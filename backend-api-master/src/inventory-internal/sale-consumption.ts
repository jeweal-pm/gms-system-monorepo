import { createHash } from "node:crypto";
import { HttpException, HttpStatus } from "@nestjs/common";
import { errorBody } from "../common/errors";
import type { Tx } from "../common/persistence";
import { Prisma } from "../generated/prisma/client";
import type { SaleConsumptionPutInput } from "./inventory-internal.schemas";

/**
 * sale SA rev 1 / ADR-0054 D4–D6 (BE-SL-002): the idempotent "set consumption" of one inventory Sale, in ONE master
 * transaction (architecture.md "Master consumption transaction").
 *
 * Lock order (extends approval-setup "Lock order"): sale_consumption header (upsert, row lock) → the Reserve headers
 * FOR SHARE (id order) → the Reserve lines FOR UPDATE (id order) → the Memo Stock items FOR NO KEY UPDATE (id order, the
 * same lock Reserve / Memo Out / Memo Return approvals take, so they queue instead of deadlocking). Reserve's own edit /
 * delete takes its header FOR NO KEY UPDATE first, so it serialises with a consumption and then sees the line sold.
 *
 * Bucket moves per line delta d (desired − applied): RESERVE `reserve_line.sold += d`, `memo_stock.reserved −= d,
 * sold += d`; STOCK `memo_stock.pending −= d, sold += d` (a negative d reverses). Increases are checked against the
 * Reserve line's open quantity / the item's pending; a net decrease of an item's `sold` must leave `sold ≥ purchased`
 * (else the Sale is "used", ADR-0054 D7). CHECKs memo_stock_balance, memo_stock_purchased_check, reserve_line_sold_check
 * hold. Statements (independent of the line count): 1 header, 1 applied-lines read, 1 Reserve header lock, 1 Reserve
 * line lock, 1 Memo Stock lock, ≤ 2 bucket updates, 1 delete + 1 insert of lines, 1 header update = ≤ 10. A replay is 1.
 */

const Decimal = Prisma.Decimal;
type Dec = Prisma.Decimal;
const ZERO = new Decimal(0);

export type ConsumptionLine = { lineId: string; source: "RESERVE" | "STOCK"; reserveLineId?: string | null; memoStockId: string; pcs: number; weightCt: string };
export type CapLine = { lineId: string; capPcs: number; capWeightCt: string };
export type ConsumptionResult = { revision: number; replayed: boolean; lines: CapLine[] };
export type ShortLine = { lineId: string; field: "pcs" | "weightCt"; code: "exceeds_open" | "exceeds_pending"; availablePcs: number; availableWeightCt: string };

/** Same-revision replays must carry the same payload: sha256 over customer, currency, doc no and the sorted lines. */
export function consumptionHash(input: Pick<SaleConsumptionPutInput, "saleDocNo" | "customerId" | "currency" | "lines">): string {
  const lines = [...input.lines]
    .sort((a, b) => (a.lineId < b.lineId ? -1 : a.lineId > b.lineId ? 1 : 0))
    .map((line) => [line.lineId.toLowerCase(), line.source, (line.reserveLineId ?? "").toLowerCase(), line.memoStockId.toLowerCase(), line.pcs, new Decimal(line.weightCt).toFixed(3)]);
  return createHash("sha256").update(JSON.stringify({ d: input.saleDocNo, c: input.customerId.toLowerCase(), k: input.currency, l: lines })).digest("hex");
}

/** A locked Reserve line with its header state and this Sale's applied quantity on it. */
export type LockedReserveLine = {
  id: string; reserveId: string; memoStockId: string | null; pcs: number; weightCt: Dec; soldPcs: number; soldWeightCt: Dec;
  live: boolean; customerId: string; currency: string;
};
/** A locked Memo Stock item. */
export type LockedItem = { id: string; pendingPcs: number; pendingWeightCt: Dec; reservedPcs: number; reservedWeightCt: Dec; soldPcs: number; soldWeightCt: Dec; purchasedPcs: number; purchasedWeightCt: Dec; stockId: string };

