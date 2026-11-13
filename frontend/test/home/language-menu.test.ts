import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LANGUAGE_FLAG_SIZE, LANGUAGES, LanguageMenu, UsFlagIcon } from "@/features/home/language-menu";
import { topbarIconButton } from "@/features/home/topbar";

/** UT-NAV-LANG-01…03: the topbar language button with the owner's 18 px US flag (2026-11-12). */
describe("topbar language menu", () => {
  it("UT-NAV-LANG-01 the flag is the owner's 18 × 18 SVG with a per-instance clip path", () => {
    expect(LANGUAGE_FLAG_SIZE).toBe(18);
    const html = renderToStaticMarkup(createElement("div", null, createElement(UsFlagIcon), createElement(UsFlagIcon)));
    expect(html.match(/width="18"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('viewBox="0 0 18 18"');
    expect(html).toContain("#D80027");
    expect(html).toContain("#0052B4");
    const ids = [...html.matchAll(/<clipPath id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(html).toContain(`clip-path="url(#${id})"`);
  });

  it("UT-NAV-LANG-02 the closed button names the current language and opens a menu", () => {
    const html = renderToStaticMarkup(createElement(LanguageMenu, { topbarIconButton }));
    expect(html).toContain('aria-label="Language: English"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('data-flag="us"');
    expect(html).not.toContain('role="menu"');
    expect(LANGUAGES.map((language) => language.code)).toEqual(["en"]);
  });

  it("UT-NAV-LANG-03 the topbar order follows the owner design: clock, language, notifications, full screen, account", () => {
    const source = readFileSync("src/features/home/topbar.tsx", "utf8");
    const order = ["<HeaderClock />", "<LanguageMenu", "<NotificationsBell />", "<FullscreenButton />", "<AccountMenu"].map((tag) => source.indexOf(tag));
    expect(order.every((at) => at > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});
