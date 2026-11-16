import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * UT-DOC-KEY-01 (owner 2026-11-16: "approved, but the status stays until a reload"): every saved document page keys its
 * form on id + version, so a refetched newer version (approved, rejected, sent back) replaces the shown copy instead of
 * keeping the old version for Edit / Delete.
 */
describe("document pages remount on a new version", () => {
  it("UT-DOC-KEY-01 all eight document pages key the form on `${id}:${version}`", () => {
    for (const file of [
      "src/features/quotation/components/QuotationPage.tsx",
      "src/features/reserve/components/ReservePage.tsx",
      "src/features/memo-receive/components/MemoReceivePage.tsx",
      "src/features/memo-return/components/MemoReturnPage.tsx",
      "src/features/memo-out/components/MemoOutPage.tsx",
      "src/features/memo-out-return/components/MemoOutReturnPage.tsx",
      "src/features/purchase-order/components/PurchaseOrderPage.tsx",
      "src/features/purchase/components/PurchasePage.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain("key={`${id}:${detail.data.version}`}");
      expect(source, file).not.toMatch(/Form key=\{id\}/);
    }
  });
});