export type ReserveDelta = { reserveLineId: string; pcs: number; weightCt: Dec };
export type ItemDelta = { memoStockId: string; pendingPcs: number; pendingWeight: Dec; reservedPcs: number; reservedWeight: Dec; soldPcs: number; soldWeight: Dec };
export type ConsumptionPlan =
  | { ok: true; reserveDeltas: ReserveDelta[]; itemDeltas: ItemDelta[]; caps: CapLine[] }
  | { ok: false; status: 422; code: "SALE_CONSUMPTION_LINE_UNAVAILABLE"; lineIds: string[] }
  | { ok: false; status: 409; code: "SALE_CONSUMPTION_EXCEEDS_AVAILABLE"; lines: ShortLine[] }
  | { ok: false; status: 409; code: "SALE_CONSUMPTION_IN_USE"; stockIds: string[] };

type Qty = { pcs: number; weight: Dec };
const qtyOf = (line: { pcs: number; weightCt: string | Dec }): Qty => ({ pcs: line.pcs, weight: new Decimal(line.weightCt.toString()) });

/**
 * Pure planning step (UT-SL-M01): per line and per item, the delta between the applied set and the desired set.
 * - every DESIRED line must name a live reference: RESERVE → the Reserve line exists, is a stock line of the same Memo
 *   Stock item, its Reserve is APPROVED, not deleted, of the Sale's customer and currency; STOCK → the item exists.
 *   A reference only being released (applied, not desired) is always allowed.
 * - RESERVE increases ≤ the line's open (qty − sold) and the item's reserved; STOCK increases ≤ the item's pending.
 * - an item's net `sold` decrease ≤ sold − purchased (else IN_USE: a Purchase already paid the vendor for it).
 * `caps` = what each desired line could hold after the change (open / pending + its own quantity).
 */
