import type { FromStockItem } from "@/features/trade-document/from-stock-api";

/** Fixtures of `fromStock.lots` rows (lot-based-stock round 1): a Memo Stock lot and one of our items (own stock, not merged). */
export const ID = "11111111-1111-4111-8111-111111111111";
export const MEMO_LOT = `ML${"a".repeat(32)}`;
export const OWN_LOT = "OS33333333-3333-4333-8333-333333333333";
const LOAD = { id: ID, docNo: "LS-0001", docDate: "2026-11-17" };

export const memoLot: FromStockItem = {
  lotKey: MEMO_LOT, source: "MEMO_STOCK", lot: "L-7", merged: true, stoneCode: "", stone: "Tourmaline", shape: "Oval", size: "", color: "Red", clarity: "", cutting: "", quality: "",
  cerType: "GIA", cerNo: "C-1", location: "Memo", itemNote: "vendor note", ref: { type: "MEMO_RECEIVE", id: ID, docNo: "MR-1", docDate: "2026-10-29" }, refCount: 2,
  pendingPcs: 2, pendingWeightCt: "1.360", priceUnit: "PER_CT", unitPrice: "12500.00", netUnitPrice: "12500.0000", amount: "17000.00", currency: "THB", vendor: { id: ID, code: "V001", name: "Aom" },
};
export const ownLot: FromStockItem = {
  ...memoLot, lotKey: OWN_LOT, source: "OWN_STOCK", lot: "", merged: false, stoneCode: "RU-OV", stone: "Ruby", location: "BKK-01", itemNote: "", cerType: "", cerNo: "", ref: { type: "LOAD", ...LOAD }, refCount: 1,
  pendingPcs: 3, pendingWeightCt: "2.100", priceUnit: "PER_PCS", unitPrice: null, netUnitPrice: null, amount: null, currency: null, vendor: null,
};
