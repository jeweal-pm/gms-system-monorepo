import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Home: gray page with white shortcut cards (owner 2026-11-09). */
describe("UT-HOME-BG-01 Home background", () => {
  const source = readFileSync("src/features/home/home-dashboard.tsx", "utf8");

  it("the page fills the pane in gray and every card is white", () => {
    expect(source).toContain('<div className="min-h-full bg-gms-page">');
    expect(source).toMatch(/<article [^>]*className="[^"]*\bbg-gms-surface\b/);
  });

  it("4 columns on wide screens (2xl), 3 on xl, 2 on sm (owner 2026-11-09)", () => {
    expect(source).toContain('className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"');
    expect(source).toContain("mx-auto max-w-[1600px]");
  });
});
