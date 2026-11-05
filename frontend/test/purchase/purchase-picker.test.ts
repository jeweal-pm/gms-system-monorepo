import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PurchaseMemoStockRow, PurchaseOrderLineRow } from "@/features/purchase/api";
import {
  expandedRows,
  groupStarts,
  PurchasePickerView,
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
  type PurchasePickerProps,
} from "@/features/purchase/components/purchase-picker";
import {
  IN_STOCK_GROUP_LABEL,
  MEMO_STOCK_COLUMNS,
  memoStockEmptyText,
  memoStockGroups,
  memoStockPickerProps,
  memoStockTabs,
  PICKER_PAGE_SIZE,
  pickerInput,
  purchaseOrderEmptyText,
  purchaseOrderGroups,
  purchaseOrderPickerProps,
  purchaseOrderTabs,
  SOLD_GROUP_LABEL,
} from "@/features/purchase/components/purchase-pickers";
import { gatewayError } from "../partner/helpers";
import { memoRow, poRow, STOCK } from "./fixtures";

/** UT-PU-07 (picker shell) and UT-PU-08 (Memo Stock view model), purchase UI rev 2 (FE-PU-004/008/009). */

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
/** The design's five rows (source 05): 2 sold, 3 in stock, with its amounts. */
const sold = [
  memoRow({ key: `${id(1)}:SOLD`, memoStockId: id(1), status: "SOLD", stockId: "STK-000231", availablePcs: 1, availableWeightCt: "0.760", netUnitPrice: "1450.0000", amount: "1102.00", itemNote: "" }),
  memoRow({ key: `${id(2)}:SOLD`, memoStockId: id(2), status: "SOLD", stockId: "STK-000232", availablePcs: 3, availableWeightCt: "3.600", netUnitPrice: "980.0000", amount: "3528.00" }),
];
const inStock = [
  memoRow({ key: `${id(3)}:IN_STOCK`, memoStockId: id(3), stockId: "STK-000331", availablePcs: 2, availableWeightCt: "1.450", netUnitPrice: "2100.0000", amount: "3045.00" }),
  memoRow({ key: `${id(4)}:IN_STOCK`, memoStockId: id(4), stockId: "STK-000332", availablePcs: 4, availableWeightCt: "2.940", netUnitPrice: "320.0000", amount: "940.80" }),
  memoRow({ key: `${id(5)}:IN_STOCK`, memoStockId: id(5), stockId: "STK-000333", priceUnit: "PCS", availablePcs: 1, availableWeightCt: "0.500", netUnitPrice: "900.0000", amount: "900.00" }),
];
const counts = { all: 5, sold: 2, inStock: 3 };
const key = (row: PurchaseMemoStockRow) => row.key;

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
const numbers = (html: string) => [...html.matchAll(/<td class="py-4 text-\[#4E626C\]">(\d+)<\/td>/g)].map((match) => Number(match[1]));

