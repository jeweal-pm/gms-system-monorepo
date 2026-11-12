import { describe, expect, it } from "vitest";
import {
  assertDeletable,
  assertEditable,
  assertReviewable,
  assertSubmittable,
  canApprove,
  canSubmit,
  flowFlags,
  isEditableStatus,
  REVISE_LIMIT,
  reviewOf,
  saveStatus,
  type FlowDoc,
  type FlowErrors,
} from "../../src/approval-setting/approval-flow";
import { APPROVAL_DOC_TYPES } from "../../src/approval-setting/approval-types";

/** UT-AS-B01…B06, B08 (approval-setup SA rev 1 / ADR-0048): the pure status rules shared by the eight documents. */

class Coded extends Error {
  constructor(readonly code: string, readonly usedBy?: string) { super(code); }
}
const errors: FlowErrors = {
  deleted: () => new Coded("DELETED"),
  statusInvalid: () => new Coded("STATUS_INVALID"),
  inUse: (usedBy) => new Coded("IN_USE", usedBy),
  approvalOff: () => new Coded("APPROVAL_OFF"),
  reviseLimit: () => new Coded("REVISE_LIMIT"),
};
const doc = (status: string, extra: Partial<FlowDoc> = {}): FlowDoc => ({ status, autoApproved: false, revisionCount: 0, deletedAt: null, ...extra });
const codeOf = (run: () => void) => {
  try { run(); return "ok"; } catch (error) { return (error as Coded).code; }
};
const noReview = { reviewAction: null, reviewNote: null, reviewedAt: null, reviewedByName: null };
const STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "REVISION_REQUESTED", "CANCELLED"] as const;

