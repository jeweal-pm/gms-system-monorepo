import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * UT-ITEM-ROWKEY-01 (owner 2026-11-16 bug): moving the row editor to another row kept the previous row's PCS / Weight /
 * Sale Price / Note on screen (register()ed inputs reused under the other row's names; Save was right). The editor's
 * fields are keyed by the row, so each row gets fresh inputs, while the scroll box stays (its scroll position kept).
 * Shared by Quotation, Reserve, Memo Out, Purchase (document-form), Memo Receive and Purchase Order.
 * Browser check (2026-11-16): row 1 10/100/1000, row 2 50/60/7894, back to row 1 → 10/100/1000 (was 50/60/7894).
 */
describe("row editor fields follow the selected row", () => {
  it("UT-ITEM-ROWKEY-01 the fields sit in a box keyed by the row inside the unkeyed scroll box", () => {
    const source = readFileSync("src/features/quotation/components/items/ItemEditorPanel.tsx", "utf8");
    const scroll = source.indexOf('<fieldset disabled={readOnly} className="min-h-0 flex-1 overflow-y-auto px-5 py-2">');
    const keyed = source.indexOf('<div key={line?.key ?? index} data-editor-row={index} className="space-y-1">');
    const firstField = source.indexOf('register(name("pcs")');
    expect(scroll).toBeGreaterThan(0);
    expect(keyed).toBeGreaterThan(scroll);
    expect(firstField).toBeGreaterThan(keyed);
    expect(source.slice(scroll, keyed)).not.toContain("key=");
  });
});
