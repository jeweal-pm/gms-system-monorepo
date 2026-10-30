import { QueryClient } from "@tanstack/react-query";
import { createElement, createRef, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { isPermissionDenied, LOAD_ERROR, loadErrorMessage, memoOutstandingAccess } from "@/features/memo-outstanding-vendor/api";
import { CustomizeViewPanel } from "@/features/memo-outstanding-vendor/components/customize-view-panel";
import { EXCEL_UNAVAILABLE, SelectionBar, Toolbar, VendorFilter } from "@/features/memo-outstanding-vendor/components/filter-bar";
import { EmptyState, filterSummary } from "@/features/memo-outstanding-vendor/components/memo-outstanding-vendor-page";
import { OutstandingTable } from "@/features/memo-outstanding-vendor/components/outstanding-table";
import { KpiCards, Pager } from "@/features/memo-outstanding-vendor/components/parts";
import { PrintContent } from "@/features/memo-outstanding-vendor/components/print-view";
import {
  activeSort,
  clearFilters,
  createViewStore,
  dateRangeProblem,
  DEFAULT_VIEW,
  dueLabel,
  emptyListState,
  formatDecimal,
  formatMoney,
  formatWeight,
  hasFilters,
  hideAllColumns,
  isDocOpen,
  itemsCacheKey,
  listStateToSearch,
  LOCKED_COLUMNS,
  loadDocItems,
  openDocIds,
  pageNumbers,
  parseListState,
  parseViewPrefs,
  printRows,
  setColumnShown,
  showAllColumns,
  showingText,
  toFilterInput,
  toggleSort,
  toListInput,
  VIEW_COLUMNS,
  VIEW_STORAGE_KEY,
  viewLists,
  visibleRows,
  withFilters,
  type VendorItem,
} from "@/features/memo-outstanding-vendor/model";
import { gatewayError } from "../partner/helpers";
import { DOC_A, DOC_B, item, row, VENDOR } from "./fixtures";

const noop = () => undefined;
// Props are checked by the components themselves; the helper only renders them.
const html = (type: unknown, props: object) => renderToStaticMarkup(createElement(type as FunctionComponent<object>, props));
const docIds = (count: number) => Array.from({ length: count }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);

/** UT-MOV-F1: due labels, KPIs, URL filter state, items loaded once / batched. */
describe("UT-MOV-F1 due label", () => {
  it("is red overdue, amber within 7 days (today included), grey later", () => {
    expect(dueLabel(-12)).toEqual({ text: "12d overdue", tone: "overdue" });
    expect(dueLabel(-1)).toEqual({ text: "1d overdue", tone: "overdue" });
    expect(dueLabel(0)).toEqual({ text: "Due in 0d", tone: "soon" });
    expect(dueLabel(7)).toEqual({ text: "Due in 7d", tone: "soon" });
    expect(dueLabel(8)).toEqual({ text: "in 8d", tone: "later" });
  });
});

describe("UT-MOV-F1 KPI cards and number formats", () => {
  it("shows the four cards with the company currency on Grand total", () => {
    const markup = html(KpiCards, { summary: { documents: 5, overdue: 3, dueIn7Days: 1, grandTotal: "1467048.75", companyCurrency: "THB" }, loading: false });
    expect(markup).toContain("Documents");
    expect(markup).toContain("Overdue");
    expect(markup).toContain("Due in 7 days");
    expect(markup).toContain("Grand total (THB)");
    expect(markup).toContain("1,467,048.75");
    expect(markup).toMatch(/text-gms-danger[^>]*>3</);
  });

  it("shows skeletons while loading", () => {
    expect(html(KpiCards, { summary: undefined, loading: true })).toContain('aria-busy="true"');
  });

  it("formats money 2 dp, weight 2 dp from 3 dp, unit price without losing decimals", () => {
    expect(formatMoney("13633.5")).toBe("13,633.50");
    expect(formatMoney("0.00")).toBe("0.00");
    expect(formatWeight("25.605")).toBe("25.61");
    expect(formatWeight("0.000")).toBe("0.00");
    expect(formatDecimal("1850.0000")).toBe("1,850.00");
    expect(formatDecimal("760.1250")).toBe("760.125");
    expect(formatDecimal("1234567890123.4500")).toBe("1,234,567,890,123.45");
  });
});

describe("UT-MOV-F1 URL filter state", () => {
  it("round-trips filters, sort and paging; defaults keep a clean URL", () => {
    const state = { ...emptyListState(), q: "MR-1", vendorIds: [VENDOR], from: "2026-10-01", to: "2026-10-31", sort: "vendorName" as const, dir: "desc" as const, page: 3, pageSize: 50 as const };
    const search = listStateToSearch(state);
    expect(parseListState(new URLSearchParams(search))).toEqual(state);
    expect(listStateToSearch(emptyListState())).toBe("");
    expect(emptyListState().pageSize).toBe(25);
  });

  it("drops malformed params instead of failing", () => {
    const parsed = parseListState(new URLSearchParams("vendor=nope&vendor=" + VENDOR + "&from=1/10/2026&sort=price&page=-2&size=100"));
    expect(parsed).toMatchObject({ vendorIds: [VENDOR], from: "", sort: null, page: 1, pageSize: 25 });
  });

  it("a filter change goes back to page 1; clear removes every filter", () => {
    const state = { ...emptyListState(), page: 4 };
    expect(withFilters(state, { q: "ruby" })).toMatchObject({ q: "ruby", page: 1 });
    const filtered = withFilters(state, { vendorIds: [VENDOR], from: "2026-10-01" });
    expect(hasFilters(filtered)).toBe(true);
    expect(hasFilters(clearFilters(filtered))).toBe(false);
  });

  it("sorts by Due Date ascending by default; a header click flips, another column starts ascending", () => {
    const state = emptyListState();
    expect(activeSort(state)).toEqual({ key: "dueDate", dir: "asc" });
    const flipped = toggleSort(state, "dueDate");
    expect(activeSort(flipped)).toEqual({ key: "dueDate", dir: "desc" });
    expect(activeSort(toggleSort(flipped, "memoPcs"))).toEqual({ key: "memoPcs", dir: "asc" });
  });

  it("sends only set filters, the page size and the chosen sort; never a reversed range", () => {
    expect(toListInput(emptyListState())).toEqual({ page: 1, pageSize: 25 });
    expect(toListInput({ ...emptyListState(), q: "  MR ", sort: "openValue", dir: "desc" })).toEqual({ q: "MR", page: 1, pageSize: 25, sort: "openValue", dir: "desc" });
    expect(toFilterInput({ ...emptyListState(), from: "2026-10-31", to: "2026-10-01" })).toEqual({});
    expect(dateRangeProblem("2026-10-31", "2026-10-01")).toBe("The end date is before the start date.");
    expect(dateRangeProblem("2025-01-01", "2026-10-01")).toBe("Choose a range of at most 366 days.");
    expect(dateRangeProblem("2026-10-01", "")).toBeNull();
  });

  it("pager text and numbers", () => {
    expect(showingText(1, 25, 5)).toBe("Showing 1–5 out of 5 items");
    expect(showingText(2, 10, 12)).toBe("Showing 11–12 out of 12 items");
    expect(pageNumbers(1, 8)).toEqual([1, 2, 3, "…", 8]);
    expect(pageNumbers(5, 8)).toEqual([1, "…", 4, 5, 6, "…", 8]);
    expect(pageNumbers(7, 8)).toEqual([1, "…", 6, 7, 8]);
    expect(pageNumbers(1, 1)).toEqual([1]);
    const markup = html(Pager, { page: 1, pageSize: 25, total: 5, onPage: noop, onPageSize: noop });
    expect(markup).toContain("25 / page");
    expect(markup).toContain('aria-current="page"');
  });
});

describe("UT-MOV-F1 items are loaded once and batched", () => {
  const fetcher = () => vi.fn(async (ids: string[]) => ({ items: ids.map((id, index) => item({ id: `item-${id}`, memoReceiveId: id, position: index + 1 })) }));

  it("expanding the same document again within 30 s does not fetch again", async () => {
    const client = new QueryClient();
    const fetchItems = fetcher();
    const now = 1_000_000;
    const first = await loadDocItems(client, [DOC_A], fetchItems, now);
    const again = await loadDocItems(client, [DOC_A], fetchItems, now + 29_000);
    expect(fetchItems).toHaveBeenCalledTimes(1);
    expect(again.get(DOC_A)).toEqual(first.get(DOC_A));
    await loadDocItems(client, [DOC_A], fetchItems, now + 31_000);
    expect(fetchItems).toHaveBeenCalledTimes(2);
  });

  it("opening a second row fetches only that row; a skipped id is cached as empty", async () => {
    const client = new QueryClient();
    const fetchItems = vi.fn(async (ids: string[]) => ({ items: ids.filter((id) => id === DOC_A).map((id) => item({ memoReceiveId: id })) }));
    await loadDocItems(client, [DOC_A], fetchItems);
    const both = await loadDocItems(client, [DOC_A, DOC_B], fetchItems);
    expect(fetchItems).toHaveBeenLastCalledWith([DOC_B]);
    expect(both.get(DOC_B)).toEqual([]);
    expect(client.getQueryData(itemsCacheKey(DOC_B))).toEqual([]);
  });

  it("Expanded mode opens every row on the page with one batched call (25 per call at most)", async () => {
    const rows = docIds(25).map((id) => row({ memoReceiveId: id }));
    expect(openDocIds(rows, "expanded", new Set())).toHaveLength(25);
    expect(openDocIds(rows, "collapsed", new Set())).toEqual([]);
    expect(openDocIds(rows, "collapsed", new Set([rows[3].memoReceiveId]))).toEqual([rows[3].memoReceiveId]);
    expect(isDocOpen(rows[0].memoReceiveId, "expanded", new Set([rows[0].memoReceiveId]))).toBe(false);

    const client = new QueryClient();
    const fetchItems = fetcher();
    const loaded = await loadDocItems(client, openDocIds(rows, "expanded", new Set()), fetchItems);
    expect(fetchItems).toHaveBeenCalledTimes(1);
    expect(fetchItems.mock.calls[0][0]).toHaveLength(25);
    expect(loaded.size).toBe(25);

    // A page of 50 needs two calls (the contract allows 25 documents per call).
    const bigger = fetcher();
    await loadDocItems(new QueryClient(), docIds(50), bigger);
    expect(bigger).toHaveBeenCalledTimes(2);
  });
});

/** UT-MOV-F2: Customize view, selection, Print / Excel, empty and error states. */
describe("UT-MOV-F2 Customize view", () => {
  it("lists locked columns and the switchable ones in column-header order (Sold, Reserve; Stock ID · Lot)", () => {
    expect([...LOCKED_COLUMNS]).toEqual(["Doc Number", "Vendor Name", "Doc Date", "Due Date", "Overdue"]);
    expect(VIEW_COLUMNS.map((column) => column.label)).toEqual([
      "Stock ID · Lot", "Location", "Stone", "Color · Clarity", "CER Type", "Remark", "Memo", "Return", "Sold", "Reserve", "Outstanding", "Price",
    ]);
    const markup = html(CustomizeViewPanel, { open: true, prefs: DEFAULT_VIEW, onChange: noop, onClose: noop, returnFocus: createRef() });
    for (const label of LOCKED_COLUMNS) expect(markup).toContain(label);
    expect(markup.match(/aria-disabled="true"/g)).toHaveLength(LOCKED_COLUMNS.length);
    expect(markup).toContain("Hide all");
    expect(markup).not.toContain("PO/Purchase");
  });

  it("hides and shows columns, hide all / show all, keeping header order", () => {
    let prefs = setColumnShown(DEFAULT_VIEW, "price", false);
    prefs = setColumnShown(prefs, "memo", false);
    expect(prefs.hidden).toEqual(["memo", "price"]);
    expect(viewLists(prefs).hidden.map((column) => column.key)).toEqual(["memo", "price"]);
    expect(viewLists(hideAllColumns(prefs)).shown).toEqual([]);
    expect(viewLists(showAllColumns(prefs)).hidden).toEqual([]);
  });

  it("validates stored prefs and keeps working with blocked storage", () => {
    expect(parseViewPrefs("{bad json")).toEqual(DEFAULT_VIEW);
    expect(parseViewPrefs(JSON.stringify({ hidden: ["price", "nope", 4, "price"], subtasks: "weird" }))).toEqual({ hidden: ["price"], subtasks: "collapsed" });

    const blocked = createViewStore(() => ({ getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("SecurityError"); } }));
    expect(blocked.read()).toEqual(DEFAULT_VIEW);
    const listener = vi.fn();
    blocked.subscribe(listener);
    blocked.write({ hidden: ["sold"], subtasks: "expanded" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(blocked.read()).toEqual({ hidden: ["sold"], subtasks: "expanded" });
    expect(blocked.read()).toBe(blocked.read());

    const stored = new Map<string, string>();
    const persisted = createViewStore(() => ({ getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => void stored.set(key, value) }));
    persisted.write({ hidden: ["reserve"], subtasks: "collapsed" });
    expect(JSON.parse(stored.get(VIEW_STORAGE_KEY) ?? "{}")).toEqual({ hidden: ["reserve"], subtasks: "collapsed" });
    expect(createViewStore(() => ({ getItem: (key) => stored.get(key) ?? null, setItem: noop })).read().hidden).toEqual(["reserve"]);
  });

  it("the table follows the view: hidden groups and Price disappear", () => {
    const props = { entries: [{ row: row(), items: [item()] }], sort: { key: "dueDate", dir: "asc" }, onSort: noop, isOpen: () => true, onToggleOpen: noop, itemsLoading: false, itemsError: false, onRetryItems: noop, selected: new Set(), onToggleItem: noop };
    const full = html(OutstandingTable, { ...props, prefs: DEFAULT_VIEW });
    for (const label of ["Memo", "Return", "Sold", "Reserve", "Outstanding", "PRICE"]) expect(full).toContain(label);
    expect(full).toContain("open value (reserve + outstanding)");
    expect(full).toContain("12,000.00 AED");
    expect(full).toContain("1,850.00 USD");
    expect(full).toContain("per cts");
    expect(full).toContain("MS26-000001 · L-7");
    expect(full).toContain('href="/memo/memo-receive/' + DOC_A + '"');
    expect(full).toContain('aria-expanded="true"');
    expect(full).toContain("Due in 2d");
    const trimmed = html(OutstandingTable, { ...props, prefs: { hidden: ["sold", "price", "remark", "stockLot"], subtasks: "collapsed" } });
    expect(trimmed).not.toContain(">Sold<");
    expect(trimmed).not.toContain("PRICE");
    expect(trimmed).not.toContain("Unheated");
    expect(trimmed).not.toContain("MS26-000001 · L-7");
    expect(trimmed).toContain("Location Memo");
  });
});

describe("UT-MOV-F2 selection, Print and Excel", () => {
  it("selection bar: n selected, Show selected rows only, Print only with PRINT, Excel unavailable, Clear", () => {
    const withPrint = html(SelectionBar, { count: 2, selectedOnly: false, onSelectedOnly: noop, canPrint: true, onPrint: noop, onClear: noop });
    expect(withPrint).toContain("2 selected");
    expect(withPrint).toContain("Show selected rows only");
    expect(withPrint).toContain('aria-checked="false"');
    expect(withPrint).toContain("Print selected items");
    expect(withPrint).toContain(EXCEL_UNAVAILABLE.replace("'", "&#x27;"));
    expect(withPrint).toContain("Clear");
    const noPrint = html(SelectionBar, { count: 1, selectedOnly: true, onSelectedOnly: noop, canPrint: false, onPrint: noop, onClear: noop });
    expect(noPrint).not.toContain("Print selected items");
    expect(noPrint).toContain('aria-checked="true"');
  });

  it("toolbar hides Print without PRINT; Excel stays unavailable", () => {
    const toolbar = (canPrint: boolean) => html(Toolbar, { mode: "collapsed", onMode: noop, customizeRef: createRef(), customizeOpen: false, onCustomize: noop, canPrint, printDisabled: false, onPrint: noop, refreshing: false, onRefresh: noop });
    expect(toolbar(true)).toContain("Print current page");
    expect(toolbar(false)).not.toContain("Print current page");
    expect(toolbar(false)).toMatch(/aria-label="Export to Excel" aria-disabled="true"/);
    expect(toolbar(false)).toContain("Show subtasks");
    expect(toolbar(false)).toContain("Customize view");
  });

  it("Show selected rows only keeps the selected items under their documents; Print uses the selection or the page", () => {
    const one = item({ id: "i1" });
    const two = item({ id: "i2", position: 2 });
    const rows = [row(), row({ memoReceiveId: DOC_B, docNo: "MR-2" })];
    const byDoc = new Map<string, VendorItem[]>([[DOC_A, [one, two]], [DOC_B, [item({ id: "i3", memoReceiveId: DOC_B })]]]);
    const selected = new Set(["i2"]);
    expect(visibleRows(rows, byDoc, selected, false)).toHaveLength(2);
    const only = visibleRows(rows, byDoc, selected, true);
    expect(only).toHaveLength(1);
    expect(only[0].items?.map((entry) => entry.id)).toEqual(["i2"]);
    expect(printRows(rows, byDoc, selected).map((entry) => entry.items.map((i) => i.id))).toEqual([["i2"]]);
    expect(printRows(rows, byDoc, new Set())).toHaveLength(2);
  });

  it("print view shows the title, filters and the visible columns", () => {
    const filters = filterSummary({ ...emptyListState(), vendorIds: [VENDOR], from: "2026-10-01" }, [{ id: VENDOR, code: "V001", name: "Sapphire Gems Co., Ltd." }]);
    expect(filters).toEqual(["Vendor: Sapphire Gems Co., Ltd.", "Doc date: 01/10/2026 – …"]);
    const markup = html(PrintContent, { entries: [{ row: row(), items: [item()] }], prefs: { hidden: ["return"], subtasks: "collapsed" }, filters, scope: "Selected items", printedAt: "29 Oct 2026, 10:00" });
    expect(markup).toContain("Memo Outstanding – From Vendor");
    expect(markup).toContain("Printed 29 Oct 2026, 10:00");
    expect(markup).toContain("Selected items · Vendor: Sapphire Gems Co., Ltd.");
    expect(markup).not.toContain("Return Pcs");
    expect(markup).toContain("Sold Pcs / Weight");
  });
});

describe("UT-MOV-F2 empty and error states, access", () => {
  it("empty without and with filters", () => {
    expect(html(EmptyState, { filtered: false, onClear: noop })).toContain("No memo items outstanding from vendors.");
    const filtered = html(EmptyState, { filtered: true, onClear: noop });
    expect(filtered).toContain("No documents match these filters.");
    expect(filtered).toContain("Clear filters");
  });

  it("maps load errors; PERMISSION_DENIED is the no-access page", () => {
    expect(loadErrorMessage(gatewayError({ domainCode: "SERVICE_UNAVAILABLE", httpStatus: 503 }))).toBe(LOAD_ERROR);
    expect(loadErrorMessage(gatewayError({ domainCode: "DEPENDENCY_UNAVAILABLE", httpStatus: 503 }))).toBe("Couldn't load the outstanding list. Try again.");
    expect(loadErrorMessage(gatewayError({ domainCode: "AUTHORIZATION_UNAVAILABLE", httpStatus: 503 }))).toBe("Couldn't check your access right now. Try again.");
    expect(loadErrorMessage(gatewayError({ httpStatus: 401, code: "UNAUTHORIZED" }))).toBe("Your session has ended. Sign in again.");
    expect(loadErrorMessage(gatewayError({ domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "to", code: "before_from" }] }))).toContain("filters");
    expect(isPermissionDenied(gatewayError({ domainCode: "PERMISSION_DENIED", httpStatus: 403, code: "FORBIDDEN" }))).toBe(true);
    expect(isPermissionDenied(new Error("x"))).toBe(false);
  });

  it("VIEW opens the page, PRINT shows Print, EXCEL is read separately", () => {
    expect(memoOutstandingAccess({ isSuperAdmin: false, permissions: ["memo-outstanding-vendor:VIEW"] })).toEqual({ view: true, print: false, excel: false });
    expect(memoOutstandingAccess({ isSuperAdmin: false, permissions: ["memo-outstanding-vendor:VIEW", "memo-outstanding-vendor:PRINT", "memo-outstanding-vendor:EXCEL"] })).toEqual({ view: true, print: true, excel: true });
    expect(memoOutstandingAccess({ isSuperAdmin: false, permissions: ["memo-receive:VIEW"] }).view).toBe(false);
    expect(memoOutstandingAccess({ isSuperAdmin: true, permissions: [] }).print).toBe(true);
    expect(memoOutstandingAccess(undefined).view).toBe(false);
  });

  it("vendor popover trigger shows the selection count", () => {
    expect(html(VendorFilter, { vendors: [], loading: false, selected: [VENDOR], onChange: noop })).toContain("Vendor (1)");
    expect(html(VendorFilter, { vendors: [], loading: false, selected: [], onChange: noop })).toContain('aria-expanded="false"');
  });
});
