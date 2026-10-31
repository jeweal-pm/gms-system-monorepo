/**
 * Memo Outstanding › From Vendor data access (SA revision 1, api-contract.md): the read-only `memoOutstanding.*`
 * procedures on the master tRPC router. Components use only this file and model.ts.
 */
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { can, type PermissionMine } from "@/features/partner/access";
import { authTrpc } from "@/lib/auth-trpc";
import { masterTrpc } from "@/lib/master-trpc";
import { isCallerLicenseCode, readDomainError, retryTransient } from "@/lib/trpc-error";
import { ITEMS_CACHE_ROOT, ITEMS_STALE_MS, loadDocItems, MENU_KEY, toFilterInput, toListInput, type FetchItems, type ListState } from "./model";

// ---- permissions (UX only; the server checks memo-outstanding-vendor:VIEW on every call) ----

export type MemoOutstandingAccess = { view: boolean; print: boolean; excel: boolean };

export function memoOutstandingAccess(mine: PermissionMine | undefined): MemoOutstandingAccess {
  if (!mine) return { view: false, print: false, excel: false };
  const excel = mine.isSuperAdmin || mine.permissions === "ALL" || mine.permissions.includes(`${MENU_KEY}:EXCEL`);
  return { view: can(mine, MENU_KEY, "VIEW"), print: can(mine, MENU_KEY, "PRINT"), excel };
}

export function useMemoOutstandingAccess(): MemoOutstandingAccess | undefined {
  const mine = authTrpc.permission.mine.useQuery(undefined, { staleTime: 30_000, retry: false });
  return mine.data ? memoOutstandingAccess(mine.data) : undefined;
}

// ---- errors (error-handling.md) ----

export const LOAD_ERROR = "Couldn't load the outstanding list. Try again.";

export const isPermissionDenied = (error: unknown) => readDomainError(error).domainCode === "PERMISSION_DENIED";

/** Inline banner text for a failed read; PERMISSION_DENIED is shown as the no-access page instead. */
export function loadErrorMessage(error: unknown): string {
  const { domainCode } = readDomainError(error);
  if (domainCode === "UNAUTHORIZED" || domainCode === "UNAUTHENTICATED") return "Your session has ended. Sign in again.";
  if (domainCode === "AUTHORIZATION_UNAVAILABLE") return "Couldn't check your access right now. Try again.";
  if (isCallerLicenseCode(domainCode)) return "Your license doesn't allow this page right now.";
  if (domainCode === "VALIDATION_ERROR") return "Some filters aren't valid. Check them and try again.";
  return LOAD_ERROR;
}

export const NO_ACCESS = "You don't have permission to view memo outstanding from vendors.";

// ---- reads ----

const reads = { retry: retryTransient } as const;

export function useVendorSummary(state: ListState, enabled: boolean) {
  return masterTrpc.memoOutstanding.vendorSummary.useQuery(toFilterInput(state), { ...reads, enabled, staleTime: 15_000 });
}

export function useVendorList(state: ListState, enabled: boolean) {
  return masterTrpc.memoOutstanding.vendorList.useQuery(toListInput(state), { ...reads, enabled, staleTime: 15_000, placeholderData: keepPreviousData });
}

export function useVendorOptions(enabled: boolean) {
  return masterTrpc.memoOutstanding.vendorOptions.useQuery({}, { ...reads, enabled, staleTime: 60_000 });
}

/** Fetches items through the typed master client (one batched HTTP call per ≤ 25 documents). */
export function useFetchItems(): FetchItems {
  const utils = masterTrpc.useUtils();
  return useCallback((memoReceiveIds) => utils.client.memoOutstanding.vendorItems.query({ memoReceiveIds }), [utils]);
}

/**
 * Items of the open documents (expanded rows, or the whole page in Expanded mode). Each document is fetched once and
 * kept 30 s; opening another row fetches only that row. The previous map stays visible while a new row loads.
 */
export function useDocItems(ids: readonly string[]) {
  const client = useQueryClient();
  const fetchItems = useFetchItems();
  const sorted = [...ids].sort();
  return useQuery({
    queryKey: [...ITEMS_CACHE_ROOT, "open", sorted],
    queryFn: () => loadDocItems(client, sorted, fetchItems),
    enabled: sorted.length > 0,
    staleTime: ITEMS_STALE_MS,
    gcTime: ITEMS_STALE_MS,
    retry: retryTransient,
    placeholderData: keepPreviousData,
  });
}

/** Refresh: KPIs, list and options again, and drop the cached items. */
export function useRefreshAll() {
  const utils = masterTrpc.useUtils();
  const client = useQueryClient();
  return useCallback(async () => {
    // Per-document entries have no observers; the open-items query is refetched and loads them again.
    client.removeQueries({ queryKey: [...ITEMS_CACHE_ROOT], predicate: (query) => query.queryKey[2] !== "open" });
    await Promise.all([utils.memoOutstanding.invalidate(), client.invalidateQueries({ queryKey: [...ITEMS_CACHE_ROOT, "open"] })]);
  }, [client, utils]);
}
