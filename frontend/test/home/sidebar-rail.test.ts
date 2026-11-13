import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }) }));

/**
 * The rail's ⇆ Expand sidebar button is removed (owner 2026-11-09). Owner 2026-11-11: one expand / collapse toggle
 * (the panel icon) sits at the top of the sidebar column, level with the top bar, for both the rail and the full sidebar.
 */
describe("UT-NAV-RAIL-01 sidebar toggle", () => {
  const rail = readFileSync("src/features/home/sidebar-rail.tsx", "utf8");
  const sidebar = readFileSync("src/features/home/sidebar.tsx", "utf8");
  const shell = readFileSync("src/features/home/app-shell.tsx", "utf8");

  it("neither the rail nor the full sidebar has a toggle of its own", () => {
    expect(rail).not.toContain('label="Expand sidebar"');
    expect(rail).not.toContain("sidebarToggleIcon");
    expect(sidebar).not.toContain('label="Collapse sidebar"');
    expect(sidebar).not.toContain("sidebarToggleIcon");
  });

  it("rail: the toggle is the rail's first item over a short divider and the logo; full sidebar: right of the logo row (design 2026-11-11)", () => {
    expect(shell).toContain("toggle={<SidebarToggleButton expanded={false} controlsId={sidebarContainerId} onToggle={toggleSidebar} />}");
    expect(shell).not.toContain("h-gms-topbar shrink-0 items-center border-b border-gms-border-header bg-gms-page pl-3");
    expect(rail).toContain('<div className="flex h-8 shrink-0 items-center justify-center">{toggle}</div>');
    expect(rail).toContain('<span aria-hidden className="mx-auto mt-1 h-px w-7 shrink-0 bg-gms-border" />');
    expect(shell).toContain("headerAction={<SidebarToggleButton expanded controlsId={sidebarContainerId} onToggle={toggleSidebar} />}");
    expect(sidebar).toMatch(/<div className="flex shrink-0 items-start justify-between gap-2">\s*<Link href="\/"[\s\S]*?<\/Link>\s*\{headerAction\}/);
    // The button moves between the two places, so focus follows it after a switch.
    expect(shell).toContain('querySelector<HTMLElement>("[data-sidebar-toggle]")?.focus()');
    // A rail group button still opens the sidebar at its section.
    expect(rail).toContain('onExpand({ target: "section", sectionId: module.sectionId })');
  });

  it("the button names the next action and reports its state", async () => {
    const { SidebarToggleButton } = await import("@/features/home/app-shell");
    const collapsed = renderToStaticMarkup(createElement(SidebarToggleButton, { expanded: false, controlsId: "side", onToggle: () => undefined }));
    expect(collapsed).toContain('aria-label="Expand sidebar"');
    expect(collapsed).toContain('aria-expanded="false"');
    expect(collapsed).toContain('aria-controls="side"');
    expect(collapsed).toContain('d="M6 2V14M6 2H3.33333');
    const expanded = renderToStaticMarkup(createElement(SidebarToggleButton, { expanded: true, controlsId: "side", onToggle: () => undefined }));
    expect(expanded).toContain('aria-label="Collapse sidebar"');
    expect(expanded).toContain('aria-expanded="true"');
  });
});

/** Owner 2026-11-11 rail design: 20 px icons; default no fill, hover = tooltip only, active #F3F3F3; toggle icon 18 px #1C252E. */
describe("UT-NAV-RAIL-02 rail states and toggle icon", () => {
  const rail = readFileSync("src/features/home/sidebar-rail.tsx", "utf8");

  it("rail buttons have no fill unless active, and no hover fill (the tooltip is the hover state)", () => {
    expect(rail).not.toContain("bg-gms-rail-button");
    expect(rail.match(/\$\{active \? "bg-gms-nav-active" : ""\}/g)).toHaveLength(2);
    expect(rail).toMatch(/const railButtonBase = `relative flex size-10 [^`]*rounded-gms-lg text-gms-text transition-colors \$\{railFocusRing\}`;/);
    expect(rail).toContain("flex h-full w-gms-rail shrink-0 flex-col border-r border-gms-border bg-gms-surface");
  });

  it("the expand / collapse icon is 18 × 18 px in #1C252E", async () => {
    const { SidebarToggleButton, SIDEBAR_TOGGLE_ICON_SIZE } = await import("@/features/home/app-shell");
    expect(SIDEBAR_TOGGLE_ICON_SIZE).toBe(18);
    const html = renderToStaticMarkup(createElement(SidebarToggleButton, { expanded: true, controlsId: "side", onToggle: () => undefined }));
    expect(html).toContain('width="18" height="18" viewBox="0 0 16 16"');
    expect(html).toContain('class="text-[#1C252E]"');
  });
});

/** Owner 2026-11-12: no hamburger; below `lg` the sidebar is the icon rail by default and the toggle expands it over the page. */
describe("UT-NAV-RAIL-03 narrow screens", () => {
  const shell = readFileSync("src/features/home/app-shell.tsx", "utf8");
  const topbar = readFileSync("src/features/home/topbar.tsx", "utf8");

  it("the top bar has no hamburger and the mobile drawer is gone", () => {
    expect(topbar).not.toContain("Open main menu");
    expect(topbar).not.toContain("onOpenNavigation");
    expect(shell).not.toContain("MobileNavigation");
    expect(shell).not.toContain("hidden h-screen shrink-0 overflow-hidden lg:block");
  });

  it("below lg the rail shows by default; expanding overlays the full sidebar for this page and leaves the wide-screen preference alone", async () => {
    const { NARROW_SCREEN_QUERY } = await import("@/features/home/use-sidebar-collapsed");
    expect(NARROW_SCREEN_QUERY).toBe("(max-width: 1023.98px)");
    expect(shell).toContain("const showRail = isNarrow ? !isNarrowExpanded : contextNav ? !isContextExpanded : isSidebarCollapsed;");
    expect(shell).toMatch(/if \(isNarrow\) \{\s*setNarrowExpandedFor\(collapsed \? null : pathname\);\s*return;\s*\}/);
    expect(shell).toContain('"fixed inset-y-0 left-0 z-40 w-gms-sidebar max-w-[85vw] shadow-gms-overlay"');
    expect(shell).toContain('<div aria-hidden data-sidebar-backdrop className="fixed inset-0 z-30 bg-black/30" onClick={() => setNarrowExpandedFor(null)} />');
    expect(shell).toContain("onNavigate={isNarrow ? () => setNarrowExpandedFor(null) : undefined}");
  });

  it("the hook assumes a wide screen on the server (hydration matches)", async () => {
    const { useIsNarrowScreen } = await import("@/features/home/use-sidebar-collapsed");
    const Probe = () => createElement("span", null, String(useIsNarrowScreen()));
    expect(renderToStaticMarkup(createElement(Probe))).toBe("<span>false</span>");
  });
});
