import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { navigationHref, REAL_PAGE_HREFS } from "@/features/home/navigation";
import {
  fromPurchaseOrder,
  mapPurchaseOrderError,
  purchaseOrderAccess,
  purchaseOrderLoadError,
  purchaseOrderPhotoUrl,
  stoneChoices,
  toPurchaseOrderInput,
  type PurchaseOrderDetail,
  type PurchaseOrderOptions,
} from "@/features/purchase-order/api";
import { approveMessage, canApprovePurchaseOrder, PURCHASE_ORDER_HREF, purchaseOrderHref, STATUS_LABELS } from "@/features/purchase-order/components/PurchaseOrderForm";
import { emptyPurchaseOrder, PURCHASE_ORDER_KIND } from "@/features/purchase-order/defaults";
import { isEditablePurchaseOrder, purchaseOrderSchema, type PurchaseOrderFormValues } from "@/features/purchase-order/schema";
import { ItemEditorPanel } from "@/features/quotation/components/items/ItemEditorPanel";
import { ItemTable, itemColumns } from "@/features/quotation/components/items/ItemTable";
import { DocumentKindContext, QUOTATION_KIND, type DocumentKind } from "@/features/quotation/document-kind";
import { calculateTotals } from "@/features/quotation/lib/calculate";
import { emptyLine } from "@/features/quotation/lib/defaults";
import type { QuotationLine } from "@/features/quotation/schema";
import { createMasterTrpcClient, masterTrpc } from "@/lib/master-trpc";
import { gatewayError } from "../partner/helpers";

/**
 * purchase-order UI rev 1 + SA rev 1 (owner 2026-11-04, ADR-0041).
 * UT-PO-01 route, menu and access; UT-PO-02 page setting (no From Stock / Stock ID, Location typed); UT-PO-03 Approve
 * and form ↔ contract mapping; UT-PO-04 error messages.
 */

const ID = "11111111-1111-4111-8111-111111111111";
const LINE_A = "22222222-2222-4222-8222-222222222222";
const P1 = "44444444-4444-4444-8444-444444444444";
const noop = () => undefined;

const filled = (patch: Partial<QuotationLine> = {}): QuotationLine => ({
  ...emptyLine(), stone: "Sapphire", stoneCode: "SAP-OV", stoneCodeId: "sc-1", locationId: "Safe A", pcs: "2", weightCt: "1.5", unitPrice: "1000",
  photos: [{ id: P1, name: "a.jpg", url: purchaseOrderPhotoUrl(P1) }], ...patch,
});

function po(overrides: Partial<PurchaseOrderFormValues> = {}): PurchaseOrderFormValues {
  return { ...emptyPurchaseOrder(), docDate: "2026-11-04", dueDate: "2026-12-04", vendorId: ID, addressId: ID, currency: "THB", lines: [filled(), emptyLine()], ...overrides };
}

