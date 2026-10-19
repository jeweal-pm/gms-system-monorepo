import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { validationException } from "../common/errors";
import type { ListQuery } from "../common/partner-schemas";
import { WRITE_TX, type Tx } from "../common/persistence";
import { prisma } from "../database/prisma-client";
import { OPTION_KEY, isSimpleKind, type OptionKind, type StoneKind } from "./stone-master.kinds";
import { mapStoneError, stoneChanged, stoneNotFound, stoneReferenceInvalid } from "./stone-master.errors";
import type { OptionsQuery, ShapeInput, SimpleInput, StoneCodeInput, StoneNameInput } from "./stone-master.schemas";
import { buildAutoCode, STONE_CODE_PATTERN, type PartKey } from "./stone-code";

const LIST_LIMIT = 50;
const OPTIONS_LIMIT = 1_000;

type Client = Tx | typeof prisma;
type Row = Record<string, unknown> & { id: string; code: string; updatedAt?: Date };
/** The few delegate methods the generic paths use; every stone model has them (same column names). */
type Delegate = {
  findMany(args: unknown): Promise<Row[]>;
  count(args?: unknown): Promise<number>;
  create(args: unknown): Promise<{ id: string; updatedAt: Date }>;
  updateMany(args: unknown): Promise<{ count: number }>;
  deleteMany(args: unknown): Promise<{ count: number }>;
};

const MODEL: Readonly<Record<StoneKind, string>> = {
  group: "stoneGroup",
  size: "stoneSize",
  color: "stoneColor",
  cutting: "stoneCutting",
  clarity: "stoneClarity",
  quality: "stoneQuality",
  "stone-name": "stoneName",
  shape: "stoneShape",
  "stone-code": "stoneCode",
};

function delegate(client: Client, kind: StoneKind): Delegate {
  return (client as unknown as Record<string, Delegate>)[MODEL[kind]];
}

// ---- keyset cursor on (code, id) (SA-SM-07: order by code; codes are unique and uppercase) ----

const cursorSchema = z.object({ c: z.string().max(60), i: z.uuid(), v: z.literal(1) }).strict();

function encodeCursor(code: string, id: string): string {
  return Buffer.from(JSON.stringify({ c: code, i: id, v: 1 }), "utf8").toString("base64url");
}

function decodeCursor(value: string): { code: string; id: string } {
  const invalid = () => validationException([{ path: "cursor", code: "invalid" }]);
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(value)) throw invalid();
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw invalid();
  }
  const parsed = cursorSchema.safeParse(json);
  if (!parsed.success) throw invalid();
  return { code: parsed.data.c, id: parsed.data.i };
}

const contains = (value: string) => ({ contains: value, mode: "insensitive" as const });

/** SA-SM-07 search fields per kind. */
function searchWhere(kind: StoneKind, q: string) {
  const base = [{ code: contains(q) }, { name: contains(q) }];
  if (kind === "stone-name") return [...base, { hsn: { contains: q } }, { group: { code: contains(q) } }];
  if (kind === "stone-code") return [{ code: contains(q) }, { stoneName: { name: contains(q) } }, { stoneName: { code: contains(q) } }];
  return base;
}

const SIMPLE_SELECT = { id: true, code: true, name: true, active: true } as const;

function listSelect(kind: StoneKind) {
  if (kind === "stone-name") return { ...SIMPLE_SELECT, hsn: true, group: { select: { id: true, code: true, name: true } } };
  if (kind === "shape") return { ...SIMPLE_SELECT, _count: { select: { sizes: true } } };
  if (kind === "stone-code") return { id: true, code: true, mode: true, active: true, stoneName: { select: { code: true, name: true } } };
  return SIMPLE_SELECT;
}

function listItem(kind: StoneKind, row: Row) {
  if (kind === "shape") {
    const { _count, ...rest } = row as Row & { _count: { sizes: number } };
    return { ...rest, sizeCount: _count.sizes };
  }
  return row;
}

const iso = (value: Date) => value.toISOString();

/** GREATEST(now, expected + 1 ms): the optimistic version always moves forward (vendor rule). */
function nextVersion(expected: Date): Date {
  return new Date(Math.max(Date.now(), expected.getTime() + 1));
}

