import type { DocumentApprovalType } from "@/features/trade-document/flow-status";
import { isCallerLicenseCode, readDomainError } from "@/lib/trpc-error";
import type { ApproveMenu, AvailableMenu } from "./menus";

/**
 * Approve Center pure rules (approve-center UI rev 1; phase 2 FE-AP-009/010 and approval-setup FE-AS-009/013):
 * permissions, counts, row adapter, sort, selection, landing menu, review dialogs and error messages. The hooks in
 * `api.ts` and the components only wire these.
 */

// ---------- permissions (FE-AP-002, Q-AP-13) ----------

export type Mine = { isSuperAdmin: boolean; permissions: "ALL" | readonly string[] } | undefined;
export type MenuAccess = { approve: boolean; view: boolean };

/**
 * UX only; the server checks `canApprove` (`<leaf>:APPROVE`, + CSRF on writes) on every approve / reject / revise and on
 * `approval.pending` (approval-setup authorization.md: VIEW is not needed to approve, G11).
 */
export function menuAccess(mine: Mine, menu: ApproveMenu): MenuAccess {
  const can = (action: string) => Boolean(mine && (mine.isSuperAdmin || mine.permissions === "ALL" || mine.permissions.includes(`${menu.leaf}:${action}`)));
  return { approve: can("APPROVE"), view: can("VIEW") };
}

export function visibleMenus(mine: Mine, menus: readonly ApproveMenu[]): ApproveMenu[] {
  return menus.filter((menu) => menuAccess(mine, menu).approve);
}

// ---------- counts (FE-AP-003 → FE-AP-009 / FE-AS-009: `approval.summary`) ----------

export const PENDING_STATUS = "PENDING_APPROVAL" as const;
export const COUNT_CAP = 99;

/** `approval.summary` (approve-center api-contract as amended by approval-setup G13). */
export type ApprovalSummary = {
  /** Types whose approval is ON and that the caller may approve; 0 ≤ count ≤ `countCap`. */
  items: readonly { type: string; count: number }[];
  countCap: number;
  /** Every type the caller may approve with its setting (OFF types are shown "off"). */
  types: readonly { type: string; requireApproval: boolean }[];
};

/** One menu's count: `off` = the type's approval is off (no count, "off" badge). */
export type CountState = { status: "pending" | "error" | "success"; total?: number; off?: boolean };
export type MenuBadge = { kind: "count"; text: string } | { kind: "off" } | { kind: "none" };

export const capCount = (total: number) => (total > COUNT_CAP ? `${COUNT_CAP}+` : String(total));

/**
 * A menu's count from the summary query: undefined for a menu without a document type or one the summary does not
 * return for the caller; `off` for a type whose setting is OFF; otherwise the capped pending count (0 when none).
 */
export function summaryCount(summary: { status: CountState["status"]; data?: ApprovalSummary }, menu: ApproveMenu): CountState | undefined {
  if (menu.availability !== "available") return undefined;
  if (summary.status !== "success" || !summary.data) return { status: summary.status === "error" ? "error" : "pending" };
  const setting = summary.data.types.find((entry) => entry.type === menu.type);
  if (!setting) return undefined;
  if (!setting.requireApproval) return { status: "success", off: true };
  return { status: "success", total: summary.data.items.find((entry) => entry.type === menu.type)?.count ?? 0 };
}

/** Panel badge: "off" for a type whose approval is off, the count when > 0, nothing while loading, on error or at 0. */
export function menuBadge(menu: ApproveMenu, count: CountState | undefined): MenuBadge {
  if (menu.availability !== "available" || !count || count.status !== "success") return { kind: "none" };
  if (count.off) return { kind: "off" };
  return count.total ? { kind: "count", text: capCount(count.total) } : { kind: "none" };
}

/**
 * Sidebar total (Q-AP-05): the sum of the visible menus' counts, shown once every count has settled; failed counts
 * add nothing; hidden at 0.
 */
export function approvalTotal(counts: readonly CountState[]): number | null {
  if (counts.some((count) => count.status === "pending")) return null;
  const total = counts.reduce((sum, count) => sum + (count.status === "success" ? (count.total ?? 0) : 0), 0);
  return total > 0 ? total : null;
}

