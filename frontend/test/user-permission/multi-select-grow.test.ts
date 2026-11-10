import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MultiSelect } from "@/components/ui/multi-select";

/** UT-UP-MS01 (owner 2026-11-10): the multi-select grows downward with its chips instead of overflowing a fixed 52 px. */
describe("MultiSelect height", () => {
  it("has a 52 px minimum and no fixed height; chips wrap", () => {
    const options = Array.from({ length: 11 }, (_, index) => ({ id: `d${index}`, label: `Document ${index}` }));
    const html = renderToStaticMarkup(
      createElement(MultiSelect, { id: "user-approve", label: "Approve", options, value: options.map((option) => option.id), onChange: () => undefined, onBlur: () => undefined }),
    );
    expect(html).toContain("min-h-[52px]");
    expect(html).not.toMatch(/class="[^"]*(?<!min-)h-\[52px\]/);
    expect(html).toContain("py-[11px]");
    expect(html).toContain("flex-wrap");
  });
});
