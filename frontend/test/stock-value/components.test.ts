import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NumberFormatContext, numberFormatFor } from "@/features/decimal-setup/number-format-provider";
import { BackLink } from "@/features/stock-value/components/back-link";
import { DetailPrintContent, ListPrintContent } from "@/features/stock-value/components/print-view";
import { StockValueTable } from "@/features/stock-value/components/stock-value-table";
import { StockValueTransactionsTable } from "@/features/stock-value/components/stock-value-transactions-table";
import { StockValueViewPanel } from "@/features/stock-value/components/view-panel";
import { AmountText, Dash, PriceBlock, ProfitLossText } from "@/features/stock-value/components/value-cells";
import { DEFAULT_VIEW, hideAllColumns, setColumnShown } from "@/features/stock-value/view-prefs";
import { HEADER_A, KEY_A, LIST_TOTALS, ROW_LAST_SALE, ROW_LIST, ROW_LOSS, ROW_NO_PRICE, TXN_LOAD, TXN_NEW_TYPE, TXN_OUT, TXN_TOTALS } from "./fixtures";

/**
 * UT-SV-13 / FE-SV-003, 006, 008, 011, 012 view behaviour: the pages are built from presentational pieces so the markup can
 * be asserted without a DOM renderer (the pages themselves only wire router, queries and state).
 */
const html = (element: ReactElement) => renderToStaticMarkup(element);
const noop = () => {};
const withPlaces = (pricePlaces: number, element: ReactElement) => createElement(NumberFormatContext.Provider, { value: numberFormatFor({ weightPlaces: 2, pricePlaces }) }, element);

