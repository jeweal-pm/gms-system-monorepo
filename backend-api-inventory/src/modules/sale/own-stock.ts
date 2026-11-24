import { createHash } from "node:crypto";
import { uuidV7 } from "@gms/storage";
import { AppError, type FieldError } from "../../platform/errors";
import { Decimal, Prisma, type Client, type Dec, type Tx } from "../../platform/db";
import type { PriceUnit, SaleStoneAttrs } from "../../platform/master-api";
import { LOT_CANDIDATES_MAX, LOT_GROUP_MAX } from "../stock/lots";

/**
 * Sale own stock (ADR-0058, ADR-0054 D11, ADR-0055 D5): a Sale line with source OWN_STOCK names one own-stock lot (`stock.lot_key`
 * OS* / OL*). Inventory owns both the Sale and the stock, so the stock moves locally in the same transaction as the Sale
 * (no master call for an own-only Sale):
 * - `resolveOwnLots`: one statement; the lot groups of the open stocks (on-hand > 0, ACTIVE) plus the quantity this Sale already
 *   holds in the lot (an edit may keep its own pieces). Stock held by a Reserve / Memo Out is in another bucket and never counts.
 * - `consumeOwn`: locks the candidate stocks `FOR UPDATE` in id order (the lock order of `applyHolds`), allocates each line FIFO
 *   (ref date, Stock ID; pcs and weight separately), moves on-hand -> sold in ONE set-based UPDATE, stores the allocation
 *   (`sale_line_alloc.own_stock_uuid`) and appends `SALE_OUT` ledger rows. Short stock changes nothing: 409 SALE_SOURCE_SHORT.
 * - `releaseOwn`: reads the stored allocation, moves sold -> on-hand exactly, appends `SALE_OUT_REVERSAL`, deletes the allocation.
 * Both run in the caller's transaction (a re-apply releases first, then consumes the new set), with <= 7 statements for any
 * number of lines.
 */
export type OwnLot = {
  lotKey: string; attrs: SaleStoneAttrs; priceUnit: PriceUnit; stockCount: number; loadId: string; loadDocNo: string;
  availablePcs: number; availableWeightCt: string;
};

export const OWN_LOT_KEYS_MAX = 200;
const OPEN = Prisma.sql`s."status" = 'ACTIVE' AND (s."on_hand_pcs" > 0 OR s."on_hand_weight_ct" > 0)`;

type LotRow = SaleStoneRow & { lot_key: string; price_unit: string; load_id: string; ref_doc_no: string; stock_count: number; available_pcs: number; available_weight_ct: string };
type SaleStoneRow = { stone_code: string; stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string; lot: string; location: string; cer_type: string; cer_no: string };

