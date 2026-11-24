import { AppError } from "../../platform/errors";
import { Prisma, type Tx } from "../../platform/db";
import type { NormalizedLine, NormalizedSale } from "./prepare";

/**
 * Set-based writes of a Sale's parts (lines, charges, line photo links): ≤ 3 statements whatever the line count, and the
 * guarded-update helpers (sale database-diagram part A). Photo links only: stored files are never deleted (ADR-0030).
 */
export async function insertParts(tx: Tx, saleId: string, doc: Pick<NormalizedSale, "lines" | "serviceCharges">) {
  await tx.sale_line.createMany({ data: doc.lines.map((line) => lineRow(saleId, line)) });
  if (doc.serviceCharges.length > 0) await tx.sale_charge.createMany({ data: doc.serviceCharges.map((charge) => ({ sale_id: saleId, charge_type: charge.type, amount: charge.amount })) });
  const photos = doc.lines.flatMap((line) => line.photoIds.map((fileId, index) => ({ line_id: line.id, position: index, file_id: fileId })));
  if (photos.length > 0) await tx.sale_line_photo.createMany({ data: photos });
}

/** Replaces lines (photo links cascade) and charges, then inserts the new set. */
export async function replaceParts(tx: Tx, saleId: string, doc: Pick<NormalizedSale, "lines" | "serviceCharges">) {
  await tx.$executeRaw`DELETE FROM "inventory"."sale_line" WHERE "sale_id" = ${saleId}::uuid`;
  await tx.$executeRaw`DELETE FROM "inventory"."sale_charge" WHERE "sale_id" = ${saleId}::uuid`;
  await insertParts(tx, saleId, doc);
}

function lineRow(saleId: string, line: NormalizedLine) {
  return {
    id: line.id, sale_id: saleId, position: line.position, source: line.source,
    reserve_line_id: line.reserveLineId, reserve_id: line.reserveId, reserve_doc_no: line.reserveDocNo,
    memo_stock_id: line.memoStockId, lot_key: line.lotKey, stock_count: line.stockCount, stock_id: line.stockId.slice(0, 10), memo_receive_id: line.memoReceiveId, memo_receive_doc_no: line.memoReceiveDocNo,
    load_id: line.loadId, load_doc_no: line.loadDocNo ? line.loadDocNo.slice(0, 40) : null,
    stone_code: line.attrs.stoneCode.slice(0, 60), stone: line.attrs.stone.slice(0, 60), shape: line.attrs.shape.slice(0, 60), size: line.attrs.size.slice(0, 60),
    color: line.attrs.color.slice(0, 60), clarity: line.attrs.clarity.slice(0, 60), cutting: line.attrs.cutting.slice(0, 60), quality: line.attrs.quality.slice(0, 60),
    lot: line.attrs.lot.slice(0, 40), location: line.attrs.location.slice(0, 40), cer_type: line.attrs.cerType.slice(0, 20), cer_no: line.attrs.cerNo.slice(0, 60),
    price_unit: line.priceUnit, pcs: line.pcs, weight_ct: line.weightCt, cap_pcs: line.capPcs, cap_weight_ct: line.capWeightCt,
    reserve_net_unit_price: line.reserveNetUnitPrice, unit_price: line.unitPrice, discount_type: line.discount.type, discount_value: line.discount.value,
    discount_amount: line.discountAmount, amount: line.amount, item_note: line.itemNote.slice(0, 500),
  };
}

/**
 * ADR-0055 D7: replaces the Sale's allocation copy with master's result for the applied revision (one DELETE + one
 * INSERT … SELECT joined to the live lines, so a line removed meanwhile is skipped). Audit / reports only. Own-stock
 * allocations (`own_stock_uuid`, ADR-0058) belong to inventory and are never touched here.
 */
