import { isCallerLicenseCode, readDomainError } from "@/lib/trpc-error";
import type { ApproveMenu, AvailableMenu } from "./menus";

/**
 * Approve Center pure rules (approve-center UI rev 1, phase 1): permissions, counts, row adapter, sort, selection,
 * landing menu and error messages. The hooks in `api.ts` and the components only wire these.
 */

// ---------- permissions (FE-AP-002, Q-AP-13) ----------

export type Mine = { isSuperAdmin: boolean; permissions: "ALL" | readonly string[] } | undefined;
export type MenuAccess = { approve: boolean; view: boolean };

/** UX only; the server checks APPROVE (+ CSRF) on every approve and VIEW on every list. */
export function menuAccess(mine: Mine, menu: ApproveMenu): MenuAccess {
  const can = (action: string) => Boolean(mine && (mine.isSuperAdmin || mine.permissions === "ALL" || mine.permissions.includes(`${menu.leaf}:${action}`)));
  return { approve: can("APPROVE"), view: can("VIEW") };
}

export function visibleMenus(mine: Mine, menus: readonly ApproveMenu[]): ApproveMenu[] {
  return menus.filter((menu) => menuAccess(mine, menu).approve);
}

/** Count queries are made only for menus with a document API that the user may approve and list. */
export function countedMenus(mine: Mine, menus: readonly ApproveMenu[]): AvailableMenu[] {
  return menus.filter((menu): menu is AvailableMenu => menu.availability === "available" && menuAccess(mine, menu).approve && menuAccess(mine, menu).view);
}

// ---------- counts (FE-AP-003) ----------

export const PENDING_STATUS = "PENDING_APPROVAL" as const;
export const COUNT_INPUT = { status: PENDING_STATUS, limit: 1 } as const;
export const COUNT_CAP = 99;

export type CountState = { status: "pending" | "error" | "success"; total?: number };
export type MenuBadge = { kind: "count"; text: string } | { kind: "off" } | { kind: "none" };

export const capCount = (total: number) => (total > COUNT_CAP ? `${COUNT_CAP}+` : String(total));

