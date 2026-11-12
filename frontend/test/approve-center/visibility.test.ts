import { describe, expect, it } from "vitest";
import { APPROVE_MENUS } from "@/features/approve-center/menus";
import { menuAccess, visibleMenus } from "@/features/approve-center/model";
import { canViewWith, isNavItemActive, navigationHref, railModules, sidebarSections, visibleRailModules, visibleSections, type NavLink } from "@/features/home/navigation";
import { mine, SUPER } from "./fixtures";

/** UT-AP-02 (FE-AP-002, Q-AP-13): who sees each Approve item, and the sidebar Approve item (UT-AP-10 nav part). */
const slugs = (menus: { slug: string }[]) => menus.map((menu) => menu.slug);
const approveLink = sidebarSections[0].items.find((item) => item.id === "approve") as NavLink;

describe("UT-AP-02 Approve menu visibility", () => {
  it("Super Admin and ALL see every item", () => {
    expect(visibleMenus(SUPER, APPROVE_MENUS)).toHaveLength(11);
    expect(visibleMenus({ isSuperAdmin: false, permissions: "ALL" }, APPROVE_MENUS)).toHaveLength(11);
  });

  it("an item needs <leaf>:APPROVE; VIEW alone does not show it", () => {
    expect(slugs(visibleMenus(mine(["reserve:VIEW"]), APPROVE_MENUS))).toEqual([]);
    expect(slugs(visibleMenus(mine(["reserve:APPROVE", "stock-transfer-location:APPROVE"]), APPROVE_MENUS))).toEqual(["reserve", "transfer-location"]);
    expect(visibleMenus(undefined, APPROVE_MENUS)).toEqual([]);
  });

  it("APPROVE alone is enough to work the list (approval-setup authorization.md / G11: no VIEW needed)", () => {
    const reserve = APPROVE_MENUS[1];
    expect(menuAccess(mine(["reserve:APPROVE"]), reserve)).toEqual({ approve: true, view: false });
    expect(slugs(visibleMenus(mine(["reserve:APPROVE", "quotation:APPROVE"]), APPROVE_MENUS))).toEqual(["quotation", "reserve"]);
  });
});

describe("UT-AP-10 sidebar Approve item", () => {
  const can = (permissions: string[]) => (permission: readonly string[] | undefined) => canViewWith(mine(permissions), permission);
  const ids = (permissions: string[]) => visibleSections(sidebarSections, can(permissions)).flatMap((section) => section.items.map((item) => item.id));

  it("links to /approve and stays active on /approve/*", () => {
    expect(approveLink.href).toBe("/approve");
    expect(navigationHref({ label: "Approve", slug: "approve" })).toBe("/approve");
    expect(isNavItemActive(approveLink, "/approve")).toBe(true);
    expect(isNavItemActive(approveLink, "/approve/reserve")).toBe(true);
    expect(isNavItemActive(approveLink, "/approved")).toBe(false);
    expect(isNavItemActive(approveLink, "/modules/approve")).toBe(false);
  });

  it("is shown when any Approve item is visible and hidden otherwise (sidebar and rail)", () => {
    expect(ids([])).not.toContain("approve");
    expect(ids(["reserve:VIEW"])).not.toContain("approve");
    expect(ids(["memo-out:APPROVE"])).toContain("approve");
    const rail = (permissions: string[]) => visibleRailModules(railModules, visibleSections(sidebarSections, can(permissions)), can(permissions)).map((module) => module.id);
    expect(rail(["purchase:APPROVE"])).toContain("approve");
    expect(rail([])).not.toContain("approve");
    expect(canViewWith(SUPER, approveLink.permission)).toBe(true);
  });

  it("a bare key still means VIEW; a key with an action matches that action only", () => {
    expect(canViewWith(mine(["reserve:VIEW"]), ["reserve"])).toBe(true);
    expect(canViewWith(mine(["reserve:APPROVE"]), ["reserve"])).toBe(false);
    expect(canViewWith(mine(["reserve:VIEW"]), ["reserve:APPROVE"])).toBe(false);
  });
});