/** Q-AP-04: `/approve` opens the first visible menu with pending documents, else the first visible menu. */
export function landingMenu(menus: readonly ApproveMenu[], countOf: (menu: ApproveMenu) => CountState | undefined): ApproveMenu | null {
  return menus.find((menu) => (countOf(menu)?.total ?? 0) > 0) ?? menus[0] ?? null;
}

// ---------- rows (FE-AP-009: `approval.pending`) ----------

export type ApprovalReview = { action: "REVISE" | "REJECT"; note: string; at: string; byName: string | null };

/** One `approval.pending` row (approve-center api-contract `ApprovalRow` + approval-setup `revisionCount`). */
export type PendingApprovalItem = {
  type: string;
  id: string;
  docNo: string;
  docDate: string;
  dueDate: string;
  version: number;
  status: string;
  party: { id: string; code: string; name: string };
  ref: string;
  currency: string;
  grandTotal: string;
  lineCount: number;
  totalPcs: number;
  totalWeightCt: string;
  stoneNames: readonly string[];
  moreStoneCount: number;
  submittedAt: string;
  submittedBy: string;
  submittedByName: string | null;
  revisionCount: number;
  lastReview: ApprovalReview | null;
  updatedAt: string;
};
export type PendingPage = { items: readonly PendingApprovalItem[]; nextCursor: string | null };

/** The single row shape of every menu. */
export type ApprovalRow = {
  id: string;
  docNo: string;
  docDate: string;
  dueDate: string | null;
  partyName: string;
  lineCount: number;
  stoneNames: readonly string[];
  moreStoneCount: number;
  totalPcs: number;
  totalWeightCt: string;
  grandTotal: string;
  currency: string;
  /** Submitter name snapshot; null = unknown ("—"). */
  submittedBy: string | null;
  submittedAt: string;
  /** Passed as `expectedVersion` to approve / reject / requestRevision (no `get` first). */
  version: number;
  /** 1 = already sent back once: Revise is refused (ADR-0048). */
  revisionCount: number;
  lastReview: ApprovalReview | null;
};

export const DASH = "—";

export function toApprovalRow(item: PendingApprovalItem): ApprovalRow {
  return {
    id: item.id,
    docNo: item.docNo,
    docDate: item.docDate,
    dueDate: item.dueDate || null,
    partyName: item.party.name || DASH,
    lineCount: item.lineCount,
    stoneNames: item.stoneNames,
    moreStoneCount: item.moreStoneCount,
    totalPcs: item.totalPcs,
    totalWeightCt: item.totalWeightCt,
    grandTotal: item.grandTotal,
    currency: item.currency,
    submittedBy: item.submittedByName,
    submittedAt: item.submittedAt,
    version: item.version,
    revisionCount: item.revisionCount,
    lastReview: item.lastReview,
  };
}

/** Rows of the loaded pages in server order; pending rows only, each id once. */
export function rowsOf(pages: readonly PendingPage[] | undefined): ApprovalRow[] {
  const seen = new Set<string>();
  const rows: ApprovalRow[] = [];
  for (const page of pages ?? []) {
    for (const item of page.items) {
      if (item.status !== PENDING_STATUS || seen.has(item.id)) continue;
      seen.add(item.id);
      rows.push(toApprovalRow(item));
    }
  }
  return rows;
}