/** The lot groups behind `lotKeys` (<= 200), available = on-hand + what `saleId` itself holds in the lot. One statement. */
export async function resolveOwnLots(client: Client, lotKeys: readonly string[], saleId: string | null): Promise<Map<string, OwnLot>> {
  const keys = [...new Set(lotKeys)];
  if (keys.length === 0) return new Map();
  const rows = await client.$queryRaw<LotRow[]>(Prisma.sql`
    WITH mine AS (
      SELECT a."own_stock_uuid" AS id, sum(a."pcs")::int AS p, sum(a."weight_ct") AS w
      FROM "inventory"."sale_line_alloc" a JOIN "inventory"."sale_line" l ON l."id" = a."sale_line_id"
      WHERE l."sale_id" = ${saleId}::uuid AND a."own_stock_uuid" IS NOT NULL GROUP BY a."own_stock_uuid"
    ), o AS (
      SELECT s.*, COALESCE(m.p, 0) AS mp, COALESCE(m.w, 0) AS mw
      FROM "inventory"."stock" s LEFT JOIN mine m ON m.id = s."id"
      WHERE s."lot_key" = ANY(${keys}::varchar[]) AND s."status" = 'ACTIVE' AND ((s."on_hand_pcs" > 0 OR s."on_hand_weight_ct" > 0) OR m.id IS NOT NULL)
    ), g AS (
      SELECT "lot_key", sum("on_hand_pcs" + mp)::int AS available_pcs, sum("on_hand_weight_ct" + mw)::text AS available_weight_ct, count(*)::int AS stock_count
      FROM o GROUP BY "lot_key"
    ), n AS (
      SELECT DISTINCT ON ("lot_key") "lot_key", "stone_code", "stone", "shape", "size", "color", "clarity", "cutting", "quality", "lot", "location", "cer_type", "cer_no",
        "price_unit", "load_id", "ref_doc_no"
      FROM o ORDER BY "lot_key", "ref_doc_date" DESC, "stock_id" DESC
    )
    SELECT n.*, g."available_pcs", g."available_weight_ct", g."stock_count" FROM n JOIN g ON g."lot_key" = n."lot_key"`);
  return new Map(rows.map((row) => [row.lot_key, {
    lotKey: row.lot_key,
    attrs: {
      stoneCode: row.stone_code, stone: row.stone, shape: row.shape, size: row.size, color: row.color, clarity: row.clarity, cutting: row.cutting, quality: row.quality,
      lot: row.lot, location: row.location, cerType: row.cer_type, cerNo: row.cer_no,
    },
    priceUnit: row.price_unit as PriceUnit, stockCount: Number(row.stock_count), loadId: row.load_id, loadDocNo: row.ref_doc_no,
    availablePcs: Number(row.available_pcs), availableWeightCt: new Decimal(row.available_weight_ct).toFixed(3),
  }]));
}

export type OwnConsumeLine = { lineId: string; index: number; lotKey: string; pcs: number; weightCt: string };
export type OwnContext = { saleId: string; revision: number; actorId: string };

export type Locked = { id: string; stock_id: string; lot_key: string; ref_doc_date: string; on_hand_pcs: number; on_hand_weight_ct: string; load_syncing: boolean };
type Take = { stock: Locked; pcs: number; weight: Dec };

/** FIFO allocation of one dimension: `want` taken from the oldest stocks first. Returns the takes and what stayed short. */
export function allocate(stocks: readonly Locked[], pcsWant: number, weightWant: Dec): { takes: Map<string, { pcs: number; weight: Dec }>; shortPcs: boolean; shortWeight: boolean } {
  const takes = new Map<string, { pcs: number; weight: Dec }>();
  let pcs = pcsWant;
  let weight = weightWant;
  for (const stock of stocks) {
    const takePcs = Math.min(pcs, stock.on_hand_pcs);
    const takeWeight = Decimal.min(weight, new Decimal(stock.on_hand_weight_ct));
    if (takePcs > 0 || takeWeight.gt(0)) takes.set(stock.id, { pcs: takePcs, weight: takeWeight });
    pcs -= takePcs;
    weight = weight.minus(takeWeight);
    if (pcs <= 0 && weight.lte(0)) break;
  }
  return { takes, shortPcs: pcs > 0, shortWeight: weight.gt(0) };
}

