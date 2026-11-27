import { uuidV7 } from "@gms/storage";
import { AppError } from "../../platform/errors";
import { Decimal, Prisma, type Client, type Dec, type Tx } from "../../platform/db";
import type { PriceUnit } from "../../platform/master-api";
import { rowPriceUnit, rowUnitCost, sourceAmount } from "../load-to-stock/cost";

/**
 * Merge/Split in the stock component (merge-split ADR D3–D11, SA-MS-03/04/05/08/09/11). The ONLY writer of stock rows for a
 * Merge/Split document. An existing stock row never changes its card (stone code / attributes, location, lot): every source is
 * consumed WHOLE (on hand → consumed, `pcs` unchanged, so the balance CHECK holds and the Load becomes "used"), and every result is
 * a NEW stock row with a Stock ID issued by master before the transaction.
 *
 * - `planCosts`: pure cost math (company currency). Take cost = `sourceAmount`; SPLIT results keep the source price unit and unit
 *   cost, the highest position of each source absorbs the rounding residue; MERGE = Σ take cost, `rowPriceUnit("MERGE")`,
 *   `rowUnitCost`. Σ IN cost = Σ OUT cost per document, exactly.
 * - `readStockFacts` / `checkStockFacts`: the availability rules (unknown / REVERSED → 422 SOURCE_UNAVAILABLE, load SYNCING →
 *   409 BUSY, on hand ≠ snapshot → 409 STOCK_CHANGED, on another PENDING Merge/Split → 409 SOURCE_PENDING, MERGE mixed currency →
 *   422 CURRENCY_MIXED). One statement, optionally `FOR UPDATE OF s ORDER BY id`.
 * - `applyConversion`: 8 statements for any line count (≤ 200 + 200): lock + facts, one source UPDATE, one INSERT … SELECT of the
 *   result stocks, one photo insert, one ledger insert, two write-backs (results, sources). A failed check throws before any write.
 * - `reverseConversion`: 7 statements: applied lines, id-ordered lock, IN_USE check (a result not ACTIVE or `version ≠
 *   applied_version`), ledger reversal, sources back (consumed → on hand), results REVERSED (every bucket 0), lines detached.
 *
 * Reserved / Memo Out / sold / consumed quantities of a source are never touched; only its on hand is taken.
 */
export const MERGE_SPLIT_DOCUMENT_TYPE = "merge-split";
export type ConversionMode = "SPLIT" | "MERGE";

export type ResultAttrs = {
  stoneCodeId: string | null; stoneCode: string; stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string;
  cerType: string; cerNo: string;
};
export type ConversionSource = { sourceId: string; key: string; stockUuid: string; availPcs: number; availWeightCt: string };
export type ConversionResult = {
  resultId: string; position: number; sourceId: string | null; attrs: ResultAttrs; location: string; lot: string; parcel: string;
  pcs: number; weightCt: string; stockPrice: string; salePrice: string; itemNote: string; photoIds: readonly string[];
};
export type ConversionContext = { documentId: string; mode: ConversionMode; applySeq: number; actorId: string };

const kinds = (mode: ConversionMode) => (mode === "SPLIT"
  ? { out: "SPLIT_OUT", in: "SPLIT_IN", reversal: "SPLIT_REVERSAL" }
  : { out: "MERGE_OUT", in: "MERGE_IN", reversal: "MERGE_REVERSAL" });

// ---------- cost (pure, UT-MS-B02) ----------

export type CostSource = { sourceId: string; priceUnit: PriceUnit; unitCostBase: string; availPcs: number; availWeightCt: string };
export type CostResult = { resultId: string; position: number; sourceId: string | null; pcs: number; weightCt: string };
export type CostPlan = {
  takes: Map<string, Dec>;
  results: Map<string, { priceUnit: PriceUnit; unitCostBase: string; cost: Dec }>;
};

