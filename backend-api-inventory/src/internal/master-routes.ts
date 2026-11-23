import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { AppError } from "../platform/errors";
import { WRITE_TX, type Db } from "../platform/db";
import { jsonBody, type AppEnv } from "../platform/http";
import type { Logger } from "../platform/logger";
import { applyHolds, HOLD_DOCUMENT_TYPES, HOLD_MAX_STOCKS, readHolds, type HoldDocumentType } from "../modules/stock/holds";
import { stockBatch } from "../modules/stock/picker";
import { LOT_KEYS_MAX, lotCandidates, lotsAvailablePage, OWN_LOT_KEY } from "../modules/stock/lots";

/**
 * api-master → inventory internal API (ADR-0052 D16–D18/D21, api-contract "Inventory internal"), mounted at
 * `/internal/v1/master` and not routed by nginx (it routes only `/api/inventory/`).
 * - `Authorization: Bearer <MASTER_INVENTORY_SERVICE_TOKEN>`, compared as SHA-256 digests in constant time; the inventory →
 *   master token is a different credential and is refused here (when both files hold the same value the routes refuse
 *   every call and log `inventory.master_inventory_token_reused`).
 * - ≤ 4 requests in flight per process (else 503 INVENTORY_BUSY, Retry-After 1); strict JSON bodies ≤ 64 KiB.
 * - `X-Actor-User-Id` is audit only (movement `created_by`); master authorizes users before it calls.
 */
export const INTERNAL_BODY_MAX = 64 * 1024;
export const INTERNAL_MAX_IN_FLIGHT = 4;
const TOKEN = /^[\x21-\x7E]{43,512}$/;
const BEARER = /^Bearer ([\x21-\x7E]{1,512})$/;
const ACTOR = /^[A-Za-z0-9._:@-]{1,64}$/;

/** Reads a token file (trailing newline trimmed) into its SHA-256 digest; null when unset, unreadable or malformed. */
export function readTokenDigest(path: string | undefined): Buffer | null {
  if (!path || path.length > 512) return null;
  try {
    let token = readFileSync(path, "utf8");
    if (token.endsWith("\r\n")) token = token.slice(0, -2);
    else if (token.endsWith("\n")) token = token.slice(0, -1);
    return TOKEN.test(token) ? createHash("sha256").update(token, "utf8").digest() : null;
  } catch {
    return null;
  }
}

/** Constant-time comparison of a bearer header against the expected digest; a missing digest never matches. */
export function bearerMatches(header: string | undefined, expected: Buffer | null): boolean {
  const match = typeof header === "string" ? BEARER.exec(header) : null;
  const presented = createHash("sha256").update(match?.[1] ?? "", "utf8").digest();
  const reference = expected ?? createHash("sha256").update("\0no-master-inventory-token\0", "utf8").digest();
  return timingSafeEqual(presented, reference) && match !== null && expected !== null;
}

export type InternalDeps = { db: Db; logger: Logger; tokenDigest: Buffer | null; otherTokenDigest?: Buffer | null };

const isoDate = z.iso.date();
// lot-based-stock (ADR-0055 D3/D7): own-stock lot reads; the cursor is the opaque lot cursor master pages with.
const lotsAvailableSchema = z.object({
  q: z.string().trim().max(100).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  location: z.string().trim().min(1).max(40).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(51),
}).strict();
const lotsSchema = z.object({ lotKeys: z.array(z.string().regex(OWN_LOT_KEY)).min(1).max(LOT_KEYS_MAX) }).strict()
  .refine((value) => new Set(value.lotKeys).size === value.lotKeys.length, { path: ["lotKeys"], params: { code: "duplicate" }, message: "duplicate" });
const batchSchema = z.object({ ids: z.array(z.uuid()).min(1).max(HOLD_MAX_STOCKS) }).strict()
  .refine((value) => new Set(value.ids.map((id) => id.toLowerCase())).size === value.ids.length, { path: ["ids"], params: { code: "duplicate" }, message: "duplicate" });
