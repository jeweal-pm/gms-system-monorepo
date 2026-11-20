import { describe, expect, it, vi } from "vitest";
import { mergeSettings } from "@/features/approval-setup/model";
import { detailQueryKey, invalidateAfterReview } from "@/features/approve-center/api";
import { salePreview, saleDocumentClient, toPendingItem } from "@/features/approve-center/inventory";
import { approveMenuFor } from "@/features/approve-center/menus";
import { isInventoryApprovalType } from "@/features/inventory/approval";
import { pendingPageSchema } from "@/features/load-to-stock/types";
import { invalidateForNotification } from "@/features/notifications/api";
import { documentHref, listHref, typeLabel } from "@/features/notifications/model";
import { saleCalls } from "@/features/sale/api";
import { APPROVAL_DOCUMENTS, mapFlowError } from "@/features/trade-document/flow-status";
import { InventoryApiError } from "@/lib/inventory-client";
import { ID, saleOut } from "./fixtures";

/**
 * IT-SL-06 (FE-SL-009): Sale in the shared approval platform, served by backend-api-inventory: approval type and its
 * `SALE_*` flow errors, inventory settings / summary / pending rows, the Approve menu's client and preview, Approval
 * Setup rows, and notification links / refreshes.
 */

describe("IT-SL-06a approval type sale (ADR-0050 flow on inventory)", () => {
  it("is an inventory approval type with code SALE; flow errors name the sale", () => {
    expect(isInventoryApprovalType("sale")).toBe(true);
    expect(APPROVAL_DOCUMENTS.sale).toEqual({ code: "SALE", menu: "Sale" });
    const error = new InventoryApiError(409, "SALE_REVISE_LIMIT", "x");
    expect(mapFlowError(error, "sale", "SL-1", "submit")?.message).toBe("SL-1 was already sent back once. Approve or reject it.");
    expect(mapFlowError(new InventoryApiError(409, "SALE_STATUS_INVALID", "x"), "sale", undefined, "submit")?.message).toBe("This Sale can't be sent to approve in its current status.");
  });

  it("Approval Setup lists Sale from inventory as available", () => {
    const merged = mergeSettings([], [{ type: "sale", requireApproval: false, version: 2, waitingCount: { pending: 1, revision: 1 } }])!;
    expect(merged).toEqual([{ type: "sale", requireApproval: false, available: true, version: 2, updatedAt: "", updatedByName: null, waiting: 2 }]);
  });
});

describe("IT-SL-06b Approve Center Sale menu", () => {
  it("pending rows (value + currency of the sale) parse and map to the shared row", () => {
    const page = pendingPageSchema.parse({
      items: [{ id: ID, docNo: "SL-1001", docDate: "2026-11-20", partyName: "Al Noor", submittedAt: "2026-11-20T02:00:00.000Z", submittedByName: "Ann", totalPcs: 3, totalWeightCt: "17.500", value: "1225.15", currency: "USD", revisionCount: 0 }],
      nextCursor: null,
    });
    const row = toPendingItem(page.items[0]!, "THB", "sale");
    expect(row).toMatchObject({ type: "sale", docNo: "SL-1001", currency: "USD", grandTotal: "1225.15", party: { name: "Al Noor" }, version: 0 });
  });

  it("the document client previews, and approves / revises / rejects with the current version (read first when the row has none)", async () => {
    const sent: { url: string; method: string; body: unknown }[] = [];
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({ url: String(input), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const body = (init?.method ?? "GET") === "GET" ? saleOut() : { id: ID, version: 4, status: "APPROVED" };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
    const client = saleDocumentClient(saleCalls({ fetch: fetch as unknown as typeof globalThis.fetch, renew: async () => false }));
    const preview = await client.get.query({ id: ID });
    expect(preview).toMatchObject({ docNo: "SL-1001", customer: { name: "Al Noor" }, currency: "USD", totals: { grandTotal: "1225.15" } });
    expect(preview.lines.map((line) => line.stockId)).toEqual(["260014", "260009"]);
    await client.approve.mutate({ id: ID, expectedVersion: 0 });
    await client.requestRevision.mutate({ id: ID, expectedVersion: 3, note: "fix" });
    await client.reject.mutate({ id: ID, expectedVersion: 3, reason: "no" });
    expect(sent.map((entry) => `${entry.method} ${entry.url.replace("/api/inventory/v1", "")}`)).toEqual([
      `GET /sale/${ID}`, `GET /sale/${ID}`, `POST /sale/${ID}/approve`, `POST /sale/${ID}/request-revision`, `POST /sale/${ID}/reject`,
    ]);
    expect(sent[2]!.body).toEqual({ expectedVersion: 3 });
    expect(salePreview(saleOut({ deleted: { at: "x", by: "u" } })).deletedAt).toBe("x");
  });

  it("menu, preview cache key and refreshes after a review (inventory, Memo Stock, Reserve)", async () => {
    const menu = approveMenuFor("sale");
    expect(menu).toMatchObject({ label: "Sale", availability: "available", proc: "sale", documentBase: "/sale/sale", party: "customer" });
    expect(detailQueryKey("sale", ID)).toEqual(["inventory", "sale", "preview", ID]);
    const keys: unknown[] = [];
    const client = { invalidateQueries: vi.fn(async ({ queryKey }: { queryKey: unknown }) => void keys.push(queryKey)) };
    await invalidateAfterReview(client as never, "sale", "approve");
    expect(keys).toEqual([["inventory"], [["memoStock"]], [["reserve"]]]);
  });
});

describe("IT-SL-06c notifications for documentType sale", () => {
  it("links to the sale and to the Approve Sale menu; label Sale", () => {
    expect(typeLabel("sale")).toBe("Sale");
    expect(documentHref({ documentType: "sale", documentId: ID })).toBe(`/sale/sale/${ID}`);
    expect(listHref({ documentType: "sale", type: "approval.pending" })).toBe("/approve/sale");
  });

  it("a sale event refreshes inventory reads; an approval also Memo Stock and Reserve", async () => {
    const keys: unknown[] = [];
    const client = { invalidateQueries: vi.fn(async ({ queryKey }: { queryKey: unknown }) => void keys.push(queryKey)) };
    await invalidateForNotification(client as never, { type: "document.approved", documentType: "sale" });
    expect(keys).toEqual([["inventory"], [["memoStock"]], [["reserve"]]]);
    keys.length = 0;
    await invalidateForNotification(client as never, { type: "approval.pending", documentType: "sale" });
    expect(keys).toEqual([["inventory"]]);
    keys.length = 0;
    await invalidateForNotification(client as never, { type: "document.approved", documentType: "load-to-stock" });
    expect(keys).toEqual([["inventory"], [["purchase"]]]);
  });
});
