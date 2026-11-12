import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import {
  clearPickedRows,
  emptyPurchase,
  emptyPurchaseLine,
  fromPurchase,
  mapPurchaseSaveError,
  memoStockKey,
  memoStockToPurchaseLine,
  pickedSourceKeys,
  PURCHASE_HREF,
  purchaseHref,
  purchaseLineSource,
  purchaseLoadError,
  purchaseOrderLineToPurchaseLine,
  purchaseSchema,
  purchaseTableLine,
  toPurchaseInput,
  type PurchaseFormValues,
  type PurchaseLine,
} from "@/features/purchase/api";
import { canViewPurchase, PURCHASE_CONFIG, PURCHASE_EMPTY_ROW_TEXT, PURCHASE_KIND, purchasePickerBlocked } from "@/features/purchase/components/PurchasePage";
import { isNavItemActive, navigationHref, sidebarSections } from "@/features/home/navigation";
import { ItemEditorPanel } from "@/features/quotation/components/items/ItemEditorPanel";
import { DocumentKindContext, QUOTATION_KIND, type DocumentKind } from "@/features/quotation/document-kind";
import { emptyQuotation } from "@/features/quotation/lib/defaults";
import { DUE_BEFORE_DOC_MESSAGE, type QuotationLine } from "@/features/quotation/schema";
import { gatewayError } from "../partner/helpers";
import { ID, LINE, memoRow, POL, poRow, savedLine, savedPurchase, STOCK } from "./fixtures";

/** UT-PU-03…06, UT-PU-09…11: purchase UI rev 1 + rev 2 on SA rev 1 (FE-PU-002…005, FE-PU-009/010). */



const manualLine = (patch: Partial<PurchaseLine> = {}): PurchaseLine => ({ ...emptyPurchaseLine(), stoneCode: "RU-1", stone: "Ruby", pcs: "5", weightCt: "9.000", unitPrice: "10", ...patch });

/** A valid purchase: header filled, one Memo Stock row with a price. */
const valid = (patch: Partial<PurchaseFormValues> = {}): PurchaseFormValues => {
  const base = emptyPurchase();
  return { ...base, docDate: "2026-11-04", dueDate: "2026-12-04", vendorId: ID, addressId: ID, currency: "USD", lines: [memoStockToPurchaseLine(memoRow()), ...base.lines.slice(1)], ...patch };
};
const issues = (values: PurchaseFormValues) => {
  const result = purchaseSchema.safeParse(values);
  return result.success ? [] : result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
};
const withRow = (row: PurchaseLine) => valid({ lines: [row] });

describe("UT-PU-03 routes, page settings and access", () => {
  it("routes; the sidebar opens the page and stays active on a saved purchase (FE-PU-006)", () => {
    expect(PURCHASE_HREF).toBe("/purchase-order/purchase");
    expect(purchaseHref(ID)).toBe(`/purchase-order/purchase/${ID}`);
    expect(navigationHref({ label: "Purchase", slug: "purchase" })).toBe(PURCHASE_HREF);
    const link = sidebarSections.flatMap((section) => section.items).find((item) => "href" in item && item.id === "purchase");
    expect(link && "href" in link ? link.href : undefined).toBe(PURCHASE_HREF);
    expect(link && "href" in link && isNavItemActive(link, purchaseHref(ID))).toBe(true);
  });

  it("reads the purchase leaf", () => {
    expect(canViewPurchase({ isSuperAdmin: false, permissions: ["purchase:VIEW"] })).toBe(true);
    expect(canViewPurchase({ isSuperAdmin: false, permissions: ["memo-return:VIEW", "purchase-order:VIEW"] })).toBe(false);
    expect(canViewPurchase({ isSuperAdmin: true, permissions: [] })).toBe(true);
    expect(canViewPurchase(undefined)).toBe(false);
  });

  it("number label, kind and note", () => {
    expect(PURCHASE_CONFIG.noLabel).toBe("Purchase No.:");
    expect(PURCHASE_KIND).toMatchObject({ stockId: "auto", stoneCode: true, location: true, locations: "text", stockQuantity: true, lockStockDiscount: true, priceTitle: "Price", documentNote: { max: 250, hint: "Printed on the purchase for the vendor" } });
    expect(PURCHASE_CONFIG.noteMax).toBe(250);
    expect(PURCHASE_CONFIG.notePlaceholder).toBe("e.g. Paid by transfer on delivery.");
    expect(PURCHASE_CONFIG.partyId(valid())).toBe(ID);
    expect(PURCHASE_CONFIG.approvalType).toBe("purchase");
  });
});

