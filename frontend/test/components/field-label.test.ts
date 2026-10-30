import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TextField } from "@/components/ui/outlined-field";
import { Field, SelectMenu } from "@/features/quotation/components/ui";

/**
 * Field labels (owner 2026-10-29): no visible label background in any state. Above the field's top border (8 px)
 * the label is transparent; from the border down it takes the control's own fill, so no strip or patch shows.
 */
const labelClass = (html: string) => /<(?:span|label)[^>]*class="([^"]*-top-2[^"]*)"/.exec(html)?.[1] ?? "";

describe("field labels", () => {
  it("UT-FIELD-01 document Field: transparent down to the border; the fill follows the control, not the form error", () => {
    const cls = labelClass(renderToStaticMarkup(createElement(Field, { label: "Due Date", required: true, error: "Required" } as Parameters<typeof Field>[0], createElement("input"))));
    expect(cls).toContain("text-gms-danger");
    expect(cls).not.toContain("_6px");
    expect(cls).toContain("bg-[linear-gradient(to_bottom,transparent_8px,var(--color-gms-surface)_8px)]");
    // Light red only when the control itself is invalid; grey when it is disabled / read-only.
    expect(cls).toContain("group-has-[[aria-invalid=true]]/field:bg-[linear-gradient(to_bottom,transparent_8px,var(--color-gms-danger-subtle)_8px)]");
    expect(cls).toContain("group-has-[:disabled]/field:bg-[linear-gradient(to_bottom,transparent_8px,var(--color-gms-field-disabled)_8px)]");
    expect(cls.split(" ").filter((c) => c.startsWith("bg-"))).toHaveLength(1);
  });

  it("UT-FIELD-02 an invalid dropdown says so, so its label matches its light red fill", () => {
    const html = renderToStaticMarkup(createElement(SelectMenu, { value: "", onChange: () => undefined, options: [], invalid: true }));
    expect(html).toContain('aria-invalid="true"');
    expect(renderToStaticMarkup(createElement(SelectMenu, { value: "", onChange: () => undefined, options: [] }))).not.toContain("aria-invalid");
  });

  it("UT-FIELD-03 shared TextField: the label fill starts at the border line in every state", () => {
    const render = (props: Record<string, unknown>) => labelClass(renderToStaticMarkup(createElement(TextField, { id: "f", label: "Name", ...props })));
    expect(render({})).toContain("transparent_8px,var(--color-gms-surface)_8px");
    expect(render({ error: "Required" })).toContain("transparent_8px,var(--color-gms-danger-subtle)_8px");
    expect(render({ disabled: true })).toContain("transparent_8px,var(--color-gms-field-disabled)_8px");
    expect(render({ readOnly: true, error: "x" })).toContain("transparent_8px,var(--color-gms-field-disabled)_8px");
  });
});