export async function writeSaleAllocations(tx: Tx, saleId: string, allocations: readonly { lineId: string; rows: { seq: number; stockUuid: string; stockId: string; pcs: number; weightCt: string }[] }[]) {
  await tx.$executeRaw`DELETE FROM "inventory"."sale_line_alloc" a USING "inventory"."sale_line" l WHERE a."sale_line_id" = l."id" AND l."sale_id" = ${saleId}::uuid AND a."own_stock_uuid" IS NULL`;
  const rows = allocations.flatMap((entry) => entry.rows.filter((row) => row.pcs > 0 || Number(row.weightCt) > 0).map((row) => ({ lineId: entry.lineId, ...row })));
  if (rows.length === 0) return;
  const values = rows.map((row) => Prisma.sql`(${row.lineId}::uuid, ${row.seq}::smallint, ${row.stockUuid}::uuid, ${row.stockId.slice(0, 10)}, ${row.pcs}::int, ${row.weightCt}::numeric)`);
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "inventory"."sale_line_alloc" ("id", "sale_line_id", "seq", "memo_stock_id", "stock_id", "pcs", "weight_ct")
    SELECT uuidv7(), v.line_id, v.seq, v.stock, v.stock_id, v.pcs, v.weight FROM (VALUES ${Prisma.join(values)}) AS v(line_id, seq, stock, stock_id, pcs, weight)
    JOIN "inventory"."sale_line" l ON l."id" = v.line_id AND l."sale_id" = ${saleId}::uuid`);
}

/** Header columns of a normalized document (snapshots clipped to their column sizes). */
export const headerFields = (doc: NormalizedSale) => ({
  doc_date: new Date(`${doc.docDate}T00:00:00Z`), due_date: new Date(`${doc.dueDate}T00:00:00Z`),
  customer_id: doc.customerId, customer_code_snapshot: doc.customerCode.slice(0, 120), customer_name_snapshot: doc.customerName.slice(0, 200),
  shipping_address_id: doc.shippingAddressId, shipping_address_snapshot: doc.shippingText.slice(0, 1000),
  invoice_address_id: doc.invoiceAddressId, invoice_address_snapshot: doc.invoiceText.slice(0, 1000),
  currency_code: doc.currency, exchange_rate: doc.exchangeRate, ref: doc.ref, document_note: doc.documentNote,
  discount_type: doc.discount.type, discount_value: doc.discount.value,
  tax_enabled: doc.tax.enabled, tax_rate: doc.tax.rate, tax_included: doc.tax.includeInPrice,
  labor_work: doc.labor?.work ?? null, labor_basis: doc.labor?.basis ?? null, labor_qty: doc.labor?.qty ?? null, labor_rate: doc.labor?.rate ?? null,
  subtotal: doc.totals.subtotal, discount_amount: doc.totals.discountAmount, price_before_tax: doc.totals.priceBeforeTax, tax_amount: doc.totals.taxAmount,
  charges_amount: doc.totals.chargesAmount, labor_amount: doc.totals.laborAmount, grand_total: doc.totals.grandTotal,
  line_count: doc.totals.lineCount, total_pcs: doc.totals.pcs, total_weight_ct: doc.totals.weightCt,
});

/**
 * ADR-0054 D9: every photo id must be a READY `sale-line` file that is either linked from this Sale already or the
 * caller's own unlinked upload → else 422 SALE_PHOTO_INVALID at each bad one. One statement.
 */
export async function checkPhotos(tx: Tx, saleId: string | null, actorId: string, lines: readonly { photoIds: readonly string[] }[]) {
  const ids = [...new Set(lines.flatMap((line) => line.photoIds))];
  if (ids.length === 0) return;
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT f."id" FROM "inventory"."stored_file" f
    WHERE f."id" = ANY(${ids}::uuid[]) AND f."status" = 'ready' AND f."source_type" = ${SALE_PHOTO_SOURCE}
      AND (
        EXISTS (SELECT 1 FROM "inventory"."sale_line_photo" p JOIN "inventory"."sale_line" l ON l."id" = p."line_id" WHERE p."file_id" = f."id" AND l."sale_id" = ${saleId}::uuid)
        OR (f."created_by" = ${actorId} AND NOT EXISTS (SELECT 1 FROM "inventory"."sale_line_photo" p WHERE p."file_id" = f."id"))
      )`;
  const ok = new Set(rows.map((row) => row.id));
  const fieldErrors = lines.flatMap((line, index) => line.photoIds.flatMap((id, position) => (ok.has(id) ? [] : [{ path: `lines.${index}.photoIds.${position}`, code: "invalid_photo" }])));
  if (fieldErrors.length > 0) throw new AppError(422, "SALE_PHOTO_INVALID", { fieldErrors: fieldErrors.slice(0, 50) });
}
export const SALE_PHOTO_SOURCE = "sale-line";

