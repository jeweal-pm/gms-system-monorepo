import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { navigationHref, REAL_PAGE_HREFS } from "@/features/home/navigation";
import { memoOutstandingAccess } from "@/features/memo-outstanding-vendor/api";
import { CustomizeViewPanel } from "@/features/memo-outstanding-vendor/components/customize-view-panel";
import { OutstandingTable } from "@/features/memo-outstanding-vendor/components/outstanding-table";
import { ReportSpecContext } from "@/features/memo-outstanding-vendor/components/report-context";
import { bucketLabel, DEFAULT_VIEW, emptyListState, reportColumns, VENDOR_SPEC } from "@/features/memo-outstanding-vendor/model";
import {
  PAGE_HREF,
  PURCHASE_OUTSTANDING_SPEC,
  purchaseOutstandingListInput,
  toReportItem,
  toReportRow,
  type PurchaseOutstandingItem,
  type PurchaseOutstandingRow,
} from "@/features/purchase-outstanding/api";

/** UT-POS-01…02: Purchase Outstanding (UI rev 1 + SA rev 1 / ADR-0044, owner 2026-11-06). */

const DOC = "11111111-1111-4111-8111-111111111111";
const VENDOR = "33333333-3333-4333-8333-333333333333";
const qty = (pcs: number, weightCt: string) => ({ pcs, weightCt });
// The design's Blue Sapphire / document totals: Memo 16, Purchase 0, Sale 4 → Balance 12 (Memo − Return − Purchase).
const row: PurchaseOutstandingRow = {
  memoReceiveId: DOC, docNo: "MI26100012", docDate: "2026-10-02", dueDate: "2026-10-15", dueInDays: -7,
  vendor: { id: VENDOR, code: "V001", name: "Sapphire Gems Co., Ltd." }, currency: "USD", openValue: "27014.90",
  memo: qty(16, "25.600"), return: qty(0, "0.000"), purchase: qty(4, "5.210"), sale: qty(4, "5.210"), balance: qty(12, "20.390"),
};
const item: PurchaseOutstandingItem = {
  id: "44444444-4444-4444-8444-444444444444", memoReceiveId: DOC, position: 1, stockId: "260012", lot: "L-1", location: "Memo",
  stone: "Blue Sapphire", shape: "Oval", size: "9×7 mm", color: "Royal Blue", clarity: "VS", cutting: "Excellent", quality: "AAA", cerType: "GIA", cerNo: "2245180932", itemNote: "",
  photoCount: 0, priceUnit: "CTS", netUnitPrice: "1850.0000", currency: "USD", openValue: "11932.50",
  memo: qty(4, "8.600"), return: qty(0, "0.000"), purchase: qty(1, "2.150"), sale: qty(1, "2.150"), balance: qty(3, "6.450"),
};
const noop = () => undefined;
const withSpec = (type: unknown, props: object) =>
  renderToStaticMarkup(createElement(ReportSpecContext.Provider, { value: PURCHASE_OUTSTANDING_SPEC }, createElement(type as FunctionComponent<object>, props)));

describe("UT-POS-01 route, access and columns", () => {
  it("the sidebar opens the real page; only purchase-outstanding VIEW reads it", () => {
    expect(PAGE_HREF).toBe("/purchase-order/purchase-outstanding");
    expect(REAL_PAGE_HREFS["purchase-outstanding"]).toBe(PAGE_HREF);
    expect(navigationHref({ label: "Purchase Outstanding", slug: "purchase-outstanding" })).toBe(PAGE_HREF);
    expect(memoOutstandingAccess({ isSuperAdmin: false, permissions: ["purchase-outstanding:VIEW"] }, PURCHASE_OUTSTANDING_SPEC.menuKey).view).toBe(true);
    expect(memoOutstandingAccess({ isSuperAdmin: false, permissions: ["memo-outstanding-vendor:VIEW", "purchase:VIEW"] }, PURCHASE_OUTSTANDING_SPEC.menuKey).view).toBe(false);
  });

  it("names the groups Memo, Return, Purchase, Sale, Balance Outstanding; the other reports keep theirs", () => {
    expect(reportColumns(PURCHASE_OUTSTANDING_SPEC).filter((column) => ["memo", "return", "sold", "reserve", "outstanding"].includes(column.key)).map((column) => column.label))
      .toEqual(["Memo", "Return", "Purchase", "Sale", "Balance Outstanding"]);
    expect(bucketLabel(VENDOR_SPEC, "sold")).toBe("Sold");
    expect(reportColumns(VENDOR_SPEC).map((column) => column.label)).toContain("Reserve");
  });
});

describe("UT-POS-02 mapping, table and sort", () => {
  it("maps purchase → Purchase, sale → Sale (a plain number), balance → Balance Outstanding", () => {
    expect(toReportRow(row)).toMatchObject({ memoReceiveId: DOC, sold: qty(4, "5.210"), reserve: qty(4, "5.210"), outstanding: qty(12, "20.390"), vendor: { name: "Sapphire Gems Co., Ltd." } });
    expect(toReportItem(item)).toMatchObject({ sold: qty(1, "2.150"), reserve: qty(1, "2.150"), outstanding: qty(3, "6.450"), netUnitPrice: "1850.0000" });
    const props = { entries: [{ row: toReportRow(row), items: [toReportItem(item)] }], sort: { key: "dueDate", dir: "asc" }, onSort: noop, isOpen: () => true, onToggleOpen: noop, itemsLoading: false, itemsError: false, onRetryItems: noop, selected: new Set(), onToggleItem: noop, prefs: DEFAULT_VIEW };
    const table = withSpec(OutstandingTable, props);
    for (const label of ["Purchase", "Sale", "Balance Outstanding", "Vendor Name", "MI26100012", "Blue Sapphire"]) expect(table).toContain(label);
    expect(table).not.toContain(">Sold<");
    expect(table).not.toContain(">Reserve<");
    expect(table).not.toContain("(1)");
    expect(table).toContain(`href="/memo/memo-receive/${DOC}"`);
    const panel = withSpec(CustomizeViewPanel, { open: true, prefs: DEFAULT_VIEW, onChange: noop, onClose: noop, returnFocus: { current: null } });
    expect(panel).toContain("Balance Outstanding");
    expect(panel).not.toContain("Reserve");
  });

  it("sends the Purchase / Sale / Balance sort keys of this contract", () => {
    expect(purchaseOutstandingListInput({ ...emptyListState(), sort: "soldPcs", dir: "desc" })).toEqual({ page: 1, pageSize: 25, sort: "purchasePcs", dir: "desc" });
    expect(purchaseOutstandingListInput({ ...emptyListState(), sort: "reservePcs", dir: "asc" })).toMatchObject({ sort: "salePcs" });
    expect(purchaseOutstandingListInput({ ...emptyListState(), sort: "outstandingPcs", dir: "asc" })).toMatchObject({ sort: "balancePcs" });
    expect(purchaseOutstandingListInput({ ...emptyListState(), sort: "vendorName", dir: "asc", vendorIds: [VENDOR] })).toMatchObject({ sort: "vendorName", vendorIds: [VENDOR] });
    expect(purchaseOutstandingListInput(emptyListState())).toEqual({ page: 1, pageSize: 25 });
  });
});