/** Panel badge: "off" for Quotation, the count when > 0, nothing while loading, on error, at 0 or without an API. */
export function menuBadge(menu: ApproveMenu, count: CountState | undefined): MenuBadge {
  if (menu.availability === "off") return { kind: "off" };
  if (menu.availability !== "available" || !count || count.status !== "success" || !count.total) return { kind: "none" };
  return { kind: "count", text: capCount(count.total) };
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

// ---------- rows (FE-AP-004) ----------

/** One existing `<doc>.list` item (verified 2026-11-07, `document-engine.ts` list). */
export type PendingListItem = {
  id: string;
  docNo: string;
  status: string;
  docDate: string;
  dueDate?: string | null;
  customerName?: string | null;
  vendorName?: string | null;
  currency: string;
  grandTotal: string;
  updatedAt: string;
  deletedAt?: string | null;
};
export type PendingPage = { items: readonly PendingListItem[]; nextCursor: string | null; total: number };

/** The single row shape of every menu; optional fields render "—" until SA-AP-02 supplies them. */
export type ApprovalRow = {
  id: string;
  docNo: string;
  docDate: string;
  dueDate: string | null;
  partyName: string;
  lineCount?: number;
  stoneNames?: readonly string[];
  totalPcs?: number;
  totalWeightCt?: string;
  grandTotal: string;
  currency: string;
  submittedBy?: string;
  submittedRole?: string;
  /** Phase 1: `updatedAt` ("Last saved"), labelled as such. */
  submittedAt: string;
  submittedAtIsLastSaved: boolean;
  version?: number;
};

export const DASH = "—";

export function toApprovalRow(item: PendingListItem): ApprovalRow {
  return {
    id: item.id,
    docNo: item.docNo,
    docDate: item.docDate,
    dueDate: item.dueDate ?? null,
    partyName: item.customerName ?? item.vendorName ?? DASH,
    grandTotal: item.grandTotal,
    currency: item.currency,
    submittedAt: item.updatedAt,
    submittedAtIsLastSaved: true,
  };
}

/** Pending rows of the loaded pages; deleted documents (never listed by default) are dropped defensively. */
export function rowsOf(pages: readonly PendingPage[] | undefined): ApprovalRow[] {
  return (pages ?? []).flatMap((page) => page.items.filter((item) => !item.deletedAt && item.status === PENDING_STATUS).map(toApprovalRow));
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

export const STONE_NAME_CAP = 3;

/** Distinct stone names in line order, at most 3, then `+k`. */
export function stoneSummary(names: readonly string[]): string {
  const distinct = [...new Set(names.filter(Boolean))];
  const shown = distinct.slice(0, STONE_NAME_CAP).join(", ");
  const rest = distinct.length - STONE_NAME_CAP;
  return rest > 0 ? `${shown} +${rest}` : shown;
}

const lines = (count: number) => `${count} ${count === 1 ? "line" : "lines"}`;

/** Detail sub line per menu (ui-spec "Per-menu variants"); parts phase 1 lacks are left out, "—" when none remain. */
export function detailSubLine(menu: AvailableMenu, row: ApprovalRow): string {
  const parts = [
    menu.dueLabel && row.dueDate ? `${menu.dueLabel} ${shortDate(row.dueDate)}` : null,
    row.lineCount !== undefined ? lines(row.lineCount) : null,
    row.stoneNames && row.stoneNames.length > 0 ? stoneSummary(row.stoneNames) : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : DASH;
}

/** "{user} ({role})" or "—" while the list has no submitter (phase 1). */
export function submitterText(row: ApprovalRow): string {
  if (!row.submittedBy) return DASH;
  return row.submittedRole ? `${row.submittedBy} (${row.submittedRole})` : row.submittedBy;
}

// ---------- search ----------

export const SEARCH_MAX = 100;
export const SEARCH_DEBOUNCE_MS = 300;

/** The `q` sent to the list: trimmed, cut at 100 characters, omitted when empty. */
export function searchQuery(text: string): string | undefined {
  const q = text.trim().slice(0, SEARCH_MAX).trim();
  return q === "" ? undefined : q;
}

export const PAGE_SIZE = 50;
export type PendingListInput = { status: typeof PENDING_STATUS; limit: number; q?: string; cursor?: string | null };
export function pendingListInput(q: string | undefined): PendingListInput {
  return q ? { status: PENDING_STATUS, limit: PAGE_SIZE, q } : { status: PENDING_STATUS, limit: PAGE_SIZE };
}

// ---------- sort (Q-AP-11) ----------

export type SortKey = "document" | "detail" | "qty" | "value" | "submitted";
export type SortDir = "asc" | "desc";
export type SortState = { key: SortKey; dir: SortDir };
/** Oldest submitted first (approvers work first-in first-out). */
export const DEFAULT_SORT: SortState = { key: "submitted", dir: "asc" };

/** Clicking a header: same column flips, a new column starts ascending. */
export function nextSort(current: SortState, key: SortKey): SortState {
  return current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" };
}

type SortValue = string | number | undefined;
function sortValue(row: ApprovalRow, key: SortKey): SortValue | [string, number] {
  switch (key) {
    case "document":
      return row.docNo;
    case "detail":
      return row.partyName.toLocaleLowerCase("en");
    case "qty":
      return row.totalWeightCt === undefined ? undefined : Number(row.totalWeightCt);
    case "value":
      return [row.currency, Number(row.grandTotal)];
    case "submitted":
      return row.submittedAt;
  }
}

function compareValues(a: SortValue | [string, number], b: SortValue | [string, number]): number {
  if (Array.isArray(a) && Array.isArray(b)) return a[0] === b[0] ? a[1] - b[1] : a[0] < b[0] ? -1 : 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

/** Client sort of the loaded rows (phase 1; SA-AP-02 adds server order). Missing values go last; ties keep doc no. order. */
export function sortRows(rows: readonly ApprovalRow[], sort: SortState): ApprovalRow[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const a = sortValue(left, sort.key);
    const b = sortValue(right, sort.key);
    if (a === undefined || b === undefined) {
      if (a !== b) return a === undefined ? 1 : -1;
    } else {
      const order = compareValues(a, b) * sign;
      if (order !== 0) return order;
    }
    return left.docNo < right.docNo ? -1 : left.docNo > right.docNo ? 1 : 0;
  });
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

/**
 * What happens to a row after a failed get / approve (error-handling.md):
 * `refetch` reloads the list; `inline` keeps the reason under the row's actions; `link` asks to open the document.
 */
export type ApproveFailure = { toast: string; inline: string | null; refetch: boolean; link: boolean; refetchAccess: boolean };

export function approveFailure(error: unknown, menu: ApproveMenu, docNo: string): ApproveFailure {
  const { domainCode } = readDomainError(error);
  const code = domainCode ?? "";
  const base = { inline: null, refetch: false, link: false, refetchAccess: false };
  if (code.endsWith("_PENDING_SHORT") || code.endsWith("_OUTSTANDING_SHORT")) {
    const inline = "Some stock items no longer have enough pending. Open the document to fix it.";
    return { ...base, toast: `Couldn't approve ${docNo}. ${inline}`, inline, link: true };
  }
  if (code.endsWith("_CHANGED")) return { ...base, toast: `${docNo} was changed by someone else. The list was refreshed.`, refetch: true };
  if (code.endsWith("_STATUS_INVALID")) return { ...base, toast: `${docNo} is no longer pending.`, refetch: true };
  if (code.endsWith("_DELETED") || code.endsWith("_NOT_FOUND")) return { ...base, toast: `${docNo} was deleted.`, refetch: true };
  if (code === "PERMISSION_DENIED" || code === "FORBIDDEN") {
    return { ...base, toast: `You no longer have permission to approve ${menu.label}.`, inline: "No permission to approve.", refetchAccess: true };
  }
  if (code === "CSRF_INVALID") return { ...base, toast: "Your session needs a refresh. Reload the page and try again.", inline: "Couldn't approve. Try again." };
  if (code === "UNAUTHORIZED") return { ...base, toast: "Your session has ended. Sign in again.", inline: "Couldn't approve. Try again." };
  if (isCallerLicenseCode(code)) return { ...base, toast: "Your license doesn't allow this right now. Nothing was approved.", inline: "Couldn't approve. Try again." };
  return { ...base, toast: `Couldn't approve ${docNo}. Try again.`, inline: "Couldn't approve. Try again." };
}

/** List load errors: no VIEW shows the permission text; everything else offers Retry. */
export function listLoadError(error: unknown, menu: ApproveMenu): { message: string; retry: boolean } {
  const { domainCode } = readDomainError(error);
  if (domainCode === "PERMISSION_DENIED" || domainCode === "FORBIDDEN") return { message: noViewMessage(menu), retry: false };
  if (domainCode === "UNAUTHORIZED") return { message: "Your session has ended. Sign in again.", retry: false };
  return { message: `Couldn't load ${menu.label} approvals.`, retry: true };
}

export const noViewMessage = (menu: ApproveMenu) => `You don't have permission to view ${menu.label} documents.`;
export const noApproveMessage = (menu: ApproveMenu) => `You don't have permission to approve ${menu.label} documents.`;

/** Phase 1 disabled actions (FE-AP-007; Q-AP-01/02 answered, backend designed by SA). */
export const REJECT_UNAVAILABLE = "Reject is coming soon";
export const REVISE_UNAVAILABLE = "Revise is coming soon";

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

export type BulkCalls = {
  prepare: (id: string) => Promise<{ version: number }>;
  approve: (id: string, expectedVersion: number) => Promise<unknown>;
};
export type BulkOutcome = { ok: number; failed: Map<string, ApproveFailure>; stopped: boolean };

/**
 * FE-AP-006: approves `rows` one at a time in the given order (no parallel burst; 4 GB / 2 vCPU budget). Each row gets
 * a fresh version (`get`) before its `approve`. `isCancelled` is read before each document, so Cancel stops before the next.
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
      const { version } = await calls.prepare(row.id);
      await calls.approve(row.id, version);
      ok += 1;
    } catch (error) {
      failed.set(row.id, approveFailure(error, menu, row.docNo));
    }
    done += 1;
  }
  return { ok, failed, stopped: done < rows.length };
}
