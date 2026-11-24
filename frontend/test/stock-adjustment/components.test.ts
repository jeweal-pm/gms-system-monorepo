import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AdjustmentTable } from "@/features/stock-adjustment/components/adjustment-table";
import { lineFromStock } from "@/features/stock-adjustment/form";

const row = lineFromStock({ stockUuid: "b9b3adcf-0805-45ee-b578-54d0fd4ddfbb", stockId: "SA-01", lotKey: "OS-1", refDocNo: "LS-1", priceUnit: "PER_CT", onHandPcs: 3, onHandWeightCt: "1.120", stockPrice: "12.50", attrs: { stoneCode: "SC-1", stone: "Sapphire", shape: "Oval", size: "5 mm", color: "Blue", clarity: "VS1", cutting: "Good", quality: "A", lot: "L-1", location: "Safe A", cerType: "", cerNo: "" } });

describe("IT-SAJ-01 adjustment grouped table", () => {
  it("shows grouped Stock / Physical / Diff price columns and five empty rows", () => {
    const html = renderToStaticMarkup(createElement(AdjustmentTable, { lines: [], editable: true, selected: new Set<string>(), onSelect: vi.fn(), onChange: vi.fn(), onRemove: vi.fn(), onPick: vi.fn() }));
    expect(html).toContain("Stock"); expect(html).toContain("Physical"); expect(html).toContain("Diff");
    expect(html.match(/Empty row · click to pick from stock/g)).toHaveLength(5);
    expect(html.match(/>Price<|>Price<\/th>/g)).toHaveLength(3);
  });
  it("renders a picked row's details, empty diffs and editable physical inputs", () => {
    const html = renderToStaticMarkup(createElement(AdjustmentTable, { lines: [row], editable: true, selected: new Set<string>(), onSelect: vi.fn(), onChange: vi.fn(), onRemove: vi.fn(), onPick: vi.fn() }));
    expect(html).toContain("SA-01"); expect(html).toContain("1.12 cts"); expect(html).toContain("aria-label=\"SA-01 Physical Pcs\"");
    expect(html).toContain("aria-label=\"SA-01 Physical Price\""); expect(html).toContain(">–<");
  });
});