export function planConsumption(
  sale: { customerId: string; currency: string },
  desired: readonly ConsumptionLine[],
  applied: readonly ConsumptionLine[],
  reserveLines: readonly LockedReserveLine[],
  items: readonly LockedItem[],
): ConsumptionPlan {
  const lineById = new Map(reserveLines.map((line) => [line.id, line]));
  const itemById = new Map(items.map((item) => [item.id, item]));
  const unavailable = desired.filter((line) => {
    if (!itemById.has(line.memoStockId)) return true;
    if (line.source === "STOCK") return false;
    const reserveLine = line.reserveLineId ? lineById.get(line.reserveLineId) : undefined;
    return !reserveLine || !reserveLine.live || reserveLine.memoStockId !== line.memoStockId || reserveLine.customerId !== sale.customerId || reserveLine.currency !== sale.currency;
  }).map((line) => line.lineId);
  if (unavailable.length > 0) return { ok: false, status: 422, code: "SALE_CONSUMPTION_LINE_UNAVAILABLE", lineIds: unavailable };

  // Per Reserve line: applied (own) vs desired; per item: STOCK own vs desired, RESERVE own vs desired.
  const sumBy = <K>(lines: readonly ConsumptionLine[], key: (line: ConsumptionLine) => K | null) => {
    const sums = new Map<K, Qty>();
    for (const line of lines) {
      const k = key(line);
      if (k === null) continue;
      const entry = sums.get(k) ?? { pcs: 0, weight: ZERO };
      const q = qtyOf(line);
      sums.set(k, { pcs: entry.pcs + q.pcs, weight: entry.weight.plus(q.weight) });
    }
    return sums;
  };
  const reserveKey = (line: ConsumptionLine) => (line.source === "RESERVE" && line.reserveLineId ? line.reserveLineId : null);
  const stockKey = (line: ConsumptionLine) => (line.source === "STOCK" ? line.memoStockId : null);
  const ownReserve = sumBy(applied, reserveKey);
  const wantReserve = sumBy(desired, reserveKey);
  const ownStock = sumBy(applied, stockKey);
  const wantStock = sumBy(desired, stockKey);
  const none: Qty = { pcs: 0, weight: ZERO };

  const short: ShortLine[] = [];
  const reserveDeltas: ReserveDelta[] = [];
  const itemReserveDelta = new Map<string, Qty>();
  for (const id of [...new Set([...ownReserve.keys(), ...wantReserve.keys()])].sort()) {
    const own = ownReserve.get(id) ?? none;
    const want = wantReserve.get(id) ?? none;
    const d = { pcs: want.pcs - own.pcs, weight: want.weight.minus(own.weight) };
    if (d.pcs === 0 && d.weight.isZero()) continue;
    const line = lineById.get(id);
    if (!line || !line.memoStockId) throw new Error("consumption ledger out of balance"); // an applied line always exists (FK RESTRICT)
    const openPcs = line.pcs - line.soldPcs + own.pcs;
    const openWeight = line.weightCt.minus(line.soldWeightCt).plus(own.weight);
    const wanted = desired.find((entry) => entry.reserveLineId === id);
    if (wanted) {
      if (want.pcs > openPcs) short.push({ lineId: wanted.lineId, field: "pcs", code: "exceeds_open", availablePcs: openPcs, availableWeightCt: openWeight.toFixed(3) });
      if (want.weight.greaterThan(openWeight)) short.push({ lineId: wanted.lineId, field: "weightCt", code: "exceeds_open", availablePcs: openPcs, availableWeightCt: openWeight.toFixed(3) });
    }
    if (line.soldPcs + d.pcs < 0 || line.soldWeightCt.plus(d.weight).isNegative()) throw new Error("consumption ledger out of balance");
    reserveDeltas.push({ reserveLineId: id, pcs: d.pcs, weightCt: d.weight });
    const entry = itemReserveDelta.get(line.memoStockId) ?? { pcs: 0, weight: ZERO };
    itemReserveDelta.set(line.memoStockId, { pcs: entry.pcs + d.pcs, weight: entry.weight.plus(d.weight) });
  }

  const itemDeltas: ItemDelta[] = [];
  const inUse: string[] = [];
  const itemIds = [...new Set([...itemReserveDelta.keys(), ...ownStock.keys(), ...wantStock.keys()])].sort();
  for (const id of itemIds) {
    const item = itemById.get(id);
    if (!item) throw new Error("consumption ledger out of balance");
    const ownS = ownStock.get(id) ?? none;
    const wantS = wantStock.get(id) ?? none;
    const dStock = { pcs: wantS.pcs - ownS.pcs, weight: wantS.weight.minus(ownS.weight) };
    const dReserve = itemReserveDelta.get(id) ?? none;
    const dSold = { pcs: dStock.pcs + dReserve.pcs, weight: dStock.weight.plus(dReserve.weight) };
    if (dStock.pcs === 0 && dStock.weight.isZero() && dReserve.pcs === 0 && dReserve.weight.isZero()) continue;
    const wantedStock = desired.find((entry) => entry.source === "STOCK" && entry.memoStockId === id);
    const pendingAvailable = { pcs: item.pendingPcs + ownS.pcs, weight: item.pendingWeightCt.plus(ownS.weight) };
    if (wantedStock) {
      if (wantS.pcs > pendingAvailable.pcs) short.push({ lineId: wantedStock.lineId, field: "pcs", code: "exceeds_pending", availablePcs: pendingAvailable.pcs, availableWeightCt: pendingAvailable.weight.toFixed(3) });
      if (wantS.weight.greaterThan(pendingAvailable.weight)) short.push({ lineId: wantedStock.lineId, field: "weightCt", code: "exceeds_pending", availablePcs: pendingAvailable.pcs, availableWeightCt: pendingAvailable.weight.toFixed(3) });
    }
    // Reserve lines of this item: their open quantity sits in `reserved`; a Memo Out hold on the same item is never
    // touched, because each increase is bounded by the line's own open quantity (checked above) and by `reserved`.
    if (dReserve.pcs > item.reservedPcs || dReserve.weight.greaterThan(item.reservedWeightCt)) {
      for (const entry of desired.filter((line) => line.source === "RESERVE" && line.memoStockId === id)) {
        if (!short.some((s) => s.lineId === entry.lineId)) short.push({ lineId: entry.lineId, field: "pcs", code: "exceeds_open", availablePcs: 0, availableWeightCt: "0.000" });
      }
    }
    const soldAfter = { pcs: item.soldPcs + dSold.pcs, weight: item.soldWeightCt.plus(dSold.weight) };
    if (soldAfter.pcs < item.purchasedPcs || soldAfter.weight.lessThan(item.purchasedWeightCt)) inUse.push(item.stockId);
    itemDeltas.push({ memoStockId: id, pendingPcs: -dStock.pcs, pendingWeight: dStock.weight.negated(), reservedPcs: -dReserve.pcs, reservedWeight: dReserve.weight.negated(), soldPcs: dSold.pcs, soldWeight: dSold.weight });
  }
  if (short.length > 0) return { ok: false, status: 409, code: "SALE_CONSUMPTION_EXCEEDS_AVAILABLE", lines: short };
  if (inUse.length > 0) return { ok: false, status: 409, code: "SALE_CONSUMPTION_IN_USE", stockIds: inUse.slice(0, 20) };

  const caps: CapLine[] = desired.map((line) => {
    if (line.source === "RESERVE") {
      const reserveLine = lineById.get(line.reserveLineId!)!;
      const own = ownReserve.get(line.reserveLineId!) ?? none;
      return { lineId: line.lineId, capPcs: reserveLine.pcs - reserveLine.soldPcs + own.pcs, capWeightCt: reserveLine.weightCt.minus(reserveLine.soldWeightCt).plus(own.weight).toFixed(3) };
    }
    const item = itemById.get(line.memoStockId)!;
    const own = ownStock.get(line.memoStockId) ?? none;
    return { lineId: line.lineId, capPcs: item.pendingPcs + own.pcs, capWeightCt: item.pendingWeightCt.plus(own.weight).toFixed(3) };
  });
  return { ok: true, reserveDeltas, itemDeltas, caps };
}

