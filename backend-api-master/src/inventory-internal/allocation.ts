import { createHash } from "node:crypto";
import { HttpException, HttpStatus } from "@nestjs/common";
import { errorBody } from "../common/errors";
import type { Tx } from "../common/persistence";
import { Prisma } from "../generated/prisma/client";
import { issueStockIds } from "../trade-document/memo-receive.service";
import type { AllocationPutInput } from "./inventory-internal.schemas";

/**
 * ADR-0052 D4/D5 (BE-LS-004): the idempotent "set allocation" of one Load to Stock document, in ONE master transaction.
 *
 * Lock order (architecture.md "Timeouts, retries, transactions"): allocation header (upsert, row lock) → the Purchase
 * headers FOR SHARE in id order → the purchase lines FOR UPDATE in id order → Stock ID advisory lock → counter row.
 * Purchase approve / update / delete take the Purchase header first, so they serialize with this without deadlock.
 *
 * Statements (N+1 budget NP-LS-05, independent of the line count): 1 header upsert, 1 Purchase header lock, 1 line lock
 * (with the old allocation joined), 1 bulk `loaded_*` update, 1 delete + 1 insert of allocation lines, 2 for the Stock IDs
 * (advisory lock, counter upsert) and 1 statement that records the issued ids and the result = ≤ 9. A replay is 1.
 */

const Decimal = Prisma.Decimal;
type Dec = Prisma.Decimal;

export type AllocationLine = { purchaseLineId: string; pcs: number; weightCt: string };
export type RemainingLine = { purchaseLineId: string; remainingPcs: number; remainingWeightCt: string };
export type AllocationResult = { revision: number; stockIds: string[]; lines: RemainingLine[]; replayed: boolean };

/** Same-revision replays must carry the same payload: sha256 over vendor, Stock ID count and the sorted lines. */
export function allocationHash(input: Pick<AllocationPutInput, "vendorId" | "lines" | "newStockIdCount">): string {
  const lines = [...input.lines]
    .sort((a, b) => (a.purchaseLineId < b.purchaseLineId ? -1 : a.purchaseLineId > b.purchaseLineId ? 1 : 0))
    .map((line) => [line.purchaseLineId.toLowerCase(), line.pcs, new Decimal(line.weightCt).toFixed(3)]);
  return createHash("sha256").update(JSON.stringify({ v: input.vendorId.toLowerCase(), n: input.newStockIdCount, l: lines })).digest("hex");
}

export type LockedLine = {
  id: string; purchaseId: string; source: string; pcs: number; weightCt: Dec; loadedPcs: number; loadedWeightCt: Dec;
  ownPcs: number; ownWeightCt: Dec; purchaseStatus: string; purchaseDeleted: boolean; vendorId: string;
};
export type Delta = { purchaseLineId: string; pcs: number; weightCt: Dec };
export type AllocationPlan =
  | { ok: true; deltas: Delta[]; after: RemainingLine[] }
  | { ok: false; status: 409; code: "LOAD_ALLOCATION_EXCEEDS_REMAINING"; lines: RemainingLine[] }
  | { ok: false; status: 422; code: "LOAD_ALLOCATION_LINE_UNAVAILABLE"; purchaseLineIds: string[] };

/**
 * Pure planning step (UT-LS-B08): delta old → new per line, availability and remaining checks.
 * - every NEW line must exist, be on an APPROVED, live Purchase of the load's vendor, and be MANUAL / PURCHASE_ORDER;
 *   a line only being released (old, not new) is always allowed;
 * - after the change 0 ≤ loaded ≤ line qty (pcs and weight); otherwise the remaining available to this load is
 *   reported (`remaining = qty − loaded + own`).
 */
export function planAllocation(vendorId: string, wanted: readonly AllocationLine[], locked: readonly LockedLine[]): AllocationPlan {
  const byId = new Map(locked.map((line) => [line.id, line]));
  const unavailable = wanted.filter((line) => {
    const row = byId.get(line.purchaseLineId);
    return !row || row.purchaseStatus !== "APPROVED" || row.purchaseDeleted || row.source === "STOCK" || row.vendorId !== vendorId;
  }).map((line) => line.purchaseLineId);
  if (unavailable.length > 0) return { ok: false, status: 422, code: "LOAD_ALLOCATION_LINE_UNAVAILABLE", purchaseLineIds: unavailable };

  const wantedById = new Map(wanted.map((line) => [line.purchaseLineId, line]));
  const deltas: Delta[] = [];
  const exceeded: RemainingLine[] = [];
  const after: RemainingLine[] = [];
  for (const row of [...locked].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const next = wantedById.get(row.id);
    const nextPcs = next?.pcs ?? 0;
    const nextWeight = new Decimal(next?.weightCt ?? 0);
    const deltaPcs = nextPcs - row.ownPcs;
    const deltaWeight = nextWeight.minus(row.ownWeightCt);
    const loadedPcs = row.loadedPcs + deltaPcs;
    const loadedWeight = row.loadedWeightCt.plus(deltaWeight);
    if (loadedPcs < 0 || loadedWeight.isNegative()) throw new Error("allocation ledger out of balance"); // loaded_* always ≥ own
    if (loadedPcs > row.pcs || loadedWeight.greaterThan(row.weightCt)) {
      exceeded.push({ purchaseLineId: row.id, remainingPcs: row.pcs - row.loadedPcs + row.ownPcs, remainingWeightCt: row.weightCt.minus(row.loadedWeightCt).plus(row.ownWeightCt).toFixed(3) });
      continue;
    }
    if (deltaPcs !== 0 || !deltaWeight.isZero()) deltas.push({ purchaseLineId: row.id, pcs: deltaPcs, weightCt: deltaWeight });
    after.push({ purchaseLineId: row.id, remainingPcs: row.pcs - loadedPcs, remainingWeightCt: row.weightCt.minus(loadedWeight).toFixed(3) });
  }
  if (exceeded.length > 0) return { ok: false, status: 409, code: "LOAD_ALLOCATION_EXCEEDS_REMAINING", lines: exceeded };
  return { ok: true, deltas, after };
}

