import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COLUMN_TONE, rowState, TABLE_HEAD, TABLE_ROW } from "@/features/trade-document/table-row";

/** UT-TBL-01 (owner table guide 2026-11-27): transaction table rows, states and column groups. */
describe("transaction table guide", () => {
  const css = readFileSync("src/app/globals.css", "utf8");

  it("rows are 56px with 8px padding, centred; the header is #E9EDED and 56px", () => {
    expect(TABLE_HEAD).toContain("bg-[#E9EDED]");
    expect(TABLE_ROW).toContain("gms-row");
    expect(css).toMatch(/\.gms-row > td \{ height: 56px; padding-top: 8px; padding-bottom: 8px; vertical-align: middle;/);
    expect(css).toContain(".gms-head > tr:only-child > th { height: 56px; }");
  });

  it("hover, checkbox active and active tints; active has the accent line, error a red one", () => {
    expect(css).toContain(".gms-row:hover { --gms-row-tint: rgb(19 146 137 / 0.04); }");
    expect(css).toContain(".gms-row[data-checked] { --gms-row-tint: rgb(19 146 137 / 0.11); }");
    expect(css).toContain(".gms-row[data-active] > td:first-child { box-shadow: inset 3px 0 0 #0E5A5F; }");
    expect(css).toContain(".gms-row[data-error] > td:first-child { box-shadow: inset 3px 0 0 #D9535C; }");
    // Active is declared after hover and checkbox active, so it wins; error after active replaces its line.
    expect(css.indexOf("[data-active] > td")).toBeLessThan(css.indexOf("[data-error] > td"));
  });

  it("rowState sets only the states that apply", () => {
    expect(rowState({ active: true })).toEqual({ "data-active": "", "data-checked": undefined, "data-error": undefined });
    expect(rowState({ checked: true, error: true })).toEqual({ "data-active": undefined, "data-checked": "", "data-error": "" });
  });

  it("column groups use the guide's 30 / 18 / 8% colours", () => {
    expect(COLUMN_TONE.neutral).toEqual({ head: "bg-[#E9EDED]", sub: "bg-[#F2F4F4]", body: "bg-[#FFFFFF]" });
    expect(COLUMN_TONE.red).toEqual({ head: "bg-[#F4CBCE]", sub: "bg-[#F8E0E2]", body: "bg-[#FCF1F2]" });
    expect(COLUMN_TONE.blue).toEqual({ head: "bg-[#C5D7F4]", sub: "bg-[#DCE7F8]", body: "bg-[#F0F4FC]" });
    expect(COLUMN_TONE.teal).toEqual({ head: "bg-[#B7CDCF]", sub: "bg-[#D4E1E2]", body: "bg-[#ECF2F2]" });
  });
});