describe("UT-PU-11 item buttons and empty-row text (R2-01a, R2-02)", () => {
  it("Memo Stock and Purchase Order both open their pickers; the empty-row text names both", () => {
    expect(PURCHASE_CONFIG.pickLabel).toBe("Memo Stock");
    expect(PURCHASE_CONFIG.picker?.addedToast(2)).toBe("Added 2 items from Memo Stock");
    expect(PURCHASE_CONFIG.picker?.addedToast(1)).toBe("Added 1 item from Memo Stock");
    expect(PURCHASE_CONFIG.secondaryPicker?.label).toBe("Purchase Order");
    expect(PURCHASE_CONFIG.secondaryPicker?.disabledReason).toBeUndefined();
    expect(PURCHASE_CONFIG.secondaryPicker?.render).toBeTypeOf("function");
    expect(PURCHASE_CONFIG.secondaryPicker?.addedToast?.(1)).toBe("Added 1 item from Purchase Order");
    expect(PURCHASE_EMPTY_ROW_TEXT).toBe("Empty row · click to enter details, or use Memo Stock and Purchase Order to populate.");
    expect(PURCHASE_CONFIG.emptyRowText).toBe(PURCHASE_EMPTY_ROW_TEXT);
    expect(PURCHASE_CONFIG.itemTable).toBeTypeOf("function");
  });

  it("both pickers are blocked with a toast until a vendor and a currency are chosen", () => {
    expect(purchasePickerBlocked({ vendorId: "", currency: "USD" })).toBe("Choose a vendor first");
    expect(purchasePickerBlocked({ vendorId: ID, currency: "" })).toBe("Choose a currency first");
    expect(purchasePickerBlocked({ vendorId: ID, currency: "USD" })).toBeNull();
    expect(PURCHASE_CONFIG.picker?.blockedReason({ ...emptyPurchase(), currency: "THB" })).toBe("Choose a vendor first");
  });

  it("the Purchase Order picker without a vendor renders the blocked toast instead of the dialog", () => {
    const html = renderToStaticMarkup(createElement(() => PURCHASE_CONFIG.secondaryPicker!.render!({ values: { ...emptyPurchase(), currency: "THB" }, onClose: () => undefined, onAdd: () => undefined }) as never));
    expect(html).toContain("Choose a vendor first");
    expect(html).toContain('role="status"');
    expect(html).not.toContain('role="dialog"');
  });
});

describe("UT-PU-04 schema (form-guidelines, R2-03)", () => {
  it("a complete purchase passes", () => {
    expect(issues(valid())).toEqual([]);
  });

  it("an empty new purchase: header fields Required and Add at least one item", () => {
    const found = issues(emptyPurchase());
    for (const path of ["dueDate", "vendorId", "addressId", "currency"]) expect(found).toContainEqual({ path, message: "Required" });
    expect(found).toContainEqual({ path: "lines", message: "Add at least one item" });
  });

  it("Due Date on or after Doc Date", () => {
    expect(issues(valid({ dueDate: "2026-11-03" }))).toContainEqual({ path: "dueDate", message: DUE_BEFORE_DOC_MESSAGE });
    expect(issues(valid({ dueDate: "2026-11-04" }))).toEqual([]);
  });

  it("Ref. up to 100 and Document Note up to 250 characters", () => {
    expect(issues(valid({ ref: "x".repeat(100), documentNote: "x".repeat(250) }))).toEqual([]);
    expect(issues(valid({ ref: "x".repeat(101) }))).toContainEqual({ path: "ref", message: "Up to 100 characters" });
    expect(issues(valid({ documentNote: "x".repeat(251) }))).toContainEqual({ path: "documentNote", message: "Up to 250 characters" });
  });

  it("at most 200 rows", () => {
    const rows = (count: number) => Array.from({ length: count }, (_, index) => manualLine({ key: `k${index}` }));
    expect(issues(valid({ lines: rows(200) }))).toEqual([]);
    expect(issues(valid({ lines: rows(201) }))).toContainEqual({ path: "lines", message: "Up to 200 rows" });
  });

  it("every filled row needs a quantity and a Price above 0; manual rows have no cap", () => {
    expect(issues(withRow(manualLine({ unitPrice: "" })))).toEqual([{ path: "lines.0.unitPrice", message: "Enter the price" }]);
    expect(issues(withRow(manualLine({ unitPrice: "0" })))).toEqual([{ path: "lines.0.unitPrice", message: "Enter the price" }]);
    expect(issues(withRow(manualLine({ pcs: "", weightCt: "" })))).toEqual([{ path: "lines.0.pcs", message: "Enter the quantity" }]);
    expect(issues(withRow(manualLine({ pcs: "999", weightCt: "999.000" })))).toEqual([]);
  });
});

