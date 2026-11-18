import { Prisma, type Tx } from "../../platform/db";
import { AppError } from "../../platform/errors";
import type { NormalizedDocument } from "./prepare";

/** Set-based writes of a document's parts (sources, rows, row ↔ source quantities, row photos): 4 statements. */
export async function insertParts(tx: Tx, loadId: string, doc: NormalizedDocument, stockIdOf: ReadonlyMap<string, string | null> = new Map()) {
  await tx.load_to_stock_source.createMany({
    data: doc.sources.map((source) => ({
      id: source.id, load_id: loadId, position: source.position, purchase_line_id: source.purchaseLineId, purchase_id: source.purchaseId,
      purchase_doc_no: source.purchaseDocNo, purchase_doc_date: new Date(`${source.purchaseDocDate}T00:00:00Z`), purchase_currency: source.purchaseCurrency,
      exchange_rate: source.exchangeRate, price_unit: source.priceUnit, unit_price: source.unitPrice, net_unit_price: source.netUnitPrice, unit_cost_base: source.unitCostBase,
      line_pcs: source.linePcs, line_weight_ct: source.lineWeightCt, location: source.location.slice(0, 40), item_note: source.itemNote.slice(0, 500),
      stone_code_id: source.attrs.stoneCodeId, stone_code: source.attrs.stoneCode, stone: source.attrs.stone, shape: source.attrs.shape, size: source.attrs.size,
      color: source.attrs.color, clarity: source.attrs.clarity, cutting: source.attrs.cutting, quality: source.attrs.quality, lot: source.attrs.lot,
      cer_type: source.attrs.cerType, cer_no: source.attrs.cerNo,
    })),
  });
  await tx.load_to_stock_row.createMany({
    data: doc.rows.map((row) => ({
      id: row.id, load_id: loadId, position: row.position, location: row.location, parcel: row.parcel,
      stone_code_id: row.attrs.stoneCodeId, stone_code: row.attrs.stoneCode, stone: row.attrs.stone, shape: row.attrs.shape, size: row.attrs.size, color: row.attrs.color,
      clarity: row.attrs.clarity, cutting: row.attrs.cutting, quality: row.attrs.quality, lot: row.attrs.lot, cer_type: row.attrs.cerType, cer_no: row.attrs.cerNo,
      price_unit: row.priceUnit, pcs: row.pcs, weight_ct: row.weightCt, unit_cost_base: row.unitCostBase, cost_amount_base: row.costAmountBase,
      stock_price: row.stockPrice, sale_price: row.salePrice, item_note: row.itemNote, stock_id: stockIdOf.get(row.id) ?? null,
    })),
  });
  const sourceId = new Map(doc.sources.map((source) => [source.purchaseLineId, source.id]));
  await tx.load_to_stock_row_source.createMany({
    data: doc.rows.flatMap((row) => row.sources.map((source) => ({ row_id: row.id, source_id: sourceId.get(source.purchaseLineId)!, pcs: source.pcs, weight_ct: source.weightCt, cost_amount_base: source.costAmountBase }))),
  });
  const photos = doc.rows.flatMap((row) => row.photoIds.map((fileId, index) => ({ row_id: row.id, position: index + 1, file_id: fileId })));
  if (photos.length > 0) await tx.load_to_stock_row_photo.createMany({ data: photos });
}

/** Replaces the parts; stocks are detached first (re-linked by the stock component for kept rows). */
export async function replaceParts(tx: Tx, loadId: string, doc: NormalizedDocument, stockIdOf: ReadonlyMap<string, string | null>) {
  await tx.$executeRaw`UPDATE "inventory"."stock" SET "load_row_id" = NULL WHERE "load_id" = ${loadId}::uuid AND "load_row_id" IS NOT NULL`;
  await tx.$executeRaw`DELETE FROM "inventory"."load_to_stock_row" WHERE "load_id" = ${loadId}::uuid`;
  await tx.$executeRaw`DELETE FROM "inventory"."load_to_stock_source" WHERE "load_id" = ${loadId}::uuid`;
  await insertParts(tx, loadId, doc, stockIdOf);
}