export function planCosts(mode: ConversionMode, sources: readonly CostSource[], results: readonly CostResult[]): CostPlan {
  const takes = new Map(sources.map((source) => [source.sourceId, sourceAmount(source.priceUnit, source.availPcs, source.availWeightCt, source.unitCostBase)]));
  const planned = new Map<string, { priceUnit: PriceUnit; unitCostBase: string; cost: Dec }>();
  if (mode === "MERGE") {
    const cost = [...takes.values()].reduce((sum, value) => sum.plus(value), new Decimal(0));
    const priceUnit = rowPriceUnit("MERGE", sources.map((source) => source.priceUnit));
    for (const result of results) {
      planned.set(result.resultId, { priceUnit, unitCostBase: rowUnitCost(priceUnit, result.pcs, new Decimal(result.weightCt), cost).toFixed(4), cost });
    }
    return { takes, results: planned };
  }
  for (const source of sources) {
    const group = results.filter((result) => result.sourceId === source.sourceId).sort((a, b) => a.position - b.position);
    if (group.length === 0) continue;
    const take = takes.get(source.sourceId)!;
    const costs = group.map((result) => sourceAmount(source.priceUnit, result.pcs, result.weightCt, source.unitCostBase));
    const others = costs.slice(0, -1).reduce((sum, value) => sum.plus(value), new Decimal(0));
    let residue = take.minus(others);
    costs[costs.length - 1] = residue;
    // Rounding can, in a degenerate case (tiny unit cost, many rows), leave the last row negative: take the deficit from the
    // largest rows so every cost stays ≥ 0 and Σ stays = take.
    while (residue.isNegative()) {
      costs[costs.length - 1] = new Decimal(0);
      let largest = 0;
      costs.forEach((value, index) => { if (value.greaterThan(costs[largest])) largest = index; });
      const taken = Decimal.min(costs[largest], residue.negated());
      costs[largest] = costs[largest].minus(taken);
      residue = residue.plus(taken);
      if (taken.isZero()) break;
    }
    group.forEach((result, index) => planned.set(result.resultId, { priceUnit: source.priceUnit, unitCostBase: new Decimal(source.unitCostBase).toFixed(4), cost: costs[index] }));
  }
  return { takes, results: planned };
}

// ---------- availability (SA-MS-04) ----------

export type StockFact = {
  id: string; stock_id: string; status: string; price_unit: PriceUnit; on_hand_pcs: number; on_hand_weight_ct: string; unit_cost_base: string; currency_code: string;
  ref_doc_date: string; load_syncing: boolean; pending_doc_no: string | null; version: number; consumed_pcs: number; consumed_weight_ct: string;
};

/** One statement: the picked stocks with their load sync state and another PENDING Merge/Split (excluding `documentId`). */
export async function readStockFacts(client: Client, stockUuids: readonly string[], documentId: string | null, lock: boolean): Promise<Map<string, StockFact>> {
  if (stockUuids.length === 0) return new Map();
  const rows = await client.$queryRaw<StockFact[]>(Prisma.sql`
    SELECT s."id", s."stock_id", s."status", s."price_unit", s."on_hand_pcs", s."on_hand_weight_ct"::text AS "on_hand_weight_ct", s."unit_cost_base"::text AS "unit_cost_base",
      s."currency_code", to_char(s."ref_doc_date", 'YYYY-MM-DD') AS "ref_doc_date", s."version", s."consumed_pcs", s."consumed_weight_ct"::text AS "consumed_weight_ct",
      COALESCE((SELECT l."sync_state" = 'SYNCING' FROM "inventory"."load_to_stock" l WHERE l."id" = s."load_id"), false) AS "load_syncing",
      (SELECT m."doc_no" FROM "inventory"."merge_split_source" ps JOIN "inventory"."merge_split" m ON m."id" = ps."merge_split_id"
        WHERE ps."stock_uuid" = s."id" AND m."status" = 'PENDING_APPROVAL' AND m."deleted_at" IS NULL AND m."id" IS DISTINCT FROM ${documentId}::uuid
        ORDER BY m."doc_no" LIMIT 1) AS "pending_doc_no"
    FROM "inventory"."stock" s WHERE s."id" = ANY(${[...stockUuids]}::uuid[])
    ORDER BY s."id" ${lock ? Prisma.sql`FOR UPDATE OF s` : Prisma.empty}`);
  return new Map(rows.map((row) => [row.id, row]));
}

