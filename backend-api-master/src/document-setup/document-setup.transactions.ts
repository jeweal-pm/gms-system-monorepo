/**
 * Transactions that have a document setup (document-setup UI rev 1, Q-DS-01 default, owner 2026-10-23).
 * Keys are the permission catalog menu keys of those pages; the list is fixed (no create/delete).
 */
export const DOCUMENT_TRANSACTIONS = [
  { key: "quotation", label: "Quotation", defaultCode: "QT" },
  { key: "reserve", label: "Reserve", defaultCode: "RS" },
  { key: "memo-receive", label: "Memo Receive", defaultCode: "MR" },
  { key: "memo-return", label: "Memo Return", defaultCode: "MRT" },
  { key: "memo-out", label: "Memo Out", defaultCode: "MO" },
  { key: "memo-out-return", label: "Memo Out Return", defaultCode: "MOR" },
  { key: "purchase-order", label: "Purchase Order", defaultCode: "PO" },
  { key: "purchase", label: "Purchase", defaultCode: "PU" },
  { key: "load-to-stock", label: "Load to Stock", defaultCode: "LS" },
  { key: "merge-split", label: "Merge/Split", defaultCode: "MS" },
  { key: "stock-transfer-location", label: "Stock Transfer Location", defaultCode: "ST" },
  { key: "stock-adjustment", label: "Stock Adjustment", defaultCode: "SA" },
  { key: "sale", label: "Sale", defaultCode: "SL" },
  { key: "payable", label: "Payable", defaultCode: "PY" },
  { key: "receivable", label: "Receivable", defaultCode: "RC" },
] as const;

export type DocumentTransactionKey = (typeof DOCUMENT_TRANSACTIONS)[number]["key"];

export const DOCUMENT_TRANSACTION_KEYS = DOCUMENT_TRANSACTIONS.map((transaction) => transaction.key) as [DocumentTransactionKey, ...DocumentTransactionKey[]];

export function findTransaction(key: string) {
  return DOCUMENT_TRANSACTIONS.find((transaction) => transaction.key === key);
}
