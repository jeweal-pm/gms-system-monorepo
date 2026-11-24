import { describe, expect, it } from "vitest";
import { inventoryApprovalCalls } from "@/features/inventory/approval";
import { adjustmentOutSchema } from "@/features/stock-adjustment/api";
import { stockAdjustmentDocumentClient, stockAdjustmentPreview, toPendingItem } from "@/features/approve-center/inventory";
import { approveMenuFor } from "@/features/approve-center/menus";
import { previewView } from "@/features/approve-center/preview";
import type { AvailableMenu } from "@/features/approve-center/menus";

const detail = adjustmentOutSchema.parse({
  id: "11111111-1111-4111-8111-111111111111", docNo: "SA2611001", docDate: "2026-11-24", location: "BKK-01", ref: "COUNT-1", note: "Cycle count",
  status: "PENDING_APPROVAL", autoApproved: false, version: 2, deleted: null,
  lines: [{
    id: "22222222-2222-4222-8222-222222222222", position: 1, stockUuid: "33333333-3333-4333-8333-333333333333", stockId: "260005", lotKey: "OL1", refDocNo: "LD2611", priceUnit: "PER_CT",
    stockPcs: 4, stockWeightCt: "2.000", stockPrice: "10.00", physicalPcs: 5, physicalWeightCt: "2.500", physicalPrice: "12.00", remark: "Counted",
    diffPcs: 1, diffWeightCt: "0.500", diffPrice: "2.00",
    attrs: { stoneCode: "RU-1", stone: "Ruby", shape: "Oval", size: "5x7", color: "Red", clarity: "VS", cutting: "Good", quality: "A", lot: "L-1", location: "BKK-01", cerType: "GIA", cerNo: "C-1" },
  }],
  approval: { requireApproval: true, autoApproved: false, revisionCount: 1, submitted: null, review: null },
  flow: { canEdit: false, canDelete: false, canSubmit: false, canRestore: false, usedBy: null }, updatedAt: "2026-11-24T00:00:00.000Z", approvedAt: null, approvedBy: null,
});

describe("Stock Adjustment Approve Center adapter (FE-SAJ-007)", () => {
  it("maps location and signed differences into the shared preview and line summary", () => {
    const menu = approveMenuFor("stock-adjustment")!;
    const view = previewView(menu as AvailableMenu, stockAdjustmentPreview(detail), null, 2);
    expect(view).toMatchObject({ partyLabel: "Location", partyName: "BKK-01", totals: { pcs: 1, weightCt: "0.500" }, note: "Cycle count" });
    expect(view.rows[0]).toMatchObject({ code: "RU-1", pcs: 1, weightCt: "0.500", value: "2.00" });
  });

  it("maps pending signed totals and revision count for the review action limit", () => {
    expect(toPendingItem({ id: detail.id, docNo: detail.docNo!, docDate: detail.docDate, partyName: detail.location, submittedAt: "2026-11-24T00:00:00Z", submittedByName: "Maker", revisionCount: 1, lineCount: 1, totalDiffPcs: -2, totalDiffWeightCt: "-0.500" }, "THB", "stock-adjustment"))
      .toMatchObject({ type: "stock-adjustment", party: { name: "BKK-01" }, revisionCount: 1, lineCount: 1, totalPcs: -2, totalWeightCt: "-0.500" });
  });

  it("reads the current version before review and forwards the expected version", async () => {
    const calls: unknown[][] = [];
    const client = stockAdjustmentDocumentClient({
      get: async () => { calls.push(["get"]); return detail; },
      approve: async (id, version) => { calls.push(["approve", id, version]); return { id, version, status: "APPROVED" }; },
      reject: async (id, version, reason) => { calls.push(["reject", id, version, reason]); return { id, version }; },
      requestRevision: async (id, version, note) => { calls.push(["revise", id, version, note]); return { id, version }; },
    });
    await client.approve.mutate({ id: detail.id, expectedVersion: 0 });
    expect(calls).toEqual([["get"], ["approve", detail.id, 2]]);
  });

  it("does not send unsupported sort parameters to the strict stock-adjustment pending endpoint", async () => {
    let requested = "";
    const api = inventoryApprovalCalls({ fetch: async (input) => {
      requested = String(input);
      return Response.json({ items: [{ id: detail.id, docNo: "SA2611001", docDate: detail.docDate, partyName: "BKK-01", submittedAt: "2026-11-24T00:00:00Z", submittedByName: null, totalPcs: 0, revisionCount: 0, lineCount: 1, totalDiffPcs: 1, totalDiffWeightCt: "0.500" }], nextCursor: null });
    } });
    const page = await api.pending({ type: "stock-adjustment", sort: "docNo", dir: "desc", limit: 50 }, null);
    expect(requested).toContain("type=stock-adjustment");
    expect(requested).not.toContain("sort=");
    expect(requested).not.toContain("dir=");
    expect(page.items[0]).toMatchObject({ revisionCount: 0, totalDiffPcs: 1 });
  });
});