export function checkStockFacts(mode: ConversionMode, sources: readonly ConversionSource[], facts: ReadonlyMap<string, StockFact>): AppError | null {
  const unavailable = sources.filter((source) => { const fact = facts.get(source.stockUuid); return !fact || fact.status !== "ACTIVE"; });
  // Unknown or REVERSED (the only non-ACTIVE status) → 422 (error-handling "SOURCE_UNAVAILABLE").
  if (unavailable.length > 0) return new AppError(422, "MERGE_SPLIT_SOURCE_UNAVAILABLE", { sourceKeys: unavailable.map((source) => source.key) });
  const busy = sources.some((source) => facts.get(source.stockUuid)!.load_syncing);
  if (busy) return new AppError(409, "MERGE_SPLIT_BUSY", { retryAfterSeconds: 5 }, { "Retry-After": "5" });
  const changed = sources.filter((source) => {
    const fact = facts.get(source.stockUuid)!;
    return fact.on_hand_pcs !== source.availPcs || !new Decimal(fact.on_hand_weight_ct).equals(source.availWeightCt);
  });
  if (changed.length > 0) {
    return new AppError(409, "MERGE_SPLIT_STOCK_CHANGED", {
      sources: changed.map((source) => {
        const fact = facts.get(source.stockUuid)!;
        return { sourceId: source.sourceId, key: source.key, stockId: fact.stock_id, availPcs: fact.on_hand_pcs, availWeightCt: new Decimal(fact.on_hand_weight_ct).toFixed(3) };
      }),
    });
  }
  const pending = sources.map((source) => facts.get(source.stockUuid)!).filter((fact) => fact.pending_doc_no !== null);
  if (pending.length > 0) {
    return new AppError(409, "MERGE_SPLIT_SOURCE_PENDING", { stockIds: pending.map((fact) => fact.stock_id), docNos: [...new Set(pending.map((fact) => fact.pending_doc_no!))] });
  }
  if (mode === "MERGE") {
    const currencies = [...new Set(sources.map((source) => facts.get(source.stockUuid)!.currency_code))].sort();
    if (currencies.length > 1) return new AppError(422, "MERGE_SPLIT_CURRENCY_MIXED", { currencies });
  }
  return null;
}

/** The source whose vendor / currency / load / ref a result inherits: its own (SPLIT) or the oldest by (ref date, Stock ID) (MERGE). */
export function inheritFrom(mode: ConversionMode, sources: readonly ConversionSource[], facts: ReadonlyMap<string, StockFact>, sourceId: string | null): string {
  if (mode === "SPLIT") return sources.find((source) => source.sourceId === sourceId)!.stockUuid;
  const oldest = [...sources].sort((a, b) => {
    const fa = facts.get(a.stockUuid)!;
    const fb = facts.get(b.stockUuid)!;
    return fa.ref_doc_date < fb.ref_doc_date ? -1 : fa.ref_doc_date > fb.ref_doc_date ? 1 : fa.stock_id < fb.stock_id ? -1 : fa.stock_id > fb.stock_id ? 1 : 0;
  })[0];
  return oldest.stockUuid;
}

// ---------- apply (SA-MS-08) ----------

export type AppliedConversion = { stockIds: string[]; stockUuids: string[]; plan: CostPlan };

