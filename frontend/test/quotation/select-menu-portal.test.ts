import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { menuPlace, SelectMenu } from "@/features/quotation/components/ui";

/**
 * UT-SELECT-PORTAL-01/02 (Load to Stock, owner 2026-11-24): a portalled SelectMenu list is fixed under its button, or
 * above it when the window has less room below, so a table's scroll box never hides the last row's menu.
 */
describe("SelectMenu portal placement", () => {
  const rect = (top: number, height = 40) => ({ top, bottom: top + height, left: 120, width: 170 });

  it("UT-SELECT-PORTAL-01 opens below with room, capped at 256 px, aligned to the button", () => {
    expect(menuPlace(rect(100), 900)).toEqual({ placement: "below", left: 120, width: 170, top: 148, maxHeight: 256 });
    // Less than 256 px below but still more than above: stays below, shorter.
    expect(menuPlace(rect(60), 300)).toEqual({ placement: "below", left: 120, width: 170, top: 108, maxHeight: 184 });
  });

  it("UT-SELECT-PORTAL-02 flips above when the last row sits near the window bottom", () => {
    expect(menuPlace(rect(800), 900)).toEqual({ placement: "above", left: 120, width: 170, bottom: 108, maxHeight: 256 });
    expect(menuPlace(rect(200), 300)).toEqual({ placement: "above", left: 120, width: 170, bottom: 108, maxHeight: 184 });
  });

  it("UT-SELECT-PORTAL-03 renders closed exactly like the in-place menu (no list until opened)", () => {
    const props = { value: "", options: [{ value: "A", label: "A" }], onChange: vi.fn() };
    const portal = renderToStaticMarkup(createElement(SelectMenu, { ...props, portal: true }));
    expect(portal).toBe(renderToStaticMarkup(createElement(SelectMenu, props)));
    expect(portal).not.toContain('role="listbox"');
  });
});
