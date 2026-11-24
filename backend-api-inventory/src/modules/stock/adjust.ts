import { uuidV7 } from "@gms/storage";
import { AppError } from "../../platform/errors";
import { Decimal, Prisma, type Tx } from "../../platform/db";

export type AdjustmentStockLine = {
  lineId: string; stockUuid: string; stockId: string; position: number;
  stockPcs: number; stockWeightCt: string; stockPrice: string;
  physicalPcs: number; physicalWeightCt: string; physicalPrice: string | null;
};
export type AdjustmentHeader = { id: string; docNo: string; docDate: string; revision: number; location: string; actorId: string };
export type LockedStock = {
  id: string; stock_id: string; status: string; location: string; price_unit: string;
  on_hand_pcs: number; on_hand_weight_ct: string; stock_price: string; unit_cost_base: string;
  cost_amount_base: string; version: number;
};
function costDelta(stock: Pick<LockedStock, "price_unit" | "unit_cost_base">, dPcs: number, dWeight: Prisma.Decimal) {
  const quantity = stock.price_unit === "PER_PCS" ? new Decimal(dPcs) : dWeight;
  return quantity.times(stock.unit_cost_base).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Shared unit-test seam for signed on-hand and base-cost changes (UT-SAJ-B02). */
export function adjustmentDelta(input: Pick<AdjustmentStockLine, "stockPcs" | "stockWeightCt" | "physicalPcs" | "physicalWeightCt" | "physicalPrice" | "stockPrice">, stock: Pick<LockedStock, "price_unit" | "unit_cost_base">) {
  const dPcs = input.physicalPcs - input.stockPcs;
  const dWeight = new Decimal(input.physicalWeightCt).minus(input.stockWeightCt);
  const dCost = costDelta(stock, dPcs, dWeight);
  const nextPrice = input.physicalPrice ?? input.stockPrice;
  return { dPcs, dWeight, dCost, nextPrice, changed: dPcs !== 0 || !dWeight.isZero() || !new Decimal(nextPrice).equals(input.stockPrice) };
}

/**
 * Applies an adjustment in a constant number of statements: one ordered row lock, one set update,
 * one movement insert, one version snapshot update. Caller owns transaction and document status.
 */
export async function adjustStocks(tx: Tx, header: AdjustmentHeader, lines: readonly AdjustmentStockLine[]): Promise<void> {
  if (!lines.length) return;
  const ordered = [...lines].sort((a, b) => a.stockUuid.localeCompare(b.stockUuid));
  const stocks = await tx.$queryRaw<LockedStock[]>`
    SELECT s."id", s."stock_id", s."status", s."location", s."price_unit", s."on_hand_pcs",
      s."on_hand_weight_ct"::text AS "on_hand_weight_ct", s."stock_price"::text AS "stock_price",
      s."unit_cost_base"::text AS "unit_cost_base", s."cost_amount_base"::text AS "cost_amount_base", s."version"
    FROM "inventory"."stock" s WHERE s."id" = ANY(${ordered.map((line) => line.stockUuid)}::uuid[])
    ORDER BY s."id" FOR UPDATE`;
  const byId = new Map(stocks.map((stock) => [stock.id, stock]));
  const unavailable = ordered.filter((line) => {
    const stock = byId.get(line.stockUuid);
    return !stock || stock.status !== "ACTIVE" || stock.location.toLocaleLowerCase() !== header.location.toLocaleLowerCase();
  });
  if (unavailable.length) throw new AppError(422, "STOCK_ADJUSTMENT_LINE_UNAVAILABLE", { lineIds: unavailable.map((line) => line.lineId) });
  const changed = ordered.filter((line) => {
    const stock = byId.get(line.stockUuid)!;
    return stock.on_hand_pcs !== line.stockPcs || !new Decimal(stock.on_hand_weight_ct).equals(line.stockWeightCt);
  });
  if (changed.length) throw new AppError(409, "STOCK_ADJUSTMENT_STOCK_CHANGED", { lines: changed.map((line) => {
    const stock = byId.get(line.stockUuid)!;
    return { lineId: line.lineId, onHandPcs: stock.on_hand_pcs, onHandWeightCt: stock.on_hand_weight_ct };
  }) });

  const values = ordered.map((line) => {
    const stock = byId.get(line.stockUuid)!;
    return { line, stock, ...adjustmentDelta(line, stock) };
  });
  const applyValues = values.filter(({ changed }) => changed);
  if (applyValues.length === 0) return;
  const rows = applyValues.map(({ line, dPcs, dWeight, dCost, nextPrice }) => Prisma.sql`(${line.stockUuid}::uuid, ${dPcs}::int,
    ${dWeight.toFixed(3)}::numeric, ${dCost.toFixed(2)}::numeric, ${nextPrice}::numeric)`);
  await tx.$executeRaw(Prisma.sql`
    UPDATE "inventory"."stock" AS s SET
      "on_hand_pcs" = v.dp + s."on_hand_pcs", "pcs" = v.dp + s."pcs",
      "on_hand_weight_ct" = v.dw + s."on_hand_weight_ct", "weight_ct" = v.dw + s."weight_ct",
      "cost_amount_base" = s."cost_amount_base" + v.dc, "stock_price" = v.price,
      "first_used_at" = COALESCE(s."first_used_at", now()), "version" = s."version" + 1, "updated_at" = now()
    FROM (VALUES ${Prisma.join(rows)}) AS v(id, dp, dw, dc, price) WHERE s."id" = v.id`);
  const movementRows = applyValues.map(({ line, dPcs, dWeight, dCost }) => ({
    id: uuidV7(), stock_uuid: line.stockUuid, kind: "ADJUST", document_type: "stock-adjustment", document_id: header.id,
    revision: header.revision, pcs_delta: dPcs, weight_delta: dWeight.toFixed(3), cost_delta_base: dCost.toFixed(2), created_by: header.actorId,
  }));
  if (movementRows.length) await tx.stock_movement.createMany({ data: movementRows });
  const versionRows = applyValues.map(({ line, stock }) => Prisma.sql`(${line.lineId}::uuid, ${stock.version + 1}::int, ${stock.stock_price}::numeric)`);
  await tx.$executeRaw(Prisma.sql`
    UPDATE "inventory"."stock_adjustment_line" AS l SET "applied_version" = v.version, "prev_stock_price" = v.prev_price
    FROM (VALUES ${Prisma.join(versionRows)}) AS v(id, version, prev_price) WHERE l."id" = v.id`);
}

/** Reverses only if every affected stock still has the version written by its adjustment. */
export async function reverseAdjust(tx: Tx, header: AdjustmentHeader): Promise<void> {
  const lines = await tx.$queryRaw<(AdjustmentStockLine & { applied_version: number | null; prev_stock_price: string | null })[]>`
    SELECT l."id" AS "lineId", l."stock_uuid" AS "stockUuid", l."stock_id" AS "stockId", l."position",
      l."stock_pcs" AS "stockPcs", l."stock_weight_ct"::text AS "stockWeightCt", l."stock_price"::text AS "stockPrice",
      l."physical_pcs" AS "physicalPcs", l."physical_weight_ct"::text AS "physicalWeightCt", l."physical_price"::text AS "physicalPrice",
      l."applied_version", l."prev_stock_price"::text AS "prev_stock_price"
    FROM "inventory"."stock_adjustment_line" l WHERE l."adjustment_id" = ${header.id}::uuid ORDER BY l."stock_uuid"`;
  const applied = lines.filter((line) => line.applied_version !== null);
  if (!applied.length) return;
  const stocks = await tx.$queryRaw<LockedStock[]>`
    SELECT s."id", s."stock_id", s."status", s."location", s."price_unit", s."on_hand_pcs",
      s."on_hand_weight_ct"::text AS "on_hand_weight_ct", s."stock_price"::text AS "stock_price",
      s."unit_cost_base"::text AS "unit_cost_base", s."cost_amount_base"::text AS "cost_amount_base", s."version"
    FROM "inventory"."stock" s WHERE s."id" = ANY(${applied.map((line) => line.stockUuid)}::uuid[])
    ORDER BY s."id" FOR UPDATE`;
  const byId = new Map(stocks.map((stock) => [stock.id, stock]));
  const inUse = applied.filter((line) => byId.get(line.stockUuid)?.version !== line.applied_version || !byId.has(line.stockUuid));
  if (inUse.length) throw new AppError(409, "STOCK_ADJUSTMENT_IN_USE", { stockIds: inUse.map((line) => line.stockId) });
  const values = applied.map((line) => {
    const stock = byId.get(line.stockUuid)!;
    const dPcs = line.stockPcs - line.physicalPcs;
    const dWeight = new Decimal(line.stockWeightCt).minus(line.physicalWeightCt);
    const dCost = costDelta(stock, dPcs, dWeight);
    const prevPrice = line.prev_stock_price ?? line.stockPrice;
    return { line, stock, dPcs, dWeight, dCost, prevPrice };
  });
  const rows = values.map(({ line, dPcs, dWeight, dCost, prevPrice }) => Prisma.sql`(${line.stockUuid}::uuid, ${dPcs}::int, ${dWeight.toFixed(3)}::numeric, ${dCost.toFixed(2)}::numeric, ${prevPrice}::numeric)`);
  await tx.$executeRaw(Prisma.sql`
    UPDATE "inventory"."stock" AS s SET "on_hand_pcs" = s."on_hand_pcs" + v.dp, "pcs" = s."pcs" + v.dp,
      "on_hand_weight_ct" = s."on_hand_weight_ct" + v.dw, "weight_ct" = s."weight_ct" + v.dw,
      "cost_amount_base" = s."cost_amount_base" + v.dc, "stock_price" = v.price,
      "version" = s."version" + 1, "updated_at" = now()
    FROM (VALUES ${Prisma.join(rows)}) AS v(id, dp, dw, dc, price) WHERE s."id" = v.id`);
  const movements = values.filter(({ line, dPcs, dWeight, dCost, prevPrice }) => dPcs !== 0 || !dWeight.isZero() || !dCost.isZero() || !new Decimal(prevPrice).equals(line.physicalPrice ?? line.stockPrice)).map(({ line, dPcs, dWeight, dCost }) => ({
    id: uuidV7(), stock_uuid: line.stockUuid, kind: "ADJUST_REVERSAL", document_type: "stock-adjustment", document_id: header.id,
    revision: header.revision, pcs_delta: dPcs, weight_delta: dWeight.toFixed(3), cost_delta_base: dCost.toFixed(2), created_by: header.actorId,
  }));
  if (movements.length) await tx.stock_movement.createMany({ data: movements });
  await tx.$executeRaw`UPDATE "inventory"."stock_adjustment_line" SET "applied_version" = NULL, "prev_stock_price" = NULL WHERE "adjustment_id" = ${header.id}::uuid`;
}
