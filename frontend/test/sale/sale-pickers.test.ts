import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  NOT_CONNECTED,
  NOT_CONNECTED_DATA,
  RESERVE_LINE_COLUMNS,
  reserveLinePickerProps,
  ReserveLinePickerDialog,
  STOCK_COLUMNS,
  stockPickerProps,
  StockPickerDialog,
} from "@/features/sale/components/sale-pickers";
import { StockPickerView, type PickerData, type PickerViewState, type StockPickerProps } from "@/features/trade-document/stock-picker";
import { RESERVE_LINE, reserveLine, STOCK, stockItem } from "./fixtures";

/**
 * IT-SL-03 / IT-SL-04 (UI only, owner 2026-11-18): Add From Reserve and Add From Stock on the shared shell. Without the
 * Sale API they open empty with the not-connected text; with `data` (FE-SL-004/005) they list rows and leave out the
 * ones already on the document. Rows here are typed test fixtures only.
 */

const handlers = { onTab: () => undefined, onSearch: () => undefined, onFrom: () => undefined, onTo: () => undefined, onToggleGroup: () => undefined, onToggleRow: () => undefined, onToggleAll: () => undefined, onOk: () => undefined };
const view = <R,>(props: StockPickerProps<R, "ALL">, data: PickerData<R>, patch: Partial<PickerViewState<R, "ALL">> = {}) =>
  renderToStaticMarkup(
    createElement(StockPickerView<R, "ALL">, {
      props,
      state: { tab: "ALL", search: "", from: "", to: "", collapsed: new Set<string>(), checked: new Map<string, R>(), data, filtered: false, ...patch },
      on: handlers,
    }),
  ).replaceAll("&#x27;", "'").replaceAll("&amp;", "&");
const loaded = <R,>(rows: R[]): PickerData<R> => ({ ...NOT_CONNECTED_DATA, rows });
const scope = { excluded: new Set<string>(), onCancel: () => undefined, onConfirm: () => undefined };

describe("IT-SL-03 Add From Reserve (P-01)", () => {
  it("title, search, Start → Due and the spec columns; empty and not connected without the API", () => {
    const props = reserveLinePickerProps({ ...scope, currency: "THB" });
    expect(props.title).toBe("Add From Reserve");
    expect(props.searchPlaceholder).toBe("Search Reserve No., Stock ID, Lot, Stone, Cer No.");
    expect(props.dateLabels).toEqual({ from: "Start", to: "Due" });
    expect(RESERVE_LINE_COLUMNS.map((column) => column.title)).toEqual(["Reserve No.", "Stone Code", "Location", "Stone", "Color", "Clarity", "Cer Type", "Open Pcs", "Open Weight", "Sale Price", "Amount"]);
    const html = view(props, NOT_CONNECTED_DATA);
    expect(html).toContain("Add From Reserve");
    expect(html).toContain(`${NOT_CONNECTED}. Open reserve lines appear here once Sale is connected.`);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>OK<\/button>/);
    expect(html).toContain(">Cancel<");
  });

  it("connected: lists rows with the Reserve No., leaves out lines on the document, and uses the spec empty text", () => {
    const props = reserveLinePickerProps({ ...scope, currency: "USD", connected: true });
    const html = view(props, loaded([reserveLine()]));
    expect(html).toContain("RS-26110001");
    expect(html).toContain("260003");
    expect(html).toContain("12500.4567 / ct");
    const excluded = view(reserveLinePickerProps({ ...scope, currency: "USD", connected: true, excluded: new Set([RESERVE_LINE]) }), loaded([reserveLine()]));
    expect(excluded).not.toContain("RS-26110001");
    expect(excluded).toContain("No open reservations for this customer in USD.");
  });

  it("the dialog without data renders the not-connected state", () => {
    const html = renderToStaticMarkup(createElement(ReserveLinePickerDialog, { ...scope, currency: "THB" }));
    expect(html).toContain("Open reserve lines appear here once Sale is connected.");
  });
});

describe("IT-SL-04 Add From Stock (P-02 phase 1 UI)", () => {
  it("title, columns without prices, not-connected empty state; connected rows show the Memo Receive No.", () => {
    const props = stockPickerProps(scope);
    expect(props.title).toBe("Add From Stock");
    expect(STOCK_COLUMNS.some((column) => /price|amount/i.test(column.title))).toBe(false);
    expect(view(props, NOT_CONNECTED_DATA)).toContain(`${NOT_CONNECTED}. Stock appears here once Sale is connected.`);
    const html = view(stockPickerProps({ ...scope, connected: true }), loaded([stockItem()]));
    expect(html).toContain("260009");
    expect(html).toContain("MR-26100012");
    expect(view(stockPickerProps({ ...scope, connected: true, excluded: new Set([STOCK]) }), loaded([stockItem()]))).toContain("No stock with anything pending.");
    expect(renderToStaticMarkup(createElement(StockPickerDialog, scope))).toContain("Stock appears here once Sale is connected.");
  });
});
