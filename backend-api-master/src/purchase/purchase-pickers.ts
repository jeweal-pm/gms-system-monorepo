import { z } from "zod";
import { validationException } from "../common/errors";
import { escapeLike } from "../common/persistence";
import { prisma } from "../database/prisma-client";
import { fromDbDate, toDbDate } from "../document-setup/document-setup.service";
import { Prisma } from "../generated/prisma/client";
import { netUnitPrice } from "../trade-document/memo-receive.service";
import { pendingAmount } from "../trade-document/memo-stock.service";
import { purchaseErrors } from "./purchase.errors";
import type { PurchaseOrderLinesInput } from "./purchase.schemas";

const Decimal = Prisma.Decimal;
type Dec = Prisma.Decimal;
const dec = (value: Dec | string) => new Decimal(value.toString());
const invalidCursor = () => validationException([{ path: "cursor", code: "invalid" }]);

// ---- Purchase Order picker (SA-PU-13) ----

const poCursorSchema = z.object({ d: z.iso.date(), c: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/), i: z.uuid(), p: z.number().int().min(1).max(200), v: z.literal(1) }).strict();

/** Opaque keyset cursor: base64url JSON `{d, c, i, p, v: 1}` (PO doc date, PO created_at, PO id, line position). */
export function encodePurchaseOrderLineCursor(docDate: string, createdAt: string, id: string, position: number): string {
  return Buffer.from(JSON.stringify({ d: docDate, c: createdAt, i: id, p: position, v: 1 }), "utf8").toString("base64url");
}

export function decodePurchaseOrderLineCursor(value: string): { docDate: string; createdAt: string; id: string; position: number } {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(value)) throw invalidCursor();
  try {
    const parsed = poCursorSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    if (!parsed.success) throw invalidCursor();
    return { docDate: parsed.data.d, createdAt: parsed.data.c, id: parsed.data.i, position: parsed.data.p };
  } catch {
    throw invalidCursor();
  }
}

type PoLineRow = {
  id: string;
  position: number;
  stone_code_id: string | null;
  stone_code_snapshot: string;
  stone: string;
  shape: string;
  size: string;
  color: string;
  clarity: string;
  cutting: string;
  quality: string;
  lot: string;
  location: string;
  cer_type: string;
  cer_no: string;
  item_note: string;
  pcs: number;
  weight_ct: Dec | string;
  purchased_pcs: number;
  purchased_weight_ct: Dec | string;
  price_unit: string;
  unit_price: Dec | string;
  discount_type: string;
  discount_value: Dec | string;
  amount: Dec | string;
  po_id: string;
  doc_no: string;
  doc_date: Date;
  due_date: Date;
  ref: string;
  created_at_text: string;
};

const PO_OPEN = Prisma.sql`(l.purchased_pcs < l.pcs OR l.purchased_weight_ct < l.weight_ct)`;
const PO_UNTOUCHED = Prisma.sql`(l.purchased_pcs = 0 AND l.purchased_weight_ct = 0)`;

/**
 * `purchase.purchaseOrderLines` (SA-PU-13, R2-D-05): lines of APPROVED POs of the vendor in the document currency with
 * something still to purchase, newest PO first then line position (one PO's lines stay adjacent). OPEN = nothing
 * purchased yet; PARTLY_PURCHASED = some purchased, some outstanding. One page query (LIMIT n + 1) on
 * `purchase_order_line_open_idx` and one `count(*) FILTER` query.
 */