/** Internal envelope with array details (ids and quantities only). */
export function consumptionException(code: string, status: number, details?: Record<string, unknown>) {
  const body = errorBody(code);
  return new HttpException({ error: { ...body.error, message: CONSUMPTION_MESSAGES[code] ?? body.error.message, ...(details ? { details } : {}) } }, status);
}

const CONSUMPTION_MESSAGES: Record<string, string> = {
  SALE_CONSUMPTION_STALE: "The sale consumption was already applied with another revision",
  SALE_CONSUMPTION_EXCEEDS_AVAILABLE: "Some items do not have enough available quantity",
  SALE_CONSUMPTION_LINE_UNAVAILABLE: "Some items can no longer be sold",
  SALE_CONSUMPTION_IN_USE: "Some sold items are already purchased from the vendor",
  SALE_CONSUMPTION_NOT_FOUND: "The sale consumption was not found",
};

/** Compact stored result: {l: [[lineId, capPcs, capWeight]]}. */
export function packCaps(lines: readonly CapLine[]) {
  return { l: lines.map((line) => [line.lineId, line.capPcs, line.capWeightCt]) };
}
export function unpackCaps(value: unknown): CapLine[] {
  const stored = (value ?? {}) as { l?: unknown };
  return Array.isArray(stored.l)
    ? stored.l.flatMap((entry) => (Array.isArray(entry) && entry.length === 3 ? [{ lineId: String(entry[0]), capPcs: Number(entry[1]), capWeightCt: String(entry[2]) }] : []))
    : [];
}

type HeaderRow = { revision: number; request_hash: string; result: unknown };
type AppliedRow = { line_id: string; source: "RESERVE" | "STOCK"; reserve_line_id: string | null; memo_stock_id: string; pcs: number; weight_ct: string };
type LockedLineRow = { id: string; reserve_id: string; memo_stock_id: string | null; pcs: number; weight_ct: string; sold_pcs: number; sold_weight_ct: string };
type LockedHeaderRow = { id: string; live: boolean; customer_id: string; currency_code: string };
type LockedItemRow = {
  id: string; stock_id: string; pending_pcs: number; pending_weight_ct: string; reserved_pcs: number; reserved_weight_ct: string;
  sold_pcs: number; sold_weight_ct: string; purchased_pcs: number; purchased_weight_ct: string;
};

const sortedUnique = (values: readonly (string | null | undefined)[]) => [...new Set(values.filter((value): value is string => Boolean(value)))].sort();

