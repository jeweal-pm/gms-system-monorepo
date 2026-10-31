import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { navigationHref } from "@/features/home/navigation";
import {
  emptyMemoOut,
  fromMemoOut,
  mapMemoOutSaveError,
  memoOutHref,
  memoOutLoadError,
  memoOutSchema,
  memoStockToOutLine,
  pickedStockIds,
  toMemoOutInput,
  type MemoOutDetail,
  type MemoOutFormValues,
  type MemoOutLine,
} from "@/features/memo-out/api";
import { canViewMemoOut, MEMO_OUT_HREF } from "@/features/memo-out/components/MemoOutPage";
import { QuotationHeader } from "@/features/quotation/components/header/QuotationHeader";
import { emptyLine } from "@/features/quotation/lib/defaults";
import type { MemoStockItem } from "@/features/trade-document/memo-stock-api";
import { gatewayError } from "../partner/helpers";

/** UT-MO-01…04: memo-out UI rev 1 + SA rev 1 (owner 2026-10-28); UT-MO-201…205: UI rev 2 + SA rev 2 (owner 2026-10-31). */

const ID = "11111111-1111-4111-8111-111111111111";
const STOCK = "22222222-2222-4222-8222-222222222222";
const noop = () => undefined;
const manual = (patch: Partial<MemoOutLine> = {}): MemoOutLine => ({ ...emptyMemoOut().lines[0], ...emptyLine(), stone: "Ruby", pcs: "1", weightCt: "1.12", unitPrice: "65000", ...patch });
const stockItem: MemoStockItem = {
  id: STOCK, stockId: "260005", lot: "L-1", location: "Memo", itemNote: "vendor note", stone: "Sapphire", shape: "Oval", size: "7×5", color: "Blue", clarity: "VS",
  cutting: "Excellent", quality: "AA", cerType: "GIA", cerNo: "G-1", receivedPcs: 10, receivedWeightCt: "10.000", pendingPcs: 5, pendingWeightCt: "5.000",
  priceUnit: "CTS", unitPrice: "100.00", netUnitPrice: "100.0000", currency: "THB", amount: "500.00", vendor: { id: ID, code: "V001", name: "Aom" },
  memoReceive: { id: ID, docNo: "3", docDate: "2026-10-29", dueDate: "2026-10-30" },
};
const values = (patch: Partial<MemoOutFormValues> = {}): MemoOutFormValues => ({ ...emptyMemoOut(), dueDate: "2026-11-30", currency: "THB", customerId: ID, shippingAddressId: ID, invoiceAddressId: ID, ...patch });
const header = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(QuotationHeader, {
    docNo: "MO-1", isPreview: true, mode: "edit", saving: false, canSave: true, canCreate: true, canEdit: false, canDelete: false,
    actions: { onCancel: noop, onSave: noop, onEdit: noop, onDelete: noop, onDuplicate: noop, onRefresh: noop },
    ...props,
  }));

describe("navigation and access (UT-MO-01)", () => {
  it("links Memo Out to its pages and needs memo-out:VIEW", () => {
    expect(navigationHref({ label: "Memo Out", slug: "memo-out" })).toBe("/memo/memo-out");
    expect(MEMO_OUT_HREF).toBe("/memo/memo-out");
    expect(memoOutHref(ID)).toBe(`/memo/memo-out/${ID}`);
    expect(canViewMemoOut({ isSuperAdmin: false, permissions: ["memo-out:VIEW"] })).toBe(true);
    expect(canViewMemoOut({ isSuperAdmin: false, permissions: ["quotation:VIEW"] })).toBe(false);
    expect(canViewMemoOut(undefined)).toBe(false);
  });
});

describe("shared header (UT-MO-02)", () => {
  it("shows the Memo Out label and link; keeps the Quotation defaults", () => {
    const html = header({ noLabel: "Memo Out No.:", newHref: MEMO_OUT_HREF });
    expect(html).toContain("Memo Out No.:");
    expect(html).toContain('href="/memo/memo-out"');
    expect(header()).toContain("Quotation No.:");
  });
});

