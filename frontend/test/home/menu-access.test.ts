import { describe, expect, it } from "vitest";
import { canViewWith, menuKeyFor, railModules, sidebarSections, visibleRailModules, visibleSections, type CanView, moduleBreadcrumbs } from "@/features/home/navigation";

/** UT-MENU-01…07: menus without VIEW are hidden (owner 2026-10-17). */

const mine = (permissions: string[]) => ({ isSuperAdmin: false, permissions });
const canViewFor = (permissions: string[]): CanView => (permission) => canViewWith(mine(permissions), permission);
const ids = (sections: ReturnType<typeof visibleSections>) =>
  sections.flatMap((section) => section.items.flatMap((item) => (item.kind === "link" ? [item.id] : [item.id, ...item.children.map((child) => child.id)])));

describe("menu visibility", () => {
  it("UT-MENU-01 Super Admin and ALL see every item", () => {
    const all: CanView = (permission) => canViewWith({ isSuperAdmin: true, permissions: [] }, permission);
    expect(visibleSections(sidebarSections, all)).toEqual(sidebarSections);
    expect(canViewWith({ isSuperAdmin: false, permissions: "ALL" }, ["quotation"])).toBe(true);
  });

  it("UT-MENU-02 without grants only ungated items remain (Home, Approve)", () => {
    expect(ids(visibleSections(sidebarSections, canViewFor([])))).toEqual(["home", "approve"]);
  });

  it("UT-MENU-03 VIEW is required; other actions alone do not show a menu", () => {
    expect(ids(visibleSections(sidebarSections, canViewFor(["quotation:EDIT"])))).not.toContain("quotation");
    expect(ids(visibleSections(sidebarSections, canViewFor(["quotation:VIEW"])))).toContain("quotation");
  });

  it("UT-MENU-04 Setup shows when any Setup leaf has VIEW", () => {
    expect(ids(visibleSections(sidebarSections, canViewFor(["vendor:VIEW"])))).toContain("setup");
    expect(ids(visibleSections(sidebarSections, canViewFor(["quotation:VIEW"])))).not.toContain("setup");
  });

  it("UT-MENU-05 a disclosure keeps only allowed children and disappears when empty", () => {
    const visible = ids(visibleSections(sidebarSections, canViewFor(["outstanding-payable:VIEW"])));
    expect(visible).toContain("account-outstanding");
    expect(visible).toContain("os-payable");
    expect(visible).not.toContain("os-receivable");
    expect(ids(visibleSections(sidebarSections, canViewFor([])))).not.toContain("account-outstanding");
  });

  it("UT-MENU-05b Memo Outstanding keeps its Vendor / Customer sub-items without \"From\" (owner 2026-10-28)", () => {
    const visible = ids(visibleSections(sidebarSections, canViewFor(["memo-outstanding-vendor:VIEW"])));
    expect(visible).toContain("memo-outstanding");
    expect(visible).toContain("memo-outstanding-from-vendor");
    expect(visible).not.toContain("memo-outstanding-from-customer");
    expect(ids(visibleSections(sidebarSections, canViewFor([])))).not.toContain("memo-outstanding");
    expect(moduleBreadcrumbs("memo-outstanding-from-vendor")?.label).toBe("Vendor");
    expect(moduleBreadcrumbs("memo-outstanding-from-customer")?.label).toBe("Customer");
  });

  it("UT-MENU-06 rail sections follow the visible sidebar sections", () => {
    const canView = canViewFor(["sale:VIEW"]);
    const modules = visibleRailModules(railModules, visibleSections(sidebarSections, canView), canView).map((module) => module.id);
    expect(modules).toEqual(["home", "approve", "sale"]);
  });

  it("UT-MENU-07 navigation ids map to catalog keys", () => {
    expect(menuKeyFor("barcode-printing")).toBe("barcode");
    expect(menuKeyFor("os-payable")).toBe("outstanding-payable");
    expect(menuKeyFor("certificate-master")).toBe("certificate-type");
    expect(menuKeyFor("company-profile")).toBe("company-profile");
    expect(menuKeyFor("approve")).toBeUndefined();
    // currency UI rev 1 (owner 2026-10-26): Currency has its own catalog leaf.
    expect(menuKeyFor("currency")).toBe("currency");
  });
});
