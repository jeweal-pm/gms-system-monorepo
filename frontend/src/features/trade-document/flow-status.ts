import type { StatusLabels } from "@/features/quotation/components/header/QuotationHeader";
import { readDomainError } from "@/lib/trpc-error";

/**
 * approval-setup FE-AS-010 / FE-AS-012 (ADR-0048, api-contract "Shared types"): the document status model, the
 * buttons it allows on a document page, its read-only text, the new error codes and the Daybook dots. Pure functions
 * only, shared by the eight document pages (the hook lives in `approval-flow.tsx`).
 */

/** Statuses of the seven engine documents (ADR-0048 D2); Quotation adds CANCELLED. */
export const APPROVAL_DOC_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REVISION_REQUESTED", "REJECTED"] as const;
export type ApprovalDocStatus = (typeof APPROVAL_DOC_STATUSES)[number];

/** The eight document types with a page (approval setting keys, kebab-case as `approvalSetting.list`). */
export type DocumentApprovalType = "quotation" | "reserve" | "memo-receive" | "memo-return" | "memo-out" | "memo-out-return" | "purchase-order" | "purchase";

/** Error code prefix (`<CODE>_*`) and the menu name used in messages ("Approval is now off for {Menu}."). */
export const APPROVAL_DOCUMENTS: Record<DocumentApprovalType, { code: string; menu: string }> = {
  quotation: { code: "QUOTATION", menu: "Quotation" },
  reserve: { code: "RESERVE", menu: "Reserve" },
  "memo-receive": { code: "MEMO_RECEIVE", menu: "Memo Receive" },
  "memo-return": { code: "MEMO_RETURN", menu: "Memo Return" },
  "memo-out": { code: "MEMO_OUT", menu: "Memo Out" },
  "memo-out-return": { code: "MEMO_OUT_RETURN", menu: "Memo Out Return" },
  "purchase-order": { code: "PURCHASE_ORDER", menu: "Purchase Order" },
  purchase: { code: "PURCHASE", menu: "Purchase" },
};

export type DocReview = { action: "REVISE" | "REJECT"; note: string; at: string; byName: string | null };

/** `Flow` of `<doc>.get` (api-contract): the caller's flags come from the server. */
export type DocFlow = {
  status: string;
  autoApproved: boolean;
  revisionCount: number;
  canEdit: boolean;
  canDelete: boolean;
  canSubmit: boolean;
  usedBy: { docNo: string } | null;
  review: DocReview | null;
};

/** Picks the `Flow` block out of a `<doc>.get` result. */
export function flowOf(detail: DocFlow): DocFlow {
  return {
    status: detail.status,
    autoApproved: detail.autoApproved,
    revisionCount: detail.revisionCount,
    canEdit: detail.canEdit,
    canDelete: detail.canDelete,
    canSubmit: detail.canSubmit,
    usedBy: detail.usedBy ?? null,
    review: detail.review ?? null,
  };
}

const SUBMITTABLE = new Set(["DRAFT", "REVISION_REQUESTED"]);

/** ADR-0048 rule 2: editable / deletable status (the server adds isUsed and the caller's grants). */
export function isChangeableStatus(flow: Pick<DocFlow, "status" | "autoApproved" | "usedBy">): boolean {
  if (SUBMITTABLE.has(flow.status)) return true;
  return flow.status === "APPROVED" && flow.autoApproved && flow.usedBy === null;
}

const ORANGE = "bg-[#FFF4E0] text-[#B45309]";

/** Header badges of every document page (Draft grey, Pending / Revise orange, Approved green, Rejected red). */
export const FLOW_STATUS_LABELS: StatusLabels = {
  DRAFT: { label: "Draft", tone: "bg-[#EEF0F2] text-[#4B5563]" },
  PENDING_APPROVAL: { label: "Pending Approval", tone: ORANGE },
  REVISION_REQUESTED: { label: "Revise", tone: ORANGE },
  APPROVED: { label: "Approved", tone: "bg-[#E7F7EE] text-[#15803D]" },
  REJECTED: { label: "Rejected", tone: "bg-[#FDECEC] text-[#B42318]" },
  CANCELLED: { label: "Cancelled", tone: "bg-[#EEF0F2] text-[#6B7480] line-through" },
};

export type StatusNote = { text: string; tone: "warning" | "danger" | "muted" };

/** The line under the badge: the revise / reject reason, or why the document is read-only. */
export function flowStatusNote(flow: DocFlow | null): StatusNote | null {
  if (!flow) return null;
  switch (flow.status) {
    case "REVISION_REQUESTED":
      return flow.review?.action === "REVISE" ? { text: `Revise: ${flow.review.note}`, tone: "warning" } : null;
    case "REJECTED":
      return flow.review?.action === "REJECT" ? { text: `Reason: ${flow.review.note} · Read-only`, tone: "danger" } : { text: "Rejected · Read-only", tone: "danger" };
    case "PENDING_APPROVAL":
      return { text: "Waiting for approval · Read-only until it is approved, sent back or rejected", tone: "muted" };
    case "APPROVED":
      if (flow.usedBy) return { text: `Used in ${flow.usedBy.docNo} · Read-only`, tone: "muted" };
      return flow.autoApproved ? null : { text: "Approved · Read-only", tone: "muted" };
    default:
      return null;
  }
}

export type FlowActions = {
  /** Edit / Delete are shown (the status allows a change); otherwise both are hidden. */
  showEditDelete: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** "Send to approve" is shown (setting ON, Draft / Revise, ADD or EDIT). */
  showSend: boolean;
  /** …and can be clicked now (not while editing or with unsaved changes). */
  canSend: boolean;
};

