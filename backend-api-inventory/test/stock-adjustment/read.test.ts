import { describe, expect, it } from "vitest";
import type { Db } from "../../src/platform/db";
import type { Principal } from "../../src/platform/auth/principal";
import { approvalPending, approvalSummary, getDetail, listDocuments, stockPage } from "../../src/modules/stock-adjustment/read";

function measuredDb(...answers: unknown[][]) {
  const statements: unknown[] = [];
  const db = { $queryRaw: async (query: unknown) => { statements.push(query); return answers[statements.length - 1] ?? []; } } as unknown as Db;
  return { db, statements };
}
const viewer: Principal = { userId: "user", sessionId: "session", isSuperAdmin: false, grants: new Set(["stock-adjustment:VIEW", "stock-adjustment:APPROVE"]), displayName: "User", accessExpiresAt: null };

describe("Stock Adjustment N+1 budgets", () => {
  it("UT-SAJ-B03 list, stock picker, summary and pending read each run one statement for an empty or paged result", async () => {
    const list = measuredDb([]);
    await listDocuments(list.db, { limit: 50 });
    expect(list.statements).toHaveLength(1);

    const picker = measuredDb([]);
    await stockPage(picker.db, { location: "Main", exclude: [], limit: 50 });
    expect(picker.statements).toHaveLength(1);

    const summary = measuredDb([{ require_approval: true, count: 3 }]);
    await approvalSummary(summary.db, viewer);
    expect(summary.statements).toHaveLength(1);

    const pending = measuredDb([]);
    await approvalPending(pending.db, { limit: 50 });
    expect(pending.statements).toHaveLength(1);
  });

  it("UT-SAJ-B04 detail stays at two queries as line count grows: one header and one joined line batch", async () => {
    const now = new Date();
    const header = { id: "0193a6c0-0000-7000-8000-000000000001", doc_no: "SA-1", doc_date: "2026-11-24", location: "Main", ref: "", note: "", status: "DRAFT", auto_approved: false, version: 1,
      revision_count: 0, submitted_at: null, submitted_by: null, submitted_by_name: null, review_action: null, review_note: null, reviewed_at: null, reviewed_by: null, reviewed_by_name: null,
      approved_at: null, approved_by: null, deleted_at: null, deleted_by: null, created_at: now, created_by: "user", updated_at: now, require_approval: true };
    const lines = Array.from({ length: 200 }, (_, i) => ({ id: `line-${i}`, position: i + 1, stock_uuid: header.id, stock_id: `S${i}`, lot_key: `OS${i}`, ref_doc_no: "LS-1", stock_pcs: 2,
      stock_weight_ct: "1.000", stock_price: "100.00", physical_pcs: 1, physical_weight_ct: "0.500", physical_price: null, remark: "", price_unit: "PER_CT",
      stone_code: "", stone: "Ruby", shape: "Oval", size: "", color: "Red", clarity: "", cutting: "", quality: "", lot: "L1", location: "Main", cer_type: "", cer_no: "" }));
    const detail = measuredDb([header], lines);
    const result = await getDetail(detail.db, header.id, viewer);
    expect(result.lines).toHaveLength(200);
    expect(detail.statements).toHaveLength(2);
  });
});
