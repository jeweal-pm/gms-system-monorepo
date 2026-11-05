import { describe, expect, it } from "vitest";
import { fromQuotation, mapSaveError, toQuotationInput, type QuotationDetail } from "@/features/quotation/api";
import { QUOTATION_KIND } from "@/features/quotation/document-kind";
import { emptyLine, emptyQuotation } from "@/features/quotation/lib/defaults";
import { quotationSchema, type QuotationFormValues } from "@/features/quotation/schema";
import { memoStockToStockLine, pickedStockIds } from "@/features/trade-document/customer-stock";
import type { MemoStockItem } from "@/features/trade-document/memo-stock-api";
import { gatewayError, issuesByPath } from "../partner/helpers";

/** UT-QT-09…12: Quotation From Stock (quotation UI rev 2 + SA rev 2 / ADR-0038, owner 2026-11-03). */

const ID = "11111111-1111-4111-8111-111111111111";
const STOCK = "22222222-2222-4222-8222-222222222222";
const stockItem: MemoStockItem = {
  id: STOCK, stockId: "260003", stoneCode: "", lot: "L-2607-007", location: "Memo", itemNote: "", stone: "Tourmaline", shape: "Oval", size: "7.2×5.4 mm", color: "Red", clarity: "VVS",
  cutting: "Excellent", quality: "AAA", cerType: "GIA", cerNo: "GRS2024-081233", receivedPcs: 2, receivedWeightCt: "1.360", pendingPcs: 2, pendingWeightCt: "1.360",
  priceUnit: "CTS", unitPrice: "12500.00", netUnitPrice: "12500.0000", currency: "THB", amount: "17000.00", vendor: { id: ID, code: "V001", name: "Aom" },
  memoReceive: { id: ID, docNo: "1", docDate: "2026-10-29", dueDate: "2026-11-29" },
  ref: { type: "MEMO_RECEIVE" as const, id: ID, docNo: "1", docDate: "2026-10-29" },
};
const typed = { ...emptyLine(), stoneCode: "RU-1", stone: "Ruby", pcs: "1", weightCt: "1", unitPrice: "100" };
const values = (lines: QuotationFormValues["lines"]): QuotationFormValues => ({
  ...emptyQuotation(), docDate: "2026-11-03", dueDate: "2026-12-03", customerId: ID, shippingAddressId: ID, invoiceAddressId: ID, currency: "THB", lines,
});

describe("UT-QT-09 From Stock rows", () => {
  it("a picked item becomes a STOCK row: full pending, empty Sale Price, copied fields, its item named", () => {
    const row = memoStockToStockLine(stockItem);
    expect(row).toMatchObject({ source: "STOCK", stockId: "260003", lot: "L-2607-007", locationId: "Memo", stone: "Tourmaline", stoneCode: "", stoneCodeId: "",
      pcs: "2", weightCt: "1.360", unitPrice: "", priceUnit: "PER_CT", memoStockId: STOCK, stockPendingPcs: "2", stockPendingWeightCt: "1.360" });
    expect(pickedStockIds([row, typed, emptyLine()])).toEqual(new Set([STOCK]));
  });

  it("Quotation stock rows take part of their item and hide Duplicate (kind.stockQuantity); Add row stays", () => {
    expect(QUOTATION_KIND.stockQuantity).toBe(true);
    expect(QUOTATION_KIND.pickOnly).toBeFalsy();
  });
});

describe("UT-QT-10 schema", () => {
  it("a stock row stays within its picked pending and needs a Sale Price; typed rows are unchanged", () => {
    const row = memoStockToStockLine(stockItem);
    expect(issuesByPath(quotationSchema, values([{ ...row, unitPrice: "5000" }, typed]))).toEqual({});
    expect(issuesByPath(quotationSchema, values([{ ...row, pcs: "3", weightCt: "1.5", unitPrice: "5000" }]))).toEqual({
      "lines.0.pcs": "More than pending", "lines.0.weightCt": "More than pending",
    });
    expect(issuesByPath(quotationSchema, values([row]))).toEqual({ "lines.0.unitPrice": "Enter the sale price" });
    expect(issuesByPath(quotationSchema, values([{ ...row, pcs: "0", weightCt: "0", unitPrice: "5000" }]))).toEqual({ "lines.0.pcs": "Enter the quantity" });
    expect(issuesByPath(quotationSchema, values([{ ...typed, unitPrice: "" }]))).toEqual({});
  });
});