const listTable = (props: Partial<Parameters<typeof StockValueTable>[0]> = {}) =>
  createElement(StockValueTable, {
    rows: [ROW_LIST, ROW_LAST_SALE, ROW_NO_PRICE],
    totals: LIST_TOTALS,
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

const txnTable = (props: Partial<Parameters<typeof StockValueTransactionsTable>[0]> = {}) =>
  createElement(StockValueTransactionsTable, { rows: [TXN_LOAD, TXN_OUT, TXN_NEW_TYPE], totals: TXN_TOTALS, page: 1, pageSize: 25, sort: { key: "date", dir: "asc" }, onSort: noop, ...props });

describe("value cells (FE-SV-003)", () => {
  it("Price: the number with its source caption under it and the tooltip", () => {
    const markup = html(createElement(PriceBlock, { price: "12500.0000", source: "PRICE_LIST", label: "Price list", priceRef: null }));
    expect(markup).toContain("12,500.00");
    expect(markup).toContain(">Price list<");
    expect(markup).toContain('title="Price list: sell price of the Stock ID"');
    const sale = html(createElement(PriceBlock, { price: "9800.0000", source: "LAST_SALE", label: null, priceRef: { docId: "1", docNo: "SL2611003", docDate: "2026-11-12" } }));
    expect(sale).toContain(">Last sale<");
    expect(sale).toContain("SL2611003, 12/11/2026");
  });

  it("no price: a dash with an accessible name and 'No price'; Mixed has no number but a caption", () => {
    const none = html(createElement(PriceBlock, { price: null, source: "NONE", label: null, priceRef: null }));
    expect(none).toContain('<span aria-hidden="true">—</span>');
    expect(none).toContain("No value");
    expect(none).toContain(">No price<");
    const mixed = html(createElement(PriceBlock, { price: null, source: "MIXED", label: "Mixed", priceRef: null }));
    expect(mixed).toContain(">Mixed<");
  });

  it("the caption can be hidden by Customize view; an unknown source shows the number only", () => {
    expect(html(createElement(PriceBlock, { price: "1.0000", source: "PRICE_LIST", label: "Price list", priceRef: null, showCaption: false }))).not.toContain("Price list<");
    const unknown = html(createElement(PriceBlock, { price: "1.0000", source: "CONTRACT", label: null, priceRef: null }));
    expect(unknown).toContain("1.00");
    expect(unknown).not.toContain("title=");
  });

  it("Amount and Profit/Loss: grouped by the price places; negative is red with its minus sign; positive is plain; none is a dash", () => {
    expect(html(createElement(AmountText, { value: "15500.00" }))).toBe("15,500.00");
    expect(html(withPlaces(0, createElement(AmountText, { value: "15500.00" })))).toBe("15,500");
    const negative = html(createElement(ProfitLossText, { value: "-47120.00" }));
    expect(negative).toContain("text-gms-danger");
    expect(negative).toContain("-47,120.00");
    expect(html(createElement(ProfitLossText, { value: "5580.00" }))).not.toContain("text-gms-danger");
    expect(html(createElement(ProfitLossText, { value: null }))).toContain("No value");
    expect(html(createElement(Dash))).toContain('title="No value"');
  });
});

describe("list table (FE-SV-006, V1 / V4)", () => {
  it("Location comes before Stone Code and Lot No.; the purple BALANCE group has Pcs, Weight, Price, Unit and Amount; Profit/Loss spans both rows", () => {
    const markup = html(listTable());
    expect(markup.indexOf("Sort by LOCATION")).toBeLessThan(markup.indexOf("Sort by STONE CODE"));
    expect(markup.indexOf("Sort by STONE CODE")).toBeLessThan(markup.indexOf("Sort by LOT NO."));
    expect(markup).toContain("bg-gms-group-purple-head");
    for (const label of ["Pcs", "Weight", "Price", "Unit", "Amount"]) expect(markup).toContain(`>${label}</th>`);
    expect(markup).toContain('aria-label="Sort by Profit/Loss"');
    expect(markup).toMatch(/rowSpan="2"|rowspan="2"/);
    expect(markup).toContain('title="Balance weight x price, rounded by the system"');
    expect(markup).toContain('aria-sort="ascending"');
  });

  it("only the drawn columns sort", () => {
    const markup = html(listTable());
    for (const label of ["LOCATION", "STONE CODE", "LOT NO.", "Profit/Loss"]) expect(markup).toContain(`aria-label="Sort by ${label}"`);
    for (const label of ["Pcs", "Weight", "Price", "Unit", "Amount"]) expect(markup).not.toContain(`aria-label="Sort by ${label}"`);
    expect(html(listTable({ sort: { key: "profitLoss", dir: "desc" } })).match(/aria-sort="descending"/g)).toHaveLength(1);
  });

  it("66 px rows with the picker states; BALANCE cells keep their tint and darken on hover", () => {
    const markup = html(listTable());
    expect(markup.match(/<tr [^>]*class="[^"]*h-\[66px\]/g)).toHaveLength(3);
    expect(markup).toContain("cursor-pointer border-b border-gms-border bg-white hover:bg-gms-row-hover");
    expect(markup).toContain("bg-gms-group-purple-cell group-hover/row:bg-gms-group-purple-hover");
  });

  it("a ticked row takes the active tint, its BALANCE cells the purple ticked tint, and its checkbox is checked", () => {
    const markup = html(listTable({ selected: new Set([KEY_A]) }));
    expect(markup).toContain('data-state="selected"');
    expect(markup.match(/bg-gms-row-active/g)).toHaveLength(1);
    expect(markup.match(/bg-gms-group-purple-active/g)).toHaveLength(5);
    expect(markup.match(/type="checkbox"[^>]*checked/g)).toHaveLength(1);
    expect(markup).toContain('aria-label="Select SAP-OV-6x4"');
  });

  it("cells: the card link, the detail line, location, lot, balance, price with source, unit, amount and profit/loss", () => {
    const markup = html(listTable());
    expect(markup).toContain(`href="/report/stock-movement/stock-value/${KEY_A}"`);
    expect(markup).toContain("Sapphire · Oval 6x4 · Blue · VS · Brilliant · AA");
    expect(markup).toContain("Vault A");
    expect(markup).toContain("L-2609");
    expect(markup).toContain(">1.24<");
    expect(markup).toContain("12,500.00");
    expect(markup).toContain(">Price list<");
    expect(markup).toContain(">Last sale<");
    expect(markup).toContain(">Cts<");
    expect(markup).toContain("15,500.00");
    expect(markup).toContain("5,580.00");
    expect(markup).not.toContain("text-gms-danger");
  });

  it("a card without a price keeps its row: balance, 'No price', and dashes for price, amount and profit/loss", () => {
    const markup = html(listTable({ rows: [ROW_NO_PRICE] }));
    expect(markup).toContain(">0.9<".replace("0.9", "0.90"));
    expect(markup).toContain(">No price<");
    expect(markup.match(/No value/g)!.length).toBeGreaterThanOrEqual(3);
  });

  it("a negative Profit/Loss is red", () => {
    expect(html(listTable({ rows: [ROW_LOSS] }))).toContain("text-gms-danger");
  });

  it("the Total row is the server's: balance sums, amount, profit/loss and the 'without' notes", () => {
    const markup = html(listTable());
    expect(markup).toContain("bg-gms-table-total");
    expect(markup).toContain(">15<");
    expect(markup).toContain(">6.64<");
    expect(markup).toContain("59,600.00");
    expect(markup).toContain("1 without price");
    expect(markup).toContain("1 without cost");
    const clean = html(listTable({ totals: { ...LIST_TOTALS, unpricedCards: 0, noCostCards: 0, profitLoss: null } }));
    expect(clean).not.toContain("without");
  });

  it("row numbers run across pages", () => {
    const markup = html(listTable({ page: 2, pageSize: 10 }));
    expect(markup).toContain(">11<");
    expect(markup).toContain(">13<");
  });

  it("Customize view hides Location, Lot No., the detail line, Unit and the price source; the rest stays", () => {
    const markup = html(listTable({ prefs: hideAllColumns() }));
    for (const label of ["LOCATION", "LOT NO."]) expect(markup).not.toContain(`Sort by ${label}`);
    expect(markup).not.toContain("Brilliant");
    expect(markup).not.toContain(">Unit</th>");
    expect(markup).not.toContain(">Cts<");
    expect(markup).not.toContain(">Price list<");
    expect(markup).toContain("Sort by STONE CODE");
    expect(markup).toContain(">Amount</th>");
    expect(markup).toContain("12,500.00");
    const noUnit = html(listTable({ prefs: setColumnShown(DEFAULT_VIEW, "unit", false) }));
    expect(noUnit).not.toContain(">Unit</th>");
    expect(noUnit).toContain(">Price list<");
  });

  it("money follows the Decimal Setup price places", () => {
    expect(html(withPlaces(4, listTable()))).toContain("12,500.0000");
    expect(html(withPlaces(0, listTable()))).toContain(">15,500<");
  });
});

describe("transactions table (FE-SV-008, V2 / V5)", () => {
  it("two-tier header: IN green, OUT orange, BALANCE purple, Current value blue; five left columns and PROFIT & LOSS span both rows", () => {
    const markup = html(txnTable());
    for (const tone of ["green", "orange", "purple", "blue"]) {
      expect(markup).toContain(`bg-gms-group-${tone}-head`);
      expect(markup).toContain(`bg-gms-group-${tone}-sub`);
    }
    expect(markup).toContain("Current value");
    for (const label of ["DOC NO", "DATE", "STOCK ID", "Account", "PROFIT &amp; LOSS"]) expect(markup).toContain(`aria-label="Sort by ${label}"`);
    expect(markup.match(/rowSpan="2"|rowspan="2"/g)).toHaveLength(6);
    expect(markup).toContain('aria-sort="ascending"');
  });

  it("the drawn PROFIT & LOSS sort is built (the SA contract supports it) and shows its direction", () => {
    expect(html(txnTable({ sort: { key: "profitLoss", dir: "desc" } }))).toContain('aria-sort="descending"');
  });

  it("56 px rows; the Current value cells are blue and darken on hover; the other direction is blank", () => {
    const markup = html(txnTable());
    expect(markup.match(/<tr [^>]*class="[^"]*\bh-14\b/g)).toHaveLength(3);
    expect(markup).toContain("bg-gms-group-blue-cell group-hover/row:bg-gms-group-blue-hover");
    expect(markup).toContain("bg-gms-group-green-cell group-hover/row:bg-gms-group-green-hover");
    expect(markup).toContain("></td>");
  });

  it("DOC NO links to the document with its type caption; an unknown type is text; STOCK ID shows '+n' or a dash", () => {
    const markup = html(txnTable());
    expect(markup).toContain('href="/inventory/load-to-stock/0192a"');
    expect(markup).toContain('href="/memo/memo-out/0192b"');
    expect(markup).not.toContain("stock-adjustment/");
    expect(markup).toContain(">Load to Stock<");
    expect(markup).toContain(">260215 +2<");
    expect(markup).toContain(">—<");
    expect(markup).toContain("04/09/26");
  });

  it("Price (with caption) and Amount per row, the running balance, and Profit/Loss with its colour", () => {
    const markup = html(txnTable());
    expect(markup.match(/12,500\.00/g)!.length).toBeGreaterThanOrEqual(4);
    expect(markup).toContain(">Price list<");
    expect(markup).toContain("15,500.00");
    expect(markup).toContain("7,750.00");
    expect(markup).toContain("-47,120.00");
    expect(markup.match(/text-gms-danger/g)).toHaveLength(1);
    expect(markup).toContain(">1.24<");
  });

  it("the Total row is the server's: sums, closing balance, the card's price with its source, closing amount and profit/loss", () => {
    const markup = html(txnTable());
    const total = markup.slice(markup.indexOf("<tfoot"));
    expect(total).toContain("Total");
    expect(total).toContain(">5<");
    expect(total).toContain(">1.34<");
    expect(total).toContain(">0.72<");
    expect(total).toContain("12,500.00");
    expect(total).toContain(">Price list<");
    expect(total).toContain("9,000.00");
    expect(total).toContain("120.50");
  });

  it("a card without a price shows dashes and 'No price' in the Total row", () => {
    const none = { ...TXN_TOTALS, price: null, priceUnit: null, priceSource: "NONE", priceSourceLabel: null, amount: null, profitLoss: null };
    const markup = html(txnTable({ totals: none }));
    const total = markup.slice(markup.indexOf("<tfoot"));
    expect(total).toContain(">No price<");
    expect(total.match(/No value/g)!.length).toBeGreaterThanOrEqual(3);
  });
});