const totals = { subtotal: "0.00", discountAmount: "0.00", priceBeforeTax: "0.00", taxAmount: "0.00", chargesAmount: "0.00", laborAmount: "0.00", grandTotal: "0.00" };
function detail(status: "PENDING_APPROVAL" | "APPROVED" = "PENDING_APPROVAL"): PurchaseOrderDetail {
  return {
    id: ID, docNo: "PO-7", status, version: 2, docDate: "2026-11-04", dueDate: "2026-12-04",
    vendorId: ID, vendor: { code: "V001", name: "Gem Co" }, addressId: ID, addressText: "Bangkok", currency: "THB", exchangeRate: null, ref: "R-1", documentNote: "",
    lines: [{
      id: LINE_A, source: "MANUAL", stoneCodeId: "sc-1", stoneCode: "SAP-OV", stone: "Sapphire", shape: "Oval", size: "", color: "", clarity: "", cutting: "", quality: "",
      lot: "L-1", location: "Safe A", cerType: "", cerNo: "", pcs: 2, weightCt: "1.500", priceUnit: "PER_CT", unitPrice: "1000.00",
      discount: { type: "NONE", value: "0" }, discountAmount: "0.00", amount: "1500.00", itemNote: "", photoIds: [P1], purchasedPcs: 0, purchasedWeightCt: "0.000",
    }],
    discount: { type: "NONE", value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null,
    totals, approvedAt: status === "APPROVED" ? "2026-11-04T03:00:00.000Z" : null, approvedBy: null, createdAt: "", createdBy: "", updatedAt: "",
  } as unknown as PurchaseOrderDetail;
}

function withForm(kind: DocumentKind, lines: QuotationLine[], child: ReactNode) {
  function Harness() {
    const form = useForm({ defaultValues: { ...po(), lines } });
    return createElement(FormProvider, form as never, createElement(DocumentKindContext.Provider, { value: kind }, child));
  }
  // The row panel reads stone options through the master tRPC client (no request is sent while rendering to a string).
  const queryClient = new QueryClient();
  const masterProps = { client: createMasterTrpcClient(), queryClient } as ComponentProps<typeof masterTrpc.Provider>;
  return renderToStaticMarkup(createElement(QueryClientProvider, { client: queryClient }, createElement(masterTrpc.Provider, masterProps, createElement(Harness))));
}
const table = (kind: DocumentKind, lines: QuotationLine[]) => withForm(kind, lines, createElement(ItemTable, {
  lines, currency: "THB", totals: calculateTotals({ ...po(), lines }), selectedIndex: null, checkedKeys: new Set<string>(), readOnly: false,
  onSelectRow: noop, onToggleCheck: noop, onToggleAll: noop, onRowAction: noop, onAddRow: noop,
}));
const panel = (kind: DocumentKind, lines: QuotationLine[]) => withForm(kind, lines, createElement(ItemEditorPanel, {
  index: 0, total: lines.length, readOnly: false, onPrev: noop, onNext: noop, onNextRow: noop, onRemove: noop, onClose: noop,
}));

describe("UT-PO-01 route, menu and access", () => {
  it("Purchase Order (PO) opens its real page and stays active on a saved PO", () => {
    expect(REAL_PAGE_HREFS["purchase-order"]).toBe("/purchase/purchase-order");
    expect(navigationHref({ label: "Purchase Order (PO)", slug: "purchase-order" })).toBe(PURCHASE_ORDER_HREF);
    expect(purchaseOrderHref(ID)).toBe(`/purchase/purchase-order/${ID}`);
    // Purchase Outstanding stays a placeholder in rev 1; Purchase (PU) has its own page (purchase FE-PU-006, owner 2026-11-04).
    expect(navigationHref({ label: "Purchase Outstanding", slug: "purchase-outstanding" })).toBe("/modules/purchase-outstanding");
  });

  it("reads only purchase-order grants; APPROVE is separate", () => {
    expect(purchaseOrderAccess({ isSuperAdmin: false, permissions: ["purchase-order:VIEW", "purchase-order:ADD"] })).toMatchObject({ view: true, add: true, edit: false, approve: false });
    expect(purchaseOrderAccess({ isSuperAdmin: false, permissions: ["purchase-order:APPROVE"] }).approve).toBe(true);
    expect(purchaseOrderAccess({ isSuperAdmin: false, permissions: ["memo-receive:VIEW", "purchase:VIEW", "memo-receive:APPROVE"] })).toMatchObject({ view: false, approve: false });
    expect(purchaseOrderAccess({ isSuperAdmin: false, permissions: "ALL" }).approve).toBe(true);
  });
});

describe("UT-PO-02 page setting: keyed-in rows, Stone Code, typed Location, no Stock ID", () => {
  it("has no From Stock, no Stock ID and a free-text Location; Quotation and Memo Receive keep theirs", () => {
    expect(PURCHASE_ORDER_KIND).toMatchObject({ stockId: "none", stoneCode: true, location: true, locations: "text", stockQuantity: false, emptyRowText: "Empty row · click to key in" });
    expect(PURCHASE_ORDER_KIND.pickOnly).toBeFalsy();
    expect(QUOTATION_KIND).toMatchObject({ stockId: "from-stock", locations: null });
    expect(itemColumns(true, true, false)[0]).toMatchObject({ title: "Stone Code", sub: "Lot" });
    expect(itemColumns(true)[0]).toMatchObject({ sub: "Stock ID · Lot" });
  });

  it("the table shows Stone Code, Location and the Add row; no Stock ID header", () => {
    const html = table(PURCHASE_ORDER_KIND, [filled(), emptyLine()]);
    expect(html).toContain("Stone Code");
    expect(html).toContain("SAP-OV");
    expect(html).toContain("Location");
    expect(html).toContain("Safe A");
    expect(html).not.toContain("Stock ID");
    expect(html).toContain("Empty row · click to key in");
  });

  it("the row panel types Location and has no Stock ID field", () => {
    const html = panel(PURCHASE_ORDER_KIND, [filled()]);
    expect(html).toContain("Location");
    expect(html).toMatch(/<input[^>]*name="lines\.0\.locationId"/);
    expect(html).not.toContain("Stock ID");
    expect(html).not.toContain("From stock only");
    const quotation = panel(QUOTATION_KIND, [filled()]);
    expect(quotation).toContain("Stock ID");
    expect(quotation).not.toMatch(/<input[^>]*name="lines\.0\.locationId"/);
  });
});

describe("UT-PO-03 Approve and form ↔ contract", () => {
  it("Approve only for a saved Pending Approval PO with no unsaved changes and the grant; Approved is read-only", () => {
    const base = { saved: true, status: "PENDING_APPROVAL" as const, editing: false, dirty: false, approve: true };
    expect(canApprovePurchaseOrder(base)).toBe(true);
    expect(canApprovePurchaseOrder({ ...base, saved: false })).toBe(false);
    expect(canApprovePurchaseOrder({ ...base, editing: true })).toBe(false);
    expect(canApprovePurchaseOrder({ ...base, dirty: true })).toBe(false);
    expect(canApprovePurchaseOrder({ ...base, approve: false })).toBe(false);
    expect(canApprovePurchaseOrder({ ...base, status: "APPROVED" })).toBe(false);
    expect(isEditablePurchaseOrder("PENDING_APPROVAL")).toBe(true);
    expect(isEditablePurchaseOrder("APPROVED")).toBe(false);
    expect(STATUS_LABELS.APPROVED?.label).toBe("Approved");
    expect(approveMessage(2)).toBe("Approve this Purchase Order? Its 2 items are sent to Purchase and it can no longer be edited.");
    expect(approveMessage(1)).toContain("Its 1 item is sent");
  });

  it("sends keyed-in MANUAL lines with stone code, location and photos, never From Stock fields; empty rows dropped", () => {
    const input = toPurchaseOrderInput(po());
    expect(input).toMatchObject({ vendorId: ID, addressId: ID, currency: "THB", docDate: "2026-11-04" });
    expect(input.lines).toHaveLength(1);
    expect(input.lines[0]).toMatchObject({ source: "MANUAL", stoneCodeId: "sc-1", stoneCode: "SAP-OV", location: "Safe A", pcs: 2, weightCt: "1.5", photoIds: [P1] });
    expect(input.lines[0]).not.toHaveProperty("memoStockId");
    expect(input.lines[0]).not.toHaveProperty("id");
  });

  it("loads a saved PO with its status, vendor, location and photos from the PO photo route", () => {
    const values = fromPurchaseOrder(detail("APPROVED"));
    expect(values).toMatchObject({ id: ID, docNo: "PO-7", version: 2, status: "APPROVED", vendorId: ID, addressId: ID, ref: "R-1" });
    expect(values.lines[0]).toMatchObject({ key: LINE_A, stoneCode: "SAP-OV", stoneCodeId: "sc-1", locationId: "Safe A", stockId: "" });
    expect(values.lines[0].photos).toEqual([{ id: P1, name: "Photo 1", url: `/api/v1/purchase-order/photos/${P1}` }]);
  });

  it("keeps the stone codes for the Stone Code field; needs a vendor, address and one item", () => {
    const stone = { stones: [{ name: "Sapphire", code: "SAP" }], codes: [{ id: "sc-1", code: "SAP-OV" }] };
    expect(stoneChoices({ stone } as unknown as PurchaseOrderOptions)).toMatchObject({ codes: [{ code: "SAP-OV" }] });
    expect(purchaseOrderSchema.safeParse(po()).success).toBe(true);
    const missing = purchaseOrderSchema.safeParse(po({ vendorId: "", addressId: "", lines: [emptyLine()] }));
    expect(missing.success).toBe(false);
    expect(missing.error?.issues.map((issue) => issue.path.join("."))).toEqual(expect.arrayContaining(["vendorId", "addressId", "lines"]));
    expect(purchaseOrderSchema.safeParse(po({ dueDate: "2026-11-01" })).success).toBe(false);
  });
});

describe("UT-PO-04 error messages", () => {
  const err = (domainCode: string, fieldErrors?: { path: string; code: string }[]) => mapPurchaseOrderError(gatewayError({ domainCode, fieldErrors }));
  it("maps PURCHASE_ORDER_* and row errors to the ui-spec messages", () => {
    expect(err("PURCHASE_ORDER_CHANGED").message).toBe("This purchase order was changed by someone else. Reload to see the latest.");
    expect(err("PURCHASE_ORDER_STATUS_INVALID")).toMatchObject({ message: "This purchase order is already approved.", reload: true });
    expect(err("PURCHASE_ORDER_NOT_FOUND")).toMatchObject({ gone: true });
    expect(err("PURCHASE_ORDER_REFERENCE_INVALID", [{ path: "vendorId", code: "invalid_reference" }]).fieldErrors).toEqual([{ name: "vendorId", message: "Choose an active option" }]);
    expect(err("PURCHASE_ORDER_REFERENCE_INVALID", [{ path: "lines.2.stoneCodeId", code: "invalid_reference" }]).message).toBe("Row 3: this stone code is no longer available.");
    expect(err("PURCHASE_ORDER_PHOTO_INVALID", [{ path: "lines.0.photoIds.1", code: "invalid_photo" }])).toMatchObject({ message: "Row 1: a photo couldn't be used. Remove it and add it again.", fieldErrors: [{ name: "lines", message: "Check item row 1" }] });
    expect(err("VALIDATION_ERROR", [{ path: "lines.1.discount.value", code: "exceeds_gross" }]).message).toBe("Row 2: the discount is more than the line amount.");
    expect(err("VALIDATION_ERROR", [{ path: "lines.4.pcs", code: "too_big" }]).message).toBe("Row 5: check this item.");
    expect(err("VALIDATION_ERROR", [{ path: "discount.value", code: "exceeds_subtotal" }]).message).toBe("The document discount is more than the subtotal.");
    expect(err("CSRF_INVALID").message).toContain("refresh");
    expect(mapPurchaseOrderError(new Error("raw")).message).toBe("Couldn't save. Try again.");
    expect(purchaseOrderLoadError(gatewayError({ domainCode: "PERMISSION_DENIED", httpStatus: 403 }))).toBe("You don't have permission to view purchase orders.");
  });
});