describe("UT-QT-11 contract mapping", () => {
  it("sends STOCK + memoStockId for stock rows (no stone code) and MANUAL + null for typed rows", () => {
    const input = toQuotationInput(values([{ ...memoStockToStockLine(stockItem), pcs: "1", weightCt: "0.68", unitPrice: "5000" }, typed, emptyLine()]));
    expect(input.lines).toHaveLength(2);
    expect(input.lines[0]).toMatchObject({ source: "STOCK", memoStockId: STOCK, stoneCodeId: null, stoneCode: "", pcs: 1, weightCt: "0.68", unitPrice: "5000" });
    expect(input.lines[1]).toMatchObject({ source: "MANUAL", memoStockId: null, stoneCode: "RU-1" });
  });

  it("a saved stock line comes back as a STOCK row with its item and pending; typed lines stay MANUAL", () => {
    const line = (patch: Partial<QuotationDetail["lines"][number]>): QuotationDetail["lines"][number] => ({
      id: "l1", source: "MANUAL", memoStockId: null, stockId: null, stockPendingPcs: null, stockPendingWeightCt: null, stoneCodeId: null, stoneCode: "", stone: "Ruby",
      shape: "", size: "", color: "", clarity: "", cutting: "", quality: "", lot: "", location: "", cerType: "", cerNo: "", pcs: 1, weightCt: "1.000", priceUnit: "PER_CT",
      unitPrice: "100.00", discount: { type: "NONE", value: "0" }, discountAmount: "0.00", amount: "100.00", itemNote: "", photoIds: [], ...patch,
    });
    const detail = {
      id: ID, docNo: "QT-9", status: "APPROVED", version: 2, docDate: "2026-11-03", dueDate: "2026-12-03", customerId: ID, customer: { code: "C1", name: "C" },
      shippingAddressId: ID, shippingAddressText: "", invoiceAddressId: ID, invoiceAddressText: "", currency: "THB", exchangeRate: null, ref: "", documentNote: "",
      lines: [line({ id: "l1", source: "STOCK", memoStockId: STOCK, stockId: "260003", stockPendingPcs: 2, stockPendingWeightCt: "1.360", location: "Memo" }), line({ id: "l2" })],
      discount: { type: "NONE", value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null,
      totals: { subtotal: "0", discountAmount: "0", priceBeforeTax: "0", taxAmount: "0", chargesAmount: "0", laborAmount: "0", grandTotal: "0" },
      statusReason: null, createdAt: "", createdBy: "u", updatedAt: "", approvedAt: null, approvedBy: null,
    } as QuotationDetail;
    const form = fromQuotation(detail);
    expect(form.lines[0]).toMatchObject({ source: "STOCK", stockId: "260003", memoStockId: STOCK, stockPendingPcs: "2", stockPendingWeightCt: "1.360", locationId: "Memo" });
    expect(form.lines[1]).toMatchObject({ source: "MANUAL", stockId: "" });
    expect(form.lines[1].memoStockId).toBeUndefined();
  });
});

describe("UT-QT-12 save errors name the From Stock row", () => {
  it("exceeds_pending, a missing item and a duplicate item", () => {
    expect(mapSaveError(gatewayError({ domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "lines.1.pcs", code: "exceeds_pending" }] })).message).toBe("Row 2: More than pending");
    expect(mapSaveError(gatewayError({ domainCode: "QUOTATION_REFERENCE_INVALID", httpStatus: 422, fieldErrors: [{ path: "lines.0.memoStockId", code: "invalid_reference" }] })).message)
      .toBe("Row 1: This stock item no longer exists. Remove the row.");
    expect(mapSaveError(gatewayError({ domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "lines.2.memoStockId", code: "duplicate" }] })).message)
      .toBe("Row 3: This stock item is already on the quotation.");
    // Other errors keep their wording.
    expect(mapSaveError(gatewayError({ domainCode: "QUOTATION_REFERENCE_INVALID", httpStatus: 422, fieldErrors: [{ path: "customerId", code: "invalid_reference" }] })).message)
      .toBe("A selected customer, address or stone code is no longer available.");
  });
});
