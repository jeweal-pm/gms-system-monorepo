import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ComboboxField, exactOption, filterOptions, normalizeSearch } from "@/components/ui/combobox-field";

const countries = [
  { value: "BR", label: "Brazil" },
  { value: "TH", label: "Thailand" },
  { value: "ST", label: "São Tomé & Príncipe" },
  { value: "AT", label: "Austria" },
];

function render(props: Partial<ComponentProps<typeof ComboboxField>>) {
  return renderToStaticMarkup(createElement(ComboboxField, { id: "c", label: "Country", placeholder: "Search country", options: countries, value: "", onChange: () => {}, ...props }));
}

describe("combobox search", () => {
  it("ignores case and accents", () => {
    expect(normalizeSearch("  São TOMÉ ")).toBe("sao tome");
  });

  it("returns every option for an empty query", () => {
    expect(filterOptions(countries, "  ")).toEqual(countries);
  });

  it("puts labels starting with the query before labels containing it", () => {
    expect(filterOptions(countries, "a").map((option) => option.value)).toEqual(["AT", "BR", "TH", "ST"]);
    expect(filterOptions(countries, "tha").map((option) => option.value)).toEqual(["TH"]);
  });

  it("finds accented labels from plain text", () => {
    expect(filterOptions(countries, "sao tome").map((option) => option.value)).toEqual(["ST"]);
  });

  it("takes only an exact label match for typed text", () => {
    expect(exactOption(countries, "thailand")?.value).toBe("TH");
    expect(exactOption(countries, "thai")).toBeUndefined();
    expect(exactOption(countries, "")).toBeUndefined();
  });
});

describe("ComboboxField", () => {
  it("renders an accessible closed combobox with the chosen label", () => {
    const html = render({ value: "TH" });
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="c-listbox"');
    expect(html).toContain('value="Thailand"');
    expect(html).not.toContain('role="listbox"');
  });

  it("marks the field invalid with its error", () => {
    const html = render({ error: "Country is required", required: true });
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="c-error"');
    expect(html).toContain("Country is required");
  });

  it("is disabled while loading and offers Retry after a load error", () => {
    expect(render({ status: "loading" })).toContain('aria-busy="true"');
    const failed = render({ status: "error", onRetry: () => {} });
    expect(failed).toContain("Couldn&#x27;t load the list.");
    expect(failed).toContain("Retry");
  });

  it("read-only view shows the value without the chevron button", () => {
    const html = render({ value: "TH", readOnly: true });
    expect(html).toContain('value="Thailand"');
    expect(html).not.toContain("<button");
  });
});