type RefModel = "stoneGroup" | "stoneSize" | "stoneShape" | "stoneColor" | "stoneCutting" | "stoneClarity" | "stoneQuality" | "stoneName";

/**
 * SA-SM-06: a reference must exist and be active, unless it equals the value already stored on the
 * record (an old, now-inactive choice may stay). Returns the referenced code.
 */
async function referenceCode(tx: Tx, model: RefModel, id: string, path: string, storedId?: string | null): Promise<string> {
  const row = await (tx as unknown as Record<RefModel, { findUnique(args: unknown): Promise<{ code: string; active: boolean } | null> }>)[model]
    .findUnique({ where: { id }, select: { code: true, active: true } });
  if (!row || (!row.active && id !== storedId)) throw stoneReferenceInvalid(path);
  return row.code;
}

type StoredStoneCode = { stoneNameId: string; sizeId: string | null; shapeId: string; colorId: string; cuttingId: string | null; clarityId: string | null; qualityId: string | null };

@Injectable()
export class StoneMasterService {
  private readonly logger = new Logger("StoneMaster");

  async list(kind: StoneKind, query: ListQuery) {
    const limit = Math.min(query.limit ?? LIST_LIMIT, LIST_LIMIT);
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const and: unknown[] = [];
    if (query.active) and.push({ active: query.active === "true" });
    if (query.q) and.push({ OR: searchWhere(kind, query.q) });
    if (after) and.push({ OR: [{ code: { gt: after.code } }, { code: after.code, id: { gt: after.id } }] });
    try {
      const model = delegate(prisma, kind);
      const [rows, total] = await Promise.all([
        model.findMany({ where: { AND: and }, select: listSelect(kind), orderBy: [{ code: "asc" }, { id: "asc" }], take: limit + 1 }),
        model.count(),
      ]);
      const page = rows.slice(0, limit);
      const last = page[page.length - 1];
      return {
        items: page.map((row) => listItem(kind, row)),
        nextCursor: rows.length > limit && last ? encodeCursor(last.code, last.id) : null,
        total,
      };
    } catch (error) {
      throw mapStoneError(error, "list");
    }
  }

