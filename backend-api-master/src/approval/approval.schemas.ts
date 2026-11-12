import { z } from "zod";
import { APPROVAL_DOC_TYPES, type ApprovalDocType } from "../approval-setting/approval-types";

/**
 * Shared approval inputs (approve-center ADR-0046 D2/D3 as amended by approval-setup ADR-0048):
 * - document statuses of the eight approval documents (Quotation additionally keeps CANCELLED);
 * - `reject` / `requestRevision`: `reason` / `note` required, trimmed 1–500 characters (ADR-0048: a reason is required
 *   for Revise as well as Reject); line breaks allowed, the client renders plain text;
 * - `submit` (ADR-0048, replaces ADR-0046 `resubmit`, which is never built): `{ id, expectedVersion }`.
 * All objects are strict: unknown keys (e.g. an actor id or name) are refused.
 */
export const DOC_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "REVISION_REQUESTED"] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

export const REVIEW_TEXT_MAX = 500;
const reviewText = z.string().trim().min(1).max(REVIEW_TEXT_MAX);
const versioned = { id: z.uuid(), expectedVersion: z.number().int().min(1) };

export const submitInputSchema = z.object(versioned).strict();
export const rejectInputSchema = z.object({ ...versioned, reason: reviewText }).strict();
export const requestRevisionInputSchema = z.object({ ...versioned, note: reviewText }).strict();

export type SubmitInput = z.output<typeof submitInputSchema>;
export type RejectInput = z.output<typeof rejectInputSchema>;
export type RequestRevisionInput = z.output<typeof requestRevisionInputSchema>;

/** `approval.summary` count cap (D15): a count of 100 means "100 or more". */
export const SUMMARY_COUNT_CAP = 100;
/** `approval.pending` page size (D16). */
export const PENDING_LIMIT_MAX = 50;
export const PENDING_SORTS = ["submittedAt", "docNo", "party", "qty", "value"] as const;
export type PendingSort = (typeof PENDING_SORTS)[number];
export type PendingDir = "asc" | "desc";

/** `approval.summary`: no input (`undefined` or `{}`; strict). */
export const approvalSummaryInputSchema = z.object({}).strict().optional();

/**
 * `approval.pending` (approve-center api-contract, approval-setup: the type keys of the approval-setting registry,
 * Quotation included). Future inventory keys are refused (`VALIDATION_ERROR type`, D20).
 */
export const approvalPendingInputSchema = z.object({
  type: z.enum(APPROVAL_DOC_TYPES),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(PENDING_SORTS).default("submittedAt"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  cursor: z.string().max(300).nullish(),
  /** Sent by tRPC useInfiniteQuery; ignored. */
  direction: z.enum(["forward", "backward"]).optional(),
  limit: z.number().int().min(1).max(PENDING_LIMIT_MAX).default(PENDING_LIMIT_MAX),
}).strict();
export type ApprovalPendingInput = z.output<typeof approvalPendingInputSchema>;

export type ApprovalReview = { action: "REVISE" | "REJECT"; note: string; at: string; byName: string | null };

export type ApprovalSummary = {
  /** Types whose approval is ON and that the caller `canApprove`, registry order; 0 ≤ count ≤ 100. */
  items: { type: ApprovalDocType; count: number }[];
  countCap: typeof SUMMARY_COUNT_CAP;
  /** Every type the caller `canApprove`, registry order, with its setting (OFF types are shown "off"). */
  types: { type: ApprovalDocType; requireApproval: boolean }[];
};

export type ApprovalRow = {
  type: ApprovalDocType;
  id: string;
  docNo: string;
  docDate: string;
  dueDate: string;
  version: number;
  status: "PENDING_APPROVAL";
  party: { id: string; code: string; name: string };
  ref: string;
  currency: string;
  grandTotal: string;
  lineCount: number;
  totalPcs: number;
  totalWeightCt: string;
  stoneNames: string[];
  moreStoneCount: number;
  submittedAt: string;
  submittedBy: string;
  submittedByName: string | null;
  /** 1 = already sent back once: Revise is refused, Approve / Reject stay (ADR-0048). */
  revisionCount: 0 | 1;
  /** Non-null = resubmitted after a Revise (action REVISE). */
  lastReview: ApprovalReview | null;
  updatedAt: string;
};

export type ApprovalPendingPage = { items: ApprovalRow[]; nextCursor: string | null };