/** Applies (or replays) one consumption revision inside the caller's WRITE_TX transaction. */
export async function applyConsumption(tx: Tx, saleId: string, input: SaleConsumptionPutInput, actorId: string | null): Promise<ConsumptionResult> {
  const hash = consumptionHash(input);
  // 1. Header: insert-or-lock in one statement (the no-op DO UPDATE takes the row lock and returns the stored state).
  const [header] = await tx.$queryRaw<HeaderRow[]>(Prisma.sql`
    INSERT INTO "partner"."sale_consumption" ("sale_id", "sale_doc_no", "customer_id", "currency_code", "applied_by")
    VALUES (${saleId}::uuid, ${input.saleDocNo}, ${input.customerId}::uuid, ${input.currency}::char(3), ${actorId})
    ON CONFLICT ("sale_id") DO UPDATE SET "sale_id" = EXCLUDED."sale_id"
    RETURNING "revision", "request_hash", "result"`);
  if (input.revision === header.revision) {
    if (header.request_hash !== hash) throw consumptionException("SALE_CONSUMPTION_STALE", HttpStatus.CONFLICT, { appliedRevision: header.revision });
    return { revision: input.revision, replayed: true, lines: unpackCaps(header.result) };
  }
  if (input.revision < header.revision) throw consumptionException("SALE_CONSUMPTION_STALE", HttpStatus.CONFLICT, { appliedRevision: header.revision });

  // 2. The applied set.
  const appliedRows = await tx.$queryRaw<AppliedRow[]>(Prisma.sql`
    SELECT "line_id"::text AS "line_id", "source", "reserve_line_id"::text AS "reserve_line_id", "memo_stock_id"::text AS "memo_stock_id", "pcs", "weight_ct"::text AS "weight_ct"
    FROM "partner"."sale_consumption_line" WHERE "sale_id" = ${saleId}::uuid`);
  const applied: ConsumptionLine[] = appliedRows.map((row) => ({ lineId: row.line_id, source: row.source, reserveLineId: row.reserve_line_id, memoStockId: row.memo_stock_id, pcs: row.pcs, weightCt: row.weight_ct }));
  const reserveLineIds = sortedUnique([...applied, ...input.lines].map((line) => (line.source === "RESERVE" ? line.reserveLineId : null)));

  // 3. Reserve headers FOR SHARE (id order), then 4. the Reserve lines FOR UPDATE (id order).
  let reserveLines: LockedReserveLine[] = [];
  if (reserveLineIds.length > 0) {
    const headers = await tx.$queryRaw<LockedHeaderRow[]>(Prisma.sql`
      SELECT r."id"::text AS "id", (r."status" = 'APPROVED' AND r."deleted_at" IS NULL) AS "live", r."customer_id"::text AS "customer_id", r."currency_code"
      FROM "partner"."reserve" r
      WHERE r."id" IN (SELECT l."reserve_id" FROM "partner"."reserve_line" l WHERE l."id" = ANY(${reserveLineIds}::uuid[]))
      ORDER BY r."id" FOR SHARE OF r`);
    const headerById = new Map(headers.map((row) => [row.id, row]));
    const rows = await tx.$queryRaw<LockedLineRow[]>(Prisma.sql`
      SELECT l."id"::text AS "id", l."reserve_id"::text AS "reserve_id", l."memo_stock_id"::text AS "memo_stock_id", l."pcs", l."weight_ct"::text AS "weight_ct",
        l."sold_pcs", l."sold_weight_ct"::text AS "sold_weight_ct"
      FROM "partner"."reserve_line" l WHERE l."id" = ANY(${reserveLineIds}::uuid[])
      ORDER BY l."id" FOR UPDATE OF l`);
    reserveLines = rows.map((row) => {
      const head = headerById.get(row.reserve_id);
      return {
        id: row.id, reserveId: row.reserve_id, memoStockId: row.memo_stock_id, pcs: row.pcs, weightCt: new Decimal(row.weight_ct), soldPcs: row.sold_pcs, soldWeightCt: new Decimal(row.sold_weight_ct),
        live: head?.live === true, customerId: head?.customer_id ?? "", currency: head?.currency_code ?? "",
      };
    });
  }

  // 5. Memo Stock items FOR NO KEY UPDATE (id order): every item named by an applied or desired line (and by their Reserve lines).
  const itemIds = sortedUnique([...applied.map((line) => line.memoStockId), ...input.lines.map((line) => line.memoStockId), ...reserveLines.map((line) => line.memoStockId)]);
  const itemRows = itemIds.length === 0 ? [] : await tx.$queryRaw<LockedItemRow[]>(Prisma.sql`
    SELECT "id"::text AS "id", "stock_id", "pending_pcs", "pending_weight_ct"::text AS "pending_weight_ct", "reserved_pcs", "reserved_weight_ct"::text AS "reserved_weight_ct",
      "sold_pcs", "sold_weight_ct"::text AS "sold_weight_ct", "purchased_pcs", "purchased_weight_ct"::text AS "purchased_weight_ct"
    FROM "partner"."memo_stock" WHERE "id" = ANY(${itemIds}::uuid[]) ORDER BY "id" FOR NO KEY UPDATE`);
  const items: LockedItem[] = itemRows.map((row) => ({
    id: row.id, stockId: row.stock_id, pendingPcs: row.pending_pcs, pendingWeightCt: new Decimal(row.pending_weight_ct), reservedPcs: row.reserved_pcs, reservedWeightCt: new Decimal(row.reserved_weight_ct),
    soldPcs: row.sold_pcs, soldWeightCt: new Decimal(row.sold_weight_ct), purchasedPcs: row.purchased_pcs, purchasedWeightCt: new Decimal(row.purchased_weight_ct),
  }));

  const plan = planConsumption({ customerId: input.customerId, currency: input.currency }, input.lines, applied, reserveLines, items);
  if (!plan.ok) {
    if (plan.code === "SALE_CONSUMPTION_LINE_UNAVAILABLE") throw consumptionException(plan.code, HttpStatus.UNPROCESSABLE_ENTITY, { lineIds: plan.lineIds });
    if (plan.code === "SALE_CONSUMPTION_IN_USE") throw consumptionException(plan.code, HttpStatus.CONFLICT, { stockIds: plan.stockIds });
    throw consumptionException(plan.code, HttpStatus.CONFLICT, { lines: plan.lines });
  }
  // 6. Bucket moves (only what changes), one statement per table.
  if (plan.reserveDeltas.length > 0) {
    const values = plan.reserveDeltas.map((delta) => Prisma.sql`(${delta.reserveLineId}::uuid, ${delta.pcs}::int, ${delta.weightCt.toFixed(3)}::numeric)`);
    await tx.$executeRaw(Prisma.sql`
      UPDATE "partner"."reserve_line" AS l
      SET "sold_pcs" = l."sold_pcs" + d.pcs, "sold_weight_ct" = l."sold_weight_ct" + d.weight
      FROM (VALUES ${Prisma.join(values)}) AS d(id, pcs, weight)
      WHERE l."id" = d.id`);
  }
  if (plan.itemDeltas.length > 0) {
    const values = plan.itemDeltas.map((delta) => Prisma.sql`(${delta.memoStockId}::uuid, ${delta.pendingPcs}::int, ${delta.pendingWeight.toFixed(3)}::numeric, ${delta.reservedPcs}::int, ${delta.reservedWeight.toFixed(3)}::numeric, ${delta.soldPcs}::int, ${delta.soldWeight.toFixed(3)}::numeric)`);
    await tx.$executeRaw(Prisma.sql`
      UPDATE "partner"."memo_stock" AS s
      SET "pending_pcs" = s."pending_pcs" + d.pp, "pending_weight_ct" = s."pending_weight_ct" + d.pw,
          "reserved_pcs" = s."reserved_pcs" + d.rp, "reserved_weight_ct" = s."reserved_weight_ct" + d.rw,
          "sold_pcs" = s."sold_pcs" + d.sp, "sold_weight_ct" = s."sold_weight_ct" + d.sw,
          "version" = s."version" + 1, "updated_at" = now()
      FROM (VALUES ${Prisma.join(values)}) AS d(id, pp, pw, rp, rw, sp, sw)
      WHERE s."id" = d.id`);
  }
  // 7. Replace the consumption lines (set semantics).
  if (applied.length > 0) await tx.saleConsumptionLine.deleteMany({ where: { saleId } });
  if (input.lines.length > 0) {
    await tx.saleConsumptionLine.createMany({
      data: input.lines.map((line) => ({ saleId, lineId: line.lineId, source: line.source, reserveLineId: line.source === "RESERVE" ? line.reserveLineId! : null, memoStockId: line.memoStockId, pcs: line.pcs, weightCt: line.weightCt })),
    });
  }
  // 8. Header: applied revision, hash and result.
  await tx.$executeRaw(Prisma.sql`
    UPDATE "partner"."sale_consumption"
    SET "revision" = ${input.revision}::int, "request_hash" = ${hash}, "sale_doc_no" = ${input.saleDocNo}, "customer_id" = ${input.customerId}::uuid,
        "currency_code" = ${input.currency}::char(3), "result" = ${JSON.stringify(packCaps(plan.caps))}::jsonb, "applied_at" = now(), "applied_by" = ${actorId}, "updated_at" = now()
    WHERE "sale_id" = ${saleId}::uuid`);
  return { revision: input.revision, replayed: false, lines: plan.caps };
}