  async get(kind: StoneKind, id: string) {
    try {
      if (isSimpleKind(kind)) {
        const [row] = await delegate(prisma, kind).findMany({ where: { id }, select: { ...SIMPLE_SELECT, createdAt: true, updatedAt: true }, take: 1 });
        if (!row) throw stoneNotFound();
        return { ...row, createdAt: iso(row.createdAt as Date), updatedAt: iso(row.updatedAt as Date) };
      }
      if (kind === "stone-name") {
        const row = await prisma.stoneName.findUnique({ where: { id }, select: { ...SIMPLE_SELECT, groupId: true, hsn: true, createdAt: true, updatedAt: true } });
        if (!row) throw stoneNotFound();
        return { ...row, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
      }
      if (kind === "shape") {
        const row = await prisma.stoneShape.findUnique({
          where: { id },
          select: { ...SIMPLE_SELECT, createdAt: true, updatedAt: true, sizes: { select: { sizeId: true, size: { select: { code: true } } } } },
        });
        if (!row) throw stoneNotFound();
        const { sizes, ...rest } = row;
        const sizeIds = [...sizes].sort((a, b) => a.size.code.localeCompare(b.size.code)).map((entry) => entry.sizeId);
        return { ...rest, sizeIds, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
      }
      const row = await prisma.stoneCode.findUnique({ where: { id } });
      if (!row) throw stoneNotFound();
      return {
        id: row.id,
        code: row.code,
        mode: row.mode,
        parts: { stoneNameId: row.stoneNameId, sizeId: row.sizeId, shapeId: row.shapeId, colorId: row.colorId, cuttingId: row.cuttingId, clarityId: row.clarityId, qualityId: row.qualityId },
        partOrder: row.partOrder,
        active: row.active,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      };
    } catch (error) {
      throw mapStoneError(error, "get");
    }
  }

  async create(kind: StoneKind, actorId: string, input: unknown) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const now = new Date();
        const audit = { createdAt: now, updatedAt: now, createdBy: actorId, updatedBy: actorId };
        const select = { id: true, updatedAt: true };
        if (isSimpleKind(kind)) {
          return delegate(tx, kind).create({ data: { ...(input as SimpleInput), ...audit }, select });
        }
        if (kind === "stone-name") {
          const body = input as StoneNameInput;
          await referenceCode(tx, "stoneGroup", body.groupId, "groupId");
          return tx.stoneName.create({ data: { ...body, ...audit }, select });
        }
        if (kind === "shape") {
          const { sizeIds, ...fields } = input as ShapeInput;
          await this.checkSizes(tx, sizeIds, new Set());
          return tx.stoneShape.create({ data: { ...fields, ...audit, sizes: { createMany: { data: sizeIds.map((sizeId) => ({ sizeId })) } } }, select });
        }
        const body = input as StoneCodeInput;
        const code = await this.resolveStoneCode(tx, body, null);
        return tx.stoneCode.create({ data: { code, mode: body.mode, ...body.parts, partOrder: body.partOrder, active: body.active, ...audit }, select });
      }, WRITE_TX);
      this.logger.log({ event: "stone_master.created", actorId, kind, id: created.id });
      return { id: created.id, updatedAt: iso(created.updatedAt) };
    } catch (error) {
      throw mapStoneError(error, "create");
    }
  }

  /** Whole replacement with the optimistic version (SA-SM-09). */
  async update(kind: StoneKind, actorId: string, id: string, input: { expectedUpdatedAt: string }) {
    const { expectedUpdatedAt, ...fields } = input as { expectedUpdatedAt: string } & Record<string, unknown>;
    const expected = new Date(expectedUpdatedAt);
    try {
      const updatedAt = await prisma.$transaction(async (tx) => {
        const next = nextVersion(expected);
        let data: Record<string, unknown>;
        let sizeIds: string[] | null = null;
        if (isSimpleKind(kind)) {
          data = fields;
        } else if (kind === "stone-name") {
          const body = fields as unknown as StoneNameInput;
          const stored = await tx.stoneName.findUnique({ where: { id }, select: { groupId: true } });
          if (!stored) throw stoneNotFound();
          await referenceCode(tx, "stoneGroup", body.groupId, "groupId", stored.groupId);
          data = body;
        } else if (kind === "shape") {
          const { sizeIds: requested, ...rest } = fields as unknown as ShapeInput;
          const stored = await tx.stoneShapeSize.findMany({ where: { shapeId: id }, select: { sizeId: true } });
          await this.checkSizes(tx, requested, new Set(stored.map((entry) => entry.sizeId)));
          data = rest;
          sizeIds = requested;
        } else {
          const body = fields as unknown as StoneCodeInput;
          const stored = await tx.stoneCode.findUnique({
            where: { id },
            select: { stoneNameId: true, sizeId: true, shapeId: true, colorId: true, cuttingId: true, clarityId: true, qualityId: true },
          });
          if (!stored) throw stoneNotFound();
          const code = await this.resolveStoneCode(tx, body, stored);
          data = { code, mode: body.mode, ...body.parts, partOrder: body.partOrder, active: body.active };
        }
        const result = await delegate(tx, kind).updateMany({ where: { id, updatedAt: expected }, data: { ...data, updatedAt: next, updatedBy: actorId } });
        if (result.count === 0) {
          const exists = await delegate(tx, kind).count({ where: { id } });
          throw exists === 0 ? stoneNotFound() : stoneChanged();
        }
        if (sizeIds) {
          await tx.stoneShapeSize.deleteMany({ where: { shapeId: id } });
          await tx.stoneShapeSize.createMany({ data: sizeIds.map((sizeId) => ({ shapeId: id, sizeId })) });
        }
        return next;
      }, WRITE_TX);
      this.logger.log({ event: "stone_master.updated", actorId, kind, id });
      return { id, updatedAt: iso(updatedAt) };
    } catch (error) {
      throw mapStoneError(error, "update");
    }
  }

  /** SA-SM-06: a referenced row cannot be deleted (FK RESTRICT → STONE_MASTER_IN_USE). */
  async delete(kind: StoneKind, actorId: string, id: string) {
    let count: number;
    try {
      ({ count } = await delegate(prisma, kind).deleteMany({ where: { id } }));
    } catch (error) {
      throw mapStoneError(error, "delete");
    }
    if (count === 0) throw stoneNotFound();
    this.logger.log({ event: "stone_master.deleted", actorId, kind, id });
    return { ok: true as const };
  }

  /** SA-SM-08: active options per kind plus the selected `include` ids, ≤ 1,000 each, by code. */
  async options(query: OptionsQuery) {
    const where = query.include.length > 0 ? { OR: [{ active: true }, { id: { in: query.include } }] } : { active: true };
    try {
      const entries = await Promise.all(query.kinds.map(async (kind: OptionKind) => {
        const select = kind === "shape" ? { ...SIMPLE_SELECT, sizes: { select: { sizeId: true } } } : SIMPLE_SELECT;
        const rows = await delegate(prisma, kind).findMany({ where, select, orderBy: { code: "asc" }, take: OPTIONS_LIMIT });
        const items = kind === "shape"
          ? rows.map((row) => {
            const { sizes, ...rest } = row as Row & { sizes: { sizeId: string }[] };
            return { ...rest, sizeIds: sizes.map((entry) => entry.sizeId) };
          })
          : rows;
        return [OPTION_KEY[kind], items] as const;
      }));
      return Object.fromEntries(entries);
    } catch (error) {
      throw mapStoneError(error, "options");
    }
  }

  /** Sizes must exist and be active; sizes already on the shape may stay inactive. */
  private async checkSizes(tx: Tx, sizeIds: readonly string[], stored: ReadonlySet<string>) {
    const rows = await tx.stoneSize.findMany({ where: { id: { in: [...sizeIds] } }, select: { id: true, active: true } });
    const byId = new Map(rows.map((row) => [row.id, row.active]));
    for (const sizeId of sizeIds) {
      const active = byId.get(sizeId);
      if (active === undefined || (!active && !stored.has(sizeId))) throw stoneReferenceInvalid("sizeIds");
    }
  }

  /**
   * SA-SM-05/06: every part valid; the size belongs to the shape (an unchanged stored pair may stay);
   * AUTO builds the code from the part codes in order, MANUAL keeps the validated client code.
   */
  private async resolveStoneCode(tx: Tx, body: StoneCodeInput, stored: StoredStoneCode | null): Promise<string> {
    const { parts } = body;
    const codes: Partial<Record<PartKey, string | null>> = {
      name: await referenceCode(tx, "stoneName", parts.stoneNameId, "parts.stoneNameId", stored?.stoneNameId),
      shape: await referenceCode(tx, "stoneShape", parts.shapeId, "parts.shapeId", stored?.shapeId),
      color: await referenceCode(tx, "stoneColor", parts.colorId, "parts.colorId", stored?.colorId),
      size: parts.sizeId ? await referenceCode(tx, "stoneSize", parts.sizeId, "parts.sizeId", stored?.sizeId) : null,
      cutting: parts.cuttingId ? await referenceCode(tx, "stoneCutting", parts.cuttingId, "parts.cuttingId", stored?.cuttingId) : null,
      clarity: parts.clarityId ? await referenceCode(tx, "stoneClarity", parts.clarityId, "parts.clarityId", stored?.clarityId) : null,
      quality: parts.qualityId ? await referenceCode(tx, "stoneQuality", parts.qualityId, "parts.qualityId", stored?.qualityId) : null,
    };
    if (parts.sizeId) {
      const unchangedPair = stored !== null && stored.sizeId === parts.sizeId && stored.shapeId === parts.shapeId;
      if (!unchangedPair) {
        const link = await tx.stoneShapeSize.findUnique({ where: { shapeId_sizeId: { shapeId: parts.shapeId, sizeId: parts.sizeId } } });
        if (!link) throw stoneReferenceInvalid("parts.sizeId");
      }
    }
    if (body.mode === "MANUAL") return body.code as string;
    const code = buildAutoCode(body.partOrder, codes);
    if (!STONE_CODE_PATTERN.test(code)) throw validationException([{ path: "code", code: "too_big" }]);
    return code;
  }
}
