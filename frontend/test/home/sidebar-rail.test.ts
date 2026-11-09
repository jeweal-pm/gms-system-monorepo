import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** The rail's ⇆ Expand sidebar button is removed (owner 2026-11-09); the full sidebar keeps Collapse sidebar. */
describe("UT-NAV-RAIL-01 no Expand sidebar on the rail", () => {
  const rail = readFileSync("src/features/home/sidebar-rail.tsx", "utf8");

  it("the rail renders no Expand sidebar button and no toggle", () => {
    expect(rail).not.toContain('label="Expand sidebar"');
    expect(rail).not.toContain("sidebarToggleIcon");
    expect(rail).not.toContain("controlsId");
  });

  it("a module group button still opens the sidebar; Collapse sidebar stays on the full sidebar", () => {
    expect(rail).toContain('onExpand({ target: "section", sectionId: module.sectionId })');
    expect(readFileSync("src/features/home/sidebar.tsx", "utf8")).toContain('label="Collapse sidebar"');
  });
});
