import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { saleKeys } from "@/features/sale/api";
import { RESERVE_LINE_COLUMNS, reserveLinePickerProps, ReserveLinePicker } from "@/features/sale/components/sale-pickers";
import { StockPickerView, type PickerData, type PickerViewState, type StockPickerProps } from "@/features/trade-document/stock-picker";
import { ID, RESERVE_LINE, reserveLine } from "./fixtures";

/**
 * IT-SL-03 (FE-SL-004): Add From Reserve on the shared shell over `GET /sale/reserve-lines`: spec columns, search and
 * Start → Due, the Reserve No. and price per row, lines on the document left out, empty / filtered / error texts, and
 * the live dialog reading its query (seeded under the real key, nothing fetched).
 */

const handlers = { onTab: () => undefined, onSearch: () => undefined, onFrom: () => undefined, onTo: () => undefined, onToggleGroup: () => undefined, onToggleRow: () => undefined, onToggleAll: () => undefined, onOk: () => undefined };
const decode = (html: string) => html.replaceAll("&#x27;", "'").replaceAll("&amp;", "&");
const view = <R,>(props: StockPickerProps<R, "ALL">, data: PickerData<R>, patch: Partial<PickerViewState<R, "ALL">> = {}) =>
  decode(
    renderToStaticMarkup(
      createElement(StockPickerView<R, "ALL">, {
        props,
        state: { tab: "ALL", search: "", from: "", to: "", collapsed: new Set<string>(), checked: new Map<string, R>(), data, filtered: false, ...patch },
        on: handlers,
      }),
    ),
  );
const data = <R,>(rows: R[], patch: Partial<PickerData<R>> = {}): PickerData<R> => ({
  rows, isPending: false, isError: false, error: null, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: () => undefined, ...patch,
});
const scope = { currency: "USD", excluded: new Set<string>(), onCancel: () => undefined, onConfirm: () => undefined };

describe("IT-SL-03 Add From Reserve (P-01)", () => {
  it("title, search, Start → Due and the spec columns", () => {
    const props = reserveLinePickerProps(scope);
    expect(props.title).toBe("Add From Reserve");
    expect(props.searchPlaceholder).toBe("Search Reserve No., Stock ID, Lot, Stone, Cer No.");
    expect(props.dateLabels).toEqual({ from: "Start", to: "Due" });
    expect(RESERVE_LINE_COLUMNS.map((column) => column.title)).toEqual(["Reserve No.", "Stone Code", "Location", "Stone", "Color", "Clarity", "Cer Type", "Open Pcs", "Open Weight", "Sale Price", "Amount"]);
  });

  it("rows show the Reserve No., dates, Stock ID, open quantity and price; OK disabled until a row is ticked", () => {
    const html = view(reserveLinePickerProps(scope), data([reserveLine()]));
    expect(html).toContain("RS-26110001");
    expect(html).toContain("260003");
    expect(html).toContain("12500.4567 / ct");
    expect(html).toContain("17000.62");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>OK<\/button>/);
    const ticked = view(reserveLinePickerProps(scope), data([reserveLine()]), { checked: new Map([[RESERVE_LINE, reserveLine()]]) });
    expect(ticked).not.toMatch(/<button[^>]*disabled=""[^>]*>OK<\/button>/);
  });

  it("empty (names the currency), filtered, excluded and error states", () => {
    expect(view(reserveLinePickerProps(scope), data([]))).toContain("No open reservations for this customer in USD.");
    expect(view(reserveLinePickerProps(scope), data([]), { filtered: true })).toContain("Nothing matches your search.");
    expect(view(reserveLinePickerProps({ ...scope, excluded: new Set([RESERVE_LINE]) }), data([reserveLine()]))).toContain("No open reservations for this customer in USD.");
    expect(view(reserveLinePickerProps(scope), data([], { isError: true, error: new Error("x") }))).toContain("Couldn't load the reserve lines. Try again.");
  });

  it("the live dialog reads GET /sale/reserve-lines for the customer, currency and picked lines", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });
    queryClient.setQueryData(saleKeys.reserveLines({ customerId: ID, currency: "USD", q: "", from: "", to: "", exclude: [] }), { pages: [{ items: [reserveLine()], nextCursor: "c2" }], pageParams: [null] });
    const html = decode(renderToStaticMarkup(createElement(QueryClientProvider, { client: queryClient }, createElement(ReserveLinePicker, { ...scope, customerId: ID }))));
    expect(html).toContain("RS-26110001");
    expect(html).toContain("Load more");
  });
});