describe("UT-PU-05 Memo Stock rows (R2-MS → page rows)", () => {
  it("copies the item, location, the available quantity as the cap and the net price at 2 dp", () => {
    const row = memoStockToPurchaseLine(memoRow());
    expect(row).toMatchObject({
      source: "STOCK", stockId: "260003", lot: "L-2607-007", stoneCode: "", stoneCodeId: "", locationId: "Memo", stone: "Tourmaline", shape: "Oval", size: "7.2×5.4 mm",
      color: "Red", clarity: "VVS", cutting: "Excellent", quality: "AAA", cerType: "GIA", cerNo: "GRS2024-081233", itemNote: "Silk",
      pcs: "2", weightCt: "1.360", priceUnit: "PER_CT", unitPrice: "11250.50", discountValue: "", photos: [],
      memoStockId: STOCK, memoGroup: "IN_STOCK", purchaseOrderLineId: "", sourceDocNo: "MR-1001", stockPendingPcs: "2", stockPendingWeightCt: "1.360",
    });
    expect(row.key).toMatch(/^line-/);
    expect(purchaseLineSource(row)).toBe("STOCK");
  });

  it("a per-pcs item and a sold row (the cap is its sold, not yet purchased quantity; owner Q-PU-16: none on dev yet)", () => {
    expect(memoStockToPurchaseLine(memoRow({ priceUnit: "PCS", availablePcs: 1, availableWeightCt: "0.680", netUnitPrice: "900" }))).toMatchObject({ priceUnit: "PER_PCS", pcs: "1", weightCt: "0.680", unitPrice: "900.00", stockPendingPcs: "1" });
    const sold = memoStockToPurchaseLine(memoRow({ key: `${STOCK}:SOLD`, status: "SOLD", availablePcs: 1, availableWeightCt: "0.500" }));
    expect(sold).toMatchObject({ memoGroup: "SOLD", pcs: "1", weightCt: "0.500", stockPendingPcs: "1", stockPendingWeightCt: "0.500" });
  });

  it("a Memo Stock row stays above 0 and within its cap", () => {
    const row = memoStockToPurchaseLine(memoRow());
    expect(issues(withRow({ ...row, pcs: "0", weightCt: "0.500" }))).toEqual([]);
    expect(issues(withRow({ ...row, pcs: "0", weightCt: "0" }))).toContainEqual({ path: "lines.0.pcs", message: "Enter the quantity" });
    expect(issues(withRow({ ...row, pcs: "3" }))).toContainEqual({ path: "lines.0.pcs", message: "More than the pending 2 pcs" });
    expect(issues(withRow({ ...row, weightCt: "1.361" }))).toContainEqual({ path: "lines.0.weightCt", message: "More than the pending 1.360 ct" });
    expect(issues(withRow({ ...row, weightCt: "1.360" }))).toEqual([]);
  });
});