/** yyyy-mm-dd → dd/mm/yy (design "01/11/26"). */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y.slice(-2)}` : iso;
}

const submittedFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Bangkok",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** dd/mm/yyyy HH:mm in Asia/Bangkok. */
export function submittedTime(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : submittedFormatter.format(at).replace(",", "");
}

/** The server's ≤ 3 distinct stone names in line order, then `+k` for the rest. */
export function stoneSummary(names: readonly string[], more: number): string {
  const shown = names.filter(Boolean).join(", ");
  return more > 0 ? `${shown} +${more}` : shown;
}

const lines = (count: number) => `${count} ${count === 1 ? "line" : "lines"}`;

/** Detail sub line per menu (ui-spec "Per-menu variants"): due date, lines, stones. */
export function detailSubLine(menu: AvailableMenu, row: ApprovalRow): string {
  const parts = [
    menu.dueLabel && row.dueDate ? `${menu.dueLabel} ${shortDate(row.dueDate)}` : null,
    lines(row.lineCount),
    row.stoneNames.length > 0 ? stoneSummary(row.stoneNames, row.moreStoneCount) : null,
  ].filter((part): part is string => Boolean(part));
  return parts.join(" · ");
}

/** The submitter's name, or "—" when unknown. */
export function submitterText(row: Pick<ApprovalRow, "submittedBy">): string {
  return row.submittedBy?.trim() || DASH;
}

/** A document sent again after a Revise (Revise is then no longer offered). */
export const RESUBMITTED_TEXT = "Sent again after Revise";

// ---------- search ----------

export const SEARCH_MAX = 100;
export const SEARCH_DEBOUNCE_MS = 300;

/** The `q` sent to the list: trimmed, cut at 100 characters, omitted when empty. */
export function searchQuery(text: string): string | undefined {
  const q = text.trim().slice(0, SEARCH_MAX).trim();
  return q === "" ? undefined : q;
}

export const PAGE_SIZE = 50;

// ---------- sort (Q-AP-11, server order) ----------

export type SortKey = "document" | "detail" | "qty" | "value" | "submitted";
export type SortDir = "asc" | "desc";
export type SortState = { key: SortKey; dir: SortDir };
/** Oldest submitted first (approvers work first-in first-out). */
export const DEFAULT_SORT: SortState = { key: "submitted", dir: "asc" };

/** Clicking a header: same column flips, a new column starts ascending. */
export function nextSort(current: SortState, key: SortKey): SortState {
  return current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" };
}

/** Column → `approval.pending` sort key. */
export const SERVER_SORT = { document: "docNo", detail: "party", qty: "qty", value: "value", submitted: "submittedAt" } as const satisfies Record<SortKey, string>;

export type PendingInput = { type: DocumentApprovalType; q?: string; sort: (typeof SERVER_SORT)[SortKey]; dir: SortDir; limit: number };

/** The `approval.pending` input of one menu, search and sort (the cursor is added by the infinite query). */
export function pendingInput(menu: AvailableMenu, q: string | undefined, sort: SortState): PendingInput {
  const input: PendingInput = { type: menu.type, sort: SERVER_SORT[sort.key], dir: sort.dir, limit: PAGE_SIZE };
  return q ? { ...input, q } : input;
}

export function ariaSort(sort: SortState, key: SortKey): "ascending" | "descending" | "none" {
  if (sort.key !== key) return "none";
  return sort.dir === "asc" ? "ascending" : "descending";
}

// ---------- selection (FE-AP-006) ----------

export type HeaderCheck = "checked" | "unchecked" | "indeterminate";

export function headerCheckState(rows: readonly ApprovalRow[], selected: ReadonlySet<string>): HeaderCheck {
  const count = rows.filter((row) => selected.has(row.id)).length;
  if (count === 0) return "unchecked";
  return count === rows.length ? "checked" : "indeterminate";
}

export function toggleAll(rows: readonly ApprovalRow[], selected: ReadonlySet<string>): Set<string> {
  return headerCheckState(rows, selected) === "checked" ? new Set() : new Set(rows.map((row) => row.id));
}

export function toggleOne(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Selection keeps only rows still listed (a refresh that removes a row drops it). */
export function pruneSelection(selected: ReadonlySet<string>, rows: readonly ApprovalRow[]): Set<string> {
  const ids = new Set(rows.map((row) => row.id));
  return new Set([...selected].filter((id) => ids.has(id)));
}

/** Bulk order = table order. */
export function selectedInOrder(rows: readonly ApprovalRow[], selected: ReadonlySet<string>): ApprovalRow[] {
  return rows.filter((row) => selected.has(row.id));
}

// ---------- approve (FE-AP-005) ----------

export function approveConfirm(menu: AvailableMenu, docNo: string, lineCount: number) {
  return { title: `Approve ${docNo}?`, body: menu.consequence(lineCount) };
}

export function bulkConfirm(count: number) {
  return {
    title: `Approve ${count} ${count === 1 ? "document" : "documents"}?`,
    body: "They are approved one at a time, in table order. Each one can no longer be edited.",
  };
}

export const bulkProgress = (index: number, total: number) => `Approving ${index} of ${total}…`;
export const bulkResult = (ok: number, total: number, stopped: boolean) => `Approved ${ok} of ${total}${stopped ? ". Stopped." : ""}`;

export type ReviewAction = "approve" | "reject" | "revise";
const VERB: Record<ReviewAction, string> = { approve: "approve", reject: "reject", revise: "send back" };
const DONE: Record<ReviewAction, string> = { approve: "approved", reject: "rejected", revise: "sent back" };

/**
 * What happens to a row after a failed approve / reject / revise (approve-center error-handling, approval-setup
 * error-handling): `refetch` reloads the list and counts (the row leaves when it is no longer pending); `inline` keeps
 * the reason under the row's actions; `link` asks to open the document; `off` = the type's approval is off now.
 */
export type ApproveFailure = { toast: string; inline: string | null; refetch: boolean; link: boolean; refetchAccess: boolean; off: boolean };

export function actionFailure(error: unknown, menu: ApproveMenu, docNo: string, action: ReviewAction): ApproveFailure {
  const { domainCode } = readDomainError(error);
  const code = domainCode ?? "";
  const verb = VERB[action];
  const retryText = `Couldn't ${verb}. Try again.`;
  const base = { inline: null, refetch: false, link: false, refetchAccess: false, off: false };
  if (code.endsWith("_PENDING_SHORT") || code.endsWith("_OUTSTANDING_SHORT")) {
    const inline = "Some stock items no longer have enough pending. Open the document to fix it.";
    return { ...base, toast: `Couldn't approve ${docNo}. ${inline}`, inline, link: true };
  }
  if (code.endsWith("_REVISE_LIMIT")) return { ...base, toast: `${docNo} was already sent back once. Approve or reject it.`, refetch: true };
  if (code.endsWith("_CHANGED")) return { ...base, toast: `${docNo} was changed by someone else. The list was refreshed.`, refetch: true };
  if (code.endsWith("_STATUS_INVALID")) return { ...base, toast: `${docNo} is no longer pending.`, refetch: true };
  if (code.endsWith("_DELETED") || code.endsWith("_NOT_FOUND")) return { ...base, toast: `${docNo} was deleted.`, refetch: true };
  if (code === "APPROVAL_TYPE_OFF") return { ...base, toast: approvalOffText(menu), refetch: true, off: true };
  if (code === "PERMISSION_DENIED" || code === "FORBIDDEN") {
    return { ...base, toast: `You no longer have permission to approve ${menu.label}.`, inline: `No permission to ${verb}.`, refetchAccess: true };
  }
  if (code === "CSRF_INVALID") return { ...base, toast: "Your session needs a refresh. Reload the page and try again.", inline: retryText };
  if (code === "UNAUTHORIZED") return { ...base, toast: "Your session has ended. Sign in again.", inline: retryText };
  if (isCallerLicenseCode(code)) return { ...base, toast: `Your license doesn't allow this right now. Nothing was ${DONE[action]}.`, inline: retryText };
  return { ...base, toast: `Couldn't ${verb} ${docNo}. Try again.`, inline: retryText };
}