describe("approval-flow", () => {
  it("UT-AS-B01 saveStatus: ON create → DRAFT, OFF create → APPROVED auto + apply; updates keep DRAFT / REVISION_REQUESTED, auto-approved re-applies", () => {
    expect(saveStatus(true, null)).toEqual({ status: "DRAFT", autoApproved: false, effects: "none" });
    expect(saveStatus(false, null)).toEqual({ status: "APPROVED", autoApproved: true, effects: "apply" });
    expect(saveStatus(true, doc("DRAFT"))).toEqual({ status: "DRAFT", autoApproved: false, effects: "none" });
    expect(saveStatus(false, doc("DRAFT"))).toEqual({ status: "APPROVED", autoApproved: true, effects: "apply" });
    expect(saveStatus(true, doc("REVISION_REQUESTED", { revisionCount: 1 }))).toEqual({ status: "REVISION_REQUESTED", autoApproved: false, effects: "none" });
    expect(saveStatus(false, doc("REVISION_REQUESTED", { revisionCount: 1 }))).toEqual({ status: "REVISION_REQUESTED", autoApproved: false, effects: "none" });
    for (const requireApproval of [true, false]) {
      expect(saveStatus(requireApproval, doc("APPROVED", { autoApproved: true }))).toEqual({ status: "APPROVED", autoApproved: true, effects: "reapply" });
    }
    for (const status of ["PENDING_APPROVAL", "APPROVED", "REJECTED", "CANCELLED"]) {
      expect(() => saveStatus(true, doc(status))).toThrow(TypeError);
    }
  });

  it("UT-AS-B02 edit / delete matrix: every status × auto_approved × isUsed × deleted", () => {
    for (const status of STATUSES) {
      for (const autoApproved of [false, true]) {
        for (const usedBy of [null, "MR-1001"]) {
          for (const deletedAt of [null, new Date()]) {
            const state = doc(status, { autoApproved, deletedAt, revisionCount: status === "REVISION_REQUESTED" ? 1 : 0 });
            const expected = deletedAt ? "DELETED"
              : status === "DRAFT" || status === "REVISION_REQUESTED" ? "ok"
                : status === "APPROVED" && autoApproved ? (usedBy ? "IN_USE" : "ok")
                  : "STATUS_INVALID";
            const label = `${status} auto=${autoApproved} used=${usedBy} deleted=${Boolean(deletedAt)}`;
            expect(codeOf(() => assertEditable(state, usedBy, errors)), label).toBe(expected);
            expect(codeOf(() => assertDeletable(state, usedBy, errors)), label).toBe(expected);
          }
        }
      }
    }
    // The IN_USE error names the using document.
    try { assertEditable(doc("APPROVED", { autoApproved: true }), "PU-0007", errors); } catch (error) { expect((error as Coded).usedBy).toBe("PU-0007"); }
    expect(isEditableStatus(doc("PENDING_APPROVAL"))).toBe(false);
    expect(isEditableStatus(doc("APPROVED", { autoApproved: false }))).toBe(false);
  });

  it("UT-AS-B03 submit only from DRAFT / REVISION_REQUESTED while ON; ADD or EDIT grant", () => {
    for (const status of STATUSES) {
      const expected = status === "DRAFT" || status === "REVISION_REQUESTED" ? "ok" : "STATUS_INVALID";
      expect(codeOf(() => assertSubmittable(doc(status), true, errors)), status).toBe(expected);
    }
    expect(codeOf(() => assertSubmittable(doc("DRAFT"), false, errors))).toBe("APPROVAL_OFF");
    expect(codeOf(() => assertSubmittable(doc("REVISION_REQUESTED", { revisionCount: 1 }), false, errors))).toBe("APPROVAL_OFF");
    // Status is reported before the setting (a pending document stays STATUS_INVALID even if the type is OFF).
    expect(codeOf(() => assertSubmittable(doc("PENDING_APPROVAL"), false, errors))).toBe("STATUS_INVALID");
    expect(codeOf(() => assertSubmittable(doc("DRAFT", { deletedAt: new Date() }), true, errors))).toBe("DELETED");

    const user = (grants: string[]) => ({ isSuperAdmin: false, grants });
    expect(canSubmit(user(["reserve:ADD"]), "reserve")).toBe(true);
    expect(canSubmit(user(["reserve:EDIT"]), "reserve")).toBe(true);
    expect(canSubmit(user(["reserve:VIEW", "reserve:APPROVE", "memo-out:ADD"]), "reserve")).toBe(false);
    expect(canSubmit({ isSuperAdmin: true, grants: [] }, "purchase")).toBe(true);
  });

  it("UT-AS-B04 Revise once: second Revise → REVISE_LIMIT; Approve / Reject still allowed; only from PENDING_APPROVAL", () => {
    expect(REVISE_LIMIT).toBe(1);
    const first = doc("PENDING_APPROVAL");
    const resubmitted = doc("PENDING_APPROVAL", { revisionCount: 1 });
    expect(codeOf(() => assertReviewable(first, "REVISE", errors))).toBe("ok");
    expect(codeOf(() => assertReviewable(resubmitted, "REVISE", errors))).toBe("REVISE_LIMIT");
    expect(codeOf(() => assertReviewable(resubmitted, "APPROVE", errors))).toBe("ok");
    expect(codeOf(() => assertReviewable(resubmitted, "REJECT", errors))).toBe("ok");
    for (const status of STATUSES.filter((value) => value !== "PENDING_APPROVAL")) {
      for (const action of ["APPROVE", "REJECT", "REVISE"] as const) {
        expect(codeOf(() => assertReviewable(doc(status), action, errors)), `${status} ${action}`).toBe("STATUS_INVALID");
      }
    }
    expect(codeOf(() => assertReviewable(doc("PENDING_APPROVAL", { deletedAt: new Date() }), "APPROVE", errors))).toBe("DELETED");
  });

  it("UT-AS-B06 canApprove delegates to <menu>:APPROVE for every document type (Super Admin always)", () => {
    for (const type of APPROVAL_DOC_TYPES) {
      expect(canApprove({ isSuperAdmin: false, grants: [`${type}:APPROVE`] }, type)).toBe(true);
      expect(canApprove({ isSuperAdmin: false, grants: [`${type}:VIEW`, `${type}:EDIT`, `${type}:ADD`, "approval-setup:EDIT"] }, type)).toBe(false);
      expect(canApprove({ isSuperAdmin: true, grants: [] }, type)).toBe(true);
    }
    // Another type's APPROVE does not count.
    expect(canApprove({ isSuperAdmin: false, grants: ["memo-out:APPROVE"] }, "memo-out-return")).toBe(false);
  });

  it("UT-AS-B08 Flow flags per state and grants", () => {
    const all = { isSuperAdmin: false, grants: ["reserve:VIEW", "reserve:ADD", "reserve:EDIT", "reserve:DELETE"] };
    const flags = (state: FlowDoc, options: { requireApproval?: boolean; usedBy?: string | null; principal?: typeof all } = {}) => flowFlags({
      doc: { ...noReview, ...state }, type: "reserve", requireApproval: options.requireApproval ?? true, principal: options.principal ?? all, usedBy: options.usedBy ?? null,
    });
    expect(flags(doc("DRAFT"))).toEqual({ status: "DRAFT", autoApproved: false, revisionCount: 0, canEdit: true, canDelete: true, canSubmit: true, usedBy: null, review: null });
    // OFF: a draft can still be edited (Save approves it) but not sent to approve.
    expect(flags(doc("DRAFT"), { requireApproval: false })).toMatchObject({ canEdit: true, canSubmit: false });
    expect(flags(doc("PENDING_APPROVAL"))).toMatchObject({ canEdit: false, canDelete: false, canSubmit: false });
    expect(flags(doc("REJECTED"))).toMatchObject({ canEdit: false, canDelete: false, canSubmit: false });
    expect(flags(doc("APPROVED"))).toMatchObject({ canEdit: false, canDelete: false, autoApproved: false });
    expect(flags(doc("APPROVED", { autoApproved: true }))).toMatchObject({ canEdit: true, canDelete: true, canSubmit: false, usedBy: null });
    expect(flags(doc("APPROVED", { autoApproved: true }), { usedBy: "MO-12" })).toMatchObject({ canEdit: false, canDelete: false, usedBy: { docNo: "MO-12" } });
    expect(flags(doc("REVISION_REQUESTED", { revisionCount: 1 }))).toMatchObject({ revisionCount: 1, canEdit: true, canSubmit: true });
    expect(flags(doc("DRAFT", { deletedAt: new Date() }))).toMatchObject({ canEdit: false, canDelete: false, canSubmit: false });
    // Grants: EDIT → canEdit, DELETE → canDelete, ADD or EDIT → canSubmit.
    expect(flags(doc("DRAFT"), { principal: { isSuperAdmin: false, grants: ["reserve:ADD"] } })).toMatchObject({ canEdit: false, canDelete: false, canSubmit: true });
    expect(flags(doc("DRAFT"), { principal: { isSuperAdmin: false, grants: ["reserve:DELETE"] } })).toMatchObject({ canEdit: false, canDelete: true, canSubmit: false });
    expect(flags(doc("DRAFT"), { principal: { isSuperAdmin: true, grants: [] } })).toMatchObject({ canEdit: true, canDelete: true, canSubmit: true });

    const at = new Date("2026-11-10T03:00:00.000Z");
    const revised = flowFlags({
      doc: { ...doc("REVISION_REQUESTED", { revisionCount: 1 }), reviewAction: "REVISE", reviewNote: "Fix the weight", reviewedAt: at, reviewedByName: "Mint" },
      type: "reserve", requireApproval: true, principal: all, usedBy: null,
    });
    expect(revised.review).toEqual({ action: "REVISE", note: "Fix the weight", at: "2026-11-10T03:00:00.000Z", byName: "Mint" });
    expect(reviewOf({ reviewAction: "REJECT", reviewNote: "No", reviewedAt: at, reviewedByName: null })).toEqual({ action: "REJECT", note: "No", at: at.toISOString(), byName: null });
    expect(reviewOf({ reviewAction: "OTHER", reviewNote: "x", reviewedAt: at, reviewedByName: null })).toBeNull();
  });
});
