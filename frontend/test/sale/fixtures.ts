import type { SaleOut } from "@/features/sale/types";
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

/** `GET /sale/{id}` (verified contract): one From Reserve line and one From Stock line, Draft. */
export const saleOut = (patch: Partial<SaleOut> = {}): SaleOut => ({
  id: ID, docNo: "SL-1001", status: "DRAFT", version: 3, docDate: "2026-11-20", dueDate: "2026-11-30",
  customerId: ID, customer: { code: "C008", name: "Al Noor" }, shippingAddressId: ID, invoiceAddressId: CUSTOMER_B,
  currency: "USD", exchangeRate: "35.5", ref: "PO-9", documentNote: "Paid",
  discount: { type: "NONE", value: "0" }, tax: { enabled: true, rate: "7.0000", includeInPrice: false }, labor: null, serviceCharges: [{ type: "SHIPPING", amount: "10.00" }],
  lines: [
    { id: "line-2", position: 2, source: "STOCK", reserveLineId: null, memoStockId: STOCK, stockId: "260009", sourceDoc: { type: "MEMO_RECEIVE", id: ID, docNo: "MR-26100012" },
      stoneCode: "", stone: "Sapphire", shape: "Round", size: "5 mm", color: "Blue", clarity: "VS", cutting: "Good", quality: "AA", lot: "L-9", location: "Memo", cerType: "", cerNo: "",
      priceUnit: "PER_PCS", pcs: 1, weightCt: "0.700", capPcs: 3, capWeightCt: "2.100", reservePrice: null, unitPrice: "950.00", discount: { type: "AMOUNT", value: "5" }, discountAmount: "5.00", amount: "945.00", itemNote: "", photoIds: ["p1"] },
    { id: "line-1", position: 1, source: "RESERVE", reserveLineId: RESERVE_LINE, memoStockId: STOCK, stockId: "260014", sourceDoc: { type: "RESERVE", id: ID, docNo: "RS-1001" },
      stoneCode: "", stone: "South Sea Pearl", shape: "Round", size: "11.0 mm", color: "Golden", clarity: "", cutting: "", quality: "AAA", lot: "KPW", location: "Memo", cerType: "", cerNo: "",
      priceUnit: "PER_PCS", pcs: 2, weightCt: "16.800", capPcs: 40, capWeightCt: "336.000", reservePrice: "100.0000", unitPrice: "100.00", discount: { type: "NONE", value: "0" }, discountAmount: "0.00", amount: "200.00", itemNote: "gift", photoIds: [] },
  ],
  approval: { requireApproval: true, autoApproved: false, revisionCount: 0, review: null },
  flow: { canEdit: true, canDelete: true, canSubmit: true, canRestore: false, usedBy: null },
  syncing: false, deleted: null, totals: { grandTotal: "1225.15" },
  ...patch,
});
