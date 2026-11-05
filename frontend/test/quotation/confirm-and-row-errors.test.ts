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
  it("UT-QT-ROW-01 each row and its error line share one tbody that hovers together", () => {
    const parts = bodies(table(null));
    expect(parts).toHaveLength(3);
    for (const index of [0, 2]) {
      expect(parts[index]).toContain('class="group/line"');
      expect(parts[index].match(/bg-\[#FDECEC\] group-hover\/line:bg-\[#FBE0E0\]/g)).toHaveLength(2);
      expect(parts[index]).not.toContain("hover:bg-[#FAFBFB]");
    }
    expect(parts[1]).toContain("hover:bg-[#FAFBFB]");
    expect(parts[1]).not.toContain("#FDECEC");
  });

  it("UT-QT-ROW-02 a selected error row stays red with its error line, not teal", () => {
    const [first = "", second = ""] = bodies(table(0));
    expect(first.match(/bg-\[#F9D7D7\]/g)).toHaveLength(2);
    expect(first).not.toContain("bg-[#E6F1F1]");
    expect(bodies(table(1))[1]).toContain("bg-[#E6F1F1]");
    expect(second).not.toContain("bg-[#F9D7D7]");
  });
});