/** Internal envelope with array details (ids and quantities only). */
export function allocationException(code: string, status: number, details?: Record<string, unknown>) {
  const body = errorBody(code);
  return new HttpException({ error: { ...body.error, message: ALLOCATION_MESSAGES[code] ?? body.error.message, ...(details ? { details } : {}) } }, status);
}

const ALLOCATION_MESSAGES: Record<string, string> = {
  LOAD_ALLOCATION_STALE: "The load allocation was already applied with another revision",
  LOAD_ALLOCATION_EXCEEDS_REMAINING: "Some purchase lines do not have enough remaining quantity",
  LOAD_ALLOCATION_LINE_UNAVAILABLE: "Some purchase lines can no longer be loaded",
  LOAD_ALLOCATION_NOT_FOUND: "The load allocation was not found",
};

type StoredResult = { s?: unknown; l?: unknown };

/** Compact stored result (≤ 16 KiB for 200 lines): {s: stockIds, l: [[lineId, remainingPcs, remainingWeight]]}. */
export function packResult(stockIds: readonly string[], lines: readonly RemainingLine[]) {
  return { s: [...stockIds], l: lines.map((line) => [line.purchaseLineId, line.remainingPcs, line.remainingWeightCt]) };
}
export function unpackResult(value: unknown): { stockIds: string[]; lines: RemainingLine[] } {
  const stored = (value ?? {}) as StoredResult;
  const stockIds = Array.isArray(stored.s) ? stored.s.filter((id): id is string => typeof id === "string") : [];
  const lines = Array.isArray(stored.l)
    ? stored.l.flatMap((entry) => (Array.isArray(entry) && entry.length === 3 ? [{ purchaseLineId: String(entry[0]), remainingPcs: Number(entry[1]), remainingWeightCt: String(entry[2]) }] : []))
    : [];
  return { stockIds, lines };
}

type HeaderRow = { applied_revision: number; request_hash: string; result: unknown };
type LockedRow = {
  id: string; purchase_id: string; source: string; pcs: number; weight_ct: string; loaded_pcs: number; loaded_weight_ct: string;
  own_pcs: number; own_weight_ct: string; status: string; deleted: boolean; vendor_id: string;
};

