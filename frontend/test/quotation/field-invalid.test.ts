import { readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FormProvider, useForm, type FieldValues } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { AutocompleteInput, Field, FormDateInput, NumberInput, SelectMenu, TextInput } from "@/features/quotation/components/ui";

/**
 * UT-FIELD-ERR-01…03 (owner 2026-11-16): every control inside a Field that shows an error gets the red border
 * (`aria-invalid` → border-gms-danger), also while focused; before, only controls given `aria-invalid` by hand did.
 */
const field = (error: string | undefined, child: ReactNode) => renderToStaticMarkup(createElement(Field, { label: "Sale Price", required: true, error } as Parameters<typeof Field>[0], child));

function WithForm({ children }: { children: ReactNode }) {
  const form = useForm<FieldValues>({ defaultValues: { docDate: "" } });
  return createElement(FormProvider, form as Parameters<typeof FormProvider>[0], children);
}

describe("required fields in error turn red", () => {
  it("UT-FIELD-ERR-01 text, number (with unit), dropdown, autocomplete and date inside an erroring Field are aria-invalid", () => {
    const controls: ReactNode[] = [
      createElement(TextInput, { name: "ref" }),
      createElement(NumberInput, { name: "unitPrice", suffix: "USD" }),
      createElement(SelectMenu, { value: "", onChange: () => undefined, options: [] }),
      createElement(AutocompleteInput, { value: "", onChange: () => undefined, options: [] }),
      createElement(WithForm, null, createElement(FormDateInput<{ docDate: string }>, { name: "docDate" })),
    ];
    for (const control of controls) {
      expect(field("Enter the sale price", control)).toContain('aria-invalid="true"');
      expect(field(undefined, control)).not.toContain('aria-invalid="true"');
    }
  });

  it("UT-FIELD-ERR-02 a control's own aria-invalid / invalid still wins over its Field", () => {
    expect(field("Required", createElement(TextInput, { "aria-invalid": false }))).not.toContain('aria-invalid="true"');
    expect(field(undefined, createElement(TextInput, { "aria-invalid": true }))).toContain('aria-invalid="true"');
    expect(field("Required", createElement(SelectMenu, { value: "", onChange: () => undefined, options: [], invalid: false }))).not.toContain('aria-invalid="true"');
  });

  it("UT-FIELD-ERR-03 the red border stays while focused (document forms and the shared fields)", () => {
    const html = field("Required", createElement(TextInput, { name: "x" }));
    expect(html).toContain("aria-[invalid=true]:border-gms-danger");
    expect(html).toContain("aria-[invalid=true]:focus:border-gms-danger aria-[invalid=true]:focus:ring-gms-danger/20");
    const shared = readFileSync("src/components/ui/outlined-field.tsx", "utf8");
    expect(shared).toContain("aria-[invalid=true]:focus:border-gms-danger aria-[invalid=true]:focus:ring-gms-danger/20");
    expect(shared).toContain("has-[[aria-invalid=true]]:focus-within:border-gms-danger");
  });
});
