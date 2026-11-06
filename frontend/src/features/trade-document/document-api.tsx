"use client";

import { FileSearch, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/features/quotation/lib/format";
import { authClient } from "@/lib/auth-client";
import { authTrpc } from "@/lib/auth-trpc";
import { isCallerLicenseCode, readDomainError, retryTransient } from "@/lib/trpc-error";
import type { SaveOutcome } from "./document-form";

/** Helpers shared by the memo documents (ADR-0033): permissions, error messages and the daybook list. */

export type DocumentAccess = { view: boolean; add: boolean; edit: boolean; delete: boolean; approve: boolean };
type Mine = { isSuperAdmin: boolean; permissions: "ALL" | readonly string[] } | undefined;

/** UX only; the server checks every call with the same catalog leaf. */
export function documentAccess(mine: Mine, menu: string): DocumentAccess {
  const can = (action: string) => Boolean(mine && (mine.isSuperAdmin || mine.permissions === "ALL" || mine.permissions.includes(`${menu}:${action}`)));
  return { view: can("VIEW"), add: can("ADD"), edit: can("EDIT"), delete: can("DELETE"), approve: can("APPROVE") };
}

export function useDocumentAccess(menu: string): DocumentAccess | undefined {
  const mine = authTrpc.permission.mine.useQuery(undefined, { staleTime: 30_000, retry: false });
  return mine.data ? documentAccess(mine.data, menu) : undefined;
}

/** Domain codes `<CODE>_*` (api-contract "Errors") → field errors and one message. */
export function mapDocumentSaveError(error: unknown, code: string, noun: string, headerFields: readonly string[]): SaveOutcome {
  const { domainCode, fieldErrors } = readDomainError(error);
  const onFields = (message: string) => fieldErrors.flatMap((entry) => {
    if (headerFields.includes(entry.path)) return [{ name: entry.path, message: entry.code === "required" ? "Required" : message }];
    if (entry.path.startsWith("lines")) return [{ name: "lines", message: `Check item row ${Number(entry.path.split(".")[1] ?? 0) + 1}` }];
    return [];
  });
  switch (domainCode) {
    case `${code}_REFERENCE_INVALID`:
      return { fieldErrors: onFields("Choose an active option"), message: "A selected party, address, currency or stone code is no longer available." };
    case `${code}_DELETED`:
      return { fieldErrors: [], message: deletedMessage(noun), deleted: true };
    case `${code}_CHANGED`:
      return { fieldErrors: [], message: `Someone else changed this ${noun}. Refresh to see the latest.` };
    case `${code}_STATUS_INVALID`:
      return { fieldErrors: [], message: `This ${noun} can't be changed in its current status.` };
    case `${code}_NOT_FOUND`:
      return { fieldErrors: [], message: `This ${noun} no longer exists.` };
    case "VALIDATION_ERROR":
      return { fieldErrors: onFields("Check this field"), message: "Some details couldn't be saved. Check the form and try again." };
    case "PERMISSION_DENIED":
      return { fieldErrors: [], message: "You don't have permission to do this. Nothing was saved." };
    default:
      if (isCallerLicenseCode(domainCode)) return { fieldErrors: [], message: "Your license doesn't allow this right now. Nothing was saved." };
      if (domainCode === "UNAUTHORIZED") return { fieldErrors: [], message: "Your session has ended. Sign in again." };
      return { fieldErrors: [], message: "Couldn't save. Try again." };
  }
}

export function documentLoadError(error: unknown, code: string, noun: string, plural: string): string {
  const { domainCode } = readDomainError(error);
  if (domainCode === `${code}_NOT_FOUND`) return `This ${noun} no longer exists.`;
  if (domainCode === "PERMISSION_DENIED") return `You don't have permission to view ${plural}.`;
  if (isCallerLicenseCode(domainCode)) return `Your license doesn't allow opening ${plural} right now.`;
  if (domainCode === "UNAUTHORIZED") return "Your session has ended. Sign in again.";
  return `Couldn't load this ${noun}. Try again.`;
}

/** A daybook (list) load error names the list, not one document ("Couldn't load memo returns."). */
export function daybookLoadError(error: unknown, plural: string): string {
  const { domainCode } = readDomainError(error);
  if (domainCode === "PERMISSION_DENIED") return `You don't have permission to view ${plural}.`;
  if (isCallerLicenseCode(domainCode)) return `Your license doesn't allow opening ${plural} right now.`;
  if (domainCode === "UNAUTHORIZED") return "Your session has ended. Sign in again.";
  return `Couldn't load ${plural}. Try again.`;
}

// ---- transaction-soft-delete (ADR-0044, FE-SD-001…003) ----

/** FE-SD-003: a write on a deleted document (`<CODE>_DELETED`). */
export const deletedMessage = (noun: string) => `This ${noun} was deleted. Restore it to edit.`;

/** `refetch`: load the document again (it is no longer deleted, or it changed). */
export type RestoreOutcome = { message: string; refetch: boolean };

/** `<doc>.restore` errors (api-contract "Errors"): not deleted any more, changed, gone, or not allowed. */
export function mapDocumentRestoreError(error: unknown, code: string, noun: string): RestoreOutcome {
  const { domainCode } = readDomainError(error);
  switch (domainCode) {
    case `${code}_STATUS_INVALID`:
      return { message: `This ${noun} is no longer deleted.`, refetch: true };
    case `${code}_CHANGED`:
      return { message: `Someone else changed this ${noun}. Refresh to see the latest.`, refetch: true };
    case `${code}_NOT_FOUND`:
      return { message: `This ${noun} no longer exists.`, refetch: false };
    case "PERMISSION_DENIED":
      return { message: "You don't have permission to restore it. Nothing was changed.", refetch: false };
    case "CSRF_INVALID":
      return { message: "Your session needs a refresh. Reload the page and try again.", refetch: false };
    case "UNAUTHORIZED":
      return { message: "Your session has ended. Sign in again.", refetch: false };
    default:
      if (isCallerLicenseCode(domainCode)) return { message: "Your license doesn't allow this right now. Nothing was changed.", refetch: false };
      return { message: "Couldn't restore. Try again.", refetch: false };
  }
}

/** D10: `deletedAt !== null` makes a saved document read-only. */
export type DeletedInfo = { at: string; by: string | null };
export const deletedInfo = (detail: { deletedAt?: string | null; deletedBy?: string | null } | undefined): DeletedInfo | null =>
  detail?.deletedAt ? { at: detail.deletedAt, by: detail.deletedBy ?? null } : null;

const deletedFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Bangkok",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** dd/mm/yyyy HH:mm (Asia/Bangkok), as Decimal Setup's "Last updated". */
export function formatDeletedAt(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : deletedFormatter.format(at).replace(",", "");
}

export const deletedBannerText = (info: DeletedInfo, byName: string) => `Deleted by ${byName} on ${formatDeletedAt(info.at)}`;

/** Status names in the Restore confirm (a restored document keeps its status). */
const RESTORED_STATUS: Record<string, string> = { DRAFT: "Draft", PENDING_APPROVAL: "Pending Approval" };
export const restoredStatusLabel = (status: string | undefined) => (status && RESTORED_STATUS[status]) || "its saved status";

/**
 * The API returns the user id only (like `createdBy`): the signed-in user's own deletions show their name, any other
 * user shows as "another user" (the contract has no user lookup).
 */
export function deletedByName(by: string | null, user: { id: string; name?: string | null } | null | undefined): string {
  if (by && user?.id === by) return user.name || "you";
  return "another user";
}

export function useDeletedByName(by: string | null): string {
  const session = authClient.useSession();
  return deletedByName(by, session.data?.user);
}

/** FE-SD-002: the read-only banner of a deleted document; Restore only with `access.delete`. */
export function DeletedBanner({ text, canRestore, busy, onRestore }: { text: string; canRestore: boolean; busy: boolean; onRestore: () => void }) {
  return (
    <div className="mx-6 mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-[#E3E6EA] bg-[#F6F7F8] px-4 py-3 text-sm text-[#1C252E]">
      <Trash2 aria-hidden className="size-4 shrink-0 text-[#6B7480]" />
      <p role="status" tabIndex={0} className="min-w-0 flex-1 rounded outline-none focus-visible:ring-2 focus-visible:ring-[#0E5E63]">
        <span className="font-medium">{text}</span>
        <span className="text-[#6B7480]"> · Read-only</span>
      </p>
      {canRestore && (
        <button
          type="button"
          onClick={onRestore}
          disabled={busy}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#0E5E63] px-4 text-sm font-medium text-white hover:bg-[#0B4B4F] disabled:opacity-50"
        >
          <RotateCcw aria-hidden className="size-4" /> Restore
        </button>
      )}
    </div>
  );
}

/** The banner with the deleting user's name. */
export function DocumentDeletedBanner({ info, canRestore, busy, onRestore }: { info: DeletedInfo; canRestore: boolean; busy: boolean; onRestore: () => void }) {
  const byName = useDeletedByName(info.by);
  return <DeletedBanner text={deletedBannerText(info, byName)} canRestore={canRestore} busy={busy} onRestore={onRestore} />;
}

/**
 * A message for a document's next mount: saved documents remount on every new server version, so a toast set before a
 * refetch (deleted elsewhere, restored) is handed over here. Entries expire after 10 s and are removed on mount.
 */
const notices = new Map<string, { message: string; at: number }>();
const NOTICE_TTL_MS = 10_000;
export function handOverNotice(id: string, message: string, now = Date.now()) {
  notices.set(id, { message, at: now });
}
/** Reads (does not remove) the notice for `id`; `clearNotice` removes it once the form has mounted. */
export function peekNotice(id: string | undefined, now = Date.now()): string | null {
  if (!id) return null;
  const entry = notices.get(id);
  if (!entry || now - entry.at > NOTICE_TTL_MS) return null;
  return entry.message;
}
export function clearNotice(id: string | undefined) {
  if (id) notices.delete(id);
}

// ---- daybook (right rail) ----

export const DAYBOOK_PAGE_SIZE = 50;

/** `<doc>.list` input; deleted documents are left out (owner 2026-11-06: they show nowhere, no Active / Deleted view). */
export const daybookInput = () => ({ limit: DAYBOOK_PAGE_SIZE });
export const daybookQueryOptions = {
  getNextPageParam: (page: { nextCursor: string | null }) => page.nextCursor ?? undefined,
  staleTime: 15_000,
  retry: retryTransient,
};

type DaybookItem = { id: string; docNo: string; docDate: string; status: string; name: string };
export type DaybookState = {
  isPending: boolean;
  isError: boolean;
  errorMessage?: string;
  items: DaybookItem[];
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
};

type ListRow = { id: string; docNo: string; docDate: string; status: string };
type InfiniteList<T> = {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  data?: { pages: readonly { items: readonly T[] }[] };
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
};

/** An infinite `<doc>.list` query → the daybook's state. */
export function daybookState<T extends ListRow>(list: InfiniteList<T>, loadError: (error: unknown) => string, name: (item: T) => string): DaybookState {
  return {
    isPending: list.isPending,
    isError: list.isError,
    errorMessage: list.error ? loadError(list.error) : undefined,
    items: (list.data?.pages ?? []).flatMap((page) =>
      page.items.map((item) => ({ id: item.id, docNo: item.docNo, docDate: item.docDate, status: item.status, name: name(item) })),
    ),
    hasMore: list.hasNextPage,
    loadingMore: list.isFetchingNextPage,
    onLoadMore: () => void list.fetchNextPage(),
  };
}

export type DaybookDot = { className: string; label: string };

/** Daybook dot, as on Memo Receive (owner 2026-11-02): green once approved, amber while waiting for approval. */
export const daybookDot = (status: string): DaybookDot =>
  status === "APPROVED" ? { className: "bg-[#22C55E]", label: "Approved" } : { className: "bg-[#F5A524]", label: "Pending approval" };


/** Right-rail Daybook: the document's list, newest first (deleted documents left out), with Load more. */
export function DocumentDaybook({ state, href, plural, dot = daybookDot, emptyText }: {
  state: DaybookState;
  href: (id: string) => string;
  plural: string;
  /** Quotation colors its own statuses. */
  dot?: (status: string) => DaybookDot;
  /** Empty text (default "No {plural} yet."). */
  emptyText?: string;
}) {
  return <DaybookBody state={state} href={href} empty={emptyText ?? `No ${plural} yet.`} dot={dot} />;
}

function DaybookBody({ state, href, empty, dot }: { state: DaybookState; href: (id: string) => string; empty: string; dot: (status: string) => DaybookDot }) {
  if (state.isPending) return <p className="py-16 text-center text-sm text-[#6B7480]">Loading…</p>;
  if (state.isError) return <p className="py-16 text-center text-sm text-[#E5484D]">{state.errorMessage}</p>;
  if (state.items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-[#6B7480]">
        <FileSearch className="size-10 text-[#1C252E]" strokeWidth={1.5} />
        {empty}
      </div>
    );
  }
  return (
    <ul className="px-5 py-3">
      {state.items.map((e, i) => {
        const mark = dot(e.status);
        return (
          <li key={e.id}>
            <Link href={href(e.id)} className="flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-[#F6F7F8]">
              <span className="w-8 shrink-0 text-[#1C252E]">#{i + 1}</span>
              <span className={`mt-1.5 size-3 shrink-0 rounded-full ${mark.className}`} title={mark.label} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-[#1C252E]">{e.docNo}</span>
                <span className="block truncate text-sm text-[#1C252E]">{e.name}</span>
              </span>
              <span className="shrink-0 text-sm text-[#A9B1B9]">{formatDate(e.docDate)}</span>
            </Link>
          </li>
        );
      })}
      {state.hasMore && (
        <li className="pt-2 text-center">
          <button
            type="button"
            onClick={state.onLoadMore}
            disabled={state.loadingMore}
            className="h-9 rounded-lg border border-[#E3E6EA] px-4 text-sm text-[#1C252E] hover:bg-[#F6F7F8] disabled:opacity-50"
          >
            {state.loadingMore ? "Loading…" : "Load more"}
          </button>
        </li>
      )}
    </ul>
  );
}
