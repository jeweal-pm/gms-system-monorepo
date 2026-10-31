import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { defaultColumnWidths, EXPAND_WIDTH, FALLBACK_TABLE_WIDTH, stickyOffsets } from "@/features/memo-outstanding-vendor/components/column-resize";
import { OutstandingTable, tableColumns } from "@/features/memo-outstanding-vendor/components/outstanding-table";
import { DEFAULT_VIEW } from "@/features/memo-outstanding-vendor/model";
import { item, row } from "./fixtures";

const noop = () => undefined;
const html = (type: unknown, props: object) => renderToStaticMarkup(createElement(type as FunctionComponent<object>, props));
const sum = (widths: Record<string, number>, keys: readonly string[]) => keys.reduce((total, key) => total + widths[key], 0);

/** UT-MOV-F3: resizable columns, 30% info / 70% numbers by default, state only (owner note 2026-10-30). */
describe("UT-MOV-F3 column widths", () => {
  const all = tableColumns(["memo", "return", "sold", "reserve", "outstanding"], true);
  const info = ["expand", "docNo", "dueDate", "vendor"];

  it("lists expand · Doc · Due · Vendor, Pcs / Weight per shown group, then Price", () => {
    expect(tableColumns(["memo", "outstanding"], false).map((column) => column.key)).toEqual(["expand", "docNo", "dueDate", "vendor", "memo.pcs", "memo.weight", "outstanding.pcs", "outstanding.weight"]);
    expect(all.at(-1)?.key).toBe("price");
  });

  it("splits a wide table 30% info / 70% numbers", () => {
    const widths = defaultColumnWidths(all, 2000);
    expect(widths.expand).toBe(EXPAND_WIDTH);
    const total = sum(widths, all.map((column) => column.key));
    expect(Math.abs(sum(widths, info) / total - 0.3)).toBeLessThan(0.01);
    expect(widths["memo.pcs"]).toBe(widths["sold.pcs"]);
    expect(widths.price).toBeGreaterThan(widths["memo.weight"]);
  });

  it("keeps readable minimums on a narrow table (it scrolls sideways) and uses a fallback width before measuring", () => {
    const narrow = defaultColumnWidths(all, 600);
    expect(narrow.vendor).toBeGreaterThanOrEqual(150);
    expect(narrow["memo.pcs"]).toBeGreaterThanOrEqual(64);
    expect(defaultColumnWidths(all, 0)).toEqual(defaultColumnWidths(all, FALLBACK_TABLE_WIDTH));
  });

  it("frozen columns start where the previous one ends", () => {
    expect(stickyOffsets(all, { expand: 40, docNo: 120, dueDate: 100, vendor: 200 }, 4)).toEqual([0, 40, 160, 260]);
  });

  it("renders a fixed-layout table with one col per column and a resize handle per resizable header", () => {
    const markup = html(OutstandingTable, {
      entries: [{ row: row(), items: [item()] }],
      prefs: DEFAULT_VIEW,
      sort: { key: "dueDate", dir: "asc" },
      onSort: noop,
      isOpen: () => true,
      onToggleOpen: noop,
      itemsLoading: false,
      itemsError: false,
      onRetryItems: noop,
      selected: new Set(),
      onToggleItem: noop,
    });
    expect(markup).toContain("table-fixed");
    expect(markup.match(/<col /g)).toHaveLength(all.length);
    expect(markup.match(/role="separator"/g)).toHaveLength(all.length - 1);
    expect(markup).toContain('aria-label="Resize Vendor Name column"');
    expect(markup).toContain("cursor-col-resize");
    // Design 2026-10-31: group headings centred over Pcs / Weight (no text-left on them); Pcs / Weight right, dark 14 px.
    const groups = [...markup.matchAll(/<th[^>]*scope="colgroup"[^>]*class="([^"]*)"/g)].map((m) => m[1]);
    expect(groups).toHaveLength(5);
    for (const cls of groups) {
      expect(cls).toContain("text-center");
      expect(cls).not.toContain("text-left");
    }
    const subHeads = [...markup.matchAll(/<th scope="col" class="([^"]*)">(?:Pcs|Weight)/g)].map((m) => m[1]);
    expect(subHeads).toHaveLength(10);
    for (const cls of subHeads) expect(cls).toMatch(/text-right.*text-gms-body.*text-gms-text(?!-)/);
  });
});
