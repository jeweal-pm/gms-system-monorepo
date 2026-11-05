import { formatDate } from "@/features/quotation/lib/format";

/**
 * The transaction a stock item came from (owner 2026-11-04, picker Ref. column): a Memo Receive today, a Load later
 * (no Load page exists yet). The API's additive `ref` field is used when present; before the backend sends it the
 * item's `memoReceive` stands in, so the column works on either API build.
 */
export type StockRefType = "MEMO_RECEIVE" | "LOAD";
export type StockRefSource = {
  ref?: { type: StockRefType; docNo: string; docDate: string } | null;
  memoReceive?: { docNo: string; docDate: string } | null;
};
export type StockRef = { type: StockRefType; docNo: string; docDate: string; dateText: string };

export function stockRef(item: StockRefSource): StockRef | null {
  const source = item.ref ?? (item.memoReceive ? { type: "MEMO_RECEIVE" as const, ...item.memoReceive } : null);
  if (!source || !source.docNo) return null;
  return { type: source.type, docNo: source.docNo, docDate: source.docDate, dateText: source.docDate ? formatDate(source.docDate) : "" };
}

/** The transaction no. alone (checkbox labels, search hints); "" when the item has no source document. */
export const stockRefLabel = (item: StockRefSource) => stockRef(item)?.docNo ?? "";