/** Applies (or replays) one allocation revision inside the caller's WRITE_TX transaction. */
export async function applyAllocation(tx: Tx, loadId: string, input: AllocationPutInput, actorId: string | null, clock: () => Date): Promise<AllocationResult> {
  const hash = allocationHash(input);
  // 1. Header: insert-or-lock in one statement (the no-op DO UPDATE takes the row lock and returns the stored state).
  const [header] = await tx.$queryRaw<HeaderRow[]>(Prisma.sql`
    INSERT INTO "partner"."load_allocation" ("load_document_id", "vendor_id", "updated_by")
    VALUES (${loadId}::uuid, ${input.vendorId}::uuid, ${actorId})
    ON CONFLICT ("load_document_id") DO UPDATE SET "load_document_id" = EXCLUDED."load_document_id"
    RETURNING "applied_revision", "request_hash", "result"`);
  if (input.revision === header.applied_revision) {
    if (header.request_hash !== hash) throw allocationException("LOAD_ALLOCATION_STALE", HttpStatus.CONFLICT, { appliedRevision: header.applied_revision });
    return { revision: input.revision, ...unpackResult(header.result), replayed: true };
  }
  if (input.revision < header.applied_revision) throw allocationException("LOAD_ALLOCATION_STALE", HttpStatus.CONFLICT, { appliedRevision: header.applied_revision });

  const wantedIds = input.lines.map((line) => line.purchaseLineId);
  const ownLines = Prisma.sql`SELECT a."purchase_line_id" FROM "partner"."load_allocation_line" a WHERE a."load_document_id" = ${loadId}::uuid`;
  // 2. Purchase headers FOR SHARE (id order) of every line in the old ∪ new set.
  await tx.$queryRaw(Prisma.sql`
    SELECT p."id" FROM "partner"."purchase" p
    WHERE p."id" IN (SELECT l."purchase_id" FROM "partner"."purchase_line" l WHERE l."id" = ANY(${wantedIds}::uuid[]) OR l."id" IN (${ownLines}))
    ORDER BY p."id" FOR SHARE OF p`);
  // 3. Lines FOR UPDATE (id order) with this load's current allocation and the Purchase state.
  const lockedRows = await tx.$queryRaw<LockedRow[]>(Prisma.sql`
    SELECT l."id", l."purchase_id", l."source", l."pcs", l."weight_ct"::text AS "weight_ct", l."loaded_pcs", l."loaded_weight_ct"::text AS "loaded_weight_ct",
      COALESCE(own."pcs", 0)::int AS "own_pcs", COALESCE(own."weight_ct", 0)::text AS "own_weight_ct",
      p."status", (p."deleted_at" IS NOT NULL) AS "deleted", p."vendor_id"
    FROM "partner"."purchase_line" l
    JOIN "partner"."purchase" p ON p."id" = l."purchase_id"
    LEFT JOIN "partner"."load_allocation_line" own ON own."load_document_id" = ${loadId}::uuid AND own."purchase_line_id" = l."id"
    WHERE l."id" = ANY(${wantedIds}::uuid[]) OR l."id" IN (${ownLines})
    ORDER BY l."id" FOR UPDATE OF l`);
  const locked: LockedLine[] = lockedRows.map((row) => ({
    id: row.id, purchaseId: row.purchase_id, source: row.source, pcs: row.pcs, weightCt: new Decimal(row.weight_ct),
    loadedPcs: row.loaded_pcs, loadedWeightCt: new Decimal(row.loaded_weight_ct), ownPcs: Number(row.own_pcs), ownWeightCt: new Decimal(row.own_weight_ct),
    purchaseStatus: row.status, purchaseDeleted: row.deleted, vendorId: row.vendor_id,
  }));
  const plan = planAllocation(input.vendorId, input.lines, locked);
  if (!plan.ok) {
    if (plan.code === "LOAD_ALLOCATION_LINE_UNAVAILABLE") throw allocationException(plan.code, HttpStatus.UNPROCESSABLE_ENTITY, { purchaseLineIds: plan.purchaseLineIds });
    throw allocationException(plan.code, HttpStatus.CONFLICT, { lines: plan.lines });
  }
  // 4. loaded_* in one statement (only lines that change).
  if (plan.deltas.length > 0) {
    const values = plan.deltas.map((delta) => Prisma.sql`(${delta.purchaseLineId}::uuid, ${delta.pcs}::int, ${delta.weightCt.toFixed(3)}::numeric)`);
    await tx.$executeRaw(Prisma.sql`
      UPDATE "partner"."purchase_line" AS l
      SET "loaded_pcs" = l."loaded_pcs" + d.pcs, "loaded_weight_ct" = l."loaded_weight_ct" + d.weight
      FROM (VALUES ${Prisma.join(values)}) AS d(id, pcs, weight)
      WHERE l."id" = d.id`);
  }
  // 5. Replace the allocation lines (set semantics).
  await tx.loadAllocationLine.deleteMany({ where: { loadDocumentId: loadId } });
  if (input.lines.length > 0) {
    await tx.loadAllocationLine.createMany({ data: input.lines.map((line) => ({ loadDocumentId: loadId, purchaseLineId: line.purchaseLineId, pcs: line.pcs, weightCt: line.weightCt })) });
  }
  // 6. Stock IDs for the new load rows (ADR-0052 D5: fixed advisory lock, clock read after it).
  const stockIds = await issueStockIds(tx, input.newStockIdCount, clock);
  // 7. Registry of issued ids + the header's applied revision, hash and result in one statement.
  const result = packResult(stockIds, plan.after);
  const issued = stockIds.length > 0
    ? Prisma.sql`, issued AS (INSERT INTO "partner"."load_stock_id" ("stock_id", "load_document_id", "issued_revision") SELECT unnest(${stockIds}::varchar[]), ${loadId}::uuid, ${input.revision}::int RETURNING 1)`
    : Prisma.empty;
  await tx.$executeRaw(Prisma.sql`
    WITH header AS (SELECT 1)${issued}
    UPDATE "partner"."load_allocation"
    SET "applied_revision" = ${input.revision}::int, "request_hash" = ${hash}, "vendor_id" = ${input.vendorId}::uuid,
        "result" = ${JSON.stringify(result)}::jsonb, "updated_at" = now(), "updated_by" = ${actorId}
    WHERE "load_document_id" = ${loadId}::uuid`);
  return { revision: input.revision, stockIds, lines: plan.after, replayed: false };
}
