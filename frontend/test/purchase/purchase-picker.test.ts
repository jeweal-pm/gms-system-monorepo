import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PurchaseMemoStockRow, PurchaseOrderLineRow } from "@/features/purchase/api";
import {
  expandedRows,
  groupStarts,
  StockPickerView as PurchasePickerView,
  selectAllState,
  shownGroups,
  tabAfterKey,
  toggleAll,
  toggleGroup,
  toggleRow,
  trapTarget,
  type PickerData,
  type PickerGroup,
  type PickerViewState,
  type StockPickerProps as PurchasePickerProps,
} from "@/features/trade-document/stock-picker";
import {
  IN_STOCK_GROUP_LABEL,
  MEMO_STOCK_COLUMNS,
  lotPickerInput,
  memoStockEmptyText,
  memoStockGroups,
  memoStockPickerProps,
  memoStockTabs,
  PICKER_PAGE_SIZE,
  pickerInput,
  purchaseOrderEmptyText,
  purchaseOrderGroups,
  purchaseOrderPickerProps,
  PURCHASE_ORDER_COLUMNS,
  SOLD_GROUP_LABEL,
} from "@/features/purchase/components/purchase-pickers";
import { gatewayError } from "../partner/helpers";
import { memoStockKey } from "@/features/purchase/api";
import { memoRow, poRow } from "./fixtures";

/** UT-PU-07 (picker shell) and UT-PU-08 (Memo Stock view model), purchase UI rev 2 (FE-PU-004/008/009). */

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const lot = (n: number) => `ML${String(n).padStart(32, "0")}`;
/** The design's five rows (source 05): 2 sold, 3 in stock, with its amounts. */
const sold = [
  memoRow({ lotKey: lot(1), memoGroup: "SOLD", lot: "LT-231", pendingPcs: 1, pendingWeightCt: "0.760", netUnitPrice: "1450.0000", amount: "1102.00", itemNote: "" }),
  memoRow({ lotKey: lot(2), memoGroup: "SOLD", lot: "LT-232", pendingPcs: 3, pendingWeightCt: "3.600", netUnitPrice: "980.0000", amount: "3528.00" }),
];
const inStock = [
  memoRow({ lotKey: lot(3), memoGroup: "IN_STOCK", lot: "LT-331", pendingPcs: 2, pendingWeightCt: "1.450", netUnitPrice: "2100.0000", amount: "3045.00" }),
  memoRow({ lotKey: lot(4), memoGroup: "IN_STOCK", lot: "LT-332", pendingPcs: 4, pendingWeightCt: "2.940", netUnitPrice: "320.0000", amount: "940.80" }),
  memoRow({ lotKey: lot(5), memoGroup: "IN_STOCK", lot: "LT-333", priceUnit: "PER_PCS", pendingPcs: 1, pendingWeightCt: "0.500", netUnitPrice: "900.0000", amount: "900.00" }),
];
const counts = { all: 5, sold: 2, inStock: 3 };
const key = (row: PurchaseMemoStockRow) => memoStockKey(row.lotKey, row.memoGroup);

const data = <R,>(rows: R[], patch: Partial<PickerData<R>> = {}): PickerData<R> => ({
  rows, isPending: false, isError: false, error: null, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: () => undefined, ...patch,
});
const memoProps = (patch: { excluded?: Set<string>; counts?: typeof counts } = {}) =>
  memoStockPickerProps({ currency: "USD", counts: patch.counts ?? counts, excluded: patch.excluded ?? new Set(), onCancel: () => undefined, onConfirm: () => undefined });
const state = <R, S extends string>(tab: S, rows: PickerData<R>, patch: Partial<PickerViewState<R, S>> = {}): PickerViewState<R, S> => ({
  tab, search: "", from: "", to: "", collapsed: new Set(), checked: new Map(), data: rows, filtered: false, ...patch,
});
const handlers = { onTab: () => undefined, onSearch: () => undefined, onFrom: () => undefined, onTo: () => undefined, onToggleGroup: () => undefined, onToggleRow: () => undefined, onToggleAll: () => undefined, onOk: () => undefined };
function view<R, S extends string>(props: PurchasePickerProps<R, S>, viewState: PickerViewState<R, S>) {
  return renderToStaticMarkup(createElement(PurchasePickerView<R, S>, { props, state: viewState, on: handlers })).replaceAll("&#x27;", "'").replaceAll("&amp;", "&");
}
const button = (html: string, label: string) => new RegExp(`<button[^>]*>(?:(?!</button>).)*${label}(?:(?!</button>).)*</button>`).exec(html)?.[0] ?? "";
const numbers = (html: string) => [...html.matchAll(/<td class="w-8 py-2 align-top text-gms-text-muted">(\d+)<\/td>/g)].map((match) => Number(match[1]));

