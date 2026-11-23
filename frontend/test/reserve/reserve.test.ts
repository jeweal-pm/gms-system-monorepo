import { FLOW_DETAIL } from "../trade-document/flow-fixture";
import { DOCUMENT_PHOTOS } from "@/features/trade-document/document-photos";
import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { navigationHref, REAL_PAGE_HREFS } from "@/features/home/navigation";
import { fromReserve, mapReserveSaveError, RESERVE_HREF, reserveHref, reserveLoadError, reserveRestoreError, type ReserveDetail } from "@/features/reserve/api";
import { canViewReserve } from "@/features/reserve/components/ReservePage";
import { ItemTable } from "@/features/quotation/components/items/ItemTable";
import { DocumentKindContext, QUOTATION_KIND, type DocumentKind } from "@/features/quotation/document-kind";
import { calculateTotals } from "@/features/quotation/lib/calculate";
import { customerStockConfig } from "@/features/trade-document/customer-stock-config";
import { emptyCustomerStock, lotToStockLine, toCustomerStockInput, type CustomerStockFormValues } from "@/features/trade-document/customer-stock";
import { memoLot } from "../trade-document/lot-fixture";
import { gatewayError } from "../partner/helpers";

/** UT-RS-01…05: reserve UI rev 1 + SA rev 1 (owner 2026-11-02). */

const ID = "11111111-1111-4111-8111-111111111111";
const stockItem = memoLot;
const noop = () => undefined;
const config = customerStockConfig({
  photos: DOCUMENT_PHOTOS.reserve, noun: "reserve", title: "Reserve", newHref: RESERVE_HREF, detailHref: reserveHref, useApi: () => { throw new Error("not called"); },
  mapSaveError: mapReserveSaveError, mapRestoreError: reserveRestoreError, pickerTitle: "Add From Stock", approvalType: "reserve",
  notePlaceholder: "", noteHint: "Printed on the reserve for the customer", daybook: null,
});

describe("navigation and access (UT-RS-01)", () => {
  it("links Pre-Sale › Reserve to its pages and reads the reserve leaf", () => {
    expect(REAL_PAGE_HREFS.reserve).toBe("/pre-sale/reserve");
    expect(navigationHref({ label: "Reserve", slug: "reserve" })).toBe("/pre-sale/reserve");
    expect(reserveHref(ID)).toBe(`/pre-sale/reserve/${ID}`);
    expect(canViewReserve({ isSuperAdmin: false, permissions: ["reserve:VIEW"] })).toBe(true);
    expect(canViewReserve({ isSuperAdmin: false, permissions: ["memo-out:VIEW"] })).toBe(false);
    expect(canViewReserve(undefined)).toBe(false);
  });
});

describe("page settings (UT-RS-02, design 01/02)", () => {
  it("one From Stock button opening \"Add From Stock\" without the vendor cost; From Stock rows edit their quantity; approval wording", () => {
    expect(config.noLabel).toBe("Reserve No.:");
    expect(config.pickLabel).toBe("From Stock");
    expect(config.kind?.stockQuantity).toBe(true);
    expect(config.kind?.documentNote.hint).toBe("Printed on the reserve for the customer");
    const picker = config.picker!.render({ values: emptyCustomerStock(), onClose: noop, onAdd: noop });
    expect(isValidElement(picker)).toBe(true);
    expect((picker as { props: { title: string; showPrice: boolean; vendorId?: string } }).props).toMatchObject({ title: "Add From Stock", showPrice: false });
    expect((picker as { props: { vendorId?: string } }).props.vendorId).toBeUndefined();
    expect(config.picker!.addedToast(2)).toBe("Added 2 items from Stock");
    // ADR-0050: no Approve confirm on the page; the reserve approval setting drives Save / Send to approve.
    expect(config).not.toHaveProperty("approval");
    expect(config.approvalType).toBe("reserve");
  });
});