/** Running number per numbering row: max + 1 under a transaction advisory lock (ADR-0052 D10 / ADR-0054 D10). */
export async function nextRunningNo(tx: { $queryRaw: Tx["$queryRaw"] }, numbering: { id: string; startNo: number } | null, lock: boolean): Promise<number> {
  const key = `inventory.sale.numbering:${numbering?.id ?? "plain"}`;
  if (lock) await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${key}))) AS l`;
  const rows = numbering
    ? await tx.$queryRaw<{ max: number | null }[]>`SELECT max("running_no") AS "max" FROM "inventory"."sale" WHERE "numbering_id" = ${numbering.id}::uuid`
    : await tx.$queryRaw<{ max: number | null }[]>`SELECT max("running_no") AS "max" FROM "inventory"."sale" WHERE "numbering_id" IS NULL`;
  const max = rows[0]?.max ?? null;
  if (!numbering) return (max ?? 0) + 1;
  return max === null ? numbering.startNo : Math.max(max + 1, numbering.startNo);
}

export const formatDocNo = (numbering: { prefix: string; separator: string } | null, runningNo: number) => (numbering ? `${numbering.prefix}${numbering.separator}${runningNo}` : String(runningNo));

type MissRow = { status: string; version: number; deleted_at: Date | null; sync_state: string; provisional: boolean; auto_approved: boolean };

/** `APPROVED_AUTO` in an allowed list = an auto-approved APPROVED Sale (edit / delete until used, SQ-SL-02). */
export const APPROVED_AUTO = "APPROVED_AUTO";

/**
 * Explains a guarded-update miss (error-handling.md): not found / provisional → 404; deleted → SALE_DELETED (restore:
 * not deleted → SALE_STATUS_INVALID); syncing → SALE_BUSY; wrong status → SALE_STATUS_INVALID; else stale → SALE_CHANGED.
 */
export async function explainMiss(tx: { $queryRaw: Tx["$queryRaw"] }, id: string, allowed: readonly string[], options: { deleted?: boolean } = {}): Promise<never> {
  const [row] = await tx.$queryRaw<MissRow[]>`SELECT "status", "version", "deleted_at", "sync_state", "provisional", "auto_approved" FROM "inventory"."sale" WHERE "id" = ${id}::uuid`;
  if (!row || row.provisional) throw new AppError(404, "SALE_NOT_FOUND");
  if (options.deleted && !row.deleted_at) throw new AppError(409, "SALE_STATUS_INVALID", { status: row.status });
  if (!options.deleted && row.deleted_at) throw new AppError(409, "SALE_DELETED");
  if (row.sync_state === "SYNCING") throw new AppError(409, "SALE_BUSY", { retryAfterSeconds: 5 }, { "Retry-After": "5" });
  const permitted = options.deleted || allowed.includes(row.status) || (row.status === "APPROVED" && row.auto_approved && allowed.includes(APPROVED_AUTO));
  if (!permitted) throw new AppError(409, "SALE_STATUS_INVALID", { status: row.status });
  throw new AppError(409, "SALE_CHANGED", { currentVersion: row.version });
}

export const sqlList = (values: readonly string[]) => Prisma.join(values.map((value) => Prisma.sql`${value}`));
