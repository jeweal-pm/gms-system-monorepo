import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ItemTable } from "@/features/quotation/components/items/ItemTable";
import { calculateTotals } from "@/features/quotation/lib/calculate";
import { emptyLine, emptyQuotation } from "@/features/quotation/lib/defaults";
import { invalidSaveMessage, lineErrorMessages } from "@/features/trade-document/document-form";

const noop = () => undefined;

/** UT-DOC-E1…E2 (INV-20261102-003): a failed Save says which row and what to fix, and marks the row in the table. */
describe("failed Save messages", () => {
  it("UT-DOC-E1 takes each row's first message and names the first bad row in the toast", () => {
    const rows = lineErrorMessages([undefined, { unitPrice: { message: "Enter the sale price" } }, { pcs: { message: "More than pending" }, weightCt: { message: "More than pending" } }], 4);
    expect(rows).toEqual([undefined, "Enter the sale price", "More than pending", undefined]);
    expect(invalidSaveMessage(rows)).toBe("Row 2: Enter the sale price");
    expect(invalidSaveMessage(lineErrorMessages(undefined, 3))).toBe("Please complete the required fields");
  });

  it("UT-DOC-E2 the item table marks a bad row and shows its message under it", () => {
    const lines = [{ ...emptyLine(), stone: "Ruby", pcs: "1", weightCt: "1", unitPrice: "" }, emptyLine()];
    const html = renderToStaticMarkup(createElement(ItemTable, {
      lines, currency: "THB", totals: calculateTotals({ ...emptyQuotation(), lines }), selectedIndex: null, checkedKeys: new Set<string>(), readOnly: false,
      onSelectRow: noop, onToggleCheck: noop, onToggleAll: noop, onRowAction: noop, onAddRow: noop,
      rowErrors: ["Enter the sale price", undefined],
    }));
    expect(html).toContain("Row 1: Enter the sale price");
    expect(html.match(/aria-invalid="true"/g)).toHaveLength(1);
  });
});