export const approveFailure = (error: unknown, menu: ApproveMenu, docNo: string) => actionFailure(error, menu, docNo, "approve");

/** List load errors: the type turned off, a stale cursor (reset paging), permission, or Retry. */
export function listLoadError(error: unknown, menu: ApproveMenu): { message: string; retry: boolean; off: boolean; resetPaging: boolean } {
  const { domainCode, fieldErrors } = readDomainError(error);
  const base = { retry: false, off: false, resetPaging: false };
  if (domainCode === "APPROVAL_TYPE_OFF") return { ...base, message: approvalOffText(menu), off: true };
  if (domainCode === "VALIDATION_ERROR" && fieldErrors.some((field) => field.path === "cursor")) {
    return { ...base, message: `Couldn't load ${menu.label} approvals.`, retry: true, resetPaging: true };
  }
  if (domainCode === "PERMISSION_DENIED" || domainCode === "FORBIDDEN") return { ...base, message: noApproveMessage(menu) };
  if (domainCode === "UNAUTHORIZED") return { ...base, message: "Your session has ended. Sign in again." };
  return { ...base, message: `Couldn't load ${menu.label} approvals.`, retry: true };
}

export const noApproveMessage = (menu: ApproveMenu) => `You don't have permission to approve ${menu.label} documents.`;
/** approval-setup error-handling: `APPROVAL_TYPE_OFF` → "Approval is off for {Menu}." and the off state. */
export const approvalOffText = (menu: ApproveMenu) => `Approval is off for ${menu.label}.`;
export const APPROVAL_OFF_TITLE = "Approval is off";
export const approvalOffDetail = (menu: ApproveMenu) => `${approvalOffText(menu)} Its documents are approved when they are saved.`;

// ---------- Reject… / Revise… (FE-AP-010, FE-AS-013; ADR-0048 Q-AS-32) ----------

