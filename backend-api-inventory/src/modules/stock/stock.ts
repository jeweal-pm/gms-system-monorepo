import { uuidV7 } from "@gms/storage";
import { Decimal, Prisma, type Tx } from "../../platform/db";

/**
 * Own stock component (ADR-0052 D6/D9/D15 phase 1, SA-LS-04/17): one `stock` row per Stock ID with buckets
 * on_hand / reserved / memo_out / sold / consumed (CHECK pcs = Σ buckets, same for weight), photos, and the
 * append-only `stock_movement` ledger. Later modules (merge-split, transfer, adjustment, sale, phase-2 holds) change
 * stock only through this module. "In use" = any quantity outside on-hand (current state).
 *
 * Every function is set-based: a bounded number of statements independent of the row count (NP-LS-05).
 */

export type StockSource = {
  loadRowId: string; stockId: string; location: string; parcel: string;
  attrs: { stoneCodeId: string | null; stoneCode: string; stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string; lot: string; cerType: string; cerNo: string };
  priceUnit: string; pcs: number; weightCt: string; unitCostBase: string; costAmountBase: string; stockPrice: string; salePrice: string; itemNote: string;
  photoIds: string[];
};
export type StockHeader = { loadId: string; currency: string; vendorId: string; vendorName: string; revision: number; actorId: string; documentType?: string };

const stockData = (header: StockHeader, row: StockSource, id: string) => ({
  id, stock_id: row.stockId, load_row_id: row.loadRowId, load_id: header.loadId, status: "ACTIVE", location: row.location, parcel: row.parcel,
  stone_code_id: row.attrs.stoneCodeId, stone_code: row.attrs.stoneCode, stone: row.attrs.stone, shape: row.attrs.shape, size: row.attrs.size, color: row.attrs.color,
  clarity: row.attrs.clarity, cutting: row.attrs.cutting, quality: row.attrs.quality, lot: row.attrs.lot, cer_type: row.attrs.cerType, cer_no: row.attrs.cerNo,
  price_unit: row.priceUnit, pcs: row.pcs, weight_ct: row.weightCt, on_hand_pcs: row.pcs, on_hand_weight_ct: row.weightCt,
  unit_cost_base: row.unitCostBase, cost_amount_base: row.costAmountBase, stock_price: row.stockPrice, sale_price: row.salePrice,
  currency_code: header.currency, vendor_id: header.vendorId, vendor_name_snapshot: header.vendorName, item_note: row.itemNote,
});

/** New stocks (LOAD_IN): ≤ 3 statements for any number of rows. */
export async function createStocks(tx: Tx, header: StockHeader, rows: readonly StockSource[]): Promise<void> {
  if (rows.length === 0) return;
  const ids = rows.map(() => uuidV7());
  await tx.stock.createMany({ data: rows.map((row, index) => stockData(header, row, ids[index])) });
  const photos = rows.flatMap((row, index) => row.photoIds.map((fileId, position) => ({ stock_uuid: ids[index], position: position + 1, file_id: fileId })));
  if (photos.length > 0) await tx.stock_photo.createMany({ data: photos });
  await tx.stock_movement.createMany({
    data: rows.map((row, index) => ({
      id: uuidV7(), stock_uuid: ids[index], kind: "LOAD_IN", document_type: header.documentType ?? "load-to-stock", document_id: header.loadId, revision: header.revision,
      pcs_delta: row.pcs, weight_delta: row.weightCt, cost_delta_base: row.costAmountBase, created_by: header.actorId,
    })),
  });
}

type ActiveStock = { id: string; stock_id: string; pcs: number; weight_ct: string; cost_amount_base: string; on_hand_pcs: number; on_hand_weight_ct: string };

/** Locks the load's active stocks (id order) and returns them with the in-use ones (quantity outside on-hand). */
export async function lockLoadStocks(tx: Tx, loadId: string): Promise<{ stocks: ActiveStock[]; inUse: string[] }> {
  const stocks = await tx.$queryRaw<ActiveStock[]>`
    SELECT "id", "stock_id", "pcs", "weight_ct"::text AS "weight_ct", "cost_amount_base"::text AS "cost_amount_base", "on_hand_pcs", "on_hand_weight_ct"::text AS "on_hand_weight_ct"
    FROM "inventory"."stock" WHERE "load_id" = ${loadId}::uuid AND "status" = 'ACTIVE' ORDER BY "id" FOR UPDATE`;
  const inUse = stocks.filter((stock) => stock.on_hand_pcs !== stock.pcs || !new Decimal(stock.on_hand_weight_ct).equals(stock.weight_ct)).map((stock) => stock.stock_id);
  return { stocks, inUse };
}