describe("mapping (UT-RS-03/04)", () => {
  it("UT-RS-03 sends the lotKey of a From Stock row with its Sale Price, and none for a manual row", () => {
    const values: CustomerStockFormValues = {
      ...emptyCustomerStock(), currency: "THB", dueDate: "2026-11-30", customerId: ID, shippingAddressId: ID, invoiceAddressId: ID,
      lines: [{ ...lotToStockLine(stockItem), pcs: "1", weightCt: "0.68", unitPrice: "5000" }, { ...emptyCustomerStock().lines[0], stone: "Topaz", pcs: "1", weightCt: "1", unitPrice: "100" }],
    };
    const input = toCustomerStockInput(values);
    expect(input.lines.map((line) => [line.lotKey, line.memoStockId, line.pcs, line.weightCt, line.unitPrice])).toEqual([[memoLot.lotKey, null, 1, "0.68", "5000"], [null, null, 1, "1", "100"]]);
    expect(input).toMatchObject({ customerId: ID, shippingAddressId: ID, invoiceAddressId: ID });
  });

  it("UT-RS-04 loads a saved reserve with its status, lot and pending maximum (no Stock ID)", () => {
    const base = { id: ID, stoneCodeId: null, stoneCode: "", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "", lot: "", cerType: "", cerNo: "",
      priceUnit: "PER_CT" as const, discount: { type: "NONE" as const, value: "0" }, discountAmount: "0.00", itemNote: "", photoIds: [], outstandingPcs: null, outstandingWeightCt: null };
    const detail = {
      id: ID, docNo: "RS-1", status: "APPROVED", version: 2, docDate: "2026-11-02", dueDate: "2026-11-30",
      customerId: ID, customer: { code: "C001", name: "Aom" }, shippingAddressId: ID, shippingAddressText: "S", invoiceAddressId: null, invoiceAddressText: "I",
      currency: "THB", exchangeRate: null, ref: "", documentNote: "",
      lines: [{ ...base, source: "STOCK" as const, stone: "Tourmaline", location: "Memo", pcs: 1, weightCt: "0.680", unitPrice: "5000.00", amount: "3400.00", memoStockId: null, ownStockId: null, stockId: null, lotKey: memoLot.lotKey, allocated: true, stockPendingPcs: 2, stockPendingWeightCt: "1.360" }],
      discount: { type: "NONE", value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null,
      totals: { subtotal: "3400.00", discountAmount: "0.00", priceBeforeTax: "3400.00", taxAmount: "0.00", chargesAmount: "0.00", laborAmount: "0.00", grandTotal: "3400.00" },
      approvedAt: "2026-11-02T03:00:00.000Z", approvedBy: "u", createdAt: "", createdBy: "", updatedAt: "", deletedAt: null, deletedBy: null, syncState: "IDLE" as const, ...FLOW_DETAIL,
    } satisfies ReserveDetail;
    // ADR-0048 (owner 2026-11-11): saved photos load back in order, read from this document's own photo route.
    expect(fromReserve({ ...detail, lines: detail.lines.map((line) => ({ ...line, photoIds: ["p1", "p2"] })) } as typeof detail).lines[0]?.photos).toEqual([
      { id: "p1", name: "Photo 1", url: "/api/v1/reserve/photos/p1" },
      { id: "p2", name: "Photo 2", url: "/api/v1/reserve/photos/p2" },
    ]);
    expect(fromReserve(detail)).toMatchObject({
      docNo: "RS-1", status: "APPROVED", invoiceAddressId: "",
      lines: [{ source: "STOCK", stockId: "", lotKey: memoLot.lotKey, memoStockId: "", stockPendingPcs: "2", stockPendingWeightCt: "1.360", pcs: "1" }],
    });
  });
});

describe("errors (UT-RS-05)", () => {
  it("maps RESERVE_* codes, including a short approval", () => {
    expect(mapReserveSaveError(gatewayError({ domainCode: "RESERVE_PENDING_SHORT", httpStatus: 409, code: "CONFLICT" })).message).toContain("no longer have enough pending");
    expect(mapReserveSaveError(gatewayError({ domainCode: "RESERVE_STATUS_INVALID", httpStatus: 409, code: "CONFLICT" })).message).toBe("This reserve can't be changed in its current status.");
    expect(mapReserveSaveError(gatewayError({ domainCode: "RESERVE_REFERENCE_INVALID", httpStatus: 422, fieldErrors: [{ path: "customerId", code: "invalid_reference" }] })).fieldErrors)
      .toEqual([{ name: "customerId", message: "Choose an active option" }]);
    expect(reserveLoadError(gatewayError({ domainCode: "RESERVE_NOT_FOUND", httpStatus: 404, code: "NOT_FOUND" }))).toBe("This reserve no longer exists.");
  });
});

describe("From Stock only (UT-RS-06, owner 2026-11-02: \"Reserve ไม่มีการ add row\", empty rows don't open the row panel)", () => {
  const renderTable = (kind: DocumentKind) => {
    const lines = emptyCustomerStock().lines;
    function Harness() {
      const form = useForm({ defaultValues: { lines } });
      return createElement(FormProvider, form as never, createElement(DocumentKindContext.Provider, { value: kind },
        createElement(ItemTable, {
          lines, currency: "THB", totals: calculateTotals({ ...emptyCustomerStock(), lines }), selectedIndex: null, checkedKeys: new Set<string>(), readOnly: false,
          onSelectRow: noop, onToggleCheck: noop, onToggleAll: noop, onRowAction: noop, onAddRow: noop,
        })));
    }
    return renderToStaticMarkup(createElement(Harness));
  };

  it("Reserve (and Memo Out rev 3) are pick only: no Add row, an empty row opens From Stock; Quotation keeps Add row", () => {
    // pickOnly: no Add row, and an empty row opens From Stock instead of the row panel; picked rows still open it.
    expect(config.kind?.pickOnly).toBe(true);
    expect(config.kind?.emptyRowText).toBe("Empty row · click to pick From Stock");
    const reserveTable = renderTable(config.kind!);
    expect(reserveTable).not.toContain("Add row");
    expect(reserveTable).toContain("Empty row · click to pick From Stock");
    expect(renderTable(QUOTATION_KIND)).toContain("Add row");
    const memoOut = customerStockConfig({ photos: DOCUMENT_PHOTOS.memoOut, noun: "memo out", title: "Memo Out", newHref: "/memo/memo-out", detailHref: (id: string) => id, useApi: () => { throw new Error("not called"); }, mapSaveError: mapReserveSaveError, mapRestoreError: reserveRestoreError, pickerTitle: "From Stock", approvalType: "memo-out", notePlaceholder: "", noteHint: "", daybook: null });
    expect(memoOut.kind?.pickOnly).toBe(true);
    expect(renderTable(memoOut.kind!)).not.toContain("Add row");
  });
});
