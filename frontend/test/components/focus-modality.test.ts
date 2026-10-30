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
