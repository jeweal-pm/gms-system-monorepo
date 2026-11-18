import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import * as shell from "@/features/trade-document/stock-picker";
import { StockPickerView, type PickerData, type PickerViewState, type StockPickerProps } from "@/features/trade-document/stock-picker";

/**
 * sale FE-SL-001 (IT-SL-01 support): the picker shell lives in `trade-document/` so a non-Purchase document (Sale's Add
 * From Reserve, FE-SL-004) can build on it. A flat, tab-less list renders with its own rows, excludes rows already on
 * the document, and keeps OK disabled until a row is ticked. Purchase behaviour stays covered by test/purchase/**.
 */

type Row = { id: string; docNo: string; stockId: string };
const rows: Row[] = [
  { id: "a", docNo: "RS-1", stockId: "260001" },
  { id: "b", docNo: "RS-1", stockId: "260002" },
  { id: "c", docNo: "RS-2", stockId: "260003" },
];
const data = (list: Row[], patch: Partial<PickerData<Row>> = {}): PickerData<Row> => ({
  rows: list, isPending: false, isError: false, error: null, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: () => undefined, ...patch,
});
const props = (excluded: string[] = []): StockPickerProps<Row, "ALL"> => ({
  title: "Add From Reserve",
  tabs: [],
  flat: true,
  searchPlaceholder: "Search Reserve No., Stock ID",
  searchLabel: "Search reserve lines",
  dateLabels: { from: "Start", to: "Due" },
  columns: [{ title: "Reserve No." }, { title: "Stock ID" }],
  groups: (list) => [{ id: "ALL", label: "All", count: list.length, tone: "neutral", rows: list }],
  rowKey: (row) => row.id,
  rowLabel: (row) => row.stockId,
  cells: (row) => [createElement("td", { key: "doc" }, row.docNo), createElement("td", { key: "stock" }, row.stockId)],
  emptyText: (_tab, filtered) => (filtered ? "No matches." : "No open reservations."),
  loadError: () => "Couldn't load reserve lines.",
  excluded: new Set(excluded),
  onCancel: () => undefined,
  onConfirm: () => undefined,
});
const state = (list: PickerData<Row>, patch: Partial<PickerViewState<Row, "ALL">> = {}): PickerViewState<Row, "ALL"> => ({
  tab: "ALL", search: "", from: "", to: "", collapsed: new Set(), checked: new Map(), data: list, filtered: false, ...patch,
});
const on = { onTab: () => undefined, onSearch: () => undefined, onFrom: () => undefined, onTo: () => undefined, onToggleGroup: () => undefined, onToggleRow: () => undefined, onToggleAll: () => undefined, onOk: () => undefined };
const view = (p: StockPickerProps<Row, "ALL">, s: PickerViewState<Row, "ALL">) =>
  renderToStaticMarkup(createElement(StockPickerView<Row, "ALL">, { props: p, state: s, on })).replaceAll("&#x27;", "'").replaceAll("&amp;", "&");
const okButton = (html: string) => /<button[^>]*>(?:(?!<\/button>).)*>OK<(?:(?!<\/button>).)*<\/button>|<button[^>]*>OK<\/button>/.exec(html)?.[0] ?? "";

describe("UT-SL-01a shared stock picker shell (FE-SL-001)", () => {
  it("exports the shell under neutral names and no Purchase-named component", () => {
    expect(typeof shell.StockPicker).toBe("function");
    expect(typeof shell.StockPickerView).toBe("function");
    expect(typeof shell.usePickerFilters).toBe("function");
    expect(Object.keys(shell).some((name) => name.startsWith("Purchase"))).toBe(false);
  });

  it("flat list without tabs: title, rows in order, excluded rows left out, OK disabled until a row is ticked", () => {
    const html = view(props(["b"]), state(data(rows)));
    expect(html).toContain("Add From Reserve");
    expect(html).toContain('role="dialog"');
    expect(html).not.toContain('role="tablist"');
    expect(html).toContain("260001");
    expect(html).toContain("260003");
    expect(html).not.toContain("260002");
    expect(okButton(html)).toContain('disabled=""');
    const ticked = view(props(), state(data(rows), { checked: new Map([["a", rows[0]!]]) }));
    expect(okButton(ticked)).not.toContain('disabled=""');
    expect(ticked).toContain("1 selected");
  });

  it("empty, filtered-empty and error states use the picker's own texts", () => {
    expect(view(props(), state(data([])))).toContain("No open reservations.");
    expect(view(props(), state(data([]), { filtered: true }))).toContain("No matches.");
    expect(view(props(), state(data([], { isError: true, error: new Error("x") })))).toContain("Couldn't load reserve lines.");
  });
});
