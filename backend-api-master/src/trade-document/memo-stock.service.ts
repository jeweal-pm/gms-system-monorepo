import { Injectable } from "@nestjs/common";
import { validationException } from "../common/errors";
import { escapeLike } from "../common/persistence";
import { prisma } from "../database/prisma-client";
import { fromDbDate, toDbDate } from "../document-setup/document-setup.service";
import { Prisma } from "../generated/prisma/client";
import { memoReceiveErrors } from "./memo-receive.service";
import type { MemoStockListInput } from "./memo-schemas";

const Decimal = Prisma.Decimal;
type Dec = Prisma.Decimal;

type StockRow = {
  id: string;
  stock_id: string;
  lot: string;
  location: string;
  item_note: string;
  stone: string;
  shape: string;
  size: string;
  color: string;
  clarity: string;
  cutting: string;
  quality: string;
  cer_type: string;
  cer_no: string;
  received_pcs: number;
  received_weight_ct: Dec | string;
  pending_pcs: number;
  pending_weight_ct: Dec | string;
  price_unit: string;
  unit_price: Dec | string;
  net_unit_price: Dec | string;
  line_amount: Dec | string;
  currency_code: string;
  vendor_id: string;
  vendor_code_snapshot: string;
  vendor_name_snapshot: string;
  memo_receive_id: string;
  received_doc_no: string;
  received_doc_date: Date;
  due_date: Date;
};

const dec = (value: Dec | string) => new Decimal(value.toString());

/**
 * Dialog amount (SA-MR-11): line amount × pending basis ÷ received basis (weight for PER_CT, pcs for PER_PCS),
 * half-up 2 dp, so a fully pending item shows exactly its line amount.
 */
export function pendingAmount(row: Pick<StockRow, "price_unit" | "received_pcs" | "received_weight_ct" | "pending_pcs" | "pending_weight_ct" | "line_amount">): Dec {
  const perCt = row.price_unit === "PER_CT";
  const received = perCt ? dec(row.received_weight_ct) : new Decimal(row.received_pcs);
  const pending = perCt ? dec(row.pending_weight_ct) : new Decimal(row.pending_pcs);
  const amount = dec(row.line_amount);
  if (received.isZero() || pending.equals(received)) return amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return amount.times(pending).dividedBy(received).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Opaque keyset cursor: base64url of `receivedDocDate|stockId` (api-contract). */
export function encodeStockCursor(docDate: string, stockId: string): string {
  return Buffer.from(`${docDate}|${stockId}`, "utf8").toString("base64url");
}

function decodeStockCursor(value: string): { docDate: string; stockId: string } {
  const invalid = () => validationException([{ path: "cursor", code: "invalid" }]);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(value)) throw invalid();
  const match = /^(\d{4}-\d{2}-\d{2})\|(\d{6})$/.exec(Buffer.from(value, "base64url").toString("utf8"));
  if (!match || Number.isNaN(Date.parse(match[1]))) throw invalid();
  return { docDate: match[1], stockId: match[2] };
}

/**
 * memoStock.list (memo-receive SA-MR-11, ADR-0034 D7): a vendor's Memo Stock items with pending pcs or weight, for the
 * Memo Return "Add Memo Stock" dialog. One query (LIMIT limit + 1) on the partial index `memo_stock_pending_idx`;
 * no count. Read only in this revision: Memo Return will be the only writer of `pending_*`.
 */
@Injectable()
export class MemoStockService {
  async list(input: MemoStockListInput) {
    const filters: Prisma.Sql[] = [
      Prisma.sql`vendor_id = ${input.vendorId}::uuid`,
      Prisma.sql`(pending_pcs > 0 OR pending_weight_ct > 0)`,
    ];
    if (input.q) {
      const pattern = `%${escapeLike(input.q)}%`;
      filters.push(Prisma.sql`(stock_id ILIKE ${pattern} OR lot ILIKE ${pattern} OR stone ILIKE ${pattern} OR cer_no ILIKE ${pattern} OR received_doc_no ILIKE ${pattern})`);
    }
    if (input.from) filters.push(Prisma.sql`received_doc_date >= ${toDbDate(input.from)}::date`);
    if (input.to) filters.push(Prisma.sql`received_doc_date <= ${toDbDate(input.to)}::date`);
    if (input.cursor) {
      const after = decodeStockCursor(input.cursor);
      filters.push(Prisma.sql`(received_doc_date, stock_id) < (${toDbDate(after.docDate)}::date, ${after.stockId}::varchar)`);
    }
    try {
      const rows = await prisma.$queryRaw<StockRow[]>(Prisma.sql`
        SELECT id::text AS id, stock_id, lot, location, item_note, stone, shape, size, color, clarity, cutting, quality, cer_type, cer_no,
          received_pcs, received_weight_ct, pending_pcs, pending_weight_ct, price_unit, unit_price, net_unit_price, line_amount, currency_code,
          vendor_id::text AS vendor_id, vendor_code_snapshot, vendor_name_snapshot, memo_receive_id::text AS memo_receive_id,
          received_doc_no, received_doc_date, due_date
        FROM "partner"."memo_stock"
        WHERE ${Prisma.join(filters, " AND ")}
        ORDER BY received_doc_date DESC, stock_id DESC
        LIMIT ${input.limit + 1}`);
      const page = rows.slice(0, input.limit);
      const last = page.at(-1);
      return {
        items: page.map(toStockRow),
        nextCursor: rows.length > input.limit && last ? encodeStockCursor(fromDbDate(last.received_doc_date), last.stock_id) : null,
      };
    } catch (error) {
      throw memoReceiveErrors.map(error, "memo_stock.list");
    }
  }
}

function toStockRow(row: StockRow) {
  return {
    id: row.id,
    stockId: row.stock_id,
    lot: row.lot,
    location: row.location as "Memo",
    itemNote: row.item_note,
    stone: row.stone,
    shape: row.shape,
    size: row.size,
    color: row.color,
    clarity: row.clarity,
    cutting: row.cutting,
    quality: row.quality,
    cerType: row.cer_type,
    cerNo: row.cer_no,
    receivedPcs: Number(row.received_pcs),
    receivedWeightCt: dec(row.received_weight_ct).toFixed(3),
    pendingPcs: Number(row.pending_pcs),
    pendingWeightCt: dec(row.pending_weight_ct).toFixed(3),
    priceUnit: (row.price_unit === "PER_CT" ? "CTS" : "PCS") as "CTS" | "PCS",
    unitPrice: dec(row.unit_price).toFixed(2),
    netUnitPrice: dec(row.net_unit_price).toFixed(4),
    currency: row.currency_code,
    amount: pendingAmount(row).toFixed(2),
    vendor: { id: row.vendor_id, code: row.vendor_code_snapshot, name: row.vendor_name_snapshot },
    memoReceive: { id: row.memo_receive_id, docNo: row.received_doc_no, docDate: fromDbDate(row.received_doc_date), dueDate: fromDbDate(row.due_date) },
  };
}
