import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { navigationHref } from "@/features/home/navigation";
import { fromMemoOut, mapMemoOutSaveError, memoOutHref, memoOutLoadError, toMemoOutInput, type MemoOutDetail } from "@/features/memo-out/api";
import { canViewMemoOut, MEMO_OUT_HREF } from "@/features/memo-out/components/MemoOutPage";
import { QuotationHeader } from "@/features/quotation/components/header/QuotationHeader";
import { emptyLine, emptyQuotation } from "@/features/quotation/lib/defaults";
import { gatewayError } from "../partner/helpers";

/** UT-MO-01…04: memo-out UI rev 1 + SA rev 1 (owner 2026-10-28). */

const ID = "11111111-1111-4111-8111-111111111111";
const noop = () => undefined;
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
    const input = toMemoOutInput({
      ...emptyQuotation(), dueDate: "2026-11-28", customerId: ID, shippingAddressId: ID, invoiceAddressId: ID,
      lines: [{ ...emptyLine(), stone: "Ruby", pcs: "1", weightCt: "1.12", unitPrice: "65000", photos: [{ id: "p", name: "a", url: "/x" }] }, emptyLine()],
    });
    expect(input).toMatchObject({ customerId: ID, shippingAddressId: ID, invoiceAddressId: ID });
    expect(input.lines).toHaveLength(1);
    expect(input.lines[0].photoIds).toEqual([]);
  });

  it("loads a saved memo out into the quotation form shape", () => {
    const detail = {
      id: ID, docNo: "MO-2609001", status: "DRAFT", version: 2, docDate: "2026-10-28", dueDate: "2026-11-28",
      customerId: ID, customer: { code: "C001", name: "Siam Gems" }, shippingAddressId: ID, shippingAddressText: "S", invoiceAddressId: null, invoiceAddressText: "I",
      currency: "THB", exchangeRate: null, ref: "", documentNote: "", lines: [], discount: { type: "NONE", value: "0" },
      tax: { enabled: true, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null,
      totals: { subtotal: "0.00", discountAmount: "0.00", priceBeforeTax: "0.00", taxAmount: "0.00", chargesAmount: "0.00", laborAmount: "0.00", grandTotal: "0.00" },
      createdAt: "", createdBy: "", updatedAt: "",
    } satisfies MemoOutDetail;
    expect(fromMemoOut(detail)).toMatchObject({ docNo: "MO-2609001", version: 2, status: "DRAFT", customerId: ID, shippingAddressId: ID, invoiceAddressId: "" });
  });
});

describe("errors (UT-MO-04)", () => {
  it("maps MEMO_OUT_* codes", () => {
    expect(mapMemoOutSaveError(gatewayError({ domainCode: "MEMO_OUT_REFERENCE_INVALID", httpStatus: 422, fieldErrors: [{ path: "shippingAddressId", code: "invalid_reference" }] })).fieldErrors)
      .toEqual([{ name: "shippingAddressId", message: "Choose an active option" }]);
    expect(memoOutLoadError(gatewayError({ domainCode: "MEMO_OUT_NOT_FOUND", httpStatus: 404, code: "NOT_FOUND" }))).toBe("This memo out no longer exists.");
  });
});
