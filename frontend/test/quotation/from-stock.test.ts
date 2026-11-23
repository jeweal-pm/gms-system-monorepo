import { FLOW_DETAIL } from "../trade-document/flow-fixture";
import { describe, expect, it } from "vitest";
import { fromQuotation, mapSaveError, toQuotationInput, type QuotationDetail } from "@/features/quotation/api";
import { QUOTATION_KIND } from "@/features/quotation/document-kind";
import { emptyLine, emptyQuotation } from "@/features/quotation/lib/defaults";
import { quotationSchema, type QuotationFormValues } from "@/features/quotation/schema";
import { lotToStockLine, pickedStockIds } from "@/features/trade-document/customer-stock";
import { lotShortText } from "@/features/trade-document/lot-stock";
import { memoLot, ownLot } from "../trade-document/lot-fixture";
import { gatewayError, issuesByPath } from "../partner/helpers";

/** UT-QT-09…12: Quotation From Stock (quotation UI rev 2 + SA rev 2 / ADR-0038, owner 2026-11-03). */

const ID = "11111111-1111-4111-8111-111111111111";
const stockItem = memoLot;
const STOCK = memoLot.lotKey;
const typed = { ...emptyLine(), stoneCode: "RU-1", stone: "Ruby", pcs: "1", weightCt: "1", unitPrice: "100" };
const values = (lines: QuotationFormValues["lines"]): QuotationFormValues => ({
  ...emptyQuotation(), docDate: "2026-11-03", dueDate: "2026-12-03", customerId: ID, shippingAddressId: ID, invoiceAddressId: ID, currency: "THB", lines,
});

describe("UT-QT-09 From Stock rows", () => {
  it("a picked lot becomes a STOCK row: full pending, empty Sale Price, copied fields, its lotKey named and no Stock ID", () => {
    const row = lotToStockLine(stockItem);
    expect(row).toMatchObject({ source: "STOCK", stockId: "", lot: "L-7", locationId: "Memo", stone: "Tourmaline", stoneCode: "", stoneCodeId: "",
      pcs: "2", weightCt: "1.360", unitPrice: "", priceUnit: "PER_CT", lotKey: STOCK, memoStockId: "", ownStockId: "", stockPendingPcs: "2", stockPendingWeightCt: "1.360" });
    expect(pickedStockIds([row, typed, emptyLine()])).toEqual(new Set([STOCK]));
    expect(lotToStockLine(ownLot)).toMatchObject({ lotKey: ownLot.lotKey, priceUnit: "PER_PCS", locationId: "BKK-01", pcs: "3", weightCt: "2.100" });
  });

  it("Quotation stock rows take part of their item and hide Duplicate (kind.stockQuantity); Add row stays", () => {
    expect(QUOTATION_KIND.stockQuantity).toBe(true);
    expect(QUOTATION_KIND.pickOnly).toBeFalsy();
  });
});

