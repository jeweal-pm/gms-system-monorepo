import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DateInput } from "@/components/ui/date-input";
import { FOCUS_SOURCE_ATTRIBUTE, focusSourceForKey, installFocusModality } from "@/lib/focus-modality";

/** UT-FOCUS-01/02 and UT-DATE-05 (owner 2026-10-29): no focus frame on Shift; no calendar hover on error / disabled. */

function fakeDocument() {
  const attributes = new Map<string, string>();
  const doc = new EventTarget() as EventTarget & { documentElement: { getAttribute(name: string): string | null; setAttribute(name: string, value: string): void } };
  doc.documentElement = { getAttribute: (name) => attributes.get(name) ?? null, setAttribute: (name, value) => void attributes.set(name, value) };
  return doc;
}
const key = (value: string) => Object.assign(new Event("keydown"), { key: value });

describe("focus source", () => {
  it("UT-FOCUS-01 only navigation keys count as keyboard focus; Shift, typing and Enter don't", () => {
    for (const k of ["Tab", "ArrowDown", "ArrowLeft", "Home", "End", "PageUp"]) expect(focusSourceForKey(k)).toBe("keyboard");
    for (const k of ["Shift", "Control", "Alt", "Meta", "a", "A", "Enter", " ", "Escape"]) expect(focusSourceForKey(k)).toBeNull();
  });

  it("UT-FOCUS-02 a click sets pointer; Shift keeps it; Tab switches to keyboard; cleanup stops tracking", () => {
    const doc = fakeDocument();
    const stop = installFocusModality(doc as unknown as Document);
    const source = () => doc.documentElement.getAttribute(FOCUS_SOURCE_ATTRIBUTE);
    doc.dispatchEvent(new Event("pointerdown"));
    expect(source()).toBe("pointer");
    doc.dispatchEvent(key("Shift"));
    expect(source()).toBe("pointer");
    doc.dispatchEvent(key("Tab"));
    expect(source()).toBe("keyboard");
    stop();
    doc.dispatchEvent(new Event("pointerdown"));
    expect(source()).toBe("keyboard");
  });
});

describe("DateInput calendar button", () => {
  it("UT-DATE-05 no hover background when the field is invalid or locked; keyboard focus still shows a ring", () => {
    const html = renderToStaticMarkup(createElement(DateInput, { value: "", onChange: () => {}, "aria-invalid": true }));
    expect(html).toMatch(/<input[^>]*class="peer /);
    expect(html).toContain('aria-invalid="true"');
    const button = /<button[^>]*aria-label="Open calendar"[^>]*class="([^"]*)"/.exec(html)?.[1] ?? /<button[^>]*class="([^"]*)"[^>]*aria-label="Open calendar"/.exec(html)?.[1] ?? "";
    expect(button).toContain("peer-aria-invalid:hover:bg-transparent");
    expect(button).toContain("disabled:hover:bg-transparent");
    expect(button).toContain("focus-visible:outline-gms-primary");
    expect(renderToStaticMarkup(createElement(DateInput, { value: "", onChange: () => {}, disabled: true }))).toMatch(/aria-label="Open calendar"[^>]*disabled=""|disabled=""[^>]*aria-label="Open calendar"/);
  });
});

describe("scan icon (owner 2026-10-31: one barcode icon for every scan button)", () => {
  it("UT-ICON-01 draws the owner's barcode frame in the text color and is hidden from screen readers", async () => {
    const { ScanIcon } = await import("@/components/ui/scan-icon");
    const html = renderToStaticMarkup(createElement(ScanIcon));
    expect(html).toContain('viewBox="0 0 16 16"');
    expect(html).toContain('stroke="currentColor"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('class="size-4"');
    expect(html.match(/<path /g)).toHaveLength(7);
    expect(html).toContain('d="M8 4.6665V11.3332"');
  });
});

describe("crown icon (owner 2026-10-31: the design crown marks the main photo)", () => {
  it("UT-ICON-02 draws the owner's crown in the text color; labelled when it means something, hidden otherwise", async () => {
    const { CrownIcon } = await import("@/components/ui/crown-icon");
    const labelled = renderToStaticMarkup(createElement(CrownIcon, { "aria-label": "Main photo", className: "size-5 text-[#FFAB00]" }));
    expect(labelled).toContain('viewBox="0 0 20 20"');
    expect(labelled).toContain('stroke="currentColor"');
    expect(labelled).toContain('role="img"');
    expect(labelled).toContain('aria-label="Main photo"');
    expect(labelled.match(/<path /g)).toHaveLength(3);
    expect(renderToStaticMarkup(createElement(CrownIcon))).toContain('aria-hidden="true"');
  });
});

describe("rail icons (owner 2026-10-31: Daybook and Summary Value)", () => {
  it("UT-ICON-03 draws the owner's Daybook and Summary Value icons in the text color, hidden from screen readers", async () => {
    const { DaybookIcon, SummaryValueIcon } = await import("@/components/ui/rail-icons");
    const daybook = renderToStaticMarkup(createElement(DaybookIcon));
    const summary = renderToStaticMarkup(createElement(SummaryValueIcon));
    for (const html of [daybook, summary]) {
      expect(html).toContain('viewBox="0 0 16 16"');
      expect(html).toContain('stroke="currentColor"');
      expect(html).toContain('aria-hidden="true"');
    }
    expect(daybook.match(/<path /g)).toHaveLength(4);
    expect(summary.match(/<path /g)).toHaveLength(2);
    expect(daybook).toContain('d="M4.66602 4.66699H9.99935"');
  });
});

describe("sort icon (owner 2026-10-31: Memo Outstanding table headers)", () => {
  it("UT-ICON-04 grey up/down chevrons; the sorted direction turns primary", async () => {
    const { SortIcon } = await import("@/components/ui/sort-icon");
    const paths = (direction?: "asc" | "desc") => [...renderToStaticMarkup(createElement(SortIcon, { direction })).matchAll(/<path[^>]*class="([^"]*)"/g)].map((m) => m[1]);
    expect(renderToStaticMarkup(createElement(SortIcon))).toContain('viewBox="0 0 6 9"');
    expect(paths()).toEqual(["stroke-[#8A939D]", "stroke-[#8A939D]"]);
    expect(paths("asc")).toEqual(["stroke-gms-primary", "stroke-[#8A939D]"]);
    expect(paths("desc")).toEqual(["stroke-[#8A939D]", "stroke-gms-primary"]);
  });
});