describe("UT-PU-07 picker shell helpers", () => {
  const groups = memoStockGroups([...sold, ...inStock], counts);

  it("running # across groups, kept under a collapsed group (source 04: 3, 4, 5)", () => {
    expect(groupStarts(groups)).toEqual([1, 3]);
    expect(shownGroups(memoStockGroups(inStock, counts)).map((group) => group.id)).toEqual(["IN_STOCK"]);
  });

  it("select all covers only the expanded groups; rows checked under another filter stay checked", () => {
    const collapsedSold = new Set(["SOLD"]);
    expect(expandedRows(groups, collapsedSold)).toEqual(inStock);
    const before = new Map([[sold[0]!.key, sold[0]!]]);
    expect(selectAllState(expandedRows(groups, collapsedSold), before, key)).toEqual({ disabled: false, checked: false });
    const all = toggleAll(expandedRows(groups, collapsedSold), before, key);
    expect([...all.keys()]).toEqual([sold[0]!.key, ...inStock.map(key)]);
    expect(selectAllState(inStock, all, key).checked).toBe(true);
    const none = toggleAll(inStock, all, key);
    expect([...none.keys()]).toEqual([sold[0]!.key]);
    expect(selectAllState([], none, key)).toEqual({ disabled: true, checked: false });
  });

  it("row and group toggles", () => {
    const one = toggleRow(new Map(), sold[1]!.key, sold[1]!);
    expect(one.get(sold[1]!.key)).toBe(sold[1]);
    expect(toggleRow(one, sold[1]!.key, sold[1]!).size).toBe(0);
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
    expect(html).toContain('placeholder="Search Stock ID, lot, memo, invoice"');
    expect(html).toContain('aria-label="Received from"');
    expect(html).toContain('aria-label="Received to"');
    expect(html.match(/<thead/g)).toHaveLength(1);
    expect(html.match(/<tr class="h-\[52px\]">/g)).toHaveLength(1);
    expect(html.match(/<th /g)).toHaveLength(MEMO_STOCK_COLUMNS.length + 2);
    expect(MEMO_STOCK_COLUMNS.map((column) => column.title)).toEqual(["Stock ID", "Location", "Stone", "Color · Clarity", "Cer Type", "Status", "Pcs", "Price", "Amount"]);
    const soldHeader = button(html, SOLD_GROUP_LABEL);
    expect(soldHeader).toContain('aria-expanded="true"');
    const controls = /aria-controls="([^"]+)"/.exec(soldHeader)![1];
    expect(html).toContain(`<tbody id="${controls}">`);
    expect(soldHeader).toContain(">2</span>");
    expect(button(html, IN_STOCK_GROUP_LABEL)).toContain(">3</span>");
    expect(html.indexOf(SOLD_GROUP_LABEL)).toBeLessThan(html.indexOf(IN_STOCK_GROUP_LABEL));
    expect(numbers(html)).toEqual([1, 2, 3, 4, 5]);
    expect(html.match(/shadow-\[inset_3px_0_0_#DF1016\]/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Select STK-000231 from MR-1001"');
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
    const checked = new Map(inStock.map((row) => [row.key, row]));
    checked.set("hidden-under-another-filter", sold[0]!);
    const html = view(memoProps(), state("IN_STOCK", data(inStock), { checked }));
    expect(html).toContain(">4 selected</span>");
    expect(button(html, "OK")).not.toContain('disabled=""');
    expect(html).toMatch(/<input type="checkbox" aria-label="Select all" class="[^"]*" checked=""/);
    expect(html).not.toContain(SOLD_GROUP_LABEL);
  });

  it("rows already on the document are left out; Load more while the server has more", () => {
    const html = view(memoProps({ excluded: new Set([inStock[0]!.key]) }), state("ALL", data([...sold, ...inStock], { hasNextPage: true })));
    expect(html).not.toContain("STK-000331");
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

  it("cells: Stock ID with Lot · Memo No. and the note, Location, badges with AA text colours, Pcs over cts, price per unit, amount", () => {
    const html = view(memoProps(), state("ALL", data([...sold, ...inStock])));
    expect(html).toContain(">STK-000232</div>");
    expect(html).toContain("L-2607-007 · MR-1001");
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

  it("a sold row shows its invoice and customer only when the API gives them (always null in SA rev 1)", () => {
    const withSale = memoRow({ key: `${STOCK}:SOLD`, status: "SOLD", sale: { invoiceNo: "INV2610-021", invoiceDate: "2026-10-28", customerName: "Siam Gems" } as never });
    const html = view(memoProps(), state("ALL", data([withSale])));
    expect(html).toContain("INV2610-021 · 28/10/26");
    expect(html).toContain("Siam Gems");
    expect(view(memoProps(), state("ALL", data([sold[0]!])))).not.toContain("INV");
  });

  it("empty texts and the picker input (status, filters only when set, 50 a page)", () => {
    expect(memoStockEmptyText("THB")("ALL", false)).toBe("No memo stock from this vendor in THB.");
    expect(pickerInput("v", "THB", { status: "SOLD", q: "", from: "", to: "" })).toEqual({ vendorId: "v", currency: "THB", status: "SOLD", limit: PICKER_PAGE_SIZE });
    expect(pickerInput("v", "THB", { status: "ALL", q: "STK", from: "2026-10-01", to: "2026-10-31" })).toEqual({ vendorId: "v", currency: "THB", status: "ALL", limit: 50, q: "STK", from: "2026-10-01", to: "2026-10-31" });
  });
});

describe("UT-PU-09 Add Purchase Order view (R2-PO)", () => {
  const second = poRow({ purchaseOrderLineId: id(9), status: "OPEN", position: 1, purchaseOrder: { id: id(8), docNo: "PO2611002", docDate: "2026-11-02", dueDate: "2026-12-02", ref: "" }, purchasedPcs: 0, purchasedWeightCt: "0.000", itemNote: "" });
  const rows: PurchaseOrderLineRow[] = [second, poRow(), poRow({ purchaseOrderLineId: id(10), position: 3 })];
  const props = purchaseOrderPickerProps({ currency: "THB", counts: { all: 3, open: 1, partlyPurchased: 2 }, excluded: new Set(), onCancel: () => undefined, onConfirm: () => undefined });

  it("one grey group per PO in server order, tabs All / Open / Partly purchased with counts", () => {
    expect(purchaseOrderGroups(rows).map((group) => [group.label, group.tone, group.count])).toEqual([
      ["PO2611002 · 02/11/26 · Due 02/12/26", "neutral", 1],
      ["PO2611001 · 01/11/26 · Due 30/11/26", "neutral", 2],
    ]);
    expect(purchaseOrderTabs({ all: 3, open: 1, partlyPurchased: 2 }).map((tab) => `${tab.label} ${tab.count}`)).toEqual(["All 3", "Open 1", "Partly purchased 2"]);
    const html = view(props, state("ALL", data(rows)));
    expect(html).toContain(">Add Purchase Order</h2>");
    expect(html).toContain('placeholder="Search PO No., lot, stone, cer no."');
    expect(html).toContain('aria-label="Partly purchased, 2"');
    expect(html).not.toContain("bg-[#FAE6E4]");
    expect(numbers(html)).toEqual([1, 2, 3]);
  });

  it("cells: PO line, status with the ordered quantity, open quantity and the net price", () => {
    const html = view(props, state("ALL", data(rows)));
    expect(html).toContain(">Line 2</div>");
    expect(html).toContain(">L-PO-1</div>");
    expect(html).toContain(">Safe A</td>");
    expect(html).toContain('bg-[#EEF0F2] text-[#1C252E]">Open<');
    expect(html.match(/bg-\[#FDF1DC\] text-\[#B4540A\]">Partly purchased</g)).toHaveLength(2);
    expect(html).toContain("Ordered 10 pcs · 5.00 cts");
    expect(html).toContain(">6</div>");
    expect(html).toContain(">3.00 cts</div>");
    expect(html).toContain(">950.00</div>");
    expect(html).toContain("THB per cts");
    expect(html).toContain(">2,850.00</td>");
    expect(html).toContain('aria-label="Select line 2 of PO2611001"');
  });

  it("empty and filtered texts", () => {
    expect(purchaseOrderEmptyText("THB")("OPEN", false)).toBe("No open purchase order lines from this vendor in THB.");
    expect(view(props, state("ALL", data<PurchaseOrderLineRow>([])))).toContain("No open purchase order lines from this vendor in THB.");
    expect(purchaseOrderEmptyText("THB")("ALL", true)).toBe("Nothing matches your search.");
  });
});
