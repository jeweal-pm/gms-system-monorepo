import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { validationException } from "../common/errors";
import { LIST_LIMIT_MAX } from "../common/partner-schemas";
import { WRITE_TX, type Tx } from "../common/persistence";
import { prisma } from "../database/prisma-client";
import { locationChanged, locationNameTaken, locationNotFound, mapLocationError } from "./location-master.errors";
import type { CreateLocationInput, UpdateLocationInput } from "./location-master.schemas";

/** SA-LM-04: the most names a document's `options` carries (expected well under 500). */
export const LOCATION_OPTIONS_LIMIT = 500;

type Client = Tx | typeof prisma;
export type LocationListQuery = { q?: string; active?: "true" | "false"; cursor?: string; limit?: number };

const iso = (value: Date) => value.toISOString();
const contains = (value: string) => ({ contains: value, mode: "insensitive" as const });

/** GREATEST(now, expected + 1 ms): the optimistic version always moves forward (vendor / currency rule). */
function nextVersion(expected: Date): Date {
  return new Date(Math.max(Date.now(), expected.getTime() + 1));
}

const cursorSchema = z.object({ n: z.string().min(1).max(40), i: z.uuid(), v: z.literal(1) }).strict();

/**
 * Longest cursor accepted. Worst case: 40 JSON-escaped characters (6 bytes each) + the id and keys ≈ 300 bytes → 400
 * base64url characters; a 40-character Thai name is ≈ 236 (sec-auditor 2026-11-16 found 200 too small).
 */
export const LOCATION_CURSOR_MAX = 400;

/** Keyset cursor (SA-LM-08): the last row's name and id, base64url JSON like Stone Master. */
export function encodeLocationCursor(name: string, id: string): string {
  return Buffer.from(JSON.stringify({ n: name, i: id, v: 1 }), "utf8").toString("base64url");
}

export function decodeLocationCursor(value: string): { name: string; id: string } {
  const invalid = () => validationException([{ path: "cursor", code: "invalid" }]);
  if (value.length > LOCATION_CURSOR_MAX || !/^[A-Za-z0-9_-]+$/.test(value)) throw invalid();
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw invalid();
  }
  const parsed = cursorSchema.safeParse(json);
  if (!parsed.success) throw invalid();
  return { name: parsed.data.n, id: parsed.data.i };
}

/** SA-LM-01: a name another row already has, ignoring case (checked before the write; the unique index decides races). */
async function nameTaken(client: Client, name: string, exceptId?: string): Promise<boolean> {
  // `lower(name) = lower($1)` is exactly the unique index's rule (an insensitive `equals` may become ILIKE, where
  // `%` / `_` act as wildcards; security-auditor 2026-11-16). Parameterized, served by `location_name_lower_key`.
  const rows = await client.$queryRaw<{ id: string }[]>`SELECT id FROM "partner"."location" WHERE lower(name) = lower(${name}) LIMIT 2`;
  return rows.some((row) => row.id !== exceptId);
}

/**
 * SA-LM-04: active names, `name ASC`, ≤ 500 — what Purchase Order / Purchase rows may choose. Read inside the
 * documents' own `options`, so their users need no `location-master` grant.
 */
export async function activeLocationNames(client: Client = prisma): Promise<string[]> {
  const rows = await client.location.findMany({ where: { active: true }, select: { name: true }, orderBy: [{ name: "asc" }, { id: "asc" }], take: LOCATION_OPTIONS_LIMIT });
  return rows.map((row) => row.name);
}

/**
 * SA-LM-05: the master spelling of each active name, keyed by its lower case, for the documents' manual-line check.
 * Bounded like the options.
 */
export async function activeLocationsByKey(client: Client): Promise<Map<string, string>> {
  return new Map((await activeLocationNames(client)).map((name) => [name.toLowerCase(), name]));
}

/**
 * SA-LM-05 (ADR-0052): a typed (manual) line's non-empty location must be an active master name — stored in the
 * master's spelling — or a value the document already stores (an old typed or since-deactivated name may stay).
 * Copied lines (`isManual` false) keep their copied location. Blank stays allowed. Refused lines answer one
 * VALIDATION_ERROR with `lines.{i}.location` / `unknown_location`. Returns the lines with the spelling applied.
 */