describe("UT-PU-07 picker shell helpers", () => {
  const groups = memoStockGroups([...sold, ...inStock], counts);

  it("running # across groups, kept under a collapsed group (source 04: 3, 4, 5)", () => {
    expect(groupStarts(groups)).toEqual([1, 3]);
    expect(shownGroups(memoStockGroups(inStock, counts)).map((group) => group.id)).toEqual(["IN_STOCK"]);
  });

  it("select all covers only the expanded groups; rows checked under another filter stay checked", () => {
    const collapsedSold = new Set(["SOLD"]);
    expect(expandedRows(groups, collapsedSold)).toEqual(inStock);
    const before = new Map([[key(sold[0]!), sold[0]!]]);
    expect(selectAllState(expandedRows(groups, collapsedSold), before, key)).toEqual({ disabled: false, checked: false });
    const all = toggleAll(expandedRows(groups, collapsedSold), before, key);
    expect([...all.keys()]).toEqual([key(sold[0]!), ...inStock.map(key)]);
    expect(selectAllState(inStock, all, key).checked).toBe(true);
    const none = toggleAll(inStock, all, key);
    expect([...none.keys()]).toEqual([key(sold[0]!)]);
    expect(selectAllState([], none, key)).toEqual({ disabled: true, checked: false });
  });

  it("row and group toggles", () => {
    const one = toggleRow(new Map(), key(sold[1]!), sold[1]!);
    expect(one.get(key(sold[1]!))).toBe(sold[1]);
    expect(toggleRow(one, key(sold[1]!), sold[1]!).size).toBe(0);
    expect([...toggleGroup(new Set(), "SOLD")]).toEqual(["SOLD"]);
    expect([...toggleGroup(new Set(["SOLD"]), "SOLD")]).toEqual([]);
  });

  it("arrow keys move between tabs and wrap; Tab is trapped inside the dialog", () => {
    expect(tabAfterKey(3, 0, "ArrowRight")).toBe(1);
    expect(tabAfterKey(3, 2, "ArrowRight")).toBe(0);
    expect(tabAfterKey(3, 0, "ArrowLeft")).toBe(2);
    expect(tabAfterKey(3, 1, "Home")).toBe(0);
    expect(tabAfterKey(3, 1, "End")).toBe(2);
    expect(tabAfterKey(3, 1, "Enter")).toBeNull();
    expect(trapTarget(5, 4, false)).toBe(0);
    expect(trapTarget(5, 0, true)).toBe(4);
    expect(trapTarget(5, 2, false)).toBeNull();
    expect(trapTarget(5, -1, false)).toBe(0);
    expect(trapTarget(0, 0, false)).toBeNull();
  });
});

