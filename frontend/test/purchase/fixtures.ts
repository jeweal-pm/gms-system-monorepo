import type { PurchaseDetail, PurchaseMemoStockRow, PurchaseOrderLineRow } from "@/features/purchase/api";

/** Purchase test fixtures in the SA rev 1 contract shapes (purchase.memoStock, purchase.purchaseOrderLines, purchase.get). */

export const ID = "11111111-1111-4111-8111-111111111111";
export const STOCK = "22222222-2222-4222-8222-222222222222";
export const PO = "33333333-3333-4333-8333-333333333333";
export const POL = "44444444-4444-4444-8444-444444444444";
export const LINE = "55555555-5555-4555-8555-555555555555";

export const memoRow = (patch: Partial<PurchaseMemoStockRow> = {}): PurchaseMemoStockRow => ({
  key: `${STOCK}:IN_STOCK`, memoStockId: STOCK, status: "IN_STOCK", stockId: "260003", lot: "L-2607-007", itemNote: "Silk",
  memoReceive: { id: ID, docNo: "MR-1001", docDate: "2026-10-29", dueDate: "2026-11-29" }, ref: { type: "MEMO_RECEIVE", id: ID, docNo: "MR-1001", docDate: "2026-10-29" }, location: "Memo", locationType: null,
  stone: "Tourmaline", shape: "Oval", size: "7.2×5.4 mm", color: "Red", clarity: "VVS", cutting: "Excellent", quality: "AAA", cerType: "GIA", cerNo: "GRS2024-081233",
  availablePcs: 2, availableWeightCt: "1.360", priceUnit: "CTS", unitPrice: "12500.00", netUnitPrice: "11250.5000", amount: "15300.68", sale: null,
  ...patch,
});


export const poRow = (patch: Partial<PurchaseOrderLineRow> = {}): PurchaseOrderLineRow => ({
  purchaseOrderLineId: POL, status: "PARTLY_PURCHASED", purchaseOrder: { id: PO, docNo: "PO2611001", docDate: "2026-11-01", dueDate: "2026-11-30", ref: "" }, position: 2,
  stoneCodeId: ID, stoneCode: "RU-OV-1", stone: "Ruby", shape: "Oval", size: "6x4", color: "Red", clarity: "VS", cutting: "Good", quality: "AA",
  lot: "L-PO-1", location: "Safe A", cerType: "GRS", cerNo: "GRS-1", itemNote: "Pair",
  orderedPcs: 10, orderedWeightCt: "5.000", purchasedPcs: 4, purchasedWeightCt: "2.000", availablePcs: 6, availableWeightCt: "3.000",
  priceUnit: "PER_CT", unitPrice: "1000.00", netUnitPrice: "950.00", amount: "2850.00",
  ...patch,
});

/** A saved pending purchase as `purchase.get` returns it (api-contract `Purchase`). */
export const savedLine = (patch: Record<string, unknown>) => ({
  id: LINE, source: "MANUAL", stoneCodeId: ID, stoneCode: "RU-1", stone: "Ruby", shape: "Oval", size: "6x4", color: "Red", clarity: "VS", cutting: "Good", quality: "AA",
  lot: "L-1", location: "", cerType: "", cerNo: "", pcs: 1, weightCt: "0.500", priceUnit: "PER_CT", unitPrice: "100.00", discount: { type: "PERCENT", value: "10" },
  itemNote: "", photoIds: [], discountAmount: "5.00", amount: "45.00", stockId: "260011", memoStockId: null, memoGroup: null, purchaseOrderLineId: null,
  memoReceive: null, purchaseOrder: null, limitPcs: null, limitWeightCt: null, ...patch,
});
export const savedPurchase = (patch: Record<string, unknown> = {}) => ({
  id: ID, docNo: "PU-7", status: "PENDING_APPROVAL", version: 3, docDate: "2026-11-04", dueDate: "2026-12-04", currency: "THB", exchangeRate: null, ref: "R-1",
  vendorId: ID, addressId: ID, vendor: { code: "V001", name: "Aom" }, addressText: "", documentNote: "Paid by transfer",
  discount: { type: "NONE", value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null,
  totals: {}, approvedAt: null, approvedBy: null, createdAt: "2026-11-04T01:00:00.000Z", createdBy: "u", updatedAt: "2026-11-04T01:00:00.000Z", deletedAt: null, deletedBy: null,
  lines: [
    savedLine({ id: "66666666-6666-4666-8666-666666666666", source: "STOCK", memoStockId: STOCK, memoGroup: "IN_STOCK", stockId: "260003", stoneCodeId: null, stoneCode: "", discount: { type: "NONE", value: "0" }, memoReceive: { docNo: "MR-1001" }, limitPcs: 2, limitWeightCt: "1.360", pcs: 1, weightCt: "0.680" }),
    savedLine({ id: "77777777-7777-4777-8777-777777777777", source: "PURCHASE_ORDER", purchaseOrderLineId: POL, stockId: "260012", discount: { type: "NONE", value: "0" }, purchaseOrder: { id: PO, docNo: "PO2611001", position: 2 }, limitPcs: 6, limitWeightCt: "3.000" }),
    savedLine({}),
  ],
  ...patch,
}) as unknown as PurchaseDetail;
