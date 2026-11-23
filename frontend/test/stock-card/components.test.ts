import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NumberFormatContext, numberFormatFor } from "@/features/decimal-setup/number-format-provider";
import { BackLink } from "@/features/stock-card/components/back-link";
import { DateRange, EmptyCard, ErrorBanner, LocationSelect, SearchBox, TableSkeleton, ToolIcons } from "@/features/stock-card/components/parts";
import { DetailPrintContent, ListPrintContent } from "@/features/stock-card/components/print-view";
import { StockCardHeaderBlock, StockCardHeaderSkeleton } from "@/features/stock-card/components/stock-card-header";
import { StockCardTable } from "@/features/stock-card/components/stock-card-table";
import { StockCardTransactionsTable } from "@/features/stock-card/components/stock-card-transactions-table";
import { StockCardViewPanel } from "@/features/stock-card/components/view-panel";
import { DEFAULT_VIEW, hideAllColumns, setColumnShown } from "@/features/stock-card/view-prefs";
import { CARD_A, CARD_B, HEADER_A, KEY_A, KEY_B, TOTALS, TXN_LOAD, TXN_NEW_TYPE, TXN_OUT } from "./fixtures";

/**
 * UT-SC-10 / FE-SC-004…006, 008, 011, 012 view behaviour: the pages are built from presentational pieces so the markup
 * can be asserted without a DOM renderer (the pages themselves only wire router, queries and state).
 */
const html = (element: ReactElement) => renderToStaticMarkup(element);
const noop = () => {};
const withPlaces = (weightPlaces: number, element: ReactElement) => createElement(NumberFormatContext.Provider, { value: numberFormatFor({ weightPlaces, pricePlaces: 2 }) }, element);

const listTable = (props: Partial<Parameters<typeof StockCardTable>[0]> = {}) =>
  createElement(StockCardTable, {
    rows: [CARD_A, CARD_B],
    page: 1,
    pageSize: 25,
    prefs: DEFAULT_VIEW,
    sort: { key: "stoneCode", dir: "asc" },
    onSort: noop,
    selected: new Set<string>(),
    onToggle: noop,
    onOpen: noop,
    ...props,
  });

const txnTable = (props: Partial<Parameters<typeof StockCardTransactionsTable>[0]> = {}) =>
  createElement(StockCardTransactionsTable, { rows: [TXN_LOAD, TXN_OUT, TXN_NEW_TYPE], totals: TOTALS, page: 1, pageSize: 25, sort: { key: "date", dir: "asc" }, onSort: noop, ...props });