/**
 * FE-AS-010: the document page buttons. Edit / Delete follow `Flow.canEdit / canDelete` (status rule + isUsed + grant)
 * and the caller's grant; Send to approve needs the type's setting ON (from `approvalSetting.list`, else the server's
 * `canSubmit`), status Draft / Revise and ADD or EDIT. No Approve button on a document page (ADR-0048 Q-AS-23).
 */
export function flowActions(input: {
  flow: DocFlow | null;
  deleted: boolean;
  requireApproval: boolean | undefined;
  access: { add: boolean; edit: boolean; delete: boolean };
  editing: boolean;
  dirty: boolean;
}): FlowActions {
  const { flow, deleted, requireApproval, access, editing, dirty } = input;
  if (!flow || deleted) return { showEditDelete: !deleted, canEdit: false, canDelete: false, showSend: false, canSend: false };
  const showEditDelete = isChangeableStatus(flow);
  const settingOn = requireApproval ?? flow.canSubmit;
  const showSend = SUBMITTABLE.has(flow.status) && settingOn && (access.add || access.edit);
  return {
    showEditDelete,
    canEdit: showEditDelete && flow.canEdit && access.edit,
    canDelete: showEditDelete && flow.canDelete && access.delete,
    showSend,
    canSend: showSend && !editing && !dirty,
  };
}

/** Toast after a Save, from the create / update result's status (error-handling: OFF Save says it took effect). */
export function savedMessage(docNo: string | undefined, result: { status?: unknown; autoApproved?: unknown } | null | undefined): string {
  const name = docNo ?? "";
  if (result?.status === "APPROVED" && result.autoApproved === true) return `${name} saved and approved (approval is off).`.trim();
  if (result?.status === "DRAFT") return name ? `Saved ${name} as Draft` : "Saved as Draft";
  return `Saved ${name}`.trim();
}

export const sentMessage = (docNo: string | undefined) => `Sent ${docNo ?? "the document"} to approve`;

/** Confirm before Send to approve: the document locks until the approver acts. */
export function sendToApproveConfirm(docNo: string | undefined) {
  return {
    title: docNo ? `Send ${docNo} to approve?` : "Send to approve?",
    body: "It can't be edited or deleted until it is approved, sent back for revision or rejected in the Approve menu.",
    cancelLabel: "Cancel",
    confirmLabel: "Send to approve",
    confirmVariant: "primary" as const,
  };
}

/** Restore goes back to Draft when approval is ON, or is approved again when OFF (ADR-0048 G3 / G10). */
export function restoreStatusLabel(requireApproval: boolean | undefined): string {
  if (requireApproval === undefined) return "its saved status";
  return requireApproval ? "Draft" : "Approved";
}

export type FlowErrorOutcome = {
  message: string;
  /** Load the document again (its status or use changed). */
  refetch: boolean;
  /** Load the approval setting again (`<CODE>_APPROVAL_OFF`). */
  settingChanged: boolean;
};

/**
 * The ADR-0048 codes of a document write (error-handling.md), or null for any other error (the page's own mapping).
 * `docNo` names the document in the message.
 */
export function mapFlowError(error: unknown, type: DocumentApprovalType, docNo: string | undefined, action: "save" | "delete" | "submit"): FlowErrorOutcome | null {
  const { domainCode, details } = readDomainError(error);
  const { code, menu } = APPROVAL_DOCUMENTS[type];
  const name = docNo || `This ${menu}`;
  switch (domainCode) {
    case `${code}_APPROVAL_OFF`:
      return { message: `Approval is now off for ${menu}. Save to approve it.`, refetch: true, settingChanged: true };
    case `${code}_IN_USE`: {
      const usedBy = typeof details?.usedBy === "string" && details.usedBy ? details.usedBy : null;
      return { message: usedBy ? `${name} can't be changed: its items are used in ${usedBy}.` : `${name} can't be changed: its items are used in another document.`, refetch: true, settingChanged: false };
    }
    case `${code}_STATUS_INVALID`:
      return {
        message: action === "submit" ? `${name} can't be sent to approve in its current status.` : `${name} can't be changed in its current status.`,
        refetch: true,
        settingChanged: false,
      };
    case `${code}_REVISE_LIMIT`:
      return { message: `${name} was already sent back once. Approve or reject it.`, refetch: true, settingChanged: false };
    default:
      return null;
  }
}

export type DaybookDot = { className: string; label: string };

const GREEN: DaybookDot = { className: "bg-[#22C55E]", label: "Approved" };
const DOTS: Record<string, DaybookDot> = {
  DRAFT: { className: "bg-[#A9B1B9]", label: "Draft" },
  PENDING_APPROVAL: { className: "bg-[#F5A524]", label: "Pending approval" },
  REVISION_REQUESTED: { className: "bg-[#F5A524]", label: "Revise" },
  APPROVED: GREEN,
  REJECTED: { className: "bg-[#E5484D]", label: "Rejected" },
  CANCELLED: { className: "bg-[#D5DADF]", label: "Cancelled" },
};

/**
 * FE-AS-012 / ADR-0048 D6: Draft grey, Pending orange, Revise orange, Approved green, Rejected red. With the type's
 * approval OFF every saved document is approved, so an older Draft shows green too ("ถ้าไม่มี approve เป็นเขียวหมด").
 */
export function flowDot(status: string, requireApproval?: boolean): DaybookDot {
  if (requireApproval === false && status === "DRAFT") return GREEN;
  return DOTS[status] ?? GREEN;
}

/** The text under the party in the Daybook: the Revise / Reject reason (D6). */
export function daybookNote(item: { status: string; review?: DocReview | null }): string | undefined {
  if (item.status === "REVISION_REQUESTED" && item.review?.action === "REVISE") return item.review.note;
  if (item.status === "REJECTED" && item.review?.action === "REJECT") return item.review.note;
  return undefined;
}