describe("UT-PU-07 picker shell view (R2-MS layout and states)", () => {
  it("dialog, tabs with counts, search, dates, one header row, both groups expanded, running #, OK disabled", () => {
    const html = view(memoProps(), state("ALL", data([...sold, ...inStock])));
    expect(html).toMatch(/role="dialog" aria-modal="true" aria-labelledby="([^"]+)"/);
    const titleId = /aria-labelledby="([^"]+)"/.exec(html)![1];
    expect(html).toContain(`id="${titleId}" class="text-lg font-medium text-[#1C252E]">Add Memo Stock</h2>`);
    expect(html).toContain('role="tablist"');
    expect(html).toMatch(/role="tab" aria-selected="true" aria-label="All, 5" tabindex="0"/);
    expect(html).toMatch(/role="tab" aria-selected="false" aria-label="Sold, 2" tabindex="-1"/);
    expect(html).toMatch(/role="tab" aria-selected="false" aria-label="In stock, 3"/);
    expect(html).toContain('placeholder="Search Lot, Stone, Stone Code, Cer No., Doc No."');
    expect(html).toContain('aria-label="Received from"');
    expect(html).toContain('aria-label="Received to"');
    expect(html.match(/<thead/g)).toHaveLength(1);
    expect(html.match(/<tr class="h-14">/g)).toHaveLength(1);
    // Design 136: grey #E9EDED header, attribute titles in capitals, sort glyphs, OK greyed until something is ticked.
    expect(html).toContain('<thead class="sticky top-0 z-10 bg-gms-table-head text-left">');
    expect(html).toContain('<span class="block text-sm uppercase">Location</span>');
    expect(html).toContain('<span class="block text-sm">Amount</span>');
    expect(html.match(/lucide-chevrons-up-down/g)).toHaveLength(MEMO_STOCK_COLUMNS.length);
    expect(button(html, "OK")).toContain("disabled:bg-gms-surface-sunken");
    expect(html.match(/<th /g)).toHaveLength(MEMO_STOCK_COLUMNS.length + 2);
    expect(MEMO_STOCK_COLUMNS.map((column) => column.title)).toEqual(["Lot / Stone Code", "Location", "Stone", "Color · Clarity", "Cer Type", "Status", "Pcs", "Memo Price", "Amount"]);
    expect(MEMO_STOCK_COLUMNS[0]!.sub).toBe("Memo No.");
    const soldHeader = button(html, SOLD_GROUP_LABEL);
    expect(soldHeader).toContain('aria-expanded="true"');
    const controls = /aria-controls="([^"]+)"/.exec(soldHeader)![1];
    expect(html).toContain(`<tbody id="${controls}">`);
    expect(soldHeader).toContain(">2</span>");
    expect(button(html, IN_STOCK_GROUP_LABEL)).toContain(">3</span>");
    expect(html.indexOf(SOLD_GROUP_LABEL)).toBeLessThan(html.indexOf(IN_STOCK_GROUP_LABEL));
    expect(numbers(html)).toEqual([1, 2, 3, 4, 5]);
    expect(html.match(/shadow-\[inset_3px_0_0_#DF1016\]/g)).toHaveLength(2);
    // Group bands (design 144): red 18 % for Sold, neutral for In stock.
    expect(html.match(/bg-gms-group-red-sub/g)).toHaveLength(1);
    expect(html.match(/bg-gms-group-band/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Select lot LT-231"');
    expect(button(html, "OK")).toContain('disabled=""');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain("selected</span>");
    expect(html).not.toContain("Load more");
  });

  it("a collapsed Sold group hides its rows and keeps the in-stock numbers 3, 4, 5", () => {
    const html = view(memoProps(), state("ALL", data([...sold, ...inStock]), { collapsed: new Set(["SOLD"]) }));
    expect(button(html, SOLD_GROUP_LABEL)).toContain('aria-expanded="false"');
    expect(html).toMatch(/<tbody id="[^"]+" hidden="">/);
    expect(numbers(html)).toEqual([3, 4, 5]);
  });

  it("checked rows: N selected (also rows not shown), OK enabled, select all checked over the expanded groups", () => {
    const checked = new Map(inStock.map((row) => [key(row), row]));
    checked.set("hidden-under-another-filter", sold[0]!);
    const html = view(memoProps(), state("IN_STOCK", data(inStock), { checked }));
    expect(html).toContain(">4 selected</span>");
    expect(button(html, "OK")).not.toContain('disabled=""');
    expect(html).toMatch(/<input type="checkbox" aria-label="Select all" class="[^"]*" checked=""/);
    expect(html).not.toContain(SOLD_GROUP_LABEL);
  });

  it("rows already on the document are left out; Load more while the server has more", () => {
    const html = view(memoProps({ excluded: new Set([key(inStock[0]!)]) }), state("ALL", data([...sold, ...inStock], { hasNextPage: true })));
    expect(html).not.toContain("LT-331");
    expect(numbers(html)).toEqual([1, 2, 3, 4]);
    expect(button(html, "Load more")).not.toContain('disabled=""');
    expect(view(memoProps(), state("ALL", data(inStock, { hasNextPage: true, isFetchingNextPage: true })))).toMatch(/disabled="">Loading…<\/button>/);
  });

  it("loading, load error and the per-tab empty texts", () => {
    expect(view(memoProps(), state("ALL", data<PurchaseMemoStockRow>([], { isPending: true })))).toContain("Loading…");
    expect(view(memoProps(), state("ALL", data<PurchaseMemoStockRow>([], { isError: true, error: gatewayError({ code: "FORBIDDEN", httpStatus: 403, domainCode: "PERMISSION_DENIED" }) })))).toContain("You don't have permission to view memo stock.");
    const empty = (tab: "ALL" | "SOLD" | "IN_STOCK", filtered = false) => view(memoProps({ counts: { all: 0, sold: 0, inStock: 0 } }), state(tab, data<PurchaseMemoStockRow>([]), { filtered }));
    expect(empty("ALL")).toContain("No memo stock from this vendor in USD.");
    expect(empty("SOLD")).toContain("No sold items waiting to be purchased.");
    expect(empty("IN_STOCK")).toContain("No items in stock on memo.");
    expect(empty("ALL", true)).toContain("Nothing matches your search.");
    expect(empty("ALL")).toMatch(/aria-label="Select all" class="[^"]*" disabled=""/);
  });
});

describe("UT-PU-08 Memo Stock view model", () => {
  it("Sold first, server counts on tabs and groups; the Sold group is hidden while empty (owner Q-PU-16)", () => {
    expect(memoStockTabs(counts).map((tab) => [tab.label, tab.count])).toEqual([["All", 5], ["Sold", 2], ["In stock", 3]]);
    expect(memoStockTabs(undefined).map((tab) => tab.count)).toEqual([undefined, undefined, undefined]);
    const groups = memoStockGroups([inStock[0]!, sold[0]!, inStock[1]!], counts) as PickerGroup<PurchaseMemoStockRow>[];
    expect(groups.map((group) => [group.id, group.label, group.tone, group.count, group.rows.length])).toEqual([
      ["SOLD", "Sold to customers · must be purchased", "sold", 2, 1],
      ["IN_STOCK", "Still in stock on memo · buy now or return later", "neutral", 3, 2],
    ]);
    const html = view(memoProps({ counts: { all: 3, sold: 0, inStock: 3 } }), state("ALL", data(inStock)));
    expect(html).not.toContain(SOLD_GROUP_LABEL);
    expect(html).toContain('aria-label="Sold, 0"');
  });

  it("cells (design 144, lot-based-stock): Lot chip then Stone Code, Memo No. and the note under it, Location, badges with AA text colours, Pcs over cts, price per unit, amount; no Stock ID", () => {
    const html = view(memoProps(), state("ALL", data([...sold, ...inStock])));
    expect(html).toContain(">LT-232</span>");
    expect(html.match(/>MR-1001<\/div>/g)).toHaveLength(5);
    expect(html.indexOf(">LT-231</span>")).toBeLessThan(html.indexOf(">MR-1001</div>"));
    expect(html).toContain('<span class="font-medium">—</span>');
    expect(html).not.toMatch(/Stock ID/);
    expect(html.match(/lucide-message-square/g)).toHaveLength(4);
    expect(html).toContain(">Memo</td>");
    expect(html).not.toMatch(/Pair|Parcel|Single/);
    expect(html.match(/bg-\[#FAE6E4\] text-\[#C2141A\]">Sold</g)).toHaveLength(2);
    expect(html.match(/bg-\[#C1EFD2\] text-\[#166534\]">In stock</g)).toHaveLength(3);
    expect(html.match(/with us since memo/g)).toHaveLength(3);
    expect(html).toContain(">0.76 cts</div>");
    expect(html).toContain(">1,450.00</div>");
    expect(html.match(/USD per cts/g)).toHaveLength(4);
    expect(html).toContain("USD per pcs");
    for (const amount of ["1,102.00", "3,528.00", "3,045.00", "940.80"]) expect(html).toContain(`>${amount}</td>`);
  });

  it("a sold row shows no invoice or customer, and a missing price reads 0.00", () => {
    const html = view(memoProps(), state("ALL", data([sold[0]!, memoRow({ lotKey: lot(9), memoGroup: "SOLD", netUnitPrice: null, amount: null })])));
    expect(html).not.toContain("INV");
    expect(html).toContain(">0.00</div>");
  });

  it("rows are keyed by lot and part (the same lot's Sold and In-stock rows are distinct); lot columns and search text", () => {
    expect(key(memoRow({ lotKey: lot(1), memoGroup: "SOLD" }))).not.toBe(key(memoRow({ lotKey: lot(1), memoGroup: "IN_STOCK" })));
    expect(memoProps().columns[0]).toMatchObject({ title: "Lot / Stone Code", sub: "Memo No." });
    expect(memoProps().searchPlaceholder).toBe("Search Lot, Stone, Stone Code, Cer No., Doc No.");
  });

  it("empty texts and the picker input (status, filters only when set, 50 a page)", () => {
    expect(memoStockEmptyText("THB")("ALL", false)).toBe("No memo stock from this vendor in THB.");
    expect(pickerInput("v", "THB", { status: "SOLD", q: "", from: "", to: "" })).toEqual({ vendorId: "v", currency: "THB", status: "SOLD", limit: PICKER_PAGE_SIZE });
    expect(lotPickerInput("v", "THB", { status: "SOLD", q: "LT", from: "", to: "" })).toEqual({ vendorId: "v", currency: "THB", group: "SOLD", limit: 50, q: "LT" });
    expect(pickerInput("v", "THB", { status: "ALL", q: "STK", from: "2026-10-01", to: "2026-10-31" })).toEqual({ vendorId: "v", currency: "THB", status: "ALL", limit: 50, q: "STK", from: "2026-10-01", to: "2026-10-31" });
  });
});

describe("UT-PU-09 Add Purchase Order view (rev 3: like the From Stock picker)", () => {
  const second = poRow({ purchaseOrderLineId: id(9), status: "OPEN", position: 1, purchaseOrder: { id: id(8), docNo: "PO2611002", docDate: "2026-11-02", dueDate: "2026-12-02", ref: "" }, purchasedPcs: 0, purchasedWeightCt: "0.000", itemNote: "" });
  const rows: PurchaseOrderLineRow[] = [second, poRow(), poRow({ purchaseOrderLineId: id(10), position: 3, stoneCode: "", lot: "" })];
  const props = purchaseOrderPickerProps({ currency: "THB", excluded: new Set(), onCancel: () => undefined, onConfirm: () => undefined });

  it("one flat list in server order: no tabs, no PO group rows, no Status column, PO No. then Stone Code", () => {
    expect(purchaseOrderGroups(rows).map((group) => [group.id, group.count, group.rows.length])).toEqual([["ALL", 3, 3]]);
    expect(PURCHASE_ORDER_COLUMNS.map((column) => [column.title, column.sub ?? ""])).toEqual([
      ["PO No.", "Doc Date"], ["Stone Code", "Stock ID · Lot"], ["Location", ""], ["Stone", "Shape · Size"], ["Color · Clarity", "Cutting · Quality"],
      ["Cer Type", "Cer No."], ["Pcs", "Weight"], ["Price", "Unit"], ["Amount", ""],
    ]);
    const html = view(props, state("ALL", data(rows)));
    expect(html).toContain(">Add Purchase Order</h2>");
    expect(html).toContain('placeholder="Search PO No., lot, stone, cer no."');
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain("aria-controls");
    expect(html).not.toContain("Due 02/12/26");
    expect(html).not.toContain("Partly purchased");
    expect(html).not.toContain("bg-[#FAE6E4]");
    expect(html.match(/<th /g)).toHaveLength(PURCHASE_ORDER_COLUMNS.length + 2);
    expect(numbers(html)).toEqual([1, 2, 3]);
  });

  it("cells: bold PO No. over its Doc Date, Stone Code over — (no Stock ID, ADR-0051) + lot badge and the note, open quantity and the net price", () => {
    const html = view(props, state("ALL", data(rows)));
    expect(html).toContain('<div class="font-medium">PO2611002</div><div class="mt-1 text-xs leading-4 text-gms-text-secondary">02/11/2026</div>');
    expect(html.match(/>PO2611001<\/div>/g)).toHaveLength(2);
    expect(html).toContain(">RU-OV-1</div>");
    expect(html.match(/<span>—<\/span>/g)).toHaveLength(3);
    expect(html).not.toContain("<span>Auto</span>");
    expect(html).toContain('bg-gms-warning-subtle px-1.5 py-px font-mono text-xs leading-4 text-gms-warning-text">L-PO-1</span>');
    expect(html).toContain('<div class="font-medium">—</div>');
    expect(html).toContain(">Safe A</td>");
    expect(html).toContain(">6</div>");
    expect(html).toContain(">3.00 cts</div>");
    expect(html).toContain(">950.00</div>");
    expect(html).toContain("THB per cts");
    expect(html).toContain(">2,850.00</td>");
    expect(html).toContain('aria-label="Select line 2 of PO2611001"');
  });

  it("empty and filtered texts", () => {
    expect(purchaseOrderEmptyText("THB")("ALL", false)).toBe("No open purchase order lines from this vendor in THB.");
    expect(view(props, state("ALL", data<PurchaseOrderLineRow>([])))).toContain("No open purchase order lines from this vendor in THB.");
    expect(purchaseOrderEmptyText("THB")("ALL", true)).toBe("Nothing matches your search.");
  });
});
