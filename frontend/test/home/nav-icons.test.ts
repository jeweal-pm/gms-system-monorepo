import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomeIcon, SaleReportIcon } from "@/features/home/nav-icons";
import { railModules, sidebarSections, type NavEntry } from "@/features/home/navigation";
import { SIDEBAR_ICON_SIZE } from "@/features/home/sidebar-disclosure";

/** UT-NAV-ICON-01…04: sidebar icons from the owner's design SVGs (2026-10-20). */

const iconName = (icon: unknown) => renderToStaticMarkup(createElement(icon as typeof HomeIcon, { size: 18 })).match(/data-icon="([^"]+)"/)?.[1];

describe("design nav icons", () => {
  it("UT-NAV-ICON-01 render a 16-unit outline in currentColor at the requested size", () => {
    const html = renderToStaticMarkup(createElement(HomeIcon, { size: 18, strokeWidth: 1.5, className: "shrink-0", "aria-hidden": true }));
    expect(html).toContain('viewBox="0 0 16 16"');
    expect(html).toContain('width="18"');
    expect(html).toContain('stroke="currentColor"');
    expect(html).toContain('fill="none"');
    expect(html).toContain('class="shrink-0"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("#1C252E");
    expect(html.match(/<path /g)).toHaveLength(2);
  });

  it("UT-NAV-ICON-02 keep the design's 1.25 px stroke at any size (lucide strokeWidth is ignored)", () => {
    const stroke = (size: number) => Number(renderToStaticMarkup(createElement(SaleReportIcon, { size, strokeWidth: 1.5 })).match(/stroke-width="([\d.]+)"/)?.[1]);
    expect(stroke(16)).toBeCloseTo(1.25);
    expect(stroke(18) * (18 / 16)).toBeCloseTo(1.25);
    expect(stroke(24) * (24 / 16)).toBeCloseTo(1.25);
  });

  it("UT-NAV-ICON-03 every sidebar item and the top rail links use the design icons", () => {
    const byLabel = Object.fromEntries(
      sidebarSections.flatMap((section) => section.items).map((item: NavEntry) => [item.label, iconName(item.icon)]),
    );
    expect(byLabel).toEqual({
      Home: "home",
      Dashboard: "dashboard",
      Setup: "setup",
      Approve: "approve",
      Quotation: "quotation",
      Reserve: "reserve",
      "Memo Receive": "memo-receive",
      "Memo Return": "memo-return",
      "Memo Out": "memo-out",
      "Memo Out Return": "memo-out-return",
      "Memo Outstanding": "file-outstanding",
      "Purchase Order (PO)": "purchase-order",
      "Purchase (PU)": "purchase",
      "Purchase Outstanding": "purchase-outstanding",
      "Load to Stock": "box-clock",
      "Merge/Split": "split-vertical",
      "Stock Transfer Location": "stock-transfer",
      "Stock Adjustment": "file-outstanding",
      "Barcode Printing": "barcode",
      Sale: "sale",
      "Account Outstanding": "file-outstanding",
      "Stock Movement": "file-outstanding",
      "Closing Stock": "closing-stock",
      "Sale Report": "sale-report",
    });
    expect(railModules.filter((module) => module.kind === "link").map((module) => iconName(module.icon))).toEqual(["home", "dashboard", "setup", "approve"]);
  });

  it("UT-NAV-ICON-04 sidebar rows render the icons at 16 × 16 px (owner 2026-10-20)", () => {
    expect(SIDEBAR_ICON_SIZE).toBe(16);
    const html = renderToStaticMarkup(createElement(HomeIcon, { size: SIDEBAR_ICON_SIZE }));
    expect(html).toContain('width="16"');
    expect(html).toContain('height="16"');
    expect(html).toContain('stroke-width="1.25"');
  });
});
