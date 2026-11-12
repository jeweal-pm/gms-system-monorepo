import type { DocStatus } from "../approval/approval.schemas";
import { hasMasterGrant } from "../master/authorization";
import { APPROVAL_DOC_TYPE_INFO, APPROVAL_DOC_TYPES, type ApprovalDocType } from "./approval-types";

/**
 * Shared status rules of the eight approval documents (approval-setup SA rev 1 / ADR-0050 "Key rules", amending
 * approve-center ADR-0046). Pure functions: the services read the setting (`readForSave`, FOR SHARE), lock the header
 * and compute `isUsed`, then ask these helpers what is allowed and which status to write.
 *
 * - ON:  create → DRAFT; submit → PENDING_APPROVAL (locked); approve → APPROVED; requestRevision (once) →
 *        REVISION_REQUESTED; reject → REJECTED (final).
 * - OFF: create / update of a DRAFT → APPROVED with `auto_approved` and the approve effects applied.
 * - Editable / deletable iff DRAFT, REVISION_REQUESTED, or (APPROVED and auto-approved and not used).
 */

/** The state of a stored document the rules need (Quotation additionally has CANCELLED). */
export type FlowDoc = {
  status: DocStatus | "CANCELLED" | string;
  autoApproved: boolean;
  revisionCount: number;
  deletedAt?: Date | string | null;
};

/** The caller, from the master auth context. */
export type FlowPrincipal = { isSuperAdmin: boolean; grants: readonly string[] };

/** Domain errors of the document type (`<CODE>_*`); stage 2 adds `approvalOff` / `reviseLimit` / `inUse(usedBy)` to DocumentErrors. */
export type FlowErrors = {
  deleted(): Error;
  statusInvalid(): Error;
  /** `<CODE>_IN_USE` with `details: { usedBy }` (the first document that uses it). */
  inUse(usedBy: string): Error;
  /** `<CODE>_APPROVAL_OFF`: submit while the type's approval is OFF. */
  approvalOff(): Error;
  /** `<CODE>_REVISE_LIMIT`: a second Revise. */
  reviseLimit(): Error;
};

/** Revise is allowed once per document (owner rule 2026-11-10, ADR-0050). */
export const REVISE_LIMIT = 1;

const SUBMITTABLE: readonly string[] = ["DRAFT", "REVISION_REQUESTED"];

/** What a Save writes and which stock effects it runs (`reapply` = reverse the old content, then apply the new). */
export type SavePlan = {
  status: "DRAFT" | "REVISION_REQUESTED" | "APPROVED";
  autoApproved: boolean;
  effects: "none" | "apply" | "reapply";
};

/** Status rule only (no `isUsed`): DRAFT, REVISION_REQUESTED or an auto-approved APPROVED document. */
export function isEditableStatus(doc: Pick<FlowDoc, "status" | "autoApproved">): boolean {
  return doc.status === "DRAFT" || doc.status === "REVISION_REQUESTED" || (doc.status === "APPROVED" && doc.autoApproved);
}

/**
 * Status written by create (`current` null) or update (ADR-0050 rule 1, api-contract `<doc>.update`):
 * ON create → DRAFT; OFF create → APPROVED auto + apply. DRAFT stays DRAFT (ON) or becomes APPROVED auto + apply (OFF).
 * REVISION_REQUESTED stays (turning OFF is refused while one exists). Auto-approved stays auto-approved: reverse + re-apply.
 * Call only after `assertEditable`; any other status is a programming error.
 */
export function saveStatus(requireApproval: boolean, current: Pick<FlowDoc, "status" | "autoApproved"> | null): SavePlan {
  if (current === null || current.status === "DRAFT") {
    return requireApproval ? { status: "DRAFT", autoApproved: false, effects: "none" } : { status: "APPROVED", autoApproved: true, effects: "apply" };
  }
  if (current.status === "REVISION_REQUESTED") return { status: "REVISION_REQUESTED", autoApproved: false, effects: "none" };
  if (current.status === "APPROVED" && current.autoApproved) return { status: "APPROVED", autoApproved: true, effects: "reapply" };
  throw new TypeError(`saveStatus: status ${current.status} is not editable`);
}

/**
 * Edit / delete guard (ADR-0050 rule 2): deleted → `_DELETED`; Pending, Rejected, reviewed Approved (and Cancelled) →
 * `_STATUS_INVALID`; an auto-approved document that another document uses → `_IN_USE {usedBy}`.
 * `usedBy` = the first using document's number, or null when unused (only relevant for auto-approved documents).
 */
export function assertEditable(doc: FlowDoc, usedBy: string | null, errors: Pick<FlowErrors, "deleted" | "statusInvalid" | "inUse">): void {
  if (doc.deletedAt) throw errors.deleted();
  if (!isEditableStatus(doc)) throw errors.statusInvalid();
  if (doc.status === "APPROVED" && usedBy !== null) throw errors.inUse(usedBy);
}

