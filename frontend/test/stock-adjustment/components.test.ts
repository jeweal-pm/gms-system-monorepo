import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AdjustmentTable, EMPTY_ROW_TEXT, GROUP_TONE, ROW_TONE, type AdjustmentTableProps } from "@/features/stock-adjustment/components/adjustment-table";
import { lineFromStock } from "@/features/stock-adjustment/form";

const row = { ...lineFromStock({ stockUuid: "b9b3adcf-0805-45ee-b578-54d0fd4ddfbb", stockId: "SA-01", lotKey: "OS-1", refDocNo: "LS-1", priceUnit: "PER_CT", onHandPcs: 3, onHandWeightCt: "1.120", stockPrice: "12.50", attrs: { stoneCode: "SC-1", stone: "Sapphire", shape: "Oval", size: "5 mm", color: "Blue", clarity: "VS1", cutting: "Good", quality: "A", lot: "L-1", location: "Safe A", cerType: "", cerNo: "" } }), key: "row-1" };

function render(overrides: Partial<AdjustmentTableProps> = {}) {
  const props: AdjustmentTableProps = { lines: [], editable: true, selected: new Set<string>(), onSelect: vi.fn(), onSelectAll: vi.fn(), onChange: vi.fn(), onRemove: vi.fn(), onPick: vi.fn(), ...overrides };
  return renderToStaticMarkup(createElement(AdjustmentTable, props));
}

describe("IT-SAJ-01 adjustment grouped table (owner images 01–03)", () => {
  it("shows the Stone Code sort header, Stock / Physical / Diff groups with Price in all three, REMARK and five empty rows", () => {
    const html = render();
    expect(html).toContain("Stone Code"); expect(html).toContain("STOCK ID · LOT"); expect(html).toContain('aria-sort="none"');
    for (const [group, label] of [["stock", "Stock"], ["physical", "Physical"], ["diff", "Diff"]] as const) { expect(html).toContain(">" + label + "<"); expect(html).toContain(GROUP_TONE[group].head); expect(html).toContain(GROUP_TONE[group].sub); }
    expect(html.match(/>Price</g)).toHaveLength(3); expect(html).toContain("REMARK");
    expect(html.match(new RegExp(EMPTY_ROW_TEXT, "g"))).toHaveLength(5);
    expect(html.match(/aria-label="Select empty row \d"[^>]*disabled=""/g)).toHaveLength(5);
    expect(html).not.toContain("Remove selected");
  });
  it("renders a picked row's three-line Stone Code, stock cts, placeholder-0 physical inputs, empty diffs and a Remark input", () => {
    const html = render({ lines: [row] });
    expect(html).toContain(">SC-1<"); expect(html).toContain("L-1 · LS-1"); expect(html).toContain("Sapphire · Oval · 5 mm · Safe A");
    expect(html).toContain("1.12 cts"); expect(html).toContain('aria-label="SA-01 Physical Pcs"'); expect(html).toContain('aria-label="SA-01 Physical Price"');
    expect(html.match(/placeholder="0"/g)).toHaveLength(3); expect(html).toContain('placeholder="Remark"');
    expect(html.match(/>–</g)).toHaveLength(2); // Pcs / Cts blank until counted; Price starts at the stock price expect(html.match(new RegExp(EMPTY_ROW_TEXT, "g"))).toHaveLength(4);
    expect(html).toContain('aria-label="Remove SA-01"'); expect(html).toContain(GROUP_TONE.physical.body);
  });
  it("tones selected and error rows, and locks inputs when read-only", () => {
    expect(render({ lines: [row], selected: new Set(["row-1"]) })).toContain(ROW_TONE.selected);
    const error = render({ lines: [row], rowErrors: { "row-1": "Enter whole pieces" } });
    expect(error).toContain(ROW_TONE.error); expect(error).toContain("Row 1: Enter whole pieces");
    const locked = render({ lines: [row], editable: false });
    expect(locked).toMatch(/aria-label="SA-01 Physical Pcs"[^>]*readOnly=""/); expect(locked).not.toContain(EMPTY_ROW_TEXT);
  });
});