export async function applyConversion(tx: Tx, context: ConversionContext, sources: readonly ConversionSource[], results: readonly ConversionResult[], stockIds: readonly string[]): Promise<AppliedConversion> {
  if (stockIds.length < results.length) throw new Error(`stock id count mismatch: ${results.length} results, ${stockIds.length} ids`);
  // 1. Lock the sources in id order (the lock order of holds / Sale / Transfer) with their facts.
  const facts = await readStockFacts(tx, sources.map((source) => source.stockUuid), context.documentId, true);
  const refusal = checkStockFacts(context.mode, sources, facts);
  if (refusal) throw refusal;
  const plan = planCosts(context.mode, sources.map((source) => {
    const fact = facts.get(source.stockUuid)!;
    return { sourceId: source.sourceId, priceUnit: fact.price_unit, unitCostBase: fact.unit_cost_base, availPcs: source.availPcs, availWeightCt: source.availWeightCt };
  }), results);
  const ordered = [...results].sort((a, b) => a.position - b.position);
  const created = ordered.map((result, index) => ({ result, id: uuidV7(), stockId: stockIds[index], cost: plan.results.get(result.resultId)! }));
  const kind = kinds(context.mode);

  // 2. Sources: the whole on hand moves to consumed (pcs unchanged; balance CHECK holds); the version moves (blocks other reversals).
  const sorted = [...sources].sort((a, b) => (a.stockUuid < b.stockUuid ? -1 : a.stockUuid > b.stockUuid ? 1 : 0));
  await tx.$executeRaw(Prisma.sql`
    UPDATE "inventory"."stock" AS s SET
      "on_hand_pcs" = s."on_hand_pcs" - v.p, "on_hand_weight_ct" = s."on_hand_weight_ct" - v.w,
      "consumed_pcs" = s."consumed_pcs" + v.p, "consumed_weight_ct" = s."consumed_weight_ct" + v.w,
      "first_used_at" = COALESCE(s."first_used_at", now()), "version" = s."version" + 1, "updated_at" = now()
    FROM (VALUES ${Prisma.join(sorted.map((source) => Prisma.sql`(${source.stockUuid}::uuid, ${source.availPcs}::int, ${new Decimal(source.availWeightCt).toFixed(3)}::numeric)`))}) AS v(id, p, w)
    WHERE s."id" = v.id`);

  // 3. Result stocks: edited details; vendor / currency / load / ref inherited (SA-MS-06). lot_key / card_key / item_key are generated.
  const values = created.map(({ result, id, stockId, cost }) => Prisma.sql`(${id}::uuid, ${stockId}::varchar, ${inheritFrom(context.mode, sources, facts, result.sourceId)}::uuid,
    ${result.location}::varchar, ${result.parcel}::varchar, ${result.attrs.stoneCodeId}::uuid, ${result.attrs.stoneCode}::varchar, ${result.attrs.stone}::varchar,
    ${result.attrs.shape}::varchar, ${result.attrs.size}::varchar, ${result.attrs.color}::varchar, ${result.attrs.clarity}::varchar, ${result.attrs.cutting}::varchar,
    ${result.attrs.quality}::varchar, ${result.lot}::varchar, ${result.attrs.cerType}::varchar, ${result.attrs.cerNo}::varchar, ${cost.priceUnit}::varchar,
    ${result.pcs}::int, ${new Decimal(result.weightCt).toFixed(3)}::numeric, ${cost.unitCostBase}::numeric, ${cost.cost.toFixed(2)}::numeric,
    ${new Decimal(result.stockPrice).toFixed(2)}::numeric, ${new Decimal(result.salePrice).toFixed(2)}::numeric, ${result.itemNote}::varchar)`);
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "inventory"."stock" ("id", "stock_id", "load_row_id", "load_id", "status", "location", "parcel", "stone_code_id", "stone_code", "stone", "shape", "size",
      "color", "clarity", "cutting", "quality", "lot", "cer_type", "cer_no", "price_unit", "pcs", "weight_ct", "on_hand_pcs", "on_hand_weight_ct", "unit_cost_base",
      "cost_amount_base", "stock_price", "sale_price", "currency_code", "vendor_id", "vendor_name_snapshot", "item_note", "ref_doc_date", "ref_doc_no")
    SELECT v.id, v.stock_id, NULL, s."load_id", 'ACTIVE', v.location, v.parcel, v.code_id, v.code, v.stone, v.shape, v.size,
      v.color, v.clarity, v.cutting, v.quality, v.lot, v.cer_type, v.cer_no, v.price_unit, v.pcs, v.weight, v.pcs, v.weight, v.unit_cost,
      v.cost, v.stock_price, v.sale_price, s."currency_code", s."vendor_id", s."vendor_name_snapshot", v.note, s."ref_doc_date", s."ref_doc_no"
    FROM (VALUES ${Prisma.join(values)}) AS v(id, stock_id, inherit, location, parcel, code_id, code, stone, shape, size, color, clarity, cutting, quality, lot,
      cer_type, cer_no, price_unit, pcs, weight, unit_cost, cost, stock_price, sale_price, note)
    JOIN "inventory"."stock" s ON s."id" = v.inherit`);

  // 4. Photos by reference (the stored file is shared, never copied).
  const photos = created.flatMap(({ result, id }) => result.photoIds.map((fileId, index) => ({ stock_uuid: id, position: index + 1, file_id: fileId })));
  if (photos.length > 0) await tx.stock_photo.createMany({ data: photos });

  // 5. Ledger: one OUT per source, one IN per result (Σ cost delta = 0 per document).
  await tx.stock_movement.createMany({
    data: [
      ...sources.map((source) => ({
        id: uuidV7(), stock_uuid: source.stockUuid, kind: kind.out, document_type: MERGE_SPLIT_DOCUMENT_TYPE, document_id: context.documentId, revision: context.applySeq,
        pcs_delta: -source.availPcs, weight_delta: new Decimal(source.availWeightCt).negated().toFixed(3), cost_delta_base: plan.takes.get(source.sourceId)!.negated().toFixed(2), created_by: context.actorId,
      })),
      ...created.map(({ result, id, cost }) => ({
        id: uuidV7(), stock_uuid: id, kind: kind.in, document_type: MERGE_SPLIT_DOCUMENT_TYPE, document_id: context.documentId, revision: context.applySeq,
        pcs_delta: result.pcs, weight_delta: new Decimal(result.weightCt).toFixed(3), cost_delta_base: cost.cost.toFixed(2), created_by: context.actorId,
      })),
    ],
  });

  // 6. Lines remember the new stock (version 1 = untouched, SA-MS-11) and the server-computed cost.
  await tx.$executeRaw(Prisma.sql`
    UPDATE "inventory"."merge_split_result" AS r SET "stock_uuid" = v.stock, "stock_id" = v.stock_id, "applied_version" = 1,
      "price_unit" = v.price_unit, "unit_cost_base" = v.unit_cost, "cost_amount_base" = v.cost
    FROM (VALUES ${Prisma.join(created.map(({ result, id, stockId, cost }) => Prisma.sql`(${result.resultId}::uuid, ${id}::uuid, ${stockId}::varchar, ${cost.priceUnit}::varchar, ${cost.unitCostBase}::numeric, ${cost.cost.toFixed(2)}::numeric)`))})
      AS v(id, stock, stock_id, price_unit, unit_cost, cost)
    WHERE r."id" = v.id AND r."merge_split_id" = ${context.documentId}::uuid`);
  await tx.$executeRaw(Prisma.sql`
    UPDATE "inventory"."merge_split_source" AS src SET "price_unit" = v.price_unit, "unit_cost_base" = v.unit_cost, "take_cost_base" = v.take
    FROM (VALUES ${Prisma.join(sources.map((source) => { const fact = facts.get(source.stockUuid)!; return Prisma.sql`(${source.sourceId}::uuid, ${fact.price_unit}::varchar, ${fact.unit_cost_base}::numeric, ${plan.takes.get(source.sourceId)!.toFixed(2)}::numeric)`; }))})
      AS v(id, price_unit, unit_cost, take)
    WHERE src."id" = v.id AND src."merge_split_id" = ${context.documentId}::uuid`);
  return { stockIds: created.map((entry) => entry.stockId), stockUuids: created.map((entry) => entry.id), plan };
}

// ---------- reverse (SA-MS-11) ----------

type AppliedLine = { role: "R" | "S"; stock_uuid: string; applied_version: number | null; take_pcs: number; take_w: string; take_cost: string };
type LockedStock = { id: string; stock_id: string; status: string; version: number; pcs: number; weight_ct: string; cost_amount_base: string; consumed_pcs: number; consumed_weight_ct: string };

/**
 * Reverses an applied document (delete, or edit of an auto-approved one). Refuses with 409 MERGE_SPLIT_IN_USE {stockIds} when a
 * result stock moved since the apply (not ACTIVE or `version ≠ applied_version`). Returns false when nothing is applied.
 */
export async function reverseConversion(tx: Tx, context: ConversionContext): Promise<boolean> {
  const lines = await tx.$queryRaw<AppliedLine[]>`
    SELECT 'R' AS "role", r."stock_uuid", r."applied_version", 0 AS "take_pcs", '0' AS "take_w", '0' AS "take_cost"
    FROM "inventory"."merge_split_result" r WHERE r."merge_split_id" = ${context.documentId}::uuid AND r."stock_uuid" IS NOT NULL
    UNION ALL
    SELECT 'S', src."stock_uuid", NULL, src."avail_pcs", src."avail_weight_ct"::text, src."take_cost_base"::text
    FROM "inventory"."merge_split_source" src WHERE src."merge_split_id" = ${context.documentId}::uuid`;
  const applied = lines.filter((line) => line.role === "R");
  if (applied.length === 0) return false;
  const takes = lines.filter((line) => line.role === "S");
  const locked = await tx.$queryRaw<LockedStock[]>`
    SELECT s."id", s."stock_id", s."status", s."version", s."pcs", s."weight_ct"::text AS "weight_ct", s."cost_amount_base"::text AS "cost_amount_base",
      s."consumed_pcs", s."consumed_weight_ct"::text AS "consumed_weight_ct"
    FROM "inventory"."stock" s WHERE s."id" = ANY(${lines.map((line) => line.stock_uuid)}::uuid[]) ORDER BY s."id" FOR UPDATE OF s`;
  const byId = new Map(locked.map((row) => [row.id, row]));
  const inUse = new Set<string>();
  for (const line of applied) {
    const stock = byId.get(line.stock_uuid);
    if (!stock || stock.status !== "ACTIVE" || stock.version !== line.applied_version) inUse.add(stock?.stock_id ?? line.stock_uuid);
  }
  for (const line of takes) {
    const stock = byId.get(line.stock_uuid);
    if (!stock || stock.consumed_pcs < line.take_pcs || new Decimal(stock.consumed_weight_ct).lessThan(line.take_w)) inUse.add(stock?.stock_id ?? line.stock_uuid);
  }
  if (inUse.size > 0) throw new AppError(409, "MERGE_SPLIT_IN_USE", { stockIds: [...inUse].sort().slice(0, 20) });

  const kind = kinds(context.mode).reversal;
  const results = applied.map((line) => byId.get(line.stock_uuid)!);
  await tx.stock_movement.createMany({
    data: [
      ...takes.map((line) => ({
        id: uuidV7(), stock_uuid: line.stock_uuid, kind, document_type: MERGE_SPLIT_DOCUMENT_TYPE, document_id: context.documentId, revision: context.applySeq,
        pcs_delta: line.take_pcs, weight_delta: new Decimal(line.take_w).toFixed(3), cost_delta_base: new Decimal(line.take_cost).toFixed(2), created_by: context.actorId,
      })),
      ...results.map((stock) => ({
        id: uuidV7(), stock_uuid: stock.id, kind, document_type: MERGE_SPLIT_DOCUMENT_TYPE, document_id: context.documentId, revision: context.applySeq,
        pcs_delta: -stock.pcs, weight_delta: new Decimal(stock.weight_ct).negated().toFixed(3), cost_delta_base: new Decimal(stock.cost_amount_base).negated().toFixed(2), created_by: context.actorId,
      })),
    ],
  });
  const back = [...takes].sort((a, b) => (a.stock_uuid < b.stock_uuid ? -1 : 1))
    .map((line) => Prisma.sql`(${line.stock_uuid}::uuid, ${line.take_pcs}::int, ${new Decimal(line.take_w).toFixed(3)}::numeric)`);
  await tx.$executeRaw(Prisma.sql`
    UPDATE "inventory"."stock" AS s SET
      "on_hand_pcs" = s."on_hand_pcs" + v.p, "on_hand_weight_ct" = s."on_hand_weight_ct" + v.w,
      "consumed_pcs" = s."consumed_pcs" - v.p, "consumed_weight_ct" = s."consumed_weight_ct" - v.w, "version" = s."version" + 1, "updated_at" = now()
    FROM (VALUES ${Prisma.join(back)}) AS v(id, p, w) WHERE s."id" = v.id`);
  // Results: REVERSED with every bucket 0 (balance CHECK holds); their Stock IDs stay retired (never reused).
  await tx.$executeRaw`
    UPDATE "inventory"."stock" SET "status" = 'REVERSED', "pcs" = 0, "weight_ct" = 0, "on_hand_pcs" = 0, "on_hand_weight_ct" = 0, "cost_amount_base" = 0,
      "version" = "version" + 1, "updated_at" = now()
    WHERE "id" = ANY(${results.map((stock) => stock.id)}::uuid[])`;
  await tx.$executeRaw`
    UPDATE "inventory"."merge_split_result" SET "stock_uuid" = NULL, "stock_id" = NULL, "applied_version" = NULL
    WHERE "merge_split_id" = ${context.documentId}::uuid AND "stock_uuid" IS NOT NULL`;
  return true;
}