describe("list table (FE-SC-004, S5 / S2)", () => {
  it("two-tier header: sortable STONE CODE / LOCATION / LOT, the purple BALANCE group with Pcs and Cts", () => {
    const markup = html(listTable());
    for (const label of ["STONE CODE", "LOCATION", "LOT"]) expect(markup).toContain(`aria-label="Sort by ${label}"`);
    expect(markup).toContain('aria-label="Sort by Pcs"');
    expect(markup).toContain('aria-label="Sort by Cts"');
    expect(markup).toContain("bg-gms-group-purple-head");
    expect(markup).toContain("bg-gms-group-purple-sub");
    expect(markup).toContain("Balance");
    expect(markup).toContain('aria-sort="ascending"');
    expect(markup).toContain("sticky top-0");
  });

  it("the active sort is announced; another column and direction move it", () => {
    const markup = html(listTable({ sort: { key: "balanceWeightCt", dir: "desc" } }));
    expect(markup.match(/aria-sort="descending"/g)).toHaveLength(1);
    expect(markup).not.toContain('aria-sort="ascending"');
  });

  it("56 px rows with the picker row states; BALANCE cells keep their tint and darken on hover", () => {
    const markup = html(listTable());
    expect(markup.match(/<tr [^>]*class="[^"]*\bh-14\b/g)).toHaveLength(2);
    expect(markup).toContain("cursor-pointer border-b border-gms-border bg-white hover:bg-gms-row-hover");
    expect(markup).toContain("group/row");
    expect(markup).toContain("bg-gms-group-purple-cell group-hover/row:bg-gms-group-purple-hover");
    expect(markup).toContain("tabular-nums");
  });

  it("a ticked row takes the active tint and its checkbox is checked; the others are not", () => {
    const markup = html(listTable({ selected: new Set([KEY_A]) }));
    expect(markup).toContain('data-state="selected"');
    expect(markup.match(/bg-gms-row-active/g)).toHaveLength(1);
    expect(markup.match(/type="checkbox"[^>]*checked/g)).toHaveLength(1);
    expect(markup).toContain('aria-label="Select AL-CU-3040-014"');
  });

  it("cells: stone code link to the card, details line, location, lot with the vendor line, pcs and bold Cts", () => {
    const markup = html(listTable());
    expect(markup).toContain(`href="/report/stock-movement/stock-card/${KEY_A}"`);
    expect(markup).toContain("Alexandrite · Cushion 3.0 x 4.0 mm · Light Blue · VS1 · AAA");
    expect(markup).toContain("Bangkok Gem Supply Co., Ltd.");
    expect(markup).toContain("Vault");
    expect(markup).toContain("L-2609-014");
    // The 3-decimal weight shows with the default 2 places.
    expect(markup).toContain(">0.62<");
    expect(markup).toContain(">12.35<");
    expect(markup).toContain(">10<");
    expect(markup).toMatch(/font-semibold">0\.62</);
  });

  it("an empty stone code shows the attributes; an empty lot a dash; several vendors '+n'", () => {
    const markup = html(listTable());
    expect(markup).toContain(`href="/report/stock-movement/stock-card/${KEY_B}"`);
    expect(markup).toContain("Sapphire · Oval");
    expect(markup).toContain("Siam Fine Jewelry +2");
    // The name already is the attributes, so the detail line is not repeated.
    expect(markup).not.toContain("Sapphire · Oval</div>");
    expect(markup).toContain(">—<");
  });

  it("row numbers run across pages (page 2 of 10 starts at 11)", () => {
    const markup = html(listTable({ page: 2, pageSize: 10 }));
    expect(markup).toContain(">11<");
    expect(markup).toContain(">12<");
  });

  it("Customize view hides Location, Lot, the detail line and the vendor line; Stone Code and BALANCE stay", () => {
    const markup = html(listTable({ prefs: hideAllColumns() }));
    expect(markup).not.toContain("Sort by LOCATION");
    expect(markup).not.toContain("Sort by LOT");
    expect(markup).not.toContain("Cushion");
    expect(markup).not.toContain("Siam Fine");
    expect(markup).not.toContain("Vault");
    expect(markup).toContain("Sort by STONE CODE");
    expect(markup).toContain("bg-gms-group-purple-cell");
    const noDetails = html(listTable({ prefs: setColumnShown(DEFAULT_VIEW, "details", false) }));
    expect(noDetails).not.toContain("Cushion");
    expect(noDetails).toContain("Vault");
  });

  it("weight follows the Decimal Setup places", () => {
    expect(html(withPlaces(3, listTable()))).toContain(">12.345<");
  });
});

