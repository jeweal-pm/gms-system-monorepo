import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { navigationHref, REAL_PAGE_HREFS } from "@/features/home/navigation";
import {
  CUSTOMER_SPEC,
  customerFilterInput,
  customerListInput,
  memoOutHref,
  PAGE_HREF,
  toReportItem,
  toReportRow,
  type CustomerItem,
  type CustomerListRow,
} from "@/features/memo-outstanding-customer/api";
import { memoOutstandingAccess } from "@/features/memo-outstanding-vendor/api";
import { CustomizeViewPanel } from "@/features/memo-outstanding-vendor/components/customize-view-panel";
import { OutstandingTable } from "@/features/memo-outstanding-vendor/components/outstanding-table";
import { ReportSpecContext } from "@/features/memo-outstanding-vendor/components/report-context";
import { DEFAULT_VIEW, emptyListState, itemsCacheRoot, listStateToSearch, parseListState, reportColumns, VENDOR_SPEC } from "@/features/memo-outstanding-vendor/model";

/** UT-MOC-01…03: Memo Outstanding › From Customer (UI rev 1 + SA rev 1 / ADR-0039, owner 2026-11-03). */

const DOC = "11111111-1111-4111-8111-111111111111";
const CUSTOMER = "33333333-3333-4333-8333-333333333333";
const qty = (pcs: number, weightCt: string) => ({ pcs, weightCt });
const customerRow: CustomerListRow = {
  memoOutId: DOC, docNo: "MO-7", docDate: "2026-10-20", dueDate: "2026-11-05", dueInDays: 2,
  customer: { id: CUSTOMER, code: "C001", name: "Siam Jewelry" }, currency: "THB", openValue: "3000.00",
  memo: qty(4, "2.000"), return: qty(1, "0.500"), sold: qty(0, "0.000"), outstanding: qty(3, "1.500"),
};
const customerItem: CustomerItem = {
  id: "44444444-4444-4444-8444-444444444444", memoOutId: DOC, position: 1, stockId: "260003", lot: "L-7", location: "Memo",
  stone: "Ruby", shape: "Oval", size: "", color: "Red", clarity: "", cutting: "", quality: "", cerType: "GIA", cerNo: "C-7", itemNote: "lent",
  priceUnit: "CTS", netUnitPrice: "2000.0000", currency: "THB", openValue: "3000.00",
  memo: qty(4, "2.000"), return: qty(1, "0.500"), sold: qty(0, "0.000"), outstanding: qty(3, "1.500"),
};
const noop = () => undefined;
const withSpec = (type: unknown, props: object) =>
  renderToStaticMarkup(createElement(ReportSpecContext.Provider, { value: CUSTOMER_SPEC }, createElement(type as FunctionComponent<object>, props)));

describe("UT-MOC-01 report config, route and access", () => {
  it("links Memo Outstanding › Customer to its page and reads its own leaf", () => {
    expect(PAGE_HREF).toBe("/memo/memo-outstanding/customer");
    expect(REAL_PAGE_HREFS["memo-outstanding-from-customer"]).toBe(PAGE_HREF);
    expect(navigationHref({ label: "Customer", slug: "memo-outstanding-from-customer" })).toBe(PAGE_HREF);
    expect(memoOutstandingAccess({ isSuperAdmin: false, permissions: ["memo-outstanding-customer:VIEW"] }, CUSTOMER_SPEC.menuKey)).toEqual({ view: true, print: false, excel: false });
    expect(memoOutstandingAccess({ isSuperAdmin: false, permissions: ["memo-outstanding-vendor:VIEW"] }, CUSTOMER_SPEC.menuKey).view).toBe(false);
  });

  it("has no Reserve, its own labels and its own storage / cache keys", () => {
    expect(CUSTOMER_SPEC.buckets).toEqual(["memo", "return", "sold", "outstanding"]);
    expect(reportColumns(CUSTOMER_SPEC).map((column) => column.key)).not.toContain("reserve");
    expect(reportColumns(VENDOR_SPEC).map((column) => column.key)).toContain("reserve");
    expect(CUSTOMER_SPEC.sortKeys).not.toContain("reservePcs");
    expect(itemsCacheRoot(CUSTOMER_SPEC)).not.toEqual(itemsCacheRoot(VENDOR_SPEC));
    expect(memoOutHref(DOC)).toBe(`/memo/memo-out/${DOC}`);
  });
});

