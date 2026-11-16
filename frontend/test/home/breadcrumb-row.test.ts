import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** UT-NAV-CRUMB-01 (owner 2026-11-13): the breadcrumb row under the top bar uses the page colour #F9F9F9. */
describe("breadcrumb row", () => {
  it("UT-NAV-CRUMB-01 is 44 px on bg-gms-page (#F9F9F9) with no line under it (Setup design 2026-11-13)", () => {
    const shell = readFileSync("src/features/home/app-shell.tsx", "utf8");
    const row = shell.slice(shell.indexOf("function ShellBreadcrumbs"), shell.indexOf("function AppShellSkeleton"));
    expect(row).toContain("flex h-11 shrink-0 items-center bg-gms-page");
    expect(row).not.toContain("bg-gms-surface");
    expect(row).not.toContain("border-b");
    expect(readFileSync("src/app/globals.css", "utf8")).toMatch(/--color-gms-page:\s*#f9f9f9;/i);
  });
});
