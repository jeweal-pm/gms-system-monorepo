import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adjustmentKeys } from "@/features/stock-adjustment/api";
import { StockAdjustmentPage } from "@/features/stock-adjustment/components/StockAdjustmentPage";

const access = vi.hoisted(() => ({ view: true, add: true, edit: true, delete: true, approve: false }));
vi.mock("@/features/trade-document/document-api", () => ({ useDocumentAccess: () => access }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
afterEach(() => vi.clearAllMocks());

function renderPage(permission = true) {
  access.view = permission;
  const client = new QueryClient();
  client.setQueryData(adjustmentKeys.options, { locations: ["Safe A"], numbering: { configured: true } });
  client.setQueryData(adjustmentKeys.number("2026-11-24"), { docNo: "SA2611003" });
  client.setQueryData(adjustmentKeys.list, { pages: [{ items: [], nextCursor: null }], pageParams: [null] });
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(StockAdjustmentPage))).replaceAll("&#x27;", "'");
}

describe("IT-SAJ-01 Stock Adjustment page", () => {
  it("renders the number preview, headers, empty rows, picker affordance and disabled export actions", () => {
    const html = renderPage();
    expect(html).toContain("SA2611003"); expect(html).toContain("Number preview");
    for (const title of ["Doc Date", "Main Location", "Ref.", "Stock Adjustment", "Document Note", "Daybook"]) expect(html).toContain(title);
    expect(html.match(/Empty row · click to pick from stock/g)).toHaveLength(5);
    expect(html).toContain("Stock"); expect(html).toContain("Physical"); expect(html).toContain("Diff");
    expect(html).toMatch(/aria-label="Print"[^>]*disabled=""/); expect(html).toMatch(/aria-label="Export Excel"[^>]*disabled=""/);
  });
  it("does not render document data without VIEW access", () => {
    const html = renderPage(false);
    expect(html).toContain("You don't have permission to view Stock Adjustment.");
    expect(html).not.toContain("SA2611003");
  });
});