describe("UT-MOC-02 contract mapping", () => {
  it("maps a Memo Out row and line into the shared report shapes (Reserve 0, no photos)", () => {
    expect(toReportRow(customerRow)).toMatchObject({ memoReceiveId: DOC, vendor: { id: CUSTOMER, name: "Siam Jewelry" }, reserve: qty(0, "0.000"), outstanding: qty(3, "1.500") });
    expect(toReportItem(customerItem)).toMatchObject({ memoReceiveId: DOC, location: "Memo", photoCount: 0, reserve: qty(0, "0.000"), netUnitPrice: "2000.0000" });
  });

  it("the table shows Customer Name, Memo Out links, the outstanding caption and no Reserve", () => {
    const props = { entries: [{ row: toReportRow(customerRow), items: [toReportItem(customerItem)] }], sort: { key: "dueDate", dir: "asc" }, onSort: noop, isOpen: () => true, onToggleOpen: noop, itemsLoading: false, itemsError: false, onRetryItems: noop, selected: new Set(), onToggleItem: noop, prefs: DEFAULT_VIEW };
    const table = withSpec(OutstandingTable, props);
    expect(table).toContain("Customer Name");
    expect(table).not.toContain("Vendor Name");
    expect(table).not.toContain(">Reserve<");
    expect(table).toContain("open value (outstanding)");
    expect(table).toContain(`href="/memo/memo-out/${DOC}"`);
    expect(table).toContain("Siam Jewelry");
    expect(table).toContain("2,000.00 THB");
    const panel = withSpec(CustomizeViewPanel, { open: true, prefs: DEFAULT_VIEW, onChange: noop, onClose: noop, returnFocus: { current: null } });
    expect(panel).toContain("Customer Name");
    expect(panel).not.toContain("Reserve");
  });
});

describe("UT-MOC-03 filters and URL state", () => {
  it("keeps customers in ?customer=, ignores vendor-only sort keys and sends the customer contract", () => {
    const state = { ...emptyListState(), q: "MO-7", vendorIds: [CUSTOMER], from: "2026-10-01", to: "2026-10-31", sort: "vendorName" as const, dir: "desc" as const, page: 2 };
    const search = listStateToSearch(state, CUSTOMER_SPEC);
    expect(search).toContain(`customer=${CUSTOMER}`);
    expect(search).not.toContain("vendor=");
    expect(parseListState(new URLSearchParams(search), CUSTOMER_SPEC)).toMatchObject({ vendorIds: [CUSTOMER], sort: "vendorName", dir: "desc", page: 2 });
    expect(parseListState(new URLSearchParams("sort=reservePcs"), CUSTOMER_SPEC).sort).toBeNull();
    expect(parseListState(new URLSearchParams(`vendor=${CUSTOMER}`), CUSTOMER_SPEC).vendorIds).toEqual([]);

    expect(customerFilterInput(state)).toEqual({ q: "MO-7", customerIds: [CUSTOMER], from: "2026-10-01", to: "2026-10-31" });
    expect(customerListInput(state)).toEqual({ q: "MO-7", customerIds: [CUSTOMER], from: "2026-10-01", to: "2026-10-31", page: 2, pageSize: 25, sort: "customerName", dir: "desc" });
    expect(customerListInput({ ...emptyListState(), sort: "openValue", dir: "asc" })).toEqual({ page: 1, pageSize: 25, sort: "openValue", dir: "asc" });
    expect(customerListInput(emptyListState())).toEqual({ page: 1, pageSize: 25 });
  });
});
