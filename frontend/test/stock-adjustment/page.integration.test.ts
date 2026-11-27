import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adjustmentKeys } from "@/features/stock-adjustment/api";
import { adjustmentDaybookState, adjustmentHref, StockAdjustmentPage } from "@/features/stock-adjustment/components/StockAdjustmentPage";

const access = vi.hoisted(() => ({ view: true, add: true, edit: true, delete: true, approve: false }));
vi.mock("@/features/trade-document/document-api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/features/trade-document/document-api")>()), useDocumentAccess: () => access }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
// The page defaults Doc Date to today (todayIso); pin the clock so the number preview key matches the cached 2026-11-24 entry.
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-24T10:00:00+07:00")); });
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

function renderPage(permission = true) {
  access.view = permission;
  const client = new QueryClient();
  client.setQueryData(adjustmentKeys.options, { locations: ["Safe A"], numbering: { configured: true } });
  client.setQueryData(adjustmentKeys.number("2026-11-24"), { docNo: "SA2611003" });
  client.setQueryData(adjustmentKeys.list, { pages: [{ items: [], nextCursor: null }], pageParams: [null] });
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(StockAdjustmentPage))).replaceAll("&#x27;", "'");
}

describe("IT-SAJ-02 Stock Adjustment daybook rail", () => {
  it("maps the list API pages to daybook rows and links each to its document", () => {
    const fetchNextPage = vi.fn();
    const state = adjustmentDaybookState({ isPending: false, isError: false, error: null, hasNextPage: true, isFetchingNextPage: false, fetchNextPage,
      data: { pages: [{ items: [
        { id: "11111111-1111-4111-8111-111111111111", docNo: "SA2611001", docDate: "2026-11-24", location: "Safe A", status: "APPROVED", lineCount: 3, autoApproved: false, deleted: false },
        { id: "22222222-2222-4222-8222-222222222222", docNo: null, docDate: "2026-11-25", location: "BKK-01", status: "DRAFT", lineCount: 1, autoApproved: false, deleted: false },
      ], nextCursor: "c1" }], pageParams: [null] } } as unknown as Parameters<typeof adjustmentDaybookState>[0]);
    expect(state.items).toEqual([
      { id: "11111111-1111-4111-8111-111111111111", docNo: "SA2611001", docDate: "2026-11-24", status: "APPROVED", name: "Safe A · 3 rows" },
      { id: "22222222-2222-4222-8222-222222222222", docNo: "—", docDate: "2026-11-25", status: "DRAFT", name: "BKK-01 · 1 row" },
    ]);
    expect(state.hasMore).toBe(true); state.onLoadMore?.(); expect(fetchNextPage).toHaveBeenCalledOnce();
    expect(adjustmentHref("a b")).toBe("/inventory/stock-adjustment/a%20b");
  });
  it("reports a list failure", () => {
    const state = adjustmentDaybookState({ isPending: false, isError: true, error: new Error("x"), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(), data: undefined } as unknown as Parameters<typeof adjustmentDaybookState>[0]);
    expect(state.errorMessage).toBe("Couldn't load stock adjustments. Try again.");
  });
});

describe("IT-SAJ-01 Stock Adjustment page", () => {
  it("renders the number preview, headers, empty rows, picker affordance and disabled export actions", () => {
    const html = renderPage();
    expect(html).toContain("SA2611003"); expect(html).not.toContain("Number preview");
    for (const title of ["Doc Date", "Main Location", "Ref.", "Stock Adjustment", "Document Note"]) expect(html).toContain(title);
    // Transfer-page controls: dd/mm/yyyy date box, styled Select (no native <select>), From Stock + barcode button, right rail.
    expect(html).toContain('value="24/11/2026"'); expect(html).toContain('aria-label="Open calendar"');
    expect(html).not.toContain("<select"); expect(html).toMatch(/role="combobox"[^>]*>.*?>Select</);
    expect(html).toContain(">From Stock<"); expect(html).toContain('aria-label="Scan to add"');
    expect(html).not.toContain("Scan / enter Stock ID"); expect(html).not.toContain("Remove selected");
    expect(html).toContain('aria-label="Daybook"'); expect(html).toContain('aria-label="Summary Value"');
    expect(html).not.toContain("Stock Adjustment Daybook"); expect(html).toContain("0/250");
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
