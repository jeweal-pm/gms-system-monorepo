import type { SaleReserveLineRef } from "@/features/sale/form";
import type { MemoStockItem } from "@/features/trade-document/memo-stock-api";

/** Typed fixtures for the sale tests (contract shapes; no mock store, Q-PU-01 rule). */

export const ID = "11111111-1111-4111-8111-111111111111";
export const CUSTOMER_B = "33333333-3333-4333-8333-333333333333";
export const STOCK = "22222222-2222-4222-8222-222222222222";
export const RESERVE_LINE = "44444444-4444-4444-8444-444444444444";

export const reserveLine = (patch: Partial<SaleReserveLineRef> = {}): SaleReserveLineRef => ({
  reserveLineId: RESERVE_LINE, reserveId: ID, reserveNo: "RS-26110001", reserveDate: "2026-11-02", dueDate: "2026-11-30",
  memoStockId: STOCK, stockId: "260003", priceUnit: "PER_CT", netUnitPrice: "12500.4567", openPcs: 2, openWeightCt: "1.36", openAmount: "17000.62",
  stoneCode: "TM-OV", stone: "Tourmaline", shape: "Oval", size: "7.2×5.4 mm", color: "Red", clarity: "VVS", cutting: "Excellent", quality: "AAA",
  lot: "L-2607-007", location: "Memo", cerType: "GIA", cerNo: "GRS2024-081233",
  ...patch,
});

export const stockItem = (patch: Partial<MemoStockItem> = {}): MemoStockItem => ({
  id: STOCK, stockId: "260009", stoneCode: "", lot: "L-2607-009", location: "Memo", itemNote: "", stone: "Sapphire", shape: "Round", size: "5 mm", color: "Blue", clarity: "VS",
  cutting: "Good", quality: "AA", cerType: "GRS", cerNo: "GRS-1", receivedPcs: 3, receivedWeightCt: "2.100", pendingPcs: 3, pendingWeightCt: "2.100",
  priceUnit: "PCS", unitPrice: "900.00", netUnitPrice: "900.0000", currency: "THB", amount: "2700.00", vendor: { id: ID, code: "V001", name: "Aom" },
  memoReceive: { id: ID, docNo: "MR-26100012", docDate: "2026-10-29", dueDate: "2026-11-29" },
  ref: { type: "MEMO_RECEIVE" as const, id: ID, docNo: "MR-26100012", docDate: "2026-10-29" },
  ...patch,
} as MemoStockItem);
