import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** UT-TAB-07 (owner 2026-11-05): tab strip colours, no line under the active tab, and the page background. */
describe("tab strip colours and body background", () => {
  const source = readFileSync("src/features/home/tabs/tab-bar.tsx", "utf8");

  it("active #FFFFFF, inactive #EDEDED, hover #F9F9F9", () => {
    expect(source).toContain('? "bg-[#FFFFFF] text-gms-text"');
    expect(source).toContain('"bg-[#EDEDED] text-gms-text-muted shadow-[inset_0_-1px_0_var(--color-gms-border-header)] hover:bg-[#F9F9F9]"');
  });

  it("the strip overlaps the topbar border so the active tab has no bottom line; inactive tabs keep one", () => {
    expect(source).toMatch(/role="tablist"[^>]*className="-mb-px /);
    expect(source).not.toMatch(/"bg-\[#FFFFFF\] text-gms-text[^"]*shadow/);
  });

  it("the body uses the #F9F9F9 page colour", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/--color-gms-page:\s*#f9f9f9;/i);
    expect(css).toMatch(/^body \{ margin: 0; background: var\(--color-gms-page\);/m);
  });
});
