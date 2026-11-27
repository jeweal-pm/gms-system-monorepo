import { describe, expect, it } from "vitest";
import { APPROVE_MENUS, APPROVE_PERMISSIONS, approveBreadcrumbs, approveMenuFor, approveMenuHref, searchPlaceholder } from "@/features/approve-center/menus";

/** UT-AP-01 (FE-AP-002) registry and UT-AP-10 (FE-AP-001) routes / breadcrumbs. */
describe("UT-AP-01 menu registry", () => {
  it("lists 12 items in the sidebar order (owner Q-AP-03, 2026-11-07; Sale FE-SL-009)", () => {
    expect(APPROVE_MENUS.map((menu) => menu.label)).toEqual([
      "Quotation",
      "Reserve",
      "Memo Receive",
      "Memo Return",
      "Memo Out",
      "Memo Out Return",
      "Purchase Order (PO)",
      "Purchase",
      "Load to Stock",
      "Merge/Split Stock",
      "Transfer Location",
      "Sale",
    ]);
  });

  it("Merge/Split is not available; the eight document types, Load to Stock (FE-LS-011), Transfer Location (FE-STL-005) and Sale are available with their procedures", () => {
    const by = Object.fromEntries(APPROVE_MENUS.map((menu) => [menu.slug, menu]));
    expect(by["merge-split"].availability).toBe("not-available");
    const transfer = by["transfer-location"];
    expect(transfer.availability).toBe("available");
    if (transfer.availability === "available") {
      expect(transfer.type).toBe("stock-transfer-location");
      expect(transfer.documentBase).toBe("/inventory/stock-transfer-location");
      expect(transfer.consequence(2)).toContain("2 items move to the new locations");
    }
    const procs = APPROVE_MENUS.flatMap((menu) => (menu.availability === "available" ? [[menu.slug, menu.proc]] : []));
    expect(procs).toEqual([
      ["quotation", "quotation"],
      ["reserve", "reserve"],
      ["memo-receive", "memoReceive"],
      ["memo-return", "memoReturn"],
      ["memo-out", "memoOut"],
      ["memo-out-return", "memoOutReturn"],
      ["purchase-order", "purchaseOrder"],
      ["purchase", "purchase"],
      ["load-to-stock", "loadToStock"],
      ["transfer-location", "stockTransferLocation"],
      ["sale", "sale"],
    ]);
  });

  it("uses the kebab-case approval setting keys as types (G13)", () => {
    expect(APPROVE_MENUS.map((menu) => menu.type)).toEqual([
      "quotation", "reserve", "memo-receive", "memo-return", "memo-out", "memo-out-return", "purchase-order", "purchase", "load-to-stock", "merge-split", "stock-transfer-location", "sale",
    ]);
  });

  it("uses the catalog leaves and parties of the documents", () => {
    expect(APPROVE_MENUS.map((menu) => menu.leaf)).toEqual([
      "quotation", "reserve", "memo-receive", "memo-return", "memo-out", "memo-out-return", "purchase-order", "purchase", "load-to-stock", "merge-split", "stock-transfer-location", "sale",
    ]);
    expect(APPROVE_PERMISSIONS).toContain("stock-transfer-location:APPROVE");
    expect(APPROVE_MENUS.filter((menu) => menu.party === "vendor").map((menu) => menu.slug)).toEqual(["memo-receive", "memo-return", "purchase-order", "purchase", "load-to-stock"]);
    expect(approveMenuFor("sale")).toMatchObject({ party: "customer", leaf: "sale", type: "sale", proc: "sale" });
    // lot-based-stock (UT-LOT-FE-09, owner Q3): Quotation, Reserve, Memo Out, Purchase, Memo Return search by Lot; the rest keep the Stock ID.
    expect(searchPlaceholder(approveMenuFor("reserve")!)).toBe("Search no., customer, stone, Lot");
    expect(searchPlaceholder(approveMenuFor("quotation")!)).toBe("Search no., customer, stone, Lot");
    expect(searchPlaceholder(approveMenuFor("memo-out")!)).toBe("Search no., customer, stone, Lot");
    expect(searchPlaceholder(approveMenuFor("memo-return")!)).toBe("Search no., vendor, stone, Lot");
    expect(searchPlaceholder(approveMenuFor("sale")!)).toBe("Search no., customer, stone, Stock ID");
    expect(searchPlaceholder(approveMenuFor("purchase")!)).toBe("Search no., vendor, stone, Lot");
    expect(searchPlaceholder(approveMenuFor("memo-receive")!)).toBe("Search no., vendor, stone, Stock ID");
    expect(searchPlaceholder(approveMenuFor("merge-split")!)).toBe("Search no., stone, Stock ID");
  });

  it("links each document number to its document page", () => {
    const base = (slug: string) => {
      const menu = approveMenuFor(slug);
      return menu && "documentBase" in menu ? menu.documentBase : null;
    };
    expect(base("reserve")).toBe("/pre-sale/reserve");
    expect(base("purchase-order")).toBe("/purchase/purchase-order");
    expect(base("purchase")).toBe("/purchase-order/purchase");
    expect(base("memo-out-return")).toBe("/memo/memo-out-return");
    expect(base("quotation")).toBe("/pre-sale/quotation");
    expect(base("sale")).toBe("/sale/sale");
  });
});

describe("UT-AP-10 routes and breadcrumbs", () => {
  it("builds /approve/<slug> and Home › Approve › {Menu}", () => {
    expect(approveMenuHref("memo-out")).toBe("/approve/memo-out");
    expect(approveBreadcrumbs("reserve")).toEqual([{ label: "Home", href: "/" }, { label: "Approve", href: "/approve" }, { label: "Reserve" }]);
  });

  it("an unknown slug ends with Menu not found", () => {
    expect(approveMenuFor("no-such-menu")).toBeUndefined();
    expect(approveBreadcrumbs("no-such-menu").at(-1)).toEqual({ label: "Menu not found" });
  });
});
