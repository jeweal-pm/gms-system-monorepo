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

  it("UT-TAB-10 (owner 2026-11-13, replaces 2026-11-09): tab labels are 14/20; the shown tab is bold (600), the others regular", () => {
    expect(source).toContain("min-w-0 truncate rounded-gms-sm py-1 text-gms-body tracking-normal ${active ? \"font-semibold!\" : \"font-normal!\"}");
    expect(readFileSync("src/app/globals.css", "utf8")).toMatch(/--text-gms-body:\s*14px;[\s\S]*--text-gms-body--line-height:\s*20px;/);
  });

  it("UT-TAB-11 (owner 2026-11-13): the shown tab always shows its ×; another tab shows it on hover or keyboard focus", () => {
    expect(source).toContain("<CloseButton title={tab.title} alwaysVisible={active} onClick={() => onClose(tab.id)} />");
    expect(source).toContain('alwaysVisible ? "" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"');
  });

  it("UT-TAB-08 (owner 2026-11-07): the tab shell is 40px high and each tab 36px, bottom-aligned", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/--spacing-gms-topbar:\s*40px;/);
    expect(source).toMatch(/role="tablist"[^>]*className="-mb-px flex min-w-0 flex-1 items-end /);
    expect(source).toContain("group flex h-9 max-w-[220px]");
  });

  it("the body uses the #F9F9F9 page colour", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/--color-gms-page:\s*#f9f9f9;/i);
    expect(css).toMatch(/^body \{ margin: 0; background: var\(--color-gms-page\);/m);
  });
});