describe("UT-PU-09 Purchase Order rows (R2-PO, R2-05)", () => {
  it("copies the attributes, the open quantity as the cap, the PO net price and the PO line id; Stock ID Auto", () => {
    const row = purchaseOrderLineToPurchaseLine(poRow());
    expect(row).toMatchObject({
      source: "STOCK", stockId: "", stoneCode: "RU-OV-1", stoneCodeId: "", lot: "L-PO-1", locationId: "Safe A", stone: "Ruby", cerType: "GRS", cerNo: "GRS-1", itemNote: "Pair",
      pcs: "6", weightCt: "3.000", priceUnit: "PER_CT", unitPrice: "950.00", discountValue: "", photos: [],
      memoStockId: "", memoGroup: "", purchaseOrderLineId: POL, sourceDocNo: "PO2611001", stockPendingPcs: "6", stockPendingWeightCt: "3.000",
    });
    expect(purchaseLineSource(row)).toBe("PURCHASE_ORDER");
  });

  it("a fully open per-pcs line", () => {
    expect(purchaseOrderLineToPurchaseLine(poRow({ status: "OPEN", purchasedPcs: 0, purchasedWeightCt: "0.000", availablePcs: 10, availableWeightCt: "5.000", priceUnit: "PER_PCS", netUnitPrice: "120" })))
      .toMatchObject({ pcs: "10", weightCt: "5.000", priceUnit: "PER_PCS", unitPrice: "120.00" });
  });

  it("the page table shows Auto · from {PO No.}; a manual row Auto and — for a blank location", () => {
    expect(purchaseTableLine(purchaseOrderLineToPurchaseLine(poRow()))).toMatchObject({ stockId: "Auto · from PO2611001", locationId: "Safe A" });
    expect(purchaseTableLine({ ...purchaseOrderLineToPurchaseLine(poRow()), stockId: "260010" })).toMatchObject({ stockId: "260010 · from PO2611001" });
    expect(purchaseTableLine(manualLine())).toMatchObject({ stockId: "Auto", locationId: "—" });
    expect(purchaseTableLine(memoStockToPurchaseLine(memoRow()))).toMatchObject({ stockId: "260003 · In stock", locationId: "Memo" });
    const empty = emptyPurchaseLine();
    expect(purchaseTableLine(empty)).toBe(empty);
  });
});

const noop = () => undefined;
function panel(kind: DocumentKind, line: QuotationLine) {
  function Form({ children }: { children: ReactNode }) {
    const form = useForm({ defaultValues: { ...emptyQuotation(), lines: [line] } });
    return createElement(FormProvider, form as never, children);
  }
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(
        DocumentKindContext.Provider,
        { value: kind },
        createElement(Form, null, createElement(ItemEditorPanel, { index: 0, total: 1, readOnly: false, onPrev: noop, onNext: noop, onNextRow: noop, onRemove: noop, onClose: noop })),
      ),
    ),
  );
}
const input = (html: string, attr: string) => new RegExp(`<input[^>]*${attr}[^>]*>`).exec(html)?.[0] ?? "";

describe("UT-PU-10 picked-row edit rule (R2-03, owner 2026-11-04)", () => {
  it("a picked row edits only Pcs, Weight, Price and the Item Note; the line discount is locked (D8)", () => {
    for (const row of [memoStockToPurchaseLine(memoRow()), purchaseOrderLineToPurchaseLine(poRow())]) {
      const html = panel(PURCHASE_KIND, row);
      for (const field of ["pcs", "weightCt", "unitPrice", "itemNote"]) expect(input(html, `name="lines.0.${field}"`)).not.toMatch(/ (readOnly|disabled)=""/);
      for (const field of ["lot", "locationId", "cerNo"]) expect(input(html, `name="lines.0.${field}"`)).toMatch(/ readOnly=""/);
      expect(input(html, 'aria-label="Discount \\(%\\)"')).toContain('disabled=""');
      expect(input(html, 'aria-label="Discount Amt')).toContain('disabled=""');
    }
  });

  it("manual rows keep every field and the discount; other pages keep the From Stock discount (TC-PU-07)", () => {
    const manual = panel(PURCHASE_KIND, manualLine());
    expect(input(manual, 'aria-label="Discount \\(%\\)"')).not.toContain("disabled=\"\"");
    expect(input(manual, 'name="lines.0.lot"')).not.toMatch(/ readOnly=""/);
    expect(input(manual, 'name="lines.0.locationId"')).not.toMatch(/ readOnly=""/);
    expect(manual).toContain("Assigned when you save");
    const quotationStock = panel(QUOTATION_KIND, { ...manualLine(), source: "STOCK", memoStockId: STOCK, stockPendingPcs: "5", stockPendingWeightCt: "9" });
    expect(QUOTATION_KIND.lockStockDiscount).toBeUndefined();
    expect(input(quotationStock, 'aria-label="Discount \\(%\\)"')).not.toContain("disabled=\"\"");
  });

  it("a PO row stays above 0 and within its open quantity", () => {
    const row = purchaseOrderLineToPurchaseLine(poRow());
    expect(issues(withRow(row))).toEqual([]);
    expect(issues(withRow({ ...row, pcs: "7" }))).toContainEqual({ path: "lines.0.pcs", message: "More than the open 6 pcs" });
    expect(issues(withRow({ ...row, weightCt: "3.001" }))).toContainEqual({ path: "lines.0.weightCt", message: "More than the open 3.000 ct" });
    expect(issues(withRow({ ...row, unitPrice: "0" }))).toContainEqual({ path: "lines.0.unitPrice", message: "Enter the price" });
  });

  it("a new vendor clears Memo Stock and PO rows; manual and empty rows stay (R2-04)", () => {
    const memo = memoStockToPurchaseLine(memoRow());
    const po = purchaseOrderLineToPurchaseLine(poRow());
    const manual = manualLine();
    const empty = emptyPurchaseLine();
    expect([...pickedSourceKeys([memo, po, manual, empty])]).toEqual([memoStockKey(STOCK, "IN_STOCK"), POL]);
    const cleared = clearPickedRows([memo, po, manual, empty])!;
    expect(cleared).toHaveLength(4);
    expect(cleared[0]).toMatchObject({ stockId: "", stone: "", memoStockId: "", source: "MANUAL" });
    expect(cleared[1]).toMatchObject({ stoneCode: "", purchaseOrderLineId: "", source: "MANUAL" });
    expect(cleared[2]).toBe(manual);
    expect(cleared[3]).toBe(empty);
    expect(clearPickedRows([manual, empty])).toBeNull();
  });
});