export async function purchaseOrderLines(input: PurchaseOrderLinesInput) {
  const scope: Prisma.Sql[] = [
    Prisma.sql`d.status = 'APPROVED' AND d.deleted_at IS NULL`,
    Prisma.sql`d.vendor_id = ${input.vendorId}::uuid`,
    Prisma.sql`d.currency_code = ${input.currency}::char(3)`,
    PO_OPEN,
  ];
  if (input.q) {
    const pattern = `%${escapeLike(input.q)}%`;
    scope.push(Prisma.sql`(d.doc_no ILIKE ${pattern} OR l.stone ILIKE ${pattern} OR l.lot ILIKE ${pattern} OR l.cer_no ILIKE ${pattern})`);
  }
  if (input.from) scope.push(Prisma.sql`d.doc_date >= ${toDbDate(input.from)}::date`);
  if (input.to) scope.push(Prisma.sql`d.doc_date <= ${toDbDate(input.to)}::date`);
  const page: Prisma.Sql[] = [...scope];
  if (input.status === "OPEN") page.push(PO_UNTOUCHED);
  if (input.status === "PARTLY_PURCHASED") page.push(Prisma.sql`NOT ${PO_UNTOUCHED}`);
  if (input.cursor) {
    const after = decodePurchaseOrderLineCursor(input.cursor);
    const key = Prisma.sql`(${toDbDate(after.docDate)}::date, ${after.createdAt}::timestamp, ${after.id}::uuid)`;
    page.push(Prisma.sql`((d.doc_date, d.created_at, d.id) < ${key} OR ((d.doc_date, d.created_at, d.id) = ${key} AND l.position > ${after.position}::int))`);
  }
  const from = Prisma.sql`"partner"."purchase_order_line" l JOIN "partner"."purchase_order" d ON d.id = l.purchase_order_id`;
  try {
    const [rows, counts] = await Promise.all([
      prisma.$queryRaw<PoLineRow[]>(Prisma.sql`
        SELECT l.id::text AS id, l.position, l.stone_code_id::text AS stone_code_id, l.stone_code_snapshot, l.stone, l.shape, l.size, l.color, l.clarity,
          l.cutting, l.quality, l.lot, l.location, l.cer_type, l.cer_no, l.item_note, l.pcs, l.weight_ct, l.purchased_pcs, l.purchased_weight_ct,
          l.price_unit, l.unit_price, l.discount_type, l.discount_value, l.amount,
          d.id::text AS po_id, d.doc_no, d.doc_date, d.due_date, d.ref, to_char(d.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS created_at_text
        FROM ${from}
        WHERE ${Prisma.join(page, " AND ")}
        ORDER BY d.doc_date DESC, d.created_at DESC, d.id DESC, l.position ASC
        LIMIT ${input.limit + 1}`),
      prisma.$queryRaw<{ all: number; open: number }[]>(Prisma.sql`
        SELECT count(*)::int AS "all", count(*) FILTER (WHERE ${PO_UNTOUCHED})::int AS "open"
        FROM ${from}
        WHERE ${Prisma.join(scope, " AND ")}`),
    ]);
    const items = rows.slice(0, input.limit);
    const last = items.at(-1);
    const all = Number(counts[0]?.all ?? 0);
    const open = Number(counts[0]?.open ?? 0);
    return {
      items: items.map(toPurchaseOrderLineRow),
      nextCursor: rows.length > input.limit && last ? encodePurchaseOrderLineCursor(fromDbDate(last.doc_date), last.created_at_text, last.po_id, Number(last.position)) : null,
      counts: { all, open, partlyPurchased: all - open },
    };
  } catch (error) {
    throw purchaseErrors.map(error, "purchase_order_lines");
  }
}

export function toPurchaseOrderLineRow(row: PoLineRow) {
  const purchasedPcs = Number(row.purchased_pcs);
  const purchasedWeight = dec(row.purchased_weight_ct);
  const availablePcs = Number(row.pcs) - purchasedPcs;
  const availableWeight = dec(row.weight_ct).minus(purchasedWeight);
  return {
    purchaseOrderLineId: row.id,
    status: (purchasedPcs === 0 && purchasedWeight.isZero() ? "OPEN" : "PARTLY_PURCHASED") as "OPEN" | "PARTLY_PURCHASED",
    purchaseOrder: { id: row.po_id, docNo: row.doc_no, docDate: fromDbDate(row.doc_date), dueDate: fromDbDate(row.due_date), ref: row.ref },
    position: Number(row.position),
    stoneCodeId: row.stone_code_id,
    stoneCode: row.stone_code_snapshot,
    stone: row.stone,
    shape: row.shape,
    size: row.size,
    color: row.color,
    clarity: row.clarity,
    cutting: row.cutting,
    quality: row.quality,
    lot: row.lot,
    location: row.location,
    cerType: row.cer_type,
    cerNo: row.cer_no,
    itemNote: row.item_note,
    orderedPcs: Number(row.pcs),
    orderedWeightCt: dec(row.weight_ct).toFixed(3),
    purchasedPcs,
    purchasedWeightCt: purchasedWeight.toFixed(3),
    availablePcs,
    availableWeightCt: availableWeight.toFixed(3),
    priceUnit: row.price_unit as "PER_CT" | "PER_PCS",
    unitPrice: dec(row.unit_price).toFixed(2),
    // D12: the price after the PO line discount, 2 dp (the starting Price on the frontend).
    netUnitPrice: netUnitPrice({
      priceUnit: row.price_unit, pcs: Number(row.pcs), weightCt: dec(row.weight_ct), unitPrice: dec(row.unit_price), amount: dec(row.amount),
      discountType: row.discount_type, discountValue: dec(row.discount_value),
    }).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
    amount: pendingAmount({
      price_unit: row.price_unit, received_pcs: Number(row.pcs), received_weight_ct: row.weight_ct,
      pending_pcs: availablePcs, pending_weight_ct: availableWeight.toFixed(3), line_amount: row.amount,
    }).toFixed(2),
  };
}