describe("UT-QT-10 schema", () => {
  it("a stock row stays within its picked pending and needs a Sale Price; typed rows are unchanged", () => {
    const row = lotToStockLine(stockItem);
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
  it("sends STOCK / OWN_STOCK + lotKey alone for stock rows (no stone code) and MANUAL + null for typed rows", () => {
    const input = toQuotationInput(values([{ ...lotToStockLine(stockItem), pcs: "1", weightCt: "0.68", unitPrice: "5000" }, typed, emptyLine(), { ...lotToStockLine(ownLot), unitPrice: "9" }]));
    expect(input.lines).toHaveLength(3);
    expect(input.lines[2]).toMatchObject({ source: "OWN_STOCK", lotKey: ownLot.lotKey, memoStockId: null, ownStockId: null, stoneCode: "" });
    expect(input.lines[0]).toMatchObject({ source: "STOCK", lotKey: STOCK, memoStockId: null, ownStockId: null, stoneCodeId: null, stoneCode: "", pcs: 1, weightCt: "0.68", unitPrice: "5000" });
    expect(input.lines[1]).toMatchObject({ source: "MANUAL", memoStockId: null, lotKey: null, stoneCode: "RU-1" });
  });

  it("a saved stock line comes back as a STOCK row with its item and pending; typed lines stay MANUAL", () => {
    const line = (patch: Partial<QuotationDetail["lines"][number]>): QuotationDetail["lines"][number] => ({
      id: "l1", source: "MANUAL", memoStockId: null, ownStockId: null, stockId: null, lotKey: null, allocated: false, stockPendingPcs: null, stockPendingWeightCt: null, stoneCodeId: null, stoneCode: "", stone: "Ruby",
      shape: "", size: "", color: "", clarity: "", cutting: "", quality: "", lot: "", location: "", cerType: "", cerNo: "", pcs: 1, weightCt: "1.000", priceUnit: "PER_CT",
      unitPrice: "100.00", discount: { type: "NONE", value: "0" }, discountAmount: "0.00", amount: "100.00", itemNote: "", photoIds: [], ...patch,
    });
    const detail = {
      id: ID, docNo: "QT-9", status: "APPROVED", version: 2, docDate: "2026-11-03", dueDate: "2026-12-03", customerId: ID, customer: { code: "C1", name: "C" },
      shippingAddressId: ID, shippingAddressText: "", invoiceAddressId: ID, invoiceAddressText: "", currency: "THB", exchangeRate: null, ref: "", documentNote: "",
      lines: [line({ id: "l1", source: "STOCK", lotKey: STOCK, allocated: true, stockPendingPcs: 2, stockPendingWeightCt: "1.360", location: "Memo" }), line({ id: "l2" })],
      discount: { type: "NONE", value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null,
      totals: { subtotal: "0", discountAmount: "0", priceBeforeTax: "0", taxAmount: "0", chargesAmount: "0", laborAmount: "0", grandTotal: "0" },
      statusReason: null, createdAt: "", createdBy: "u", updatedAt: "", approvedAt: null, approvedBy: null, deletedAt: null, deletedBy: null, ...FLOW_DETAIL,
    } as QuotationDetail;
    const form = fromQuotation(detail);
    expect(form.lines[0]).toMatchObject({ source: "STOCK", stockId: "", lotKey: STOCK, memoStockId: "", stockPendingPcs: "2", stockPendingWeightCt: "1.360", locationId: "Memo" });
    expect(form.lines[1]).toMatchObject({ source: "MANUAL", stockId: "" });
    expect(form.lines[1].memoStockId).toBeUndefined();
    expect(form.lines[1].lotKey).toBeUndefined();
  });
});

describe("UT-QT-12 save errors name the From Stock row", () => {
  it("exceeds_pending, a missing item and a duplicate item", () => {
    expect(mapSaveError(gatewayError({ domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "lines.1.pcs", code: "exceeds_pending" }] })).message).toBe("Row 2: More than pending");
    expect(mapSaveError(gatewayError({ domainCode: "QUOTATION_REFERENCE_INVALID", httpStatus: 422, fieldErrors: [{ path: "lines.0.memoStockId", code: "invalid_reference" }] })).message)
      .toBe("Row 1: This stock item no longer exists. Remove the row.");
    expect(mapSaveError(gatewayError({ domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "lines.2.memoStockId", code: "duplicate" }] })).message)
      .toBe("Row 3: This stock item is already on the quotation.");
    // lot-based-stock: reference errors, short lot rows, unavailable and too-large lots name the row and its lot.
    const sent = values([typed, { ...lotToStockLine(stockItem), unitPrice: "1" }, { ...lotToStockLine(ownLot), unitPrice: "1" }]);
    const err = (domainCode: string, fieldErrors?: { path: string; code: string }[], details?: Record<string, unknown>) => gatewayError({ domainCode, fieldErrors, details });
    expect(mapSaveError(err("VALIDATION_ERROR", [{ path: "lines.1.reference", code: "duplicate" }]), sent).message).toBe("Row 2: This lot is already on the quotation.");
    expect(mapSaveError(err("VALIDATION_ERROR", [{ path: "lines.1.reference", code: "not_mergeable" }]), sent).message).toContain("Row 2: This lot can't be used any more");
    expect(mapSaveError(err("STOCK_LOT_UNAVAILABLE", [{ path: "lines.2.reference", code: "unavailable" }]), sent).message).toBe("Row 3: this lot has nothing left");
    const exceeds = { path: "lines.1.pcs", code: "exceeds_pending", params: { availablePcs: 1, availableWeightCt: "0.700" } };
    expect(mapSaveError(gatewayError({ domainCode: "VALIDATION_ERROR", fieldErrors: [exceeds as never] }), sent).message).toBe(lotShortText(2, { pcs: 1, weightCt: "0.700" }, "L-7"));
    expect(mapSaveError(err("STOCK_LOT_TOO_LARGE", undefined, { lotKey: STOCK, limit: 500 }), sent).message).toBe("Lot L-7 is too large to pick in one document; contact admin");
    // Other errors keep their wording.
    expect(mapSaveError(gatewayError({ domainCode: "QUOTATION_REFERENCE_INVALID", httpStatus: 422, fieldErrors: [{ path: "customerId", code: "invalid_reference" }] })).message)
      .toBe("A selected customer, address or stone code is no longer available.");
  });
});
