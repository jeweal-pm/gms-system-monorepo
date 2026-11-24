import { describe, expect, it } from "vitest";
import { activeDisclosureIds, canViewWith, homeCards, isNavItemActive, menuKeyFor, moduleBreadcrumbs, navigationHref, navigationLabelFor, REAL_PAGE_HREFS, sidebarSections, visibleHomeCards, visibleSections, type NavLink } from "@/features/home/navigation";
import { STOCK_CARD_HREF, STOCK_CARD_MENU_KEY } from "@/features/stock-card/model";
import { memoOutstandingAccess } from "@/features/memo-outstanding-vendor/api";

/** UT-SC-09 (FE-SC-010): Report › Stock Movement shows Stock Card and Stock Value; the old Primary / Consignment items are gone. */
const report = sidebarSections.find((section) => section.id === "report");
const movement = report?.items.find((item) => item.kind === "disclosure" && item.id === "stock-movement");
const children = movement && movement.kind === "disclosure" ? movement.children : [];
const card = children.find((child) => child.id === "stock-card") as NavLink;

describe("UT-SC-09 menu", () => {
  it("Stock Movement holds Stock Card then Stock Value only", () => {
    expect(children.map((child) => child.label)).toEqual(["Stock Card", "Stock Value"]);
    expect(children.map((child) => child.id)).toEqual(["stock-card", "stock-value"]);
    expect(JSON.stringify(sidebarSections)).not.toContain("stock-movement-primary");
    expect(JSON.stringify(sidebarSections)).not.toContain("stock-movement-consignment");
  });

  it("Stock Card opens its real page; Stock Value opens its own real page (stock-value FE-SV-010)", () => {
    expect(REAL_PAGE_HREFS["stock-card"]).toBe(STOCK_CARD_HREF);
    expect(STOCK_CARD_HREF).toBe("/report/stock-movement/stock-card");
    expect(card.href).toBe(STOCK_CARD_HREF);
    expect(children[1].href).toBe("/report/stock-movement/stock-value");
    expect(navigationHref({ label: "Stock Card", slug: "stock-card" })).toBe(STOCK_CARD_HREF);
    expect(navigationHref({ label: "Stock Value", slug: "stock-value" })).toBe("/report/stock-movement/stock-value");
    expect(navigationLabelFor(STOCK_CARD_HREF)).toBe("Stock Card");
  });

  it("Stock Value no longer has a /modules placeholder (it has its own page, stock-value FE-SV-010)", () => {
    expect(moduleBreadcrumbs("stock-value").label).toBeNull();
  });

  it("Stock Card is active on the list and on a card route; its parent opens", () => {
    const detail = `${STOCK_CARD_HREF}/SC${"a".repeat(32)}`;
    expect(isNavItemActive(card, STOCK_CARD_HREF)).toBe(true);
    expect(isNavItemActive(card, detail)).toBe(true);
    expect(isNavItemActive(card, "/report/stock-movement/stock-cards")).toBe(false);
    expect(activeDisclosureIds(detail)).toContain("stock-movement");
    expect(isNavItemActive(children[1], detail)).toBe(false);
  });

  it("the catalog leaves are stock-card and stock-value; the access check uses VIEW of the leaf", () => {
    expect(STOCK_CARD_MENU_KEY).toBe("stock-card");
    expect(menuKeyFor("stock-card")).toBe("stock-card");
    expect(menuKeyFor("stock-value")).toBe("stock-value");
    expect(menuKeyFor("stock-movement-primary")).toBeUndefined();
    expect(card.permission).toEqual(["stock-card"]);
    const mine = (permissions: string[]) => ({ isSuperAdmin: false, permissions });
    const labels = (permissions: string[]) => visibleSections(sidebarSections, (permission) => canViewWith(mine(permissions), permission)).flatMap((section) => section.items).flatMap((item) => (item.kind === "disclosure" ? item.children.map((child) => child.id) : []));
    expect(labels(["stock-card:VIEW"])).toEqual(["stock-card"]);
    expect(labels(["stock-card:PRINT"])).toEqual([]);
    expect(labels(["stock-value:VIEW", "stock-card:VIEW"])).toEqual(["stock-card", "stock-value"]);
  });

  it("Home follows the sidebar: the Report card shows Stock Card and Stock Value with the same links", () => {
    const all = visibleHomeCards(homeCards, (permission) => canViewWith({ isSuperAdmin: true, permissions: "ALL" }, permission));
    const block = all.find((entry) => entry.id === "report")?.blocks.find((entry) => entry.title === "Stock Movement");
    expect(block?.links.map((entry) => [entry.label, entry.href])).toEqual([
      ["Stock Card", STOCK_CARD_HREF],
      ["Stock Value", "/report/stock-movement/stock-value"],
    ]);
  });

  it("access flags: VIEW opens the page, PRINT shows the print icon, EXCEL is only informational", () => {
    expect(memoOutstandingAccess({ isSuperAdmin: false, permissions: ["stock-card:VIEW"] }, STOCK_CARD_MENU_KEY)).toEqual({ view: true, print: false, excel: false });
    expect(memoOutstandingAccess({ isSuperAdmin: false, permissions: ["stock-card:VIEW", "stock-card:PRINT", "stock-card:EXCEL"] }, STOCK_CARD_MENU_KEY)).toEqual({ view: true, print: true, excel: true });
    expect(memoOutstandingAccess({ isSuperAdmin: false, permissions: ["memo-outstanding-vendor:VIEW"] }, STOCK_CARD_MENU_KEY).view).toBe(false);
    expect(memoOutstandingAccess({ isSuperAdmin: true, permissions: "ALL" }, STOCK_CARD_MENU_KEY)).toEqual({ view: true, print: true, excel: true });
    expect(memoOutstandingAccess(undefined, STOCK_CARD_MENU_KEY)).toEqual({ view: false, print: false, excel: false });
  });
});
