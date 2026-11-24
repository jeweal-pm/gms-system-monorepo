import type { ValueCardsPage, ValueHeader, ValueRow, ValueTotals, ValueTransactionsPage, ValueTxn, ValueTxnTotals } from "@/features/stock-value/types";

/** Typed fixtures of the SA revision 1 api-contract (its example: one Price-list card, one Last-sale card, one without a price). */
export const KEY_A = `SC${"a".repeat(32)}`;
export const KEY_B = `SC${"b".repeat(32)}`;
export const KEY_C = `SC${"c".repeat(32)}`;

const blank = { stone: "", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "" };
const none = { price: null, priceUnit: null, priceSource: "NONE", priceSourceLabel: null, priceRef: null, amount: null, profitLoss: null };

export const ROW_LIST: ValueRow = {
  stoneCode: "SAP-OV-6x4",
  stone: "Sapphire",
  shape: "Oval",
  size: "6x4",
  color: "Blue",
  clarity: "VS",
  cutting: "Brilliant",
  quality: "AA",
  cardKey: KEY_A,
  location: "Vault A",
  lot: "L-2609",
  vendorName: "Bangkok Gem Supply Co., Ltd.",
  vendorCount: 1,
  balancePcs: 2,
  balanceWeightCt: "1.240",
  price: "12500.0000",
  priceUnit: "CT",
  priceSource: "PRICE_LIST",
  priceSourceLabel: "Price list",
  priceRef: null,
  amount: "15500.00",
  profitLoss: "5580.00",
};
export const ROW_LAST_SALE: ValueRow = {
  ...ROW_LIST,
  ...blank,
  stoneCode: "RUB-RD-5",
  stone: "Ruby",
  cardKey: KEY_B,
  lot: "",
  balancePcs: 10,
  balanceWeightCt: "4.500",
  price: "9800.0000",
  priceSource: "LAST_SALE",
  priceSourceLabel: "Last sale",
  priceRef: { docId: "0192", docNo: "SL2611003", docDate: "2026-11-12" },
  amount: "44100.00",
  profitLoss: null,
};
export const ROW_NO_PRICE: ValueRow = { ...ROW_LIST, ...blank, ...none, stoneCode: "SPN-1", stone: "Spinel", cardKey: KEY_C, location: "Vault B", lot: "X1", balancePcs: 3, balanceWeightCt: "0.900" };
export const ROW_LOSS: ValueRow = { ...ROW_LIST, stoneCode: "LOSS-1", cardKey: `SC${"d".repeat(32)}`, profitLoss: "-47120.00" };

export const LIST_TOTALS: ValueTotals = { balancePcs: 15, balanceWeightCt: "6.640", amount: "59600.00", profitLoss: "5580.00", pricedCards: 2, unpricedCards: 1, noCostCards: 1 };

export const valuePage = (items: ValueRow[] = [ROW_LIST, ROW_LAST_SALE, ROW_NO_PRICE], extra: Partial<ValueCardsPage> = {}): ValueCardsPage => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 25,
  mode: "CURRENT",
  asOf: null,
  totals: LIST_TOTALS,
  ...extra,
});

export const HEADER_A: ValueHeader = {
  stoneCode: ROW_LIST.stoneCode,
  stone: ROW_LIST.stone,
  shape: ROW_LIST.shape,
  size: ROW_LIST.size,
  color: ROW_LIST.color,
  clarity: ROW_LIST.clarity,
  cutting: ROW_LIST.cutting,
  quality: ROW_LIST.quality,
  cardKey: KEY_A,
  location: "Vault A",
  lot: "L-2609",
  vendorName: ROW_LIST.vendorName,
  vendorCount: 1,
  currentBalancePcs: 2,
  currentBalanceWeightCt: "1.240",
  price: "12500.0000",
  priceUnit: "CT",
  priceSource: "PRICE_LIST",
  priceSourceLabel: "Price list",
  priceRef: null,
  amount: "15500.00",
  profitLoss: "5580.00",
};

const rowValue = { price: "12500.0000", priceUnit: "CT", priceSource: "PRICE_LIST", priceSourceLabel: null, priceRef: null };

export const TXN_LOAD: ValueTxn = {
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
  ...rowValue,
  amount: "15500.00",
  profitLoss: "-47120.00",
};
export const TXN_OUT: ValueTxn = {
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
  ...rowValue,
  amount: "7750.00",
  profitLoss: null,
};
export const TXN_NEW_TYPE: ValueTxn = { ...TXN_OUT, id: "stock-adjustment:0192c", docType: "stock-adjustment", docTypeLabel: "Stock Adjustment", docId: "0192c", docNo: "", stockId: "260215", stockIdExtra: 2, inPcs: 1, inWeightCt: "0.100", outPcs: null, outWeightCt: null, accountId: null, accountName: "", amount: "9000.00", profitLoss: "120.50" };

export const TXN_TOTALS: ValueTxnTotals = {
  inPcs: 5,
  inWeightCt: "1.340",
  outPcs: 2,
  outWeightCt: "0.620",
  balancePcs: 3,
  balanceWeightCt: "0.720",
  price: "12500.0000",
  priceUnit: "CT",
  priceSource: "PRICE_LIST",
  priceSourceLabel: "Price list",
  priceRef: null,
  amount: "9000.00",
  profitLoss: "120.50",
};

export const txnPage = (items: ValueTxn[] = [TXN_LOAD, TXN_OUT, TXN_NEW_TYPE], extra: Partial<ValueTransactionsPage> = {}): ValueTransactionsPage => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 25,
  opening: { pcs: 0, weightCt: "0.000", amount: "0.00", profitLoss: "0.00" },
  totals: TXN_TOTALS,
  ...extra,
});
