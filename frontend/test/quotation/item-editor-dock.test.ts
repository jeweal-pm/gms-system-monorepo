import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ItemEditorDock } from "@/features/quotation/components/items/ItemEditorPanel";

/**
 * UT-ITEM-DOCK-01/02 (owner design 2026-11-13): the row editor docks at the top right of the Item card in every
 * document form, so the header and info form keep their width, and it sticks to the top and reaches the window bottom.
 */
describe("item editor dock", () => {
  it("UT-ITEM-DOCK-01 renders a sticky box flush with the card's top/right edges, filling the visible height before measuring", () => {
    const html = renderToStaticMarkup(createElement(ItemEditorDock, null, createElement("aside", null, "editor")));
    expect(html).toContain("data-item-editor-dock");
    expect(html).toContain("sticky top-0 -my-6 -mr-6 h-[calc(100dvh-84px)] shrink-0 self-start overflow-hidden rounded-r-gms-md");
    expect(html).toContain("<aside>editor</aside>");
  });

  it("UT-ITEM-DOCK-02 every form opens the editor inside its Item card (ItemEditorDock), not beside the page", () => {
    for (const file of [
      "src/features/quotation/components/QuotationForm.tsx",
      "src/features/trade-document/document-form.tsx",
      "src/features/memo-receive/components/MemoReceiveForm.tsx",
      "src/features/purchase-order/components/PurchaseOrderForm.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      const card = source.indexOf("rounded-gms-md bg-gms-surface mt-4 mb-6 flex gap-4 px-6 py-6");
      const dock = source.indexOf("<ItemEditorDock>");
      expect(card, file).toBeGreaterThan(0);
      expect(dock, file).toBeGreaterThan(card);
      expect(source, file).not.toMatch(/<div className="h-full">\s*<ItemEditorPanel/);
    }
  });
});