const weight = z.string().regex(/^\d{1,9}(\.\d{1,3})?$/);
const holdsSchema = z.object({
  revision: z.number().int().min(1).max(2_000_000_000),
  documentNo: z.string().trim().min(1).max(40).nullable(),
  holds: z.array(z.object({ stockUuid: z.uuid(), pcs: z.number().int().min(0).max(999_999), weightCt: weight }).strict()).max(HOLD_MAX_STOCKS),
}).strict().refine((value) => new Set(value.holds.map((hold) => hold.stockUuid.toLowerCase())).size === value.holds.length, { path: ["holds"], params: { code: "duplicate" }, message: "duplicate" });

function documentParams(type: string, id: string): { type: HoldDocumentType; id: string } {
  if (!(HOLD_DOCUMENT_TYPES as readonly string[]).includes(type) || !z.uuid().safeParse(id).success) throw new AppError(404, "NOT_FOUND");
  return { type: type as HoldDocumentType, id: id.toLowerCase() };
}

export function createMasterRoutes(deps: InternalDeps) {
  const routes = new Hono<AppEnv>();
  const reused = deps.tokenDigest !== null && deps.otherTokenDigest != null && timingSafeEqual(deps.tokenDigest, deps.otherTokenDigest);
  if (reused) deps.logger.error({ event: "inventory.master_inventory_token_reused" });
  if (!deps.tokenDigest) deps.logger.warn({ event: "inventory.master_inventory_token_missing" });
  const expected = reused ? null : deps.tokenDigest;
  let inFlight = 0;

  const guard: MiddlewareHandler<AppEnv> = async (c, next) => {
    if (!bearerMatches(c.req.header("authorization"), expected)) throw new AppError(401, "SERVICE_UNAUTHENTICATED");
    if (inFlight >= INTERNAL_MAX_IN_FLIGHT) throw new AppError(503, "INVENTORY_BUSY", undefined, { "Retry-After": "1" });
    inFlight += 1;
    try { await next(); } finally { inFlight -= 1; }
  };
  routes.use("*", guard);
  routes.use("*", bodyLimit({ maxSize: INTERNAL_BODY_MAX, onError: () => { throw new AppError(413, "PAYLOAD_TOO_LARGE"); } }));
  const actorOf = (header: string | undefined) => (header && ACTOR.test(header) ? header : "api-master");

  routes.post("/stock/batch", async (c) => {
    const { ids } = await jsonBody(c, batchSchema);
    return c.json({ items: await stockBatch(deps.db, ids) });
  });
  routes.post("/stock/lots/available", async (c) => {
    const input = await jsonBody(c, lotsAvailableSchema);
    return c.json({ items: await lotsAvailablePage(deps.db, input) });
  });
  routes.post("/stock/lots", async (c) => {
    const { lotKeys } = await jsonBody(c, lotsSchema);
    return c.json(await lotCandidates(deps.db, lotKeys));
  });
  routes.put("/stock-holds/:type/:id", async (c) => {
    const { type, id } = documentParams(c.req.param("type"), c.req.param("id"));
    const input = await jsonBody(c, holdsSchema);
    const result = await deps.db.$transaction((tx) => applyHolds(tx, { documentType: type, documentId: id, ...input, actorId: actorOf(c.req.header("x-actor-user-id")) }), WRITE_TX);
    deps.logger.info({ event: "inventory.holds_applied", requestId: c.get("requestId"), documentType: type, documentId: id, revision: result.revision, replayed: result.replayed, stockCount: result.holds.length });
    return c.json(result);
  });
  routes.get("/stock-holds/:type/:id", async (c) => {
    const { type, id } = documentParams(c.req.param("type"), c.req.param("id"));
    const holds = await readHolds(deps.db, type, id);
    if (!holds) throw new AppError(404, "NOT_FOUND");
    return c.json(holds);
  });
  return routes;
}