describe("UT-PU-06 contract mapping, errors and the approve text (FE-PU-003/005)", () => {
  it("toPurchaseInput: one row per source, empty rows dropped, picked rows without discount or stone code id, no ids on a new purchase", () => {
    const values = valid({ lines: [memoStockToPurchaseLine(memoRow()), { ...purchaseOrderLineToPurchaseLine(poRow()), discountValue: "5" }, manualLine({ discountType: "PERCENT", discountValue: "10", locationId: "Safe B" }), emptyPurchaseLine()] });
    const input = toPurchaseInput(values);
    expect(input.vendorId).toBe(ID);
    expect(input.addressId).toBe(ID);
    expect(input.lines).toHaveLength(3);
    expect(input.lines[0]).toMatchObject({ source: "STOCK", memoStockId: STOCK, memoGroup: "IN_STOCK", purchaseOrderLineId: null, stoneCodeId: null, discount: { type: "NONE", value: "0" }, photoIds: [], pcs: 2, weightCt: "1.360", unitPrice: "11250.50", priceUnit: "PER_CT", itemNote: "Silk" });
    expect(input.lines[1]).toMatchObject({ source: "PURCHASE_ORDER", purchaseOrderLineId: POL, memoStockId: null, memoGroup: null, stoneCodeId: null, discount: { type: "NONE", value: "0" }, pcs: 6, weightCt: "3.000", unitPrice: "950.00" });
    expect(input.lines[2]).toMatchObject({ source: "MANUAL", memoStockId: null, memoGroup: null, purchaseOrderLineId: null, discount: { type: "PERCENT", value: "10" }, location: "Safe B" });
    for (const line of input.lines) expect(line).not.toHaveProperty("id");
  });

  it("fromPurchase keeps sources, Stock IDs, Memo / PO numbers and the caps; a saved row sends its id on update", () => {
    const values = fromPurchase(savedPurchase());
    expect(values).toMatchObject({ id: ID, docNo: "PU-7", version: 3, status: "PENDING_APPROVAL", vendorId: ID, addressId: ID, ref: "R-1", documentNote: "Paid by transfer" });
    expect(values.lines[0]).toMatchObject({ key: "66666666-6666-4666-8666-666666666666", source: "STOCK", stockId: "260003", memoStockId: STOCK, memoGroup: "IN_STOCK", sourceDocNo: "MR-1001", stockPendingPcs: "2", stockPendingWeightCt: "1.360", pcs: "1" });
    expect(values.lines[1]).toMatchObject({ source: "STOCK", stockId: "260012", purchaseOrderLineId: POL, sourceDocNo: "PO2611001", stockPendingPcs: "6", stoneCodeId: "" });
    expect(values.lines[2]).toMatchObject({ source: "MANUAL", stockId: "260011", stoneCodeId: ID, discountType: "PERCENT", discountValue: "10", memoStockId: "", purchaseOrderLineId: "" });
    expect(issues(values)).toEqual([]);
    const input = toPurchaseInput({ ...values, lines: [...values.lines, manualLine()] });
    expect(input.lines.map((line) => ("id" in line ? line.id : undefined))).toEqual(["66666666-6666-4666-8666-666666666666", "77777777-7777-4777-8777-777777777777", LINE, undefined]);
    expect(input.lines.map((line) => line.source)).toEqual(["STOCK", "PURCHASE_ORDER", "MANUAL", "MANUAL"]);
  });

  it("an approved purchase has no caps (limits are null once approved)", () => {
    const values = fromPurchase(savedPurchase({ status: "APPROVED", lines: [savedLine({ source: "STOCK", memoStockId: STOCK, memoGroup: "IN_STOCK", memoReceive: { docNo: "MR-1001" } })] }));
    expect(values.status).toBe("APPROVED");
    expect(values.lines[0]).toMatchObject({ stockPendingPcs: "", stockPendingWeightCt: "" });
  });

  it("errors: conflict, approved, save-time and approve-time shortages as row errors, references, Stock IDs, CSRF", () => {
    const map = (domainCode: string, fieldErrors?: { path: string; code: string }[], httpStatus = 409) => mapPurchaseSaveError(gatewayError({ code: "CONFLICT", httpStatus, domainCode, fieldErrors }));
    expect(map("PURCHASE_CHANGED")).toEqual({ fieldErrors: [], message: "This purchase was changed by someone else. Refresh to see the latest." });
    expect(map("PURCHASE_STATUS_INVALID")).toEqual({ fieldErrors: [], message: "This purchase is approved and can no longer be changed." });
    expect(map("VALIDATION_ERROR", [{ path: "lines.1.pcs", code: "exceeds_available" }, { path: "lines.1.weightCt", code: "exceeds_available" }], 400)).toEqual({
      fieldErrors: [{ name: "lines.1.pcs", message: "More than the available quantity" }, { name: "lines.1.weightCt", message: "More than the available quantity" }],
      message: "Row 2: more than the available quantity. Nothing was saved.",
    });
    const short = map("PURCHASE_PENDING_SHORT", [{ path: "lines.2.pcs", code: "exceeds_available" }, { path: "lines.0.weightCt", code: "exceeds_available" }, { path: "lines.3.purchaseOrderLineId", code: "invalid_reference" }]);
    expect(short.message).toBe("Rows 1, 3, 4: not enough is available any more. Lower the quantity or remove the row, then save again. Nothing was saved.");
    expect(short.fieldErrors).toContainEqual({ name: "lines.2.pcs", message: "More than the available quantity" });
    expect(short.fieldErrors).toContainEqual({ name: "lines.3.purchaseOrderLineId", message: "No longer available" });
    expect(map("PURCHASE_REFERENCE_INVALID", [{ path: "lines.0.memoStockId", code: "invalid_reference" }], 422)).toEqual({
      fieldErrors: [{ name: "lines.0.memoStockId", message: "No longer available" }],
      message: "Row 1: this item is no longer available. Remove the row and choose again.",
    });
    expect(map("PURCHASE_REFERENCE_INVALID", [{ path: "vendorId", code: "invalid_reference" }], 422).fieldErrors).toEqual([{ name: "vendorId", message: "Choose an active option" }]);
    expect(map("PURCHASE_STOCK_ID_EXHAUSTED").message).toBe("No more Stock IDs this year. Contact the administrator.");
    expect(map("CSRF_INVALID", undefined, 403).message).toBe("Please reload the page and try again.");
    expect(map("VALIDATION_ERROR", [{ path: "dueDate", code: "required" }], 400).fieldErrors).toEqual([{ name: "dueDate", message: "Required" }]);
    expect(purchaseLoadError(gatewayError({ code: "NOT_FOUND", httpStatus: 404, domainCode: "PURCHASE_NOT_FOUND" }))).toBe("Purchase not found.");
    expect(purchaseLoadError(gatewayError({ code: "FORBIDDEN", httpStatus: 403, domainCode: "PERMISSION_DENIED" }))).toBe("You don't have permission to view purchases.");
  });

  it("the page has no Approve confirm any more (ADR-0048: Approve menu only); it follows the purchase approval setting", () => {
    expect(PURCHASE_CONFIG).not.toHaveProperty("approval");
    expect(PURCHASE_CONFIG.approvalType).toBe("purchase");
  });
});
