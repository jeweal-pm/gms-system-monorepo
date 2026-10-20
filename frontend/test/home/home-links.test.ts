import { describe, expect, it } from "vitest";
import { navigationHref } from "@/features/home/navigation";

/** UT-HOME-01…02: Home shortcuts open the real pages (owner 2026-10-20). */
describe("navigationHref", () => {
  it("UT-HOME-01 gateway shortcuts (menu key only) open the real page when one exists", () => {
    expect(navigationHref({ label: "Company Profile", slug: "company-profile" })).toBe("/setup/company-profile");
    expect(navigationHref({ label: "Stone Master", slug: "stone-master" })).toBe("/setup/stone-master/stone-group");
    expect(navigationHref({ label: "Vendor", slug: "vendor" })).toBe("/setup/vendor");
    expect(navigationHref({ label: "Customer", slug: "customer" })).toBe("/setup/customer");
    expect(navigationHref({ label: "User and Permission", slug: "user-and-permission" })).toBe("/setup/user-permission");
  });

  it("UT-HOME-02 an explicit href wins; menus without a page keep their placeholder", () => {
    expect(navigationHref({ label: "Vendor", slug: "vendor", href: "/somewhere" })).toBe("/somewhere");
    expect(navigationHref({ label: "Quotation", slug: "quotation" })).toBe("/modules/quotation");
    expect(navigationHref({ label: "Service Fee", slug: "labor-name" })).toBe("/modules/labor-name");
  });
});
