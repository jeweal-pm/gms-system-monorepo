import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * UT-SHELL-01 (owner 2026-11-11, "content can scroll into empty space"): absolutely placed descendants (sr-only labels
 * deep in long tables) made the document taller than the screen. The shell, <main> and every tab pane are positioned
 * containers, and the shell / <main> clip instead of hide, so neither the user nor scrollIntoView / focus can move them.
 */
describe("app shell scroll containment", () => {
  const shell = readFileSync("src/features/home/app-shell.tsx", "utf8");
  const host = readFileSync("src/features/home/tabs/tab-host.tsx", "utf8");

  it("the shell (and its loading skeleton) is relative and clipped", () => {
    expect(shell.match(/className="relative flex h-screen overflow-clip bg-gms-surface"/g)).toHaveLength(2);
    expect(shell).not.toContain('className="flex h-screen overflow-hidden bg-gms-surface"');
    expect(shell).toContain('<main id="main-content" tabIndex={-1} className="relative min-h-0 flex-1 overflow-clip outline-none">');
  });

  it("each tab pane and the route fallback are positioned scroll containers", () => {
    expect(host).toContain('className="relative h-full overflow-auto">');
    expect(host).toContain('<div className={showRoute ? "relative h-full overflow-auto" : "hidden"}>{children}</div>');
  });


  it("an unfocused sr-only text is pinned to its container's corner, so it never stretches a scroll area", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/\.sr-only:not\(:focus\):not\(:focus-within\) \{\s*top: 0;\s*left: 0;\s*\}/);
  });
});