export const REVIEW_REASON_MAX = 500;
/** Revise is offered once per document (ADR-0048). */
export const REVISE_LIMIT_REASON = "Already sent back once. Approve or reject it.";
export const canRevise = (row: Pick<ApprovalRow, "revisionCount">) => row.revisionCount < 1;

export type ReviewKind = Exclude<ReviewAction, "approve">;
export type ReviewText = { title: string; body: string; label: string; confirmLabel: string; pendingLabel: string; required: string; success: string };

export function reviewText(kind: ReviewKind, docNo: string): ReviewText {
  if (kind === "reject") {
    return {
      title: `Reject ${docNo}?`,
      body: "Rejecting is final: the document can no longer be edited or sent again.",
      label: "Reason for reject",
      confirmLabel: "Reject",
      pendingLabel: "Rejecting…",
      required: "Enter the reason before choosing Reject",
      success: `${docNo} rejected`,
    };
  }
  return {
    title: `Send ${docNo} back for revision?`,
    body: "It goes back to its creator to edit and send again. A document can be sent back only once.",
    label: "Reason for revise",
    confirmLabel: "Revise",
    pendingLabel: "Sending back…",
    required: "Enter the reason before choosing Revise",
    success: `${docNo} sent back for revision`,
  };
}

export const REASON_TOO_LONG = `Keep the reason to ${REVIEW_REASON_MAX} characters or fewer.`;

/** Client check before the call (the server checks the same: trimmed, 1–500 characters). */
export function reviewReasonError(kind: ReviewKind, reason: string): string | null {
  const text = reason.trim();
  if (text === "") return reviewText(kind, "").required;
  if (text.length > REVIEW_REASON_MAX) return REASON_TOO_LONG;
  return null;
}

/** A server `VALIDATION_ERROR` on `reason` / `note` → the dialog's inline message; null for any other error. */
export function reviewFieldError(kind: ReviewKind, error: unknown): string | null {
  const { domainCode, fieldErrors } = readDomainError(error);
  if (domainCode !== "VALIDATION_ERROR") return null;
  const field = fieldErrors.find((entry) => entry.path === "reason" || entry.path === "note");
  if (!field) return null;
  return field.code === "too_big" ? REASON_TOO_LONG : reviewText(kind, "").required;
}

export const EMPTY_TITLE = "Nothing waiting";
export const EMPTY_TEXT = "Every document in this menu has been reviewed.";
export const EMPTY_SEARCH_TITLE = "No matching documents";
export const emptySearchText = (menu: ApproveMenu) =>
  menu.party === "none" ? "Try another document no., stone or Stock ID." : `Try another document no., ${menu.party}, stone or Stock ID.`;
export const NOT_AVAILABLE_TITLE = "Not available yet";
export const notAvailableText = (menu: ApproveMenu) => `${menu.label} approvals will appear here once its page is built.`;

export const NO_SELECTION: ReadonlySet<string> = new Set();
/** The selection belongs to one search + sort; changing either starts a new, empty selection. */
export const selectionScope = (q: string | undefined, sort: SortState) => `${q ?? ""}\u0000${sort.key}:${sort.dir}`;

export type BulkCalls = { approve: (id: string, expectedVersion: number) => Promise<unknown> };
export type BulkOutcome = { ok: number; failed: Map<string, ApproveFailure>; stopped: boolean };

/**
 * FE-AP-006: approves `rows` one at a time in the given order (no parallel burst; 4 GB / 2 vCPU budget), each with the
 * version its row was listed at (FE-AP-009: no `get` first). `isCancelled` is read before each document, so Cancel
 * stops before the next.
 */
export async function runBulkApprove(
  rows: readonly ApprovalRow[],
  calls: BulkCalls,
  menu: ApproveMenu,
  isCancelled: () => boolean,
  onProgress: (index: number, total: number) => void,
): Promise<BulkOutcome> {
  let ok = 0;
  const failed = new Map<string, ApproveFailure>();
  let done = 0;
  for (const [index, row] of rows.entries()) {
    if (isCancelled()) break;
    onProgress(index + 1, rows.length);
    try {
      await calls.approve(row.id, row.version);
      ok += 1;
    } catch (error) {
      failed.set(row.id, approveFailure(error, menu, row.docNo));
    }
    done += 1;
  }
  return { ok, failed, stopped: done < rows.length };
}