export const headerFields = (doc: NormalizedDocument) => ({
  doc_date: new Date(`${doc.docDate}T00:00:00Z`), vendor_id: doc.vendorId, vendor_code_snapshot: doc.vendorCode.slice(0, 120), vendor_name_snapshot: doc.vendorName.slice(0, 200),
  currency_code: doc.currency, ref: doc.ref, document_note: doc.documentNote, mode: doc.mode, row_count: doc.totals.rowCount, total_pcs: doc.totals.pcs,
  total_weight_ct: doc.totals.weightCt, total_cost_base: doc.totals.costAmountBase,
});

/** Every photo id must be a READY `load-to-stock.row-photo` file → else 422 LOAD_TO_STOCK_PHOTO_INVALID at the first bad one. */
export async function checkPhotos(tx: Tx, rows: readonly { photoIds: readonly string[] }[]) {
  const ids = [...new Set(rows.flatMap((row) => row.photoIds))];
  if (ids.length === 0) return;
  const found = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "inventory"."stored_file" WHERE "id" = ANY(${ids}::uuid[]) AND "status" = 'ready' AND "source_type" = 'load-to-stock.row-photo'`;
  const ok = new Set(found.map((row) => row.id));
  const fieldErrors = rows.flatMap((row, index) => row.photoIds.flatMap((id, position) => (ok.has(id) ? [] : [{ path: `rows.${index}.photoIds.${position}`, code: "invalid_photo" }])));
  if (fieldErrors.length > 0) throw new AppError(422, "LOAD_TO_STOCK_PHOTO_INVALID", { fieldErrors: fieldErrors.slice(0, 50) });
}

/** Running number per numbering row (max + 1 under a transaction advisory lock, ADR-0052 D10). */
export async function nextRunningNo(tx: Tx | { $queryRaw: Tx["$queryRaw"] }, numbering: { id: string; startNo: number } | null, lock: boolean): Promise<number> {
  const key = `inventory.load_to_stock.numbering:${numbering?.id ?? "plain"}`;
  if (lock) await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${key}))) AS l`;
  const rows = numbering
    ? await tx.$queryRaw<{ max: number | null }[]>`SELECT max("running_no") AS "max" FROM "inventory"."load_to_stock" WHERE "numbering_id" = ${numbering.id}::uuid`
    : await tx.$queryRaw<{ max: number | null }[]>`SELECT max("running_no") AS "max" FROM "inventory"."load_to_stock" WHERE "numbering_id" IS NULL`;
  const max = rows[0]?.max ?? null;
  if (!numbering) return (max ?? 0) + 1;
  return max === null ? numbering.startNo : Math.max(max + 1, numbering.startNo);
}

export const formatDocNo = (numbering: { prefix: string; separator: string } | null, runningNo: number) => (numbering ? `${numbering.prefix}${numbering.separator}${runningNo}` : String(runningNo));

type MissRow = { status: string; version: number; deleted_at: Date | null; sync_state: string; provisional: boolean };

/** Explains a guarded-update miss: not found → 404; deleted / syncing / wrong status → 409; else stale version. */
export async function explainMiss(tx: Tx | { $queryRaw: Tx["$queryRaw"] }, id: string, allowed: readonly string[]): Promise<never> {
  const [row] = await tx.$queryRaw<MissRow[]>`SELECT "status", "version", "deleted_at", "sync_state", "provisional" FROM "inventory"."load_to_stock" WHERE "id" = ${id}::uuid`;
  if (!row || row.provisional) throw new AppError(404, "LOAD_TO_STOCK_NOT_FOUND");
  if (row.deleted_at) throw new AppError(409, "LOAD_TO_STOCK_STATUS_INVALID", { status: "DELETED" });
  if (row.sync_state === "SYNCING") throw new AppError(409, "LOAD_TO_STOCK_BUSY", { retryAfterSeconds: 5 });
  if (!allowed.includes(row.status)) throw new AppError(409, "LOAD_TO_STOCK_STATUS_INVALID", { status: row.status });
  throw new AppError(409, "LOAD_TO_STOCK_CHANGED", { currentVersion: row.version });
}

export const sqlList = (values: readonly string[]) => Prisma.join(values.map((value) => Prisma.sql`${value}`));