describe("header, back link and panel", () => {
  it("the back link says Stock Value and returns to the list route", () => {
    const markup = html(createElement(BackLink));
    expect(markup).toContain("Stock Value");
    expect(markup).toContain('href="/report/stock-movement/stock-value"');
    expect(html(createElement(BackLink, { label: "Back to Stock Value" }))).toContain("Back to Stock Value");
  });

  it("Customize view lists the locked columns and the switchable ones, closed by default", () => {
    const markup = html(createElement(StockValueViewPanel, { open: false, prefs: DEFAULT_VIEW, onChange: noop, onClose: noop, returnFocus: { current: null } }));
    for (const label of ["Stone Code", "Pcs", "Weight", "Price", "Amount", "Profit/Loss", "Location", "Lot No.", "Unit", "Price source", "Stone detail line"]) expect(markup).toContain(label);
    expect(markup).toContain("Customize view");
    expect(markup).toContain("No hidden columns");
    const hidden = html(createElement(StockValueViewPanel, { open: false, prefs: hideAllColumns(), onChange: noop, onClose: noop, returnFocus: { current: null } }));
    expect(hidden).not.toContain("No hidden columns");
  });

  it("the header block of the shared Stock Card pieces shows the card header", () => {
    expect(HEADER_A.amount).toBe("15500.00");
  });
});