describe("mapping (UT-MO-03)", () => {
  it("sends the customer and both addresses, drops empty rows, never sends photos", () => {
    const input = toMemoOutInput(values({ lines: [manual({ photos: [{ id: "p", name: "a", url: "/x" }] }), emptyMemoOut().lines[0]] }));
    expect(input).toMatchObject({ customerId: ID, shippingAddressId: ID, invoiceAddressId: ID });
    expect(input.lines).toHaveLength(1);
    expect(input.lines[0]).toMatchObject({ photoIds: [], memoStockId: null });
  });

  it("loads a saved memo out into the quotation form shape", () => {
    const detail = {
      id: ID, docNo: "MO-2609001", status: "PENDING_APPROVAL", version: 2, docDate: "2026-10-28", dueDate: "2026-11-28",
      customerId: ID, customer: { code: "C001", name: "Siam Gems" }, shippingAddressId: ID, shippingAddressText: "S", invoiceAddressId: null, invoiceAddressText: "I",
      currency: "THB", exchangeRate: null, ref: "", documentNote: "", lines: [], discount: { type: "NONE", value: "0" },
      tax: { enabled: true, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null,
      totals: { subtotal: "0.00", discountAmount: "0.00", priceBeforeTax: "0.00", taxAmount: "0.00", chargesAmount: "0.00", laborAmount: "0.00", grandTotal: "0.00" },
      approvedAt: null, approvedBy: null, createdAt: "", createdBy: "", updatedAt: "",
    } satisfies MemoOutDetail;
    expect(fromMemoOut(detail)).toMatchObject({ docNo: "MO-2609001", version: 2, status: "PENDING_APPROVAL", customerId: ID, shippingAddressId: ID, invoiceAddressId: "" });
  });
});

describe("errors (UT-MO-04)", () => {
  it("maps MEMO_OUT_* codes", () => {
    expect(mapMemoOutSaveError(gatewayError({ domainCode: "MEMO_OUT_REFERENCE_INVALID", httpStatus: 422, fieldErrors: [{ path: "shippingAddressId", code: "invalid_reference" }] })).fieldErrors)
      .toEqual([{ name: "shippingAddressId", message: "Choose an active option" }]);
    expect(memoOutLoadError(gatewayError({ domainCode: "MEMO_OUT_NOT_FOUND", httpStatus: 404, code: "NOT_FOUND" }))).toBe("This memo out no longer exists.");
  });
});

describe("From Stock rows (UT-MO-201…205, memo-out rev 2)", () => {
  it("UT-MO-201 a Memo Stock item becomes a From Stock row: Stock ID, location Memo, full pending, empty Sale Price, no vendor note", () => {
    expect(memoStockToOutLine(stockItem)).toMatchObject({
      source: "STOCK", stockId: "260005", memoStockId: STOCK, stoneCode: "", stoneCodeId: "", locationId: "Memo", stone: "Sapphire", cerNo: "G-1",
      pcs: "5", weightCt: "5.000", priceUnit: "PER_CT", unitPrice: "", itemNote: "", stockPendingPcs: "5", stockPendingWeightCt: "5.000",
    });
    expect(memoStockToOutLine({ ...stockItem, priceUnit: "PCS" }).priceUnit).toBe("PER_PCS");
    expect([...pickedStockIds([memoStockToOutLine(stockItem), manual()])]).toEqual([STOCK]);
  });

  it("UT-MO-202 a stock row takes part or all of its pending, needs a quantity and a Sale Price; manual rows keep their rules", () => {
    const issues = (v: MemoOutFormValues) => (memoOutSchema.safeParse(v).error?.issues ?? []).map((issue) => `${issue.path.join(".")}:${issue.message}`);
    const picked = (patch: Partial<MemoOutLine> = {}) => ({ ...memoStockToOutLine(stockItem), unitPrice: "2500", ...patch });
    expect(issues(values({ lines: [picked({ pcs: "3", weightCt: "3.00" })] }))).toEqual([]);
    expect(issues(values({ lines: [picked({ pcs: "6", weightCt: "5.01" })] }))).toEqual(["lines.0.pcs:More than pending", "lines.0.weightCt:More than pending"]);
    expect(issues(values({ lines: [picked({ pcs: "0", weightCt: "0" })] }))).toEqual(["lines.0.pcs:Enter the quantity"]);
    expect(issues(values({ lines: [picked({ unitPrice: "" })] }))).toEqual(["lines.0.unitPrice:Enter the sale price"]);
    expect(issues(values({ lines: [manual({ unitPrice: "" })] }))).toEqual([]);
    expect(issues(values({ status: "DRAFT" as never }))).toContain("status:Invalid option: expected one of \"PENDING_APPROVAL\"|\"APPROVED\"");
  });

  it("UT-MO-203 sends the Memo Stock item of a stock row and none for a manual row; loads both back", () => {
    const input = toMemoOutInput(values({ lines: [{ ...memoStockToOutLine(stockItem), pcs: "2", weightCt: "2.00", unitPrice: "2500" }, manual()] }));
    expect(input.lines.map((line) => [line.memoStockId, line.pcs, line.weightCt, line.unitPrice])).toEqual([[STOCK, 2, "2.00", "2500"], [null, 1, "1.12", "65000"]]);
    const base = { id: ID, source: "MANUAL" as const, stoneCodeId: null, stoneCode: "", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "", lot: "", cerType: "", cerNo: "",
      priceUnit: "PER_CT" as const, discount: { type: "NONE" as const, value: "0" }, discountAmount: "0.00", itemNote: "", photoIds: [], outstandingPcs: null, outstandingWeightCt: null };
    const detail = {
      id: ID, docNo: "MO-1", status: "APPROVED", version: 3, docDate: "2026-10-31", dueDate: "2026-11-30",
      customerId: ID, customer: { code: "C001", name: "Siam Gems" }, shippingAddressId: ID, shippingAddressText: "S", invoiceAddressId: ID, invoiceAddressText: "I",
      currency: "THB", exchangeRate: null, ref: "", documentNote: "",
      lines: [
        { ...base, source: "STOCK" as const, stone: "Sapphire", location: "Memo", pcs: 2, weightCt: "2.000", unitPrice: "2500.00", amount: "5000.00", memoStockId: STOCK, stockId: "260005", stockPendingPcs: 5, stockPendingWeightCt: "5.000" },
        { ...base, stone: "Ruby", location: "Shelf 1", pcs: 1, weightCt: "1.120", unitPrice: "65000.00", amount: "72800.00", memoStockId: null, stockId: null, stockPendingPcs: null, stockPendingWeightCt: null },
      ],
      discount: { type: "NONE", value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null,
      totals: { subtotal: "77800.00", discountAmount: "0.00", priceBeforeTax: "77800.00", taxAmount: "0.00", chargesAmount: "0.00", laborAmount: "0.00", grandTotal: "77800.00" },
      approvedAt: "2026-10-31T03:00:00.000Z", approvedBy: "u", createdAt: "", createdBy: "", updatedAt: "",
    } satisfies MemoOutDetail;
    const loaded = fromMemoOut(detail);
    expect(loaded.status).toBe("APPROVED");
    expect(loaded.lines[0]).toMatchObject({ source: "STOCK", stockId: "260005", memoStockId: STOCK, stockPendingPcs: "5", stockPendingWeightCt: "5.000", pcs: "2" });
    expect(loaded.lines[1]).toMatchObject({ source: "MANUAL", stockId: "", memoStockId: "", stockPendingPcs: "" });
  });

  it("UT-MO-204 maps a short approval (another document took the stock) and the status errors", () => {
    expect(mapMemoOutSaveError(gatewayError({ domainCode: "MEMO_OUT_PENDING_SHORT", httpStatus: 409, code: "CONFLICT" })).message).toContain("no longer have enough pending");
    expect(mapMemoOutSaveError(gatewayError({ domainCode: "MEMO_OUT_STATUS_INVALID", httpStatus: 409, code: "CONFLICT" })).message).toContain("can't be changed in its current status");
  });

  it("UT-MO-205 the approval badges and a new memo out waiting for approval", () => {
    expect(emptyMemoOut()).toMatchObject({ status: "PENDING_APPROVAL" });
    expect(header({ status: "PENDING_APPROVAL", statusLabels: { PENDING_APPROVAL: { label: "Pending Approval", tone: "" } } })).toContain("Pending Approval");
  });
});
