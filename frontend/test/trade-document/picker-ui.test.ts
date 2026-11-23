import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  PickerChip,
  PickerDialog,
  PickerFooter,
  PickerGroupSubTh,
  PickerGroupTh,
  PickerLot,
  PickerNote,
  PickerTh,
  pickerGroupHover,
  pickerGroupTone,
  pickerRowClass,
} from "@/features/trade-document/picker-ui";

/**
 * UT-PK-01..06 (owner 2026-11-20, designs 135–148 on the table design system 136): the shared look of the item pickers
 * (Quotation / Sale / Memo Out From Stock, Memo Return, Memo Outstanding, Purchase Memo Stock and Purchase Order, Load
 * to Stock From Purchase, Sale From Reserve).
 */

const html = (element: ReactElement) => renderToStaticMarkup(element);
const inRow = (cell: ReactElement) => html(createElement("table", null, createElement("thead", null, createElement("tr", null, cell))));

describe("UT-PK-01 row states (design 136 §1)", () => {
  it("default white with the #F6FAFA hover; ticked #E5F3F2 without hover", () => {
    expect(pickerRowClass(false)).toBe("cursor-pointer border-b border-gms-border bg-white hover:bg-gms-row-hover");
    expect(pickerRowClass(true)).toBe("cursor-pointer border-b border-gms-border bg-gms-row-active");
  });
});

describe("UT-PK-02 header cell", () => {
  it("two lines with the sort glyph; capitals only where asked; sub-label in capitals unless plain", () => {
    const upper = inRow(createElement(PickerTh, { title: "Stone", sub: "Shape · Size", upper: true }));
    expect(upper).toContain('<span class="block text-sm uppercase">Stone</span>');
    expect(upper).toContain('<span class="mt-0.5 block text-xs font-normal text-gms-text-muted uppercase">Shape · Size</span>');
    expect(upper).toContain("lucide-chevrons-up-down");
    const plain = inRow(createElement(PickerTh, { title: "PO No.", sub: "Doc Date", plainSub: true }));
    expect(plain).toContain('<span class="block text-sm">PO No.</span>');
    expect(plain).toContain('<span class="mt-0.5 block text-xs font-normal text-gms-text-muted">Doc Date</span>');
  });

  it("right-aligned numbers put the glyph before the label; rowSpan passes through", () => {
    const right = inRow(createElement(PickerTh, { title: "Amount", right: true, rowSpan: 2 }));
    expect(right).toContain('rowSpan="2"');
    expect(right).toContain("text-right");
    expect(right).toContain("flex-row-reverse");
  });
});

describe("UT-PK-03 column groups (design 136 §2)", () => {
  it("tones map to the 30 / 18 / 8 % tokens", () => {
    expect(pickerGroupTone.orange).toEqual({ head: "bg-gms-group-orange-head", sub: "bg-gms-group-orange-sub", cell: "bg-gms-group-orange-cell" });
    expect(pickerGroupTone.green.head).toBe("bg-gms-group-green-head");
    expect(pickerGroupTone.red.cell).toBe("bg-gms-group-red-cell");
  });

  it("group title spans its sub-columns in capitals; sub-headers are right-aligned with the 18 % tint", () => {
    const head = inRow(createElement(PickerGroupTh, { title: "Pending", span: 2, tone: "orange" }));
    expect(head).toContain('scope="colgroup" colSpan="2"');
    expect(head).toContain('uppercase bg-gms-group-orange-head">Pending</th>');
    const sub = inRow(createElement(PickerGroupSubTh, { title: "Pcs", tone: "green" }));
    expect(sub).toContain('text-right text-sm font-medium bg-gms-group-green-sub">Pcs</th>');
  });
});

