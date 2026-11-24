import { describe, expect, it } from "vitest";
import { activeDisclosureIds, canViewWith, homeCards, isNavItemActive, menuKeyFor, navigationHref, navigationLabelFor, REAL_PAGE_HREFS, sidebarSections, visibleHomeCards, visibleSections, type NavLink } from "@/features/home/navigation";
import { memoOutstandingAccess } from "@/features/memo-outstanding-vendor/api";
import { STOCK_VALUE_HREF, STOCK_VALUE_MENU_KEY } from "@/features/stock-value/model";

/** UT-SV-11 (FE-SV-010): Stock Value opens its real page from the sidebar and Home, stays active on card routes, and needs VIEW. */
const report = sidebarSections.find((section) => section.id === "report");
const movement = report?.items.find((item) => item.kind === "disclosure" && item.id === "stock-movement");
const children = movement && movement.kind === "disclosure" ? movement.children : [];
const value = children.find((child) => child.id === "stock-value") as NavLink;

describe("UT-SV-11 menu", () => {
  it("Stock Movement still holds Stock Card then Stock Value; Stock Value opens its real page, not the placeholder", () => {
    expect(children.map((child) => child.id)).toEqual(["stock-card", "stock-value"]);
    expect(STOCK_VALUE_HREF).toBe("/report/stock-movement/stock-value");
    expect(REAL_PAGE_HREFS["stock-value"]).toBe(STOCK_VALUE_HREF);
    expect(value.href).toBe(STOCK_VALUE_HREF);
    expect(navigationHref({ label: "Stock Value", slug: "stock-value" })).toBe(STOCK_VALUE_HREF);
    expect(navigationLabelFor(STOCK_VALUE_HREF)).toBe("Stock Value");
    expect(JSON.stringify(sidebarSections)).not.toContain("/modules/stock-value");
  });

  it("is active on the list and on a card route and opens its parent; Stock Card is not active there", () => {
    const detail = `${STOCK_VALUE_HREF}/SC${"a".repeat(32)}`;
    expect(isNavItemActive(value, STOCK_VALUE_HREF)).toBe(true);
    expect(isNavItemActive(value, detail)).toBe(true);
    expect(isNavItemActive(value, "/report/stock-movement/stock-values")).toBe(false);
    expect(activeDisclosureIds(detail)).toContain("stock-movement");
    expect(isNavItemActive(children[0], detail)).toBe(false);
  });

  it("the gate is the stock-value leaf: VIEW shows it, stock-card VIEW alone does not", () => {
    expect(STOCK_VALUE_MENU_KEY).toBe("stock-value");
    expect(menuKeyFor("stock-value")).toBe("stock-value");
    expect(value.permission).toEqual(["stock-value"]);
    const mine = (permissions: string[]) => ({ isSuperAdmin: false, permissions });
    const ids = (permissions: string[]) => visibleSections(sidebarSections, (permission) => canViewWith(mine(permissions), permission)).flatMap((section) => section.items).flatMap((item) => (item.kind === "disclosure" ? item.children.map((child) => child.id) : []));
    expect(ids(["stock-value:VIEW"])).toEqual(["stock-value"]);
    expect(ids(["stock-card:VIEW"])).toEqual(["stock-card"]);
    expect(ids(["stock-value:PRINT"])).toEqual([]);
  });

  it("Home follows the sidebar: the Report card links Stock Value to the real page", () => {
    const all = visibleHomeCards(homeCards, (permission) => canViewWith({ isSuperAdmin: true, permissions: "ALL" }, permission));
    const block = all.find((entry) => entry.id === "report")?.blocks.find((entry) => entry.title === "Stock Movement");
    expect(block?.links.map((entry) => [entry.label, entry.href])).toEqual([
      ["Stock Card", "/report/stock-movement/stock-card"],
      ["Stock Value", STOCK_VALUE_HREF],
    ]);
  });

  it("access flags: VIEW opens the page, PRINT shows the print icon, EXCEL is only informational", () => {
    expect(memoOutstandingAccess({ isSuperAdmin: false, permissions: ["stock-value:VIEW"] }, STOCK_VALUE_MENU_KEY)).toEqual({ view: true, print: false, excel: false });
    expect(memoOutstandingAccess({ isSuperAdmin: false, permissions: ["stock-value:VIEW", "stock-value:PRINT"] }, STOCK_VALUE_MENU_KEY)).toMatchObject({ view: true, print: true });
    expect(memoOutstandingAccess({ isSuperAdmin: false, permissions: ["stock-card:VIEW"] }, STOCK_VALUE_MENU_KEY).view).toBe(false);
    expect(memoOutstandingAccess(undefined, STOCK_VALUE_MENU_KEY)).toEqual({ view: false, print: false, excel: false });
  });
});
