import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomeCardView, shortcutCount } from "@/features/home/home-dashboard";
import { canViewWith, homeCards, visibleHomeCards, type HomeCard } from "@/features/home/navigation";

/** Home shortcut cards arranged as the owner's design (2026-11-09). */
const shape = (cards: readonly HomeCard[]) => cards.map((card) => [card.title, card.blocks.map((block) => [block.title ?? "", block.links.map((entry) => entry.label)])]);
const all = visibleHomeCards(homeCards, (permission) => canViewWith({ isSuperAdmin: true, permissions: "ALL" }, permission));

describe("UT-HOME-04 card order and contents follow the design", () => {
  it("7 cards: Main Menu (with Sale), Pre-Sale, Memo, Purchase Order, Inventory, Account, Report", () => {
    expect(shape(all)).toEqual([
      ["Main Menu", [["", ["Dashboard", "Setup", "Sale", "Approve"]]]],
      ["Pre-Sale", [["", ["Quotation", "Reserve"]]]],
      ["Memo", [["", ["Memo Receive", "Memo Return", "Memo Out", "Memo Out Return"]], ["Memo Outstanding", ["Vendor", "Customer"]]]],
      ["Purchase Order", [["", ["Purchase Order (PO)", "Purchase", "Purchase Outstanding"]]]],
      ["Inventory", [["", ["Load to Stock", "Merge/Split", "Stock Transfer Location", "Stock Adjustment", "Barcode Printing"]]]],
      ["Account", [["", ["Payable", "Receivable"]], ["Account Outstanding", ["O/S Payable", "O/S Receivable"]]]],
      ["Report", [["Stock Movement", ["Primary Stock", "Consignment Stock"]], ["Closing Stock", ["Primary Stock", "Consignment Stock"]], ["Sale Report", ["Compare With Costing", "Shareholder Report", "Commission Report"]]]],
    ]);
    expect(shortcutCount(all)).toBe(31);
  });

  it("links open the same pages as the sidebar", () => {
    const hrefs = Object.fromEntries(all.flatMap((card) => card.blocks.flatMap((block) => block.links.map((entry) => [entry.label, entry.href]))));
    expect(hrefs.Quotation).toBe("/pre-sale/quotation");
    expect(hrefs.Purchase).toBe("/purchase-order/purchase");
    expect(hrefs.Approve).toBe("/approve");
  });
});

describe("UT-HOME-05 permissions (same rule as the sidebar)", () => {
  it("only menus with VIEW show; empty blocks and cards drop out", () => {
    const mine = { isSuperAdmin: false, permissions: ["quotation:VIEW", "memo-outstanding-vendor:VIEW", "payable:VIEW"] };
    expect(shape(visibleHomeCards(homeCards, (permission) => canViewWith(mine, permission)))).toEqual([
      ["Pre-Sale", [["", ["Quotation"]]]],
      ["Memo", [["Memo Outstanding", ["Vendor"]]]],
      ["Account", [["", ["Payable"]]]],
    ]);
    expect(visibleHomeCards(homeCards, (permission) => canViewWith(undefined, permission))).toEqual([]);
  });
});

describe("UT-HOME-06 card layout", () => {
  const card = (id: string) => all.find((entry) => entry.id === id) as HomeCard;

  it("a card with sub-groups uses two columns with grey sub-titles; a plain card one column", () => {
    const memo = renderToStaticMarkup(createElement(HomeCardView, { card: card("memo") }));
    expect(memo).toContain("grid grid-cols-2");
    expect(memo).toContain(">Memo Outstanding</h3>");
    const pre = renderToStaticMarkup(createElement(HomeCardView, { card: card("pre-sale") }));
    expect(pre).not.toContain("grid-cols-2");
    expect(pre).toContain('href="/pre-sale/reserve"');
  });
});
