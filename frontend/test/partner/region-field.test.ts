import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RegionField } from "@/features/partner/components/region-field";

const data = { states: ["Bangkok", "Phuket"], cities: [["Bang Rak", 0], ["Mueang", 1]] as [string, number][] };
const ready = { status: "ready" as const, data, retry: () => {} };

function render(props: Partial<ComponentProps<typeof RegionField>>) {
  return renderToStaticMarkup(
    createElement(RegionField, {
      kind: "city",
      id: "x-city",
      label: "City",
      readOnly: false,
      hasCountry: true,
      region: ready,
      value: { state: "", city: "" },
      onChange: () => {},
      ...props,
    }),
  );
}

describe("RegionField", () => {
  it("is a disabled searchable dropdown asking for a country first", () => {
    const html = render({ hasCountry: false, region: { status: "idle", data: null, retry: () => {} } });
    expect(html).toContain('role="combobox"');
    expect(html).toContain("disabled");
    expect(html).toContain("Choose a country first");
  });

  it("is a closed searchable City dropdown once the list is loaded", () => {
    const html = render({});
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('placeholder="Search city"');
  });

  it("shows the chosen city's name", () => {
    expect(render({ value: { state: "Phuket", city: "Mueang" } })).toContain('value="Mueang"');
  });

  it("is a searchable State/Province dropdown showing the chosen state", () => {
    const html = render({ kind: "state", id: "x-state", label: "State/Province", value: { state: "Bangkok", city: "" } });
    expect(html).toContain('role="combobox"');
    expect(html).toContain('value="Bangkok"');
  });

  it("shows Loading… while the list loads", () => {
    expect(render({ region: { status: "loading", data: null, retry: () => {} } })).toContain('placeholder="Loading…"');
  });

  it("keeps free text for a country without a list", () => {
    const html = render({ region: { status: "ready", data: null, retry: () => {} } });
    expect(html).toContain("<input");
    expect(html).toContain('placeholder="Enter city"');
  });

  it("keeps free text for a city when the chosen state has no listed city", () => {
    expect(render({ value: { state: "Unlisted", city: "" } })).toContain("<input");
  });

  it("shows the saved name as read-only text", () => {
    const html = render({ readOnly: true, value: { state: "Phuket", city: "Mueang" } });
    expect(html).toContain("<input");
    expect(html).toContain('value="Mueang"');
  });
});
