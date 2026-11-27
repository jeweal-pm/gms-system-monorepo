import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ItemTable } from "@/features/quotation/components/items/ItemTable";
import { DISCARD_CHANGES_CONFIRM, deleteDocumentConfirm, useConfirm } from "@/features/quotation/components/use-confirm";
import { calculateTotals } from "@/features/quotation/lib/calculate";
import { emptyLine, emptyQuotation } from "@/features/quotation/lib/defaults";

/** Owner 2026-11-04: transaction pages confirm with the app modal (no `window.confirm`); error rows hover/select as one. */

const noop = () => {};

function table(selectedIndex: number | null) {
  const lines = [emptyLine(), emptyLine(), emptyLine()];
  return renderToStaticMarkup(
    createElement(ItemTable, {
      lines,
      currency: "THB",
      totals: calculateTotals({ ...emptyQuotation(), lines }),
      selectedIndex,
      checkedKeys: new Set<string>(),
      readOnly: false,
      rowErrors: ["Enter the sale price", undefined, "Enter the sale price"],
      onSelectRow: noop,
      onToggleCheck: noop,
      onToggleAll: noop,
      onRowAction: noop,
      onAddRow: noop,
    }),
  );
}

const bodies = (html: string) => html.match(/<tbody[\s\S]*?<\/tbody>/g) ?? [];

describe("Transaction confirm modal", () => {
  it("UT-QT-CONF-01 delete and discard texts", () => {
    expect(deleteDocumentConfirm("QT-1001")).toMatchObject({ title: "Delete QT-1001?", cancelLabel: "Keep document", confirmLabel: "Delete" });
    expect(deleteDocumentConfirm(undefined).title).toBe("Delete this document?");
    expect(DISCARD_CHANGES_CONFIRM).toMatchObject({ title: "Discard unsaved changes?", cancelLabel: "Keep editing", confirmLabel: "Discard" });
  });

  it("UT-QT-CONF-02 the hook renders the app's modal dialog, closed until asked", () => {
    function Probe() {
      return useConfirm().dialog;
    }
    const html = renderToStaticMarkup(createElement(Probe));
    expect(html).toContain("<dialog");
    expect(html).not.toMatch(/<dialog[^>]* open/);
  });

  it("UT-QT-CONF-03 Quotation, trade documents and Memo Receive no longer call window.confirm", () => {
    for (const file of [
      "src/features/quotation/components/QuotationForm.tsx",
      "src/features/trade-document/document-form.tsx",
      "src/features/memo-receive/components/MemoReceiveForm.tsx",
    ]) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source, file).not.toContain("window.confirm");
      expect(source, file).toContain("useConfirm()");
    }
  });
});

describe("Item table error rows", () => {
  it("UT-QT-ROW-01 (table guide 2026-11-27) an error row keeps its background and gets a red left line, its error line too", () => {
    const parts = bodies(table(null));
    expect(parts).toHaveLength(3);
    for (const index of [0, 2]) {
      expect(parts[index]).toMatch(/class="cursor-pointer gms-row[^"]*" data-error=""/);
      expect(parts[index]).toContain("shadow-[inset_3px_0_0_#D9535C]");
      expect(parts[index]).not.toContain("#FDECEC");
    }
    expect(parts[1]).not.toContain("data-error");
  });

  it("UT-QT-ROW-02 (table guide 2026-11-27) the selected row is active; an active error row keeps both markers (CSS draws the red line)", () => {
    const [first = ""] = bodies(table(0));
    expect(first).toMatch(/data-active="" data-error=""/);
    expect(bodies(table(1))[1]).toContain('data-active=""');
    expect(bodies(table(1))[0]).not.toContain("data-active");
  });
});