describe("transactions table (FE-SC-006, S6 / S4)", () => {
  it("two-tier header: IN green, OUT orange, BALANCE purple groups with Pcs / Weight; left cells span both tiers", () => {
    const markup = html(txnTable());
    for (const tone of ["green", "orange", "purple"]) {
      expect(markup).toContain(`bg-gms-group-${tone}-head`);
      expect(markup).toContain(`bg-gms-group-${tone}-sub`);
    }
    expect(markup).toContain(">In<");
    expect(markup).toContain(">Out<");
    expect(markup).toContain(">Balance<");
    expect(markup.match(/rowSpan="2"/g)).toHaveLength(5);
    for (const label of ["DOC NO", "DATE", "STOCK ID", "Account"]) expect(markup).toContain(`aria-label="Sort by ${label}"`);
    expect(markup.match(/>Pcs</g)).toHaveLength(3);
    expect(markup.match(/>Weight</g)).toHaveLength(3);
  });

  it("DOC NO is a bold link to the document with its type caption; the row itself is not a link", () => {
    const markup = html(txnTable());
    expect(markup).toContain('href="/inventory/load-to-stock/0192a"');
    expect(markup).toContain('href="/memo/memo-out/0192b"');
    expect(markup).toContain("LS2609014");
    expect(markup).toContain("Load to Stock");
    expect(markup).toContain("Memo Out");
    expect(markup.match(/<a /g)).toHaveLength(2);
    expect(markup).toContain("font-semibold hover:underline");
  });

  it("an unknown document type renders the number as text with its caption, and no link", () => {
    const markup = html(txnTable({ rows: [TXN_NEW_TYPE] }));
    expect(markup).not.toContain("<a ");
    expect(markup).toContain("Stock Adjustment");
    // No number stored: a dash.
    expect(markup).toContain('<span class="font-semibold">—</span>');
  });

  it("the other direction's cells are blank, the tint stays, BALANCE weight is bold", () => {
    const markup = html(txnTable({ rows: [TXN_LOAD] }));
    // OUT pcs and weight are empty but tinted (orange cell).
    expect(markup.match(/<td class="[^"]*bg-gms-group-orange-cell[^"]*"><\/td>/g)).toHaveLength(2);
    expect(markup).toMatch(/<td class="[^"]*bg-gms-group-green-cell[^"]*">4<\/td>/);
    expect(markup).toMatch(/<td class="[^"]*bg-gms-group-green-cell[^"]*">1\.24<\/td>/);
    expect(markup).toMatch(/<td class="[^"]*bg-gms-group-purple-cell[^"]*font-semibold">1\.24<\/td>/);
    expect(markup).toContain("group-hover/row:bg-gms-group-green-hover");
    expect(markup).toContain("group-hover/row:bg-gms-group-orange-hover");
    expect(markup).toContain("group-hover/row:bg-gms-group-purple-hover");
  });

  it("date dd/MM/yy; Stock ID shows a dash on Memo Out and '+n' for several", () => {
    const markup = html(txnTable());
    expect(markup).toContain(">04/09/26<");
    expect(markup).toContain(">18/09/26<");
    expect(markup).toContain(">260214<");
    expect(markup).toContain(">260215 +2<");
    expect(markup).toMatch(/text-gms-text-muted">—<\/td>/);
  });

  it("the Total row shows the server totals (not the sum of the page) on the plain grey background", () => {
    const markup = html(txnTable({ rows: [TXN_LOAD], totals: { ...TOTALS, inPcs: 99, inWeightCt: "9.999", balanceWeightCt: "7.777" } }));
    expect(markup).toContain("<tfoot>");
    expect(markup).toContain("bg-gms-table-total");
    expect(markup).toContain(">Total<");
    expect(markup).toContain(">99<");
    expect(markup).toContain(">10.00<");
    expect(markup).toContain(">7.78<");
  });

  it("running balance is shown as returned for each row", () => {
    const markup = html(txnTable());
    expect(markup).toMatch(/purple-cell[^>]*>4<\/td><td class="[^"]*font-semibold">1\.24</);
    expect(markup).toMatch(/purple-cell[^>]*>2<\/td><td class="[^"]*font-semibold">0\.62</);
    expect(markup).toMatch(/purple-cell[^>]*>3<\/td><td class="[^"]*font-semibold">0\.72</);
  });

  it("row numbers run across pages", () => {
    expect(html(txnTable({ page: 3, pageSize: 10 }))).toContain(">21<");
  });
});

describe("header block, back link, states (FE-SC-005, FE-SC-008)", () => {
  it("Stone Code, Location and Lot over three cells, then the description strip", () => {
    const markup = html(createElement(StockCardHeaderBlock, { header: HEADER_A }));
    expect(markup).toContain("Stone Code");
    expect(markup).toContain("AL-CU-3040-014");
    expect(markup).toContain("Vault");
    expect(markup).toContain("L-2609-014");
    expect(markup).toContain("Alexandrite · Cushion 3.0 x 4.0 mm · Light Blue · VS1 · AAA");
  });

  it("no lot shows a dash; no attributes no description strip", () => {
    const markup = html(createElement(StockCardHeaderBlock, { header: { ...HEADER_A, lot: "", stone: "", shape: "", size: "", color: "", clarity: "", quality: "" } }));
    expect(markup).toContain(">—<");
    expect(markup).not.toContain("border-t border-gms-border px-4");
    expect(html(createElement(StockCardHeaderSkeleton))).toContain("animate-pulse");
  });

  it("the back link reads 'Stock Card', returns to the list, shows the pill on hover and has the focus ring", () => {
    const markup = html(createElement(BackLink));
    expect(markup).toContain('href="/report/stock-movement/stock-card"');
    expect(markup).toContain(">Stock Card<");
    expect(markup).toContain("hover:bg-gms-count-badge");
    expect(markup).toContain("text-gms-primary");
    expect(markup).toContain("focus-visible:outline-2");
    expect(html(createElement(BackLink, { label: "Back to Stock Card" }))).toContain("Back to Stock Card");
  });

  it("empty card: with filters it offers Clear filters; the error banner is an alert with Retry; the skeleton is 8 rows", () => {
    expect(html(createElement(EmptyCard, { message: "No stock to show." }))).not.toContain("Clear filters");
    const filtered = html(createElement(EmptyCard, { message: "No stock matches these filters.", onClear: noop }));
    expect(filtered).toContain("No stock matches these filters.");
    expect(filtered).toContain("Clear filters");
    const banner = html(createElement(ErrorBanner, { message: "Couldn't load Stock Card.", onRetry: noop }));
    expect(banner).toContain('role="alert"');
    expect(banner).toContain("Retry");
    const skeleton = html(createElement(TableSkeleton, { label: "Loading stock card" }));
    expect(skeleton).toContain('aria-busy="true"');
    expect(skeleton.match(/animate-pulse/g)).toHaveLength(8);
  });
});

describe("toolbar pieces (FE-SC-004, FE-SC-011)", () => {
  it("search box: the design placeholder, bounded length", () => {
    const markup = html(createElement(SearchBox, { value: "", onChange: noop, placeholder: "Search stone code, lot, vendor or stock ID", label: "Search stone code, lot, vendor or stock ID" }));
    expect(markup).toContain('placeholder="Search stone code, lot, vendor or stock ID"');
    expect(markup).toContain('maxLength="100"');
  });

  it("location select: All locations first, the options, and a location from the URL that is not listed", () => {
    const markup = html(createElement(LocationSelect, { value: "Old", locations: ["Showroom", "Vault"], loading: false, onChange: noop }));
    expect(markup).toContain(">All locations<");
    expect(markup).toContain('value="Showroom"');
    expect(markup).toContain('value="Old" selected');
    expect(html(createElement(LocationSelect, { value: "", locations: undefined, loading: true, onChange: noop }))).toContain(">Loading…<");
  });

  it("Due before Start shows the problem and marks the inputs invalid", () => {
    const bad = html(createElement(DateRange, { from: "2026-10-01", to: "2026-09-01", onFrom: noop, onTo: noop, label: "Date range" }));
    expect(bad).toContain('role="alert"');
    expect(bad).toContain("The end date is before the start date.");
    expect(bad).toContain('aria-invalid="true"');
    const good = html(createElement(DateRange, { from: "2026-09-01", to: "2026-10-01", onFrom: noop, onTo: noop, label: "Date range" }));
    expect(good).not.toContain('role="alert"');
    expect(good).toContain('placeholder="Start"');
    expect(good).toContain('placeholder="Due"');
  });

  it("print needs the PRINT grant; Excel is disabled with its reason; columns and refresh only where given", () => {
    const base = { printDisabled: false, printLabel: "Print current page", onPrint: noop };
    const without = html(createElement(ToolIcons, { ...base, canPrint: false }));
    expect(without).not.toContain("Print current page");
    expect(without).toContain('aria-disabled="true"');
    expect(without).toContain("Excel export isn&#x27;t available yet");
    expect(without).not.toContain("Customize view");
    expect(without).not.toContain("Refresh");
    const withAll = html(createElement(ToolIcons, { ...base, canPrint: true, customizeRef: { current: null }, customizeOpen: false, onCustomize: noop, onRefresh: noop, refreshing: true }));
    expect(withAll).toContain("Print current page");
    expect(withAll).toContain("Customize view");
    expect(withAll).toContain("Refresh");
    expect(withAll).toContain("animate-spin");
    expect(html(createElement(ToolIcons, { ...base, canPrint: true, printDisabled: true }))).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Print current page"|<button[^>]*aria-label="Print current page"[^>]*disabled=""/);
  });

  it("the Customize view panel lists Stone Code and Balance as locked and the four switches", () => {
    const markup = html(createElement(StockCardViewPanel, { open: false, prefs: DEFAULT_VIEW, onChange: vi.fn(), onClose: noop, returnFocus: { current: null } }));
    expect(markup).toContain("Customize view");
    expect(markup).toContain("Always shown");
    for (const label of ["Stone Code", "Balance", "Location", "Lot", "Stone detail line", "Lot vendor line"]) expect(markup).toContain(`>${label}<`);
    expect(markup.match(/aria-disabled="true"/g)).toHaveLength(2);
    expect(markup).toContain("No hidden columns");
    const hidden = html(createElement(StockCardViewPanel, { open: false, prefs: hideAllColumns(), onChange: noop, onClose: noop, returnFocus: { current: null } }));
    expect(hidden).not.toContain("No hidden columns");
  });
});

describe("print views (FE-SC-011)", () => {
  it("the list prints the given rows with the filters, the scope and the printed time", () => {
    const markup = html(createElement(ListPrintContent, { rows: [CARD_A], prefs: DEFAULT_VIEW, scope: "Selected rows", filters: ["Location: Vault"], printedAt: "23/11/2026 10:00" }));
    expect(markup).toContain("Stock Card");
    expect(markup).toContain("Selected rows · Location: Vault");
    expect(markup).toContain("Printed 23/11/2026 10:00");
    expect(markup).toContain("AL-CU-3040-014");
    expect(markup).not.toContain("Sapphire");
    expect(html(createElement(ListPrintContent, { rows: [CARD_A], prefs: DEFAULT_VIEW, scope: "Current page", filters: [], printedAt: "" }))).toContain("Current page · No filters");
  });

  it("the list print follows the visible columns", () => {
    const markup = html(createElement(ListPrintContent, { rows: [CARD_A], prefs: hideAllColumns(), scope: "Current page", filters: [], printedAt: "" }));
    expect(markup).not.toContain("<th class=\"border border-black px-1.5 py-1 text-left align-top\">Location");
    expect(markup).not.toContain("Vault");
    expect(markup).toContain("Balance Pcs");
  });

  it("the detail prints the card, the page rows and the totals", () => {
    const markup = html(createElement(DetailPrintContent, { header: HEADER_A, rows: [TXN_LOAD, TXN_OUT], totals: TOTALS, filters: ["Search: MO"], printedAt: "x" }));
    expect(markup).toContain("Stock Card – AL-CU-3040-014");
    expect(markup).toContain("Current page · Search: MO");
    expect(markup).toContain("Location Vault · Lot L-2609-014");
    expect(markup).toContain("LS2609014");
    expect(markup).toContain("MO2609021");
    expect(markup).toContain("Total");
    expect(markup).toContain(">1.34<");
  });
});
