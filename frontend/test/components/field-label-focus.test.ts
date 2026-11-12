import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LABEL_FOCUS_DANGER, LABEL_FOCUS_SURFACE, TextField } from "@/components/ui/outlined-field";

/** UT-FLD-01 (owner 2026-11-10): on focus the ring stops at the notch label (fill from 5 px while focused). */
describe("notch label on focus", () => {
  it("shared fields: the shell is the focus group and the label fills from 5 px while focused", () => {
    const html = renderToStaticMarkup(createElement(TextField, { id: "f", label: "Name" }));
    expect(html).toMatch(/<div class="group\/field relative/);
    expect(html).toContain(LABEL_FOCUS_SURFACE);
    expect(html).toContain("transparent_8px,var(--color-gms-surface)_8px");
    expect(LABEL_FOCUS_SURFACE).toBe("group-focus-within/field:bg-[linear-gradient(to_bottom,transparent_5px,var(--color-gms-surface)_5px)]");
  });

  it("an invalid field keeps the error fill while focused", () => {
    const html = renderToStaticMarkup(createElement(TextField, { id: "f", label: "Name", error: "Required" }));
    expect(html).toContain(LABEL_FOCUS_DANGER);
    expect(html).not.toContain(LABEL_FOCUS_SURFACE);
  });

  it("transaction fields (quotation Field) have the same focus fill, per state", () => {
    const source = readFileSync("src/features/quotation/components/ui.tsx", "utf8");
    expect(source).toContain('"group-focus-within/field:bg-[linear-gradient(to_bottom,transparent_5px,var(--color-gms-surface)_5px)]"');
    expect(source).toContain("group-focus-within/field:group-has-[[aria-invalid=true]]/field:bg-[linear-gradient(to_bottom,transparent_5px,var(--color-gms-danger-subtle)_5px)]");
    expect(source).toContain("group-focus-within/field:group-has-[input:read-only]/field:bg-[linear-gradient(to_bottom,transparent_5px,var(--color-gms-field-disabled)_5px)]");
  });
});