describe("print (FE-SV-011, Q-SV-18)", () => {
  const list = (props: Partial<Parameters<typeof ListPrintContent>[0]> = {}) =>
    createElement(ListPrintContent, { rows: [ROW_LIST, ROW_NO_PRICE], totals: LIST_TOTALS, prefs: DEFAULT_VIEW, scope: "Current page", asOf: null, filters: [], printedAt: "23/11/2026 10:00", ...props });

  it("the list prints the value columns, the price source and the Total row with the notes", () => {
    const markup = html(list());
    expect(markup).toContain("Stock Value");
    expect(markup).toContain("Printed 23/11/2026 10:00");
    for (const label of ["Location", "Stone Code", "Lot No.", "Pcs", "Weight", "Price", "Unit", "Amount", "Profit/Loss"]) expect(markup).toContain(`>${label}</th>`);
    expect(markup).toContain("Price list");
    expect(markup).toContain("No price");
    expect(markup).toContain("59,600.00");
    expect(markup).toContain("1 without price");
    expect(markup).toContain("Total");
  });

  it("a Due date adds the as-at line; hidden columns are not printed", () => {
    expect(html(list({ asOf: "2026-09-30", scope: "Selected rows" }))).toContain("Balance as at 30/09/2026 at current prices");
    const markup = html(list({ prefs: hideAllColumns() }));
    expect(markup).not.toContain(">Location</th>");
    expect(markup).not.toContain(">Unit</th>");
    expect(markup).not.toContain("Brilliant");
  });

  it("the detail prints the header line, the four groups, the rows and the Total row", () => {
    const markup = html(createElement(DetailPrintContent, { header: HEADER_A, rows: [TXN_LOAD, TXN_OUT], totals: TXN_TOTALS, filters: ["Search: MO"], printedAt: "" }));
    expect(markup).toContain("Stock Value – SAP-OV-6x4");
    expect(markup).toContain("Location Vault A");
    expect(markup).toContain("Current value");
    expect(markup).toContain("Profit &amp; Loss");
    expect(markup).toContain("LS2609014");
    expect(markup).toContain("-47,120.00");
    expect(markup).toContain("9,000.00");
    expect(markup).toContain("Search: MO");
  });
});