describe("UT-SC-10 purple BALANCE group (stock-card FE-SC-001)", () => {
  it("the purple tone maps to the 30 / 18 / 8 % tokens and existing tones are unchanged", () => {
    expect(pickerGroupTone.purple).toEqual({ head: "bg-gms-group-purple-head", sub: "bg-gms-group-purple-sub", cell: "bg-gms-group-purple-cell" });
    expect(Object.keys(pickerGroupTone).sort()).toEqual(["green", "orange", "purple", "red"]);
    expect(pickerGroupTone.orange).toEqual({ head: "bg-gms-group-orange-head", sub: "bg-gms-group-orange-sub", cell: "bg-gms-group-orange-cell" });
    expect(inRow(createElement(PickerGroupTh, { title: "Balance", span: 2, tone: "purple" }))).toContain('uppercase bg-gms-group-purple-head">Balance</th>');
    expect(inRow(createElement(PickerGroupSubTh, { title: "Cts", tone: "purple" }))).toContain('bg-gms-group-purple-sub">Cts</th>');
  });

  it("hover tints exist for the IN / OUT / BALANCE cells only and need the row to carry group/row; the row class itself is unchanged", () => {
    expect(pickerGroupHover).toEqual({
      green: "group-hover/row:bg-gms-group-green-hover",
      orange: "group-hover/row:bg-gms-group-orange-hover",
      purple: "group-hover/row:bg-gms-group-purple-hover",
    });
    expect(pickerGroupHover.red).toBeUndefined();
    expect(pickerRowClass(false)).not.toContain("group/row");
  });
});

describe("UT-PK-04 chips and note", () => {
  it("lot is the yellow chip (AA warning tokens); Cer Type the light chip", () => {
    expect(html(createElement(PickerLot, null, "L-2608-003"))).toContain("bg-gms-warning-subtle");
    expect(html(createElement(PickerLot, null, "L-2608-003"))).toContain("text-gms-warning-text\">L-2608-003</span>");
    expect(html(createElement(PickerChip, null, "GIA"))).toContain('bg-[#EEF0F2]');
  });

  it("note shows the speech icon and text; nothing without text", () => {
    expect(html(createElement(PickerNote, { text: "Unheated" }))).toMatch(/lucide-message-square[^]*Unheated/);
    expect(html(createElement(PickerNote, { text: "" }))).toBe("");
    expect(html(createElement(PickerNote, { text: null }))).toBe("");
  });
});

describe("UT-PK-05 footer", () => {
  it("OK is disabled and grey until something is ticked; then primary with the count", () => {
    const none = html(createElement(PickerFooter, { count: 0, onCancel: vi.fn(), onOk: vi.fn() }));
    expect(none).toMatch(/<button[^>]*disabled=""[^>]*>OK<\/button>/);
    expect(none).toContain("disabled:bg-gms-surface-sunken");
    expect(none).not.toContain("selected");
    const two = html(createElement(PickerFooter, { count: 2, onCancel: vi.fn(), onOk: vi.fn() }));
    expect(two).not.toMatch(/disabled=""[^>]*>OK/);
    expect(two).toContain("bg-[#0E5E63]");
    expect(two).toContain(">2 selected</span>");
    expect(two.indexOf(">Cancel<")).toBeLessThan(two.indexOf(">OK<"));
  });
});

describe("UT-PK-06 dialog shell", () => {
  it("modal dialog labelled by its title with ✕; 1632 × 1000 within the viewport", () => {
    const markup = html(createElement(PickerDialog, { titleId: "t1", title: "Memo Outstanding", onClose: vi.fn() }, createElement("p", null, "body")));
    expect(markup).toContain('role="dialog" aria-modal="true" aria-labelledby="t1"');
    expect(markup).toContain('<h2 id="t1" class="text-lg font-medium text-[#1C252E]">Memo Outstanding</h2>');
    expect(markup).toContain('aria-label="Close"');
    expect(markup).toContain("h-[min(1000px,calc(100vh_-_48px))] w-[min(1632px,calc(100vw_-_48px))]");
    expect(markup).toContain("<p>body</p>");
  });
});
