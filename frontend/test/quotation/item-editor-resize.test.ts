import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { clampEditorWidth, EDITOR_WIDTH_DEFAULT, EDITOR_WIDTH_MAX, EDITOR_WIDTH_MIN, ItemEditorDock } from "@/features/quotation/components/items/ItemEditorPanel";

/** UT-ITEM-RESIZE-01/02 (owner 2026-11-16): the row editor can be dragged narrower from its left edge, never wider. */
describe("item editor resize (narrow only)", () => {
  it("UT-ITEM-RESIZE-01 the width stays between 340 px and the designed 460 px", () => {
    expect([EDITOR_WIDTH_DEFAULT, EDITOR_WIDTH_MIN, EDITOR_WIDTH_MAX]).toEqual([460, 340, 460]);
    expect(clampEditorWidth(400)).toBe(400);
    expect(clampEditorWidth(700)).toBe(460); // never wider than designed
    expect(clampEditorWidth(100)).toBe(340);
    expect(clampEditorWidth(Number.NaN)).toBe(460);
    expect(clampEditorWidth(412.6)).toBe(413);
  });

  it("UT-ITEM-RESIZE-02 a focusable separator with a grip on the left edge; at full width it can only narrow", () => {
    const html = renderToStaticMarkup(createElement(ItemEditorDock, null, createElement("aside", null, "editor")));
    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-orientation="vertical"');
    expect(html).toContain('aria-label="Resize the item editor"');
    expect(html).toContain('aria-valuemin="340"');
    expect(html).toContain('aria-valuemax="460"');
    expect(html).toContain('aria-valuenow="460"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("cursor-e-resize"); // designed width: the only way is narrower
    expect(html).toContain("data-editor-grip");
    // Owner 2026-11-16: the grip sits centred on the border line, half on each side.
    expect(html).toMatch(/data-editor-resize="true"[^>]*class="group\/resize absolute inset-y-0 left-0 z-20 flex w-4 -translate-x-1\/2 [^"]*justify-center/);
    expect(html).toContain("absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2");
    expect(html).toContain('title="Drag right to narrow · double-click to reset"');
    expect(html).toContain("--item-editor-width:460px");
    expect(readFileSync("src/features/quotation/components/items/ItemEditorPanel.tsx", "utf8")).toContain("w-[var(--item-editor-width,460px)]");
  });
});
