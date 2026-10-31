import { describe, expect, it } from "vitest";
import { isNavItemActive, menuKeyFor, navigationHref, REAL_PAGE_HREFS, sidebarSections, type NavLink } from "@/features/home/navigation";
import { MENU_KEY, PAGE_HREF, PAGE_TITLE } from "@/features/memo-outstanding-vendor/model";

/** UT-MOV-NAV: Memo › Memo Outstanding › Vendor opens the real page (FE-MOV-001). */
function vendorLink(): NavLink {
  for (const section of sidebarSections) {
    for (const entry of section.items) {
      if (entry.kind === "disclosure") {
        const child = entry.children.find((link) => link.id === "memo-outstanding-from-vendor");
        if (child) return child;
      }
    }
  }
  throw new Error("Vendor link missing");
}

describe("UT-MOV-NAV navigation", () => {
  it("maps the sidebar item to /memo/memo-outstanding/vendor, gated by memo-outstanding-vendor", () => {
    expect(REAL_PAGE_HREFS["memo-outstanding-from-vendor"]).toBe(PAGE_HREF);
    expect(PAGE_HREF).toBe("/memo/memo-outstanding/vendor");
    expect(navigationHref({ label: "Vendor", slug: "memo-outstanding-from-vendor" })).toBe(PAGE_HREF);
    const link = vendorLink();
    expect(link.href).toBe(PAGE_HREF);
    expect(link.label).toBe("Vendor");
    expect(link.permission).toEqual([MENU_KEY]);
    expect(menuKeyFor("memo-outstanding-from-vendor")).toBe("memo-outstanding-vendor");
    expect(isNavItemActive(link, PAGE_HREF)).toBe(true);
    expect(PAGE_TITLE).toBe("From Vendor");
  });

  it("leaves Customer as a placeholder", () => {
    expect(navigationHref({ label: "Customer", slug: "memo-outstanding-from-customer" })).toBe("/modules/memo-outstanding-from-customer");
  });
});