/** Locks, allocates FIFO and moves the stock of the given own lines (the caller's transaction). */
export async function consumeOwn(tx: Tx, context: OwnContext, lines: readonly OwnConsumeLine[]): Promise<void> {
  if (lines.length === 0) return;
  const keys = [...new Set(lines.map((line) => line.lotKey))];
  const locked = await tx.$queryRaw<Locked[]>(Prisma.sql`
    SELECT s."id", s."stock_id", s."lot_key", to_char(s."ref_doc_date", 'YYYY-MM-DD') AS "ref_doc_date", s."on_hand_pcs", s."on_hand_weight_ct"::text AS "on_hand_weight_ct",
      (l."sync_state" = 'SYNCING') AS "load_syncing"
    FROM "inventory"."stock" s JOIN "inventory"."load_to_stock" l ON l."id" = s."load_id"
    WHERE s."lot_key" = ANY(${keys}::varchar[]) AND ${OPEN}
    ORDER BY s."id" FOR UPDATE OF s LIMIT ${LOT_CANDIDATES_MAX + 1}`);
  if (locked.length > LOT_CANDIDATES_MAX) throw new AppError(422, "STOCK_LOT_TOO_LARGE", { limit: LOT_CANDIDATES_MAX });
  const byLot = new Map<string, Locked[]>();
  for (const stock of locked) byLot.set(stock.lot_key, [...(byLot.get(stock.lot_key) ?? []), stock]);

  const gone: FieldError[] = [];
  const short: FieldError[] = [];
  const plan: { line: OwnConsumeLine; takes: Take[] }[] = [];
  for (const line of lines) {
    const stocks = (byLot.get(line.lotKey) ?? []).sort((a, b) => (a.ref_doc_date === b.ref_doc_date ? (a.stock_id < b.stock_id ? -1 : 1) : a.ref_doc_date < b.ref_doc_date ? -1 : 1));
    if (stocks.length === 0) { gone.push({ path: `lines.${line.index}.reference`, code: "unavailable" }); continue; }
    if (stocks.length > LOT_GROUP_MAX) throw new AppError(422, "STOCK_LOT_TOO_LARGE", { lotKey: line.lotKey, limit: LOT_GROUP_MAX });
    const result = allocate(stocks, line.pcs, new Decimal(line.weightCt));
    if (result.shortPcs || result.shortWeight) {
      const params = { availablePcs: stocks.reduce((sum, stock) => sum + stock.on_hand_pcs, 0), availableWeightCt: stocks.reduce((sum, stock) => sum.plus(stock.on_hand_weight_ct), new Decimal(0)).toFixed(3) };
      if (result.shortPcs) short.push({ path: `lines.${line.index}.pcs`, code: "exceeds_pending", params });
      if (result.shortWeight) short.push({ path: `lines.${line.index}.weightCt`, code: "exceeds_pending", params });
      continue;
    }
    plan.push({ line, takes: stocks.flatMap((stock) => { const take = result.takes.get(stock.id); return take ? [{ stock, ...take }] : []; }) });
  }
  if (gone.length > 0) throw new AppError(422, "SALE_REFERENCE_INVALID", { fieldErrors: gone.slice(0, 50) });
  if (short.length > 0) throw new AppError(409, "SALE_SOURCE_SHORT", { fieldErrors: short.slice(0, 50) });
  if (plan.some((entry) => entry.takes.some((take) => take.stock.load_syncing))) throw new AppError(409, "SALE_BUSY", { retryAfterSeconds: 5 }, { "Retry-After": "5" });

  const moves = plan.flatMap((entry) => entry.takes.map((take, index) => ({ line: entry.line, seq: index + 1, ...take })));
  const values = moves.map((move) => Prisma.sql`(${move.stock.id}::uuid, ${move.pcs}::int, ${move.weight.toFixed(3)}::numeric)`);
  await tx.$executeRaw(Prisma.sql`
    UPDATE "inventory"."stock" AS s SET
      "on_hand_pcs" = s."on_hand_pcs" - v.p, "on_hand_weight_ct" = s."on_hand_weight_ct" - v.w,
      "sold_pcs" = s."sold_pcs" + v.p, "sold_weight_ct" = s."sold_weight_ct" + v.w,
      "first_used_at" = COALESCE(s."first_used_at", now()), "version" = s."version" + 1, "updated_at" = now()
    FROM (VALUES ${Prisma.join(values)}) AS v(id, p, w) WHERE s."id" = v.id`);
  await tx.sale_line_alloc.createMany({
    data: moves.map((move) => ({ id: uuidV7(), sale_line_id: move.line.lineId, seq: move.seq, own_stock_uuid: move.stock.id, stock_id: move.stock.stock_id, pcs: move.pcs, weight_ct: move.weight.toFixed(3) })),
  });
  await tx.stock_movement.createMany({
    data: moves.map((move) => ({
      id: uuidV7(), stock_uuid: move.stock.id, kind: "SALE_OUT", document_type: "sale", document_id: context.saleId, revision: context.revision,
      pcs_delta: -move.pcs, weight_delta: move.weight.negated().toFixed(3), cost_delta_base: "0", created_by: context.actorId,
    })),
  });
}

