import type { CardHeader, CardRow, CardsPage, Totals, TransactionsPage, Txn } from "@/features/stock-card/types";

/** Typed fixtures of the SA revision 1 api-contract (values of its example: one own-stock card, three documents). */
export const KEY_A = `SC${"a".repeat(32)}`;
export const KEY_B = `SC${"b".repeat(32)}`;

const attrs = { stoneCode: "AL-CU-3040-014", stone: "Alexandrite", shape: "Cushion", size: "3.0 x 4.0 mm", color: "Light Blue", clarity: "VS1", cutting: "", quality: "AAA" };

export const CARD_A: CardRow = { ...attrs, cardKey: KEY_A, location: "Vault", lot: "L-2609-014", vendorName: "Bangkok Gem Supply Co., Ltd.", vendorCount: 1, balancePcs: 2, balanceWeightCt: "0.620" };
export const CARD_B: CardRow = {
  ...attrs,
  stoneCode: "",
  stone: "Sapphire",
  shape: "Oval",
  size: "",
  color: "",
  clarity: "",
  quality: "",
  cardKey: KEY_B,
  location: "Showroom",
  lot: "",
  vendorName: "Siam Fine Jewelry",
  vendorCount: 3,
  balancePcs: 10,
  balanceWeightCt: "12.345",
};

export const cardsPage = (items: CardRow[] = [CARD_A, CARD_B], extra: Partial<CardsPage> = {}): CardsPage => ({ items, total: items.length, page: 1, pageSize: 25, mode: "CURRENT", asOf: null, ...extra });

export const HEADER_A: CardHeader = { ...attrs, cardKey: KEY_A, location: "Vault", lot: "L-2609-014", vendorName: "Bangkok Gem Supply Co., Ltd.", vendorCount: 1, currentBalancePcs: 2, currentBalanceWeightCt: "0.620" };

export const TXN_LOAD: Txn = {
  id: "load-to-stock:0192a",
  docType: "load-to-stock",
  docTypeLabel: "Load to Stock",
  docId: "0192a",
  docNo: "LS2609014",
  docDate: "2026-09-04",
  stockId: "260214",
  stockIdExtra: 0,
  accountId: "0191a",
  accountName: "Bangkok Gem Supply Co., Ltd.",
  inPcs: 4,
  inWeightCt: "1.240",
  outPcs: null,
  outWeightCt: null,
  balancePcs: 4,
  balanceWeightCt: "1.240",
};
export const TXN_OUT: Txn = {
  id: "memo-out:0192b",
  docType: "memo-out",
  docTypeLabel: "Memo Out",
  docId: "0192b",
  docNo: "MO2609021",
  docDate: "2026-09-18",
  stockId: null,
  stockIdExtra: 0,
  accountId: "0191b",
  accountName: "Khun Nida Jewelry",
  inPcs: null,
  inWeightCt: null,
  outPcs: 2,
  outWeightCt: "0.620",
  balancePcs: 2,
  balanceWeightCt: "0.620",
};
export const TXN_NEW_TYPE: Txn = {
  id: "stock-adjustment:0192c",
  docType: "stock-adjustment",
  docTypeLabel: "Stock Adjustment",
  docId: "0192c",
  docNo: "",
  docDate: "2026-10-02",
  stockId: "260215",
  stockIdExtra: 2,
  accountId: null,
  accountName: "",
  inPcs: 1,
  inWeightCt: "0.100",
  outPcs: null,
  outWeightCt: null,
  balancePcs: 3,
  balanceWeightCt: "0.720",
};

export const TOTALS: Totals = { inPcs: 5, inWeightCt: "1.340", outPcs: 2, outWeightCt: "0.620", balancePcs: 3, balanceWeightCt: "0.720" };

export const txnPage = (items: Txn[] = [TXN_LOAD, TXN_OUT, TXN_NEW_TYPE], extra: Partial<TransactionsPage> = {}): TransactionsPage => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 25,
  opening: { pcs: 0, weightCt: "0.000" },
  totals: TOTALS,
  ...extra,
});
