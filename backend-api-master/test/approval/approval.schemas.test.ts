import { describe, expect, it } from "vitest";
import { DOC_STATUSES, rejectInputSchema, requestRevisionInputSchema, submitInputSchema } from "../../src/approval/approval.schemas";
import { memoReceiveListSchema, memoOutListSchema, memoReturnListSchema, reserveListSchema } from "../../src/trade-document/memo-schemas";
import { purchaseListSchema } from "../../src/purchase/purchase.schemas";
import { purchaseOrderListSchema } from "../../src/purchase-order/purchase-order.schemas";
import { quotationListSchema, QUOTATION_STATUSES } from "../../src/quotation/quotation.schemas";

/** UT-AP-B09 / UT-AS-B05 (ADR-0046 D2/D3 as amended by ADR-0048): status enums and review / submit inputs. */

const ID = "0b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d0e";
const issues = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; code: string }[] } }) =>
  result.error?.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) ?? [];

describe("approval schemas", () => {
  it("UT-AS-B05 reject reason / revise note: trimmed, required 1–500, line breaks allowed", () => {
    expect(rejectInputSchema.parse({ id: ID, expectedVersion: 2, reason: "  Wrong price \n second line  " })).toEqual({ id: ID, expectedVersion: 2, reason: "Wrong price \n second line" });
    expect(requestRevisionInputSchema.parse({ id: ID, expectedVersion: 1, note: "x".repeat(500) }).note).toHaveLength(500);
    expect(issues(rejectInputSchema.safeParse({ id: ID, expectedVersion: 2, reason: "   " }))).toEqual([{ path: "reason", code: "too_small" }]);
    expect(issues(rejectInputSchema.safeParse({ id: ID, expectedVersion: 2, reason: "" }))).toEqual([{ path: "reason", code: "too_small" }]);
    expect(issues(requestRevisionInputSchema.safeParse({ id: ID, expectedVersion: 2, note: "x".repeat(501) }))).toEqual([{ path: "note", code: "too_big" }]);
    // A reason is required for Revise as well as Reject (ADR-0048).
    expect(issues(requestRevisionInputSchema.safeParse({ id: ID, expectedVersion: 2 }))).toEqual([{ path: "note", code: "invalid_type" }]);
    expect(issues(rejectInputSchema.safeParse({ id: ID, expectedVersion: 2 }))).toEqual([{ path: "reason", code: "invalid_type" }]);
  });

  it("UT-AP-B09 strict inputs: unknown keys (actor id / name), bad id or version are refused; submit is {id, expectedVersion}", () => {
    expect(rejectInputSchema.safeParse({ id: ID, expectedVersion: 1, reason: "r", actorId: "x" }).success).toBe(false);
    expect(requestRevisionInputSchema.safeParse({ id: ID, expectedVersion: 1, note: "n", reviewedByName: "x" }).success).toBe(false);
    expect(requestRevisionInputSchema.safeParse({ id: ID, expectedVersion: 1, reason: "n" }).success).toBe(false);
    expect(submitInputSchema.parse({ id: ID, expectedVersion: 3 })).toEqual({ id: ID, expectedVersion: 3 });
    expect(submitInputSchema.safeParse({ id: ID, expectedVersion: 0 }).success).toBe(false);
    expect(submitInputSchema.safeParse({ id: "not-a-uuid", expectedVersion: 1 }).success).toBe(false);
    expect(submitInputSchema.safeParse({ id: ID, expectedVersion: 1, submittedBy: "x" }).success).toBe(false);
  });

  it("UT-AP-B09 list status filters accept DRAFT, PENDING_APPROVAL, APPROVED, REJECTED, REVISION_REQUESTED", () => {
    expect(DOC_STATUSES).toEqual(["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "REVISION_REQUESTED"]);
    for (const schema of [memoReceiveListSchema, memoReturnListSchema, memoOutListSchema, reserveListSchema, purchaseOrderListSchema]) {
      for (const status of DOC_STATUSES) expect(schema.safeParse({ status }).success, status).toBe(true);
      expect(schema.safeParse({ status: "CANCELLED" }).success).toBe(false);
    }
    for (const status of DOC_STATUSES) expect(purchaseListSchema.safeParse({ status }).success, status).toBe(true);
    // Quotation keeps CANCELLED and gains REVISION_REQUESTED.
    expect(QUOTATION_STATUSES).toEqual(["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "REVISION_REQUESTED", "CANCELLED"]);
    for (const status of QUOTATION_STATUSES) expect(quotationListSchema.safeParse({ status }).success, status).toBe(true);
  });
});
