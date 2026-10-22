import { describe, expect, it } from "vitest";
import { shortcutGroups, shortcutGroupsFor } from "../../src/trpc/router";

/** UT-UP-HS-01…03: Home shortcuts follow each menu's VIEW, without a Dashboard gate (user-permission SA rev 3). */

const titlesAndSlugs = (permissions: string[]) =>
  shortcutGroupsFor({ isSuperAdmin: false, permissions }).map((group) => [group.title, group.items.map((item) => item.slug)]);

describe("shortcutGroupsFor", () => {
  it("UT-UP-HS-01 without dashboard:VIEW a user still sees the shortcuts they may view (D3-01)", () => {
    expect(titlesAndSlugs(["company-profile:VIEW", "customer:VIEW", "customer:ADD", "memo-receive:VIEW", "barcode:VIEW"])).toEqual([
      ["Setup", ["company-profile"]],
      ["Master Code", ["customer"]],
      ["Memo", ["memo-receive"]],
      ["Inventory", ["barcode"]],
    ]);
  });

  it("UT-UP-HS-02 the Dashboard shortcut still needs dashboard:VIEW; other actions never show a shortcut", () => {
    expect(titlesAndSlugs(["quotation:ADD", "quotation:PRINT"])).toEqual([]);
    expect(titlesAndSlugs(["dashboard:VIEW", "quotation:VIEW"])).toEqual([
      ["Main Menu", ["dashboard"]],
      ["Pre-Sale", ["quotation"]],
    ]);
    expect(titlesAndSlugs([])).toEqual([]);
  });

  it("UT-UP-HS-03 Super Admin sees every shortcut", () => {
    expect(shortcutGroupsFor({ isSuperAdmin: true, permissions: [] })).toBe(shortcutGroups);
  });
});