/** Delete follows the edit rule exactly (ADR-0050 rule 2/3). */
export const assertDeletable = assertEditable;

/** `submit` (ADR-0050): from DRAFT / REVISION_REQUESTED only, and only while the type's approval is ON. */
export function assertSubmittable(doc: FlowDoc, requireApproval: boolean, errors: Pick<FlowErrors, "deleted" | "statusInvalid" | "approvalOff">): void {
  if (doc.deletedAt) throw errors.deleted();
  if (!SUBMITTABLE.includes(doc.status)) throw errors.statusInvalid();
  if (!requireApproval) throw errors.approvalOff();
}

/**
 * Approve / Reject / Revise: only from PENDING_APPROVAL (ADR-0046 D1). Revise is refused once the document was sent
 * back `REVISE_LIMIT` times (`_REVISE_LIMIT`); Approve and Reject stay allowed after a revise.
 */
export function assertReviewable(doc: FlowDoc, action: "APPROVE" | "REJECT" | "REVISE", errors: Pick<FlowErrors, "deleted" | "statusInvalid" | "reviseLimit">): void {
  if (doc.deletedAt) throw errors.deleted();
  if (doc.status !== "PENDING_APPROVAL") throw errors.statusInvalid();
  if (action === "REVISE" && doc.revisionCount >= REVISE_LIMIT) throw errors.reviseLimit();
}

/**
 * Who may approve, reject and revise a type (authorization.md `canApprove`). Today: `<menu>:APPROVE` (Super Admin
 * always). ADR-0050 D3 later replaces this with the user's Approve multi-select; no other code checks APPROVE.
 */
export function canApprove(principal: FlowPrincipal, type: ApprovalDocType): boolean {
  return hasMasterGrant(principal, APPROVAL_DOC_TYPE_INFO[type].menu, "APPROVE");
}

/**
 * The types the caller `canApprove`, in registry (sidebar) order; Super Admin = all eight (BE-AP-002). The Approve
 * Center intersects this with the types whose setting is ON (`approval.summary` / `approval.pending`).
 */
export function permittedApprovalTypes(principal: FlowPrincipal): ApprovalDocType[] {
  return APPROVAL_DOC_TYPES.filter((type) => canApprove(principal, type));
}

/** `submit` needs `<menu>:ADD` or `<menu>:EDIT` (Q-AS-25). */
export function canSubmit(principal: FlowPrincipal, type: ApprovalDocType): boolean {
  const { menu } = APPROVAL_DOC_TYPE_INFO[type];
  return hasMasterGrant(principal, menu, "ADD") || hasMasterGrant(principal, menu, "EDIT");
}

/** The latest Reject / Revise stored on the header (ADR-0046 D3). */
export type Review = { action: "REVISE" | "REJECT"; note: string; at: string; byName: string | null };

export type ReviewColumns = { reviewAction: string | null; reviewNote: string | null; reviewedAt: Date | null; reviewedByName: string | null };

export function reviewOf(row: ReviewColumns): Review | null {
  if ((row.reviewAction !== "REVISE" && row.reviewAction !== "REJECT") || row.reviewNote === null || row.reviewedAt === null) return null;
  return { action: row.reviewAction, note: row.reviewNote, at: row.reviewedAt.toISOString(), byName: row.reviewedByName };
}

/** `Flow` block of every `<doc>.get` / `<doc>.list` item (api-contract "Shared types"). */
export type Flow = {
  status: string;
  autoApproved: boolean;
  revisionCount: 0 | 1;
  canEdit: boolean;
  canDelete: boolean;
  canSubmit: boolean;
  usedBy: { docNo: string } | null;
  review: Review | null;
};

/**
 * Flow flags for the caller: `canEdit` / `canDelete` = status rule, not used, not deleted, and the caller's EDIT /
 * DELETE grant; `canSubmit` = DRAFT / REVISION_REQUESTED, setting ON, ADD or EDIT. `usedBy` only when used.
 */
export function flowFlags(input: {
  doc: FlowDoc & ReviewColumns;
  type: ApprovalDocType;
  requireApproval: boolean;
  principal: FlowPrincipal;
  usedBy: string | null;
}): Flow {
  const { doc, type, requireApproval, principal, usedBy } = input;
  const { menu } = APPROVAL_DOC_TYPE_INFO[type];
  const live = !doc.deletedAt;
  const changeable = live && isEditableStatus(doc) && !(doc.status === "APPROVED" && usedBy !== null);
  return {
    status: doc.status,
    autoApproved: doc.autoApproved,
    revisionCount: doc.revisionCount >= 1 ? 1 : 0,
    canEdit: changeable && hasMasterGrant(principal, menu, "EDIT"),
    canDelete: changeable && hasMasterGrant(principal, menu, "DELETE"),
    canSubmit: live && SUBMITTABLE.includes(doc.status) && requireApproval && canSubmit(principal, type),
    usedBy: usedBy === null ? null : { docNo: usedBy },
    review: reviewOf(doc),
  };
}
