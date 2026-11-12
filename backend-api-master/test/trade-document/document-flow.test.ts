import { HttpException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { Prisma } from "../../src/generated/prisma/client";
import { documentFlow, explainReviewMiss, planData, restoreData, reviewOfRow, reviewUpdate, saveFlow, storedInput } from "../../src/trade-document/document-engine";
import { documentErrors } from "../../src/trade-document/document-errors";

/**
 * UT-AP-B01…B04 / UT-AS-B01 / UT-AS-B08 (approval-setup ADR-0050 with ADR-0046): the engine's pure approval helpers —
 * Save plan columns, restore columns (G3), the guarded review UPDATE, the review miss order, Flow of a stored row and
 * the stored document as submit's validation input.
 */

const now = new Date("2026-11-10T03:00:00.000Z");
const code = (fn: () => never) => { try { fn(); } catch (error) { return ((error as HttpException).getResponse() as { error: { code: string } }).error.code; } return null; };

describe("engine approval helpers", () => {
  it("UT-AS-B01 planData: DRAFT stays DRAFT; DRAFT → APPROVED auto records the saver (update clears a kept review); reapply and revision keep columns", () => {
    expect(planData({ status: "DRAFT", autoApproved: false, effects: "none" }, false, "u", now)).toEqual({ status: "DRAFT", autoApproved: false });
    expect(planData({ status: "APPROVED", autoApproved: true, effects: "apply" }, false, "u", now)).toEqual({ status: "APPROVED", autoApproved: true, approvedAt: now, approvedBy: "u" });
    expect(planData({ status: "APPROVED", autoApproved: true, effects: "apply" }, true, "u", now)).toMatchObject({ reviewAction: null, reviewNote: null, reviewedByName: null });
    expect(planData({ status: "APPROVED", autoApproved: true, effects: "reapply" }, true, "u", now)).toEqual({});
    expect(planData({ status: "REVISION_REQUESTED", autoApproved: false, effects: "none" }, true, "u", now)).toEqual({});
  });

  it("G3 restoreData: ON → DRAFT with approval and submitted_* cleared; OFF → auto-approved, review cleared", () => {
    expect(restoreData(true, "u", now)).toEqual({ status: "DRAFT", autoApproved: false, approvedAt: null, approvedBy: null, submittedAt: null, submittedBy: null, submittedByName: null });
    expect(restoreData(false, "u", now)).toMatchObject({ status: "APPROVED", autoApproved: true, approvedAt: now, approvedBy: "u", submittedAt: null, reviewAction: null });
  });

  it("UT-AP-B01 / B02 reviewUpdate: guarded on a live PENDING at the version; Revise also below the limit and counts once", () => {
    const actor = { id: "a", name: "Ann" };
    expect(reviewUpdate(actor, "id", 3, "REJECT", "No", now)).toEqual({
      where: { id: "id", version: 3, status: "PENDING_APPROVAL", deletedAt: null },
      data: { status: "REJECTED", reviewAction: "REJECT", reviewNote: "No", reviewedAt: now, reviewedBy: "a", reviewedByName: "Ann", version: { increment: 1 }, updatedAt: now, updatedBy: "a" },
    });
    expect(reviewUpdate(actor, "id", 3, "REVISE", "Fix", now)).toMatchObject({
      where: { revisionCount: { lt: 1 } }, data: { status: "REVISION_REQUESTED", reviewAction: "REVISE", revisionCount: { increment: 1 } },
    });
  });

  it("UT-AP-B03 / UT-AS-B04 review miss order: NOT_FOUND → DELETED → STATUS_INVALID → REVISE_LIMIT → CHANGED", () => {
    const errors = documentErrors("X", "X", "x");
    expect(code(() => explainReviewMiss(errors, null, "REJECT"))).toBe("X_NOT_FOUND");
    expect(code(() => explainReviewMiss(errors, { status: "PENDING_APPROVAL", version: 1, deletedAt: new Date() }, "REJECT"))).toBe("X_DELETED");
    for (const status of ["DRAFT", "APPROVED", "REJECTED", "REVISION_REQUESTED"]) expect(code(() => explainReviewMiss(errors, { status, version: 1, deletedAt: null }, "REJECT"))).toBe("X_STATUS_INVALID");
    expect(code(() => explainReviewMiss(errors, { status: "PENDING_APPROVAL", version: 1, deletedAt: null, revisionCount: 1 }, "REVISE"))).toBe("X_REVISE_LIMIT");
    expect(code(() => explainReviewMiss(errors, { status: "PENDING_APPROVAL", version: 1, deletedAt: null, revisionCount: 1 }, "REJECT"))).toBe("X_CHANGED");
    expect(code(() => explainReviewMiss(errors, { status: "PENDING_APPROVAL", version: 1, deletedAt: null, revisionCount: 0 }, "REVISE"))).toBe("X_CHANGED");
  });

  it("documentErrors: IN_USE carries details {usedBy} only when known; APPROVAL_OFF / REVISE_LIMIT are 409", () => {
    const errors = documentErrors("X", "X", "x");
    expect(errors.inUse("MR-7").getResponse()).toMatchObject({ error: { code: "X_IN_USE", details: { usedBy: "MR-7" } } });
    expect((errors.inUse(null).getResponse() as { error: Record<string, unknown> }).error).not.toHaveProperty("details");
    expect([errors.approvalOff().getStatus(), errors.reviseLimit().getStatus()]).toEqual([409, 409]);
  });

  it("UT-AS-B08 documentFlow / saveFlow / reviewOfRow: flags from status, auto-approval, use and grants", () => {
    const row = { status: "APPROVED", autoApproved: true, revisionCount: 0, deletedAt: null, reviewAction: null, reviewNote: null, reviewedAt: null, reviewedByName: null, submittedAt: null, submittedByName: null };
    const editor = { isSuperAdmin: false, grants: ["reserve:EDIT", "reserve:DELETE", "reserve:ADD"] };
    expect(documentFlow(row, "reserve", true, null, editor)).toMatchObject({ canEdit: true, canDelete: true, canSubmit: false, usedBy: null, review: null, submittedAt: null });
    expect(documentFlow(row, "reserve", true, "MO-1", editor)).toMatchObject({ canEdit: false, canDelete: false, usedBy: { docNo: "MO-1" } });
    expect(documentFlow({ ...row, status: "DRAFT", autoApproved: false }, "reserve", true, null, null)).toMatchObject({ canEdit: false, canSubmit: false });
    expect(saveFlow("reserve", { status: "DRAFT", autoApproved: false, effects: "none" }, 0, true, editor)).toEqual({
      status: "DRAFT", autoApproved: false, revisionCount: 0, canEdit: true, canDelete: true, canSubmit: true, usedBy: null,
    });
    expect(reviewOfRow({ reviewAction: "REJECT", reviewNote: "No", reviewedAt: now, reviewedByName: null })).toEqual({ action: "REJECT", note: "No", at: now.toISOString(), byName: null });
    expect(reviewOfRow({ reviewAction: null })).toBeNull();
  });

  it("storedInput: the stored header and lines as a Save input (decimals as strings, stone code from its snapshot)", () => {
    const D = (value: string) => new Prisma.Decimal(value);
    const input = storedInput({
      docDate: new Date("2026-11-10T00:00:00Z"), dueDate: new Date("2026-11-30T00:00:00Z"), currencyCode: "THB", exchangeRate: null,
      discountType: "PERCENT", discountValue: D("5"), taxEnabled: true, taxRate: D("7"), taxIncluded: false, laborWork: null, laborBasis: null, laborQty: null, laborRate: null,
      charges: [{ chargeType: "SHIPPING", amount: D("100") }], customerId: "c",
      lines: [{ memoStockId: "m", pcs: 2, weightCt: D("1.5"), unitPrice: D("10"), discountType: "NONE", discountValue: D("0"), stoneCodeSnapshot: "RU", outstandingWeightCt: null }],
    });
    expect(input).toMatchObject({
      docDate: "2026-11-10", dueDate: "2026-11-30", currency: "THB", exchangeRate: null, customerId: "c",
      discount: { type: "PERCENT", value: "5" }, tax: { enabled: true, rate: "7", includeInPrice: false }, serviceCharges: [{ type: "SHIPPING", amount: "100.00" }], labor: null,
      lines: [{ memoStockId: "m", pcs: 2, weightCt: "1.500", unitPrice: "10.00", discount: { type: "NONE", value: "0" }, stoneCode: "RU", photoIds: [] }],
    });
  });
});
