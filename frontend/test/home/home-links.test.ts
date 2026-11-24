import { describe, expect, it } from "vitest";
import { hasNoShortcuts, NO_SHORTCUTS_MESSAGE } from "@/features/home/home-dashboard";
import { navigationHref } from "@/features/home/navigation";

/** UT-HOME-01…02: Home shortcuts open the real pages (owner 2026-10-20). */
describe("navigationHref", () => {
  it("UT-HOME-01 gateway shortcuts (menu key only) open the real page when one exists", () => {
    expect(navigationHref({ label: "Company Profile", slug: "company-profile" })).toBe("/setup/company-profile");
    expect(navigationHref({ label: "Stone Master", slug: "stone-master" })).toBe("/setup/stone-master/stone-group");
    expect(navigationHref({ label: "Vendor", slug: "vendor" })).toBe("/setup/vendor");
    expect(navigationHref({ label: "Customer", slug: "customer" })).toBe("/setup/customer");
    expect(navigationHref({ label: "User and Permission", slug: "user-and-permission" })).toBe("/setup/user-permission");
    expect(navigationHref({ label: "Quotation", slug: "quotation" })).toBe("/pre-sale/quotation");
    // reserve UI rev 1 (owner 2026-11-02): Reserve has its page now.
    expect(navigationHref({ label: "Reserve", slug: "reserve" })).toBe("/pre-sale/reserve");
    // sale FE-SL-008 (owner 2026-11-18): Sale › Sale has its page (UI only, API pending).
    expect(navigationHref({ label: "Sale", slug: "sale" })).toBe("/sale/sale");
    // stock-card FE-SC-010 (UT-SC-09) and stock-value FE-SV-010 (UT-SV-11): both Stock Movement reports have their own pages.
    expect(navigationHref({ label: "Stock Card", slug: "stock-card" })).toBe("/report/stock-movement/stock-card");
    expect(navigationHref({ label: "Stock Value", slug: "stock-value" })).toBe("/report/stock-movement/stock-value");
    expect(navigationHref({ label: "Stock Adjustment", slug: "stock-adjustment" })).toBe("/inventory/stock-adjustment");
  });

  it("UT-HOME-02 an explicit href wins; menus without a page keep their placeholder", () => {
    expect(navigationHref({ label: "Vendor", slug: "vendor", href: "/somewhere" })).toBe("/somewhere");
    expect(navigationHref({ label: "Bank", slug: "bank" })).toBe("/modules/bank");
    expect(navigationHref({ label: "Service Fee", slug: "labor-name" })).toBe("/modules/labor-name");
  });
});

describe("Home without shortcuts (user-permission SA rev 3 D3-02)", () => {
  it("UT-HOME-03 the message shows only after the access check answered with no shortcuts", () => {
    expect(hasNoShortcuts(true, [])).toBe(true);
    expect(hasNoShortcuts(false, undefined)).toBe(false);
    expect(hasNoShortcuts(true, [{ id: "main", title: "Main Menu", blocks: [{ links: [{ kind: "link", id: "dashboard", label: "Dashboard", href: "/modules/dashboard" }] }] }])).toBe(false);
    expect(NO_SHORTCUTS_MESSAGE).toContain("Ask your administrator");
  });
});