export async function checkLineLocations<L extends { location: string }>(
  tx: Client,
  lines: readonly L[],
  isManual: (line: L) => boolean,
  storedLocations: () => Promise<readonly string[]>,
): Promise<L[]> {
  const typed = lines.some((line) => isManual(line) && line.location.trim() !== "");
  if (!typed) return [...lines];
  const [active, stored] = await Promise.all([activeLocationsByKey(tx), storedLocations()]);
  const kept = new Set(stored);
  const errors: { path: string; code: string }[] = [];
  const checked = lines.map((line, index) => {
    const location = line.location.trim();
    if (!isManual(line) || location === "") return line;
    const master = active.get(location.toLowerCase());
    if (master !== undefined) return { ...line, location: master };
    if (kept.has(location) || kept.has(line.location)) return line;
    errors.push({ path: `lines.${index}.location`, code: "unknown_location" });
    return line;
  });
  if (errors.length > 0) throw validationException(errors);
  return checked;
}

@Injectable()
export class LocationMasterService {
  private readonly logger = new Logger("LocationMaster");

  /** SA-LM-08: keyset on (name, id), ≤ 50 rows per page; `total` counts every location (the list label). */
  async list(query: LocationListQuery) {
    const limit = Math.min(query.limit ?? LIST_LIMIT_MAX, LIST_LIMIT_MAX);
    const after = query.cursor ? decodeLocationCursor(query.cursor) : null;
    const and: object[] = [];
    if (query.active) and.push({ active: query.active === "true" });
    if (query.q) and.push({ name: contains(query.q) });
    if (after) and.push({ OR: [{ name: { gt: after.name } }, { name: after.name, id: { gt: after.id } }] });
    try {
      const [rows, total] = await Promise.all([
        prisma.location.findMany({ where: { AND: and }, select: { id: true, name: true, active: true }, orderBy: [{ name: "asc" }, { id: "asc" }], take: limit + 1 }),
        prisma.location.count(),
      ]);
      const page = rows.slice(0, limit);
      const last = page[page.length - 1];
      return { items: page, nextCursor: rows.length > limit && last ? encodeLocationCursor(last.name, last.id) : null, total };
    } catch (error) {
      throw mapLocationError(error, "list");
    }
  }

  async get(id: string) {
    try {
      const row = await prisma.location.findUnique({ where: { id }, select: { id: true, name: true, active: true, createdAt: true, updatedAt: true } });
      if (!row) throw locationNotFound();
      return { ...row, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
    } catch (error) {
      throw mapLocationError(error, "get");
    }
  }

  async create(actorId: string, input: CreateLocationInput) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        if (await nameTaken(tx, input.name)) throw locationNameTaken();
        const now = new Date();
        return tx.location.create({
          data: { name: input.name, active: input.active, createdAt: now, updatedAt: now, createdBy: actorId, updatedBy: actorId },
          select: { id: true, updatedAt: true },
        });
      }, WRITE_TX);
      this.logger.log({ event: "location.created", actorId, id: created.id });
      return { id: created.id, updatedAt: iso(created.updatedAt) };
    } catch (error) {
      throw mapLocationError(error, "create");
    }
  }

  /** Whole replacement with the optimistic version. Saved documents keep the name they copied (SA-LM-03). */
  async update(actorId: string, id: string, input: UpdateLocationInput) {
    const expected = new Date(input.expectedUpdatedAt);
    try {
      const updatedAt = await prisma.$transaction(async (tx) => {
        const stored = await tx.location.findUnique({ where: { id }, select: { id: true } });
        if (!stored) throw locationNotFound();
        if (await nameTaken(tx, input.name, id)) throw locationNameTaken();
        const next = nextVersion(expected);
        const result = await tx.location.updateMany({ where: { id, updatedAt: expected }, data: { name: input.name, active: input.active, updatedAt: next, updatedBy: actorId } });
        if (result.count === 0) throw locationChanged();
        return next;
      }, WRITE_TX);
      this.logger.log({ event: "location.updated", actorId, id });
      return { id, updatedAt: iso(updatedAt) };
    } catch (error) {
      throw mapLocationError(error, "update");
    }
  }

  /** SA-LM-06: a hard delete at the read version (nothing references the row; documents keep their copied name). */
  async delete(actorId: string, id: string, expectedUpdatedAt: string) {
    try {
      await prisma.$transaction(async (tx) => {
        const stored = await tx.location.findUnique({ where: { id }, select: { id: true } });
        if (!stored) throw locationNotFound();
        const { count } = await tx.location.deleteMany({ where: { id, updatedAt: new Date(expectedUpdatedAt) } });
        if (count === 0) throw locationChanged();
      }, WRITE_TX);
    } catch (error) {
      throw mapLocationError(error, "delete");
    }
    this.logger.log({ event: "location.deleted", actorId, id });
    return { ok: true as const };
  }
}
