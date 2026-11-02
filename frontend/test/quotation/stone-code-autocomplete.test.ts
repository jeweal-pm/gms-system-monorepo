import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AutocompleteInput, autocompleteMatches } from "@/features/quotation/components/ui";

const options = ["RUB1.0-RRDEXVVS1AA", "RUB1.0MM-RD", "SAP1.0MM-RDREXVVS2AA", "99"].map((value) => ({ value, label: value }));

/** Owner 2026-11-02: the row panel's Stone Code is an autocomplete (type or pick), styled like the selects. */
describe("Stone Code autocomplete", () => {
  it("UT-QT-AC-01 lists every code until the user types, then the codes containing the text in any case", () => {
    expect(autocompleteMatches(options, null)).toHaveLength(4);
    expect(autocompleteMatches(options, "  ")).toHaveLength(4);
    expect(autocompleteMatches(options, "1.0mm").map((o) => o.value)).toEqual(["RUB1.0MM-RD", "SAP1.0MM-RDREXVVS2AA"]);
    expect(autocompleteMatches(options, "zzz")).toEqual([]);
  });

  it("UT-QT-AC-02 renders a typeable combobox with the current code; read-only when the row is locked", () => {
    const html = renderToStaticMarkup(createElement(AutocompleteInput, { value: "RUB1.0MM-RD", onChange: () => undefined, options, placeholder: "Choose or type a stone code" }));
    expect(html).toMatch(/<input[^>]*role="combobox"/);
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain('value="RUB1.0MM-RD"');
    expect(html).not.toMatch(/readonly=""/i);
    const locked = renderToStaticMarkup(createElement(AutocompleteInput, { value: "", onChange: () => undefined, options, readOnly: true }));
    expect(locked).toMatch(/<input[^>]*readonly=""/i);
  });
});