/** Reverses stocks (LOAD_REVERSAL, negative deltas); the Stock ID stays retired (never reused). ≤ 2 statements. */
export async function reverseStocks(tx: Tx, header: StockHeader, stocks: readonly ActiveStock[]): Promise<void> {
  if (stocks.length === 0) return;
  await tx.stock_movement.createMany({
    data: stocks.map((stock) => ({
      id: uuidV7(), stock_uuid: stock.id, kind: "LOAD_REVERSAL", document_type: "load-to-stock", document_id: header.loadId, revision: header.revision,
      pcs_delta: -stock.pcs, weight_delta: new Decimal(stock.weight_ct).negated().toFixed(3), cost_delta_base: new Decimal(stock.cost_amount_base).negated().toFixed(2), created_by: header.actorId,
    })),
  });
  await tx.$executeRaw`
    UPDATE "inventory"."stock" SET "status" = 'REVERSED', "pcs" = 0, "weight_ct" = 0, "on_hand_pcs" = 0, "on_hand_weight_ct" = 0,
      "load_row_id" = NULL, "version" = "version" + 1, "updated_at" = now()
    WHERE "id" = ANY(${stocks.map((stock) => stock.id)}::uuid[])`;
}

/**
 * After an applied edit: kept rows update their stock (LOAD_ADJUST with the deltas), removed rows reverse theirs, new rows
 * create stock. Photos of kept stocks are replaced by the row's photos. Bounded statements for any row count.
 */
export async function applyStockEdit(tx: Tx, header: StockHeader, rows: readonly StockSource[], stocks: readonly ActiveStock[]): Promise<void> {
  const byStockId = new Map(stocks.map((stock) => [stock.stock_id, stock]));
  const kept = rows.filter((row) => byStockId.has(row.stockId));
  const fresh = rows.filter((row) => !byStockId.has(row.stockId));
  const keptIds = new Set(kept.map((row) => row.stockId));
  await reverseStocks(tx, header, stocks.filter((stock) => !keptIds.has(stock.stock_id)));
  if (kept.length > 0) {
    const values = kept.map((row) => Prisma.sql`(${byStockId.get(row.stockId)!.id}::uuid, ${row.loadRowId}::uuid, ${row.location}, ${row.parcel}, ${row.attrs.stoneCodeId}::uuid,
      ${row.attrs.stoneCode}, ${row.attrs.stone}, ${row.attrs.shape}, ${row.attrs.size}, ${row.attrs.color}, ${row.attrs.clarity}, ${row.attrs.cutting}, ${row.attrs.quality},
      ${row.attrs.lot}, ${row.attrs.cerType}, ${row.attrs.cerNo}, ${row.priceUnit}, ${row.pcs}::int, ${row.weightCt}::numeric, ${row.unitCostBase}::numeric,
      ${row.costAmountBase}::numeric, ${row.stockPrice}::numeric, ${row.salePrice}::numeric, ${row.itemNote})`);
    await tx.$executeRaw(Prisma.sql`
      UPDATE "inventory"."stock" AS s SET "load_row_id" = v.row_id, "location" = v.location, "parcel" = v.parcel, "stone_code_id" = v.code_id, "stone_code" = v.code,
        "stone" = v.stone, "shape" = v.shape, "size" = v.size, "color" = v.color, "clarity" = v.clarity, "cutting" = v.cutting, "quality" = v.quality, "lot" = v.lot,
        "cer_type" = v.cer_type, "cer_no" = v.cer_no, "price_unit" = v.price_unit, "pcs" = v.pcs, "weight_ct" = v.weight, "on_hand_pcs" = v.pcs, "on_hand_weight_ct" = v.weight,
        "unit_cost_base" = v.unit_cost, "cost_amount_base" = v.cost, "stock_price" = v.stock_price, "sale_price" = v.sale_price, "item_note" = v.note,
        "version" = s."version" + 1, "updated_at" = now()
      FROM (VALUES ${Prisma.join(values)}) AS v(id, row_id, location, parcel, code_id, code, stone, shape, size, color, clarity, cutting, quality, lot, cer_type, cer_no,
        price_unit, pcs, weight, unit_cost, cost, stock_price, sale_price, note)
      WHERE s."id" = v.id`);
    const adjustments = kept.flatMap((row) => {
      const stock = byStockId.get(row.stockId)!;
      const pcs = row.pcs - stock.pcs;
      const weight = new Decimal(row.weightCt).minus(stock.weight_ct);
      const cost = new Decimal(row.costAmountBase).minus(stock.cost_amount_base);
      return pcs === 0 && weight.isZero() && cost.isZero() ? [] : [{
        id: uuidV7(), stock_uuid: stock.id, kind: "LOAD_ADJUST", document_type: "load-to-stock", document_id: header.loadId, revision: header.revision,
        pcs_delta: pcs, weight_delta: weight.toFixed(3), cost_delta_base: cost.toFixed(2), created_by: header.actorId,
      }];
    });
    if (adjustments.length > 0) await tx.stock_movement.createMany({ data: adjustments });
    const keptUuids = kept.map((row) => byStockId.get(row.stockId)!.id);
    await tx.stock_photo.deleteMany({ where: { stock_uuid: { in: keptUuids } } });
    const photos = kept.flatMap((row) => row.photoIds.map((fileId, position) => ({ stock_uuid: byStockId.get(row.stockId)!.id, position: position + 1, file_id: fileId })));
    if (photos.length > 0) await tx.stock_photo.createMany({ data: photos });
  }
  await createStocks(tx, header, fresh);
}