/** Returns exactly what the Sale's stored own allocation took (void / edit / delete); a Sale with none is a no-op. One read + one move. */
export async function releaseOwn(tx: Tx, context: OwnContext): Promise<boolean> {
  const allocs = await tx.$queryRaw<{ id: string; own_stock_uuid: string; pcs: number; weight_ct: string; from_reserve: boolean; reserve_id: string | null }[]>`
    SELECT a."id", a."own_stock_uuid", a."pcs", a."weight_ct"::text AS "weight_ct", (l."source" = 'RESERVE') AS "from_reserve", l."reserve_id"
    FROM "inventory"."sale_line_alloc" a JOIN "inventory"."sale_line" l ON l."id" = a."sale_line_id"
    WHERE l."sale_id" = ${context.saleId}::uuid AND a."own_stock_uuid" IS NOT NULL`;
  if (allocs.length === 0) return false;
  // Same lock order as consume / holds (id order).
  const sorted = [...allocs].sort((a, b) => (a.own_stock_uuid < b.own_stock_uuid ? -1 : a.own_stock_uuid > b.own_stock_uuid ? 1 : 0));
  await tx.$queryRaw`SELECT "id" FROM "inventory"."stock" WHERE "id" = ANY(${sorted.map((row) => row.own_stock_uuid)}::uuid[]) ORDER BY "id" FOR UPDATE`;
  const values = sorted.map((row) => Prisma.sql`(${row.own_stock_uuid}::uuid, ${row.pcs}::int, ${new Decimal(row.weight_ct).toFixed(3)}::numeric, ${row.from_reserve}::boolean)`);
  // A Sale line taken From Reserve returns to the Reserve's reserved bucket (and its hold), an own-stock line to on-hand.
  await tx.$executeRaw(Prisma.sql`
    UPDATE "inventory"."stock" AS s SET
      "on_hand_pcs" = s."on_hand_pcs" + CASE WHEN v.r THEN 0 ELSE v.p END, "on_hand_weight_ct" = s."on_hand_weight_ct" + CASE WHEN v.r THEN 0 ELSE v.w END,
      "reserved_pcs" = s."reserved_pcs" + CASE WHEN v.r THEN v.p ELSE 0 END, "reserved_weight_ct" = s."reserved_weight_ct" + CASE WHEN v.r THEN v.w ELSE 0 END,
      "sold_pcs" = s."sold_pcs" - v.p, "sold_weight_ct" = s."sold_weight_ct" - v.w, "version" = s."version" + 1, "updated_at" = now()
    FROM (VALUES ${Prisma.join(values)}) AS v(id, p, w, r) WHERE s."id" = v.id`);
  const holds = sorted.filter((row) => row.from_reserve && row.reserve_id);
  if (holds.length > 0) {
    const hv = holds.map((row) => Prisma.sql`(${row.reserve_id}::uuid, ${row.own_stock_uuid}::uuid, ${row.pcs}::int, ${new Decimal(row.weight_ct).toFixed(3)}::numeric)`);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "inventory"."stock_hold" ("id", "document_type", "document_id", "stock_uuid", "kind", "pcs", "weight_ct", "revision", "document_no")
      SELECT uuidv7(), 'reserve', v.doc, v.stock, 'RESERVED', v.p, v.w, d."applied_revision", d."document_no"
      FROM (VALUES ${Prisma.join(hv)}) AS v(doc, stock, p, w)
      JOIN "inventory"."stock_hold_document" d ON d."document_type" = 'reserve' AND d."document_id" = v.doc
      ON CONFLICT ("document_type", "document_id", "stock_uuid") DO UPDATE SET "pcs" = "stock_hold"."pcs" + EXCLUDED."pcs", "weight_ct" = "stock_hold"."weight_ct" + EXCLUDED."weight_ct", "updated_at" = now()`);
  }
  await tx.stock_movement.createMany({
    data: sorted.map((row) => ({
      id: uuidV7(), stock_uuid: row.own_stock_uuid, kind: "SALE_OUT_REVERSAL", document_type: "sale", document_id: context.saleId, revision: context.revision,
      pcs_delta: row.pcs, weight_delta: new Decimal(row.weight_ct).toFixed(3), cost_delta_base: "0", created_by: context.actorId,
    })),
  });
  await tx.$executeRaw`DELETE FROM "inventory"."sale_line_alloc" WHERE "id" = ANY(${sorted.map((row) => row.id)}::uuid[])`;
  return true;
}

/**
 * Stock Card header of a Sale (ADR-0056 D7, ADR-0058 D9): document number, date and customer of the Sale, so its OUT rows show
 * the Sale number and the account. Idempotent; the hold-document table has no stock rows for a Sale (the allocation is ours).
 */
export async function writeSaleCardHeader(tx: Tx, input: { saleId: string; revision: number; docNo: string; docDate: string; customerId: string; customerName: string }): Promise<void> {
  const hash = createHash("sha256").update(`sale|${input.saleId}|${input.docNo}`).digest("hex");
  await tx.$executeRaw`
    INSERT INTO "inventory"."stock_hold_document" ("document_type", "document_id", "applied_revision", "request_hash", "document_no", "result", "updated_at", "doc_date", "party_id", "party_name")
    VALUES ('sale', ${input.saleId}::uuid, ${input.revision}::int, ${hash}, ${input.docNo.slice(0, 40)}, '{}'::jsonb, now(), ${input.docDate}::date, ${input.customerId}::uuid, ${input.customerName.slice(0, 200)})
    ON CONFLICT ("document_type", "document_id") DO UPDATE SET "applied_revision" = GREATEST("stock_hold_document"."applied_revision", EXCLUDED."applied_revision"),
      "document_no" = EXCLUDED."document_no", "doc_date" = EXCLUDED."doc_date", "party_id" = EXCLUDED."party_id", "party_name" = EXCLUDED."party_name", "updated_at" = now()`;
}

export type ReserveOwnRow = { lineId: string; seq: number; stockUuid: string; stockId: string; pcs: number; weightCt: string };

/**
 * ADR-0058 D5 (phase B): master settled own-stock rows of Reserve lines for this Sale (oldest seq first). Inventory owns the stock, so
 * it moves the Reserve's hold into sold: `reserved -> sold` per stock, the Reserve's `stock_hold` shrinks by the same quantity (a row
 * that reaches zero is deleted), the allocation is stored on the Sale line (a delete / edit returns exactly this) and `SALE_OUT`
 * ledger rows are appended. Called in tx1 after master applied; short stock throws (the saga parks the op, nothing half-applied).
 */
export async function settleReserveOwn(tx: Tx, context: OwnContext, rows: readonly ReserveOwnRow[]): Promise<void> {
  const used = rows.filter((row) => row.pcs > 0 || new Decimal(row.weightCt).gt(0));
  if (used.length === 0) return;
  const lines = await tx.$queryRaw<{ id: string; position: number; reserve_id: string }[]>`
    SELECT "id", "position", "reserve_id" FROM "inventory"."sale_line" WHERE "sale_id" = ${context.saleId}::uuid AND "id" = ANY(${[...new Set(used.map((row) => row.lineId))]}::uuid[])`;
  const lineOf = new Map(lines.map((line) => [line.id, line]));
  const sorted = [...used].sort((a, b) => (a.stockUuid < b.stockUuid ? -1 : a.stockUuid > b.stockUuid ? 1 : 0));
  const locked = await tx.$queryRaw<{ id: string; reserved_pcs: number; reserved_weight_ct: string; load_syncing: boolean }[]>`
    SELECT s."id", s."reserved_pcs", s."reserved_weight_ct"::text AS "reserved_weight_ct", (l."sync_state" = 'SYNCING') AS "load_syncing"
    FROM "inventory"."stock" s JOIN "inventory"."load_to_stock" l ON l."id" = s."load_id"
    WHERE s."id" = ANY(${sorted.map((row) => row.stockUuid)}::uuid[]) ORDER BY s."id" FOR UPDATE OF s`;
  const stockOf = new Map(locked.map((stock) => [stock.id, stock]));
  const short: FieldError[] = [];
  for (const row of sorted) {
    const stock = stockOf.get(row.stockUuid);
    const line = lineOf.get(row.lineId);
    if (!stock || !line || stock.reserved_pcs < row.pcs || new Decimal(stock.reserved_weight_ct).lt(row.weightCt)) {
      const index = (line?.position ?? 1) - 1;
      short.push({ path: `lines.${index}.pcs`, code: "exceeds_open", params: { availablePcs: stock?.reserved_pcs ?? 0, availableWeightCt: new Decimal(stock?.reserved_weight_ct ?? 0).toFixed(3) } });
    }
  }
  if (short.length > 0) throw new AppError(409, "SALE_SOURCE_SHORT", { fieldErrors: short.slice(0, 50) });
  const values = sorted.map((row) => Prisma.sql`(${row.stockUuid}::uuid, ${row.pcs}::int, ${new Decimal(row.weightCt).toFixed(3)}::numeric)`);
  await tx.$executeRaw(Prisma.sql`
    UPDATE "inventory"."stock" AS s SET
      "reserved_pcs" = s."reserved_pcs" - v.p, "reserved_weight_ct" = s."reserved_weight_ct" - v.w,
      "sold_pcs" = s."sold_pcs" + v.p, "sold_weight_ct" = s."sold_weight_ct" + v.w, "version" = s."version" + 1, "updated_at" = now()
    FROM (VALUES ${Prisma.join(values)}) AS v(id, p, w) WHERE s."id" = v.id`);
  const hv = sorted.map((row) => Prisma.sql`(${lineOf.get(row.lineId)!.reserve_id}::uuid, ${row.stockUuid}::uuid, ${row.pcs}::int, ${new Decimal(row.weightCt).toFixed(3)}::numeric)`);
  // The hold keeps exactly the Reserve's still-open quantity: a fully sold row goes, the others shrink (CHECK pcs > 0 OR weight > 0).
  await tx.$executeRaw(Prisma.sql`
    DELETE FROM "inventory"."stock_hold" h USING (VALUES ${Prisma.join(hv)}) AS v(doc, stock, p, w)
    WHERE h."document_type" = 'reserve' AND h."document_id" = v.doc AND h."stock_uuid" = v.stock AND h."pcs" <= v.p AND h."weight_ct" <= v.w`);
  await tx.$executeRaw(Prisma.sql`
    UPDATE "inventory"."stock_hold" h SET "pcs" = GREATEST(h."pcs" - v.p, 0), "weight_ct" = GREATEST(h."weight_ct" - v.w, 0), "updated_at" = now()
    FROM (VALUES ${Prisma.join(hv)}) AS v(doc, stock, p, w)
    WHERE h."document_type" = 'reserve' AND h."document_id" = v.doc AND h."stock_uuid" = v.stock`);
  await tx.sale_line_alloc.createMany({
    data: used.map((row) => ({ id: uuidV7(), sale_line_id: row.lineId, seq: row.seq, own_stock_uuid: row.stockUuid, stock_id: row.stockId.slice(0, 10), pcs: row.pcs, weight_ct: new Decimal(row.weightCt).toFixed(3) })),
  });
  await tx.stock_movement.createMany({
    data: sorted.map((row) => ({
      id: uuidV7(), stock_uuid: row.stockUuid, kind: "SALE_OUT", document_type: "sale", document_id: context.saleId, revision: context.revision,
      pcs_delta: -row.pcs, weight_delta: new Decimal(row.weightCt).negated().toFixed(3), cost_delta_base: "0", created_by: context.actorId,
    })),
  });
}
