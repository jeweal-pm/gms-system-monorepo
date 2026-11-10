"use client";

import { useInfiniteQuery, useQueries, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { authTrpc } from "@/lib/auth-trpc";
import { masterTrpc } from "@/lib/master-trpc";
import { retryTransient } from "@/lib/trpc-error";
import { APPROVE_MENUS, type ApprovalProc, type ApproveMenu, type AvailableMenu } from "./menus";
import type { PreviewDetail } from "./preview";
import { approvalTotal, COUNT_INPUT, countedMenus, pendingListInput, visibleMenus, type CountState, type PendingListInput, type Mine, type PendingPage } from "./model";

/**
 * Approve Center data access (approve-center UI rev 1, phase 1): only the existing per-document `list` / `get` /
 * `approve` procedures (data-fetching.md). Query keys are the tRPC keys, so a document page's own invalidation
 * (`utils.reserve.list.invalidate()`) refreshes these views too, and the other way round.
 */

/** The three procedures phase 1 uses, typed to what it reads. */
export type DocumentClient = {
  list: { query(input: PendingListInput): Promise<PendingPage> };
  /** The full detail; rev 2 reads it for the preview modal (`PreviewDetail`). */
  get: { query(input: { id: string }): Promise<PreviewDetail> };
  approve: { mutate(input: { id: string; expectedVersion: number }): Promise<unknown> };
};

type MasterClient = ReturnType<typeof masterTrpc.useUtils>["client"];

/** Each approvable document's client; checked by the compiler against the real router types. */
export function documentClients(client: MasterClient): Record<ApprovalProc, DocumentClient> {
  return {
    reserve: client.reserve,
    memoReceive: client.memoReceive,
    memoReturn: client.memoReturn,
    memoOut: client.memoOut,
    memoOutReturn: client.memoOutReturn,
    purchaseOrder: client.purchaseOrder,
    purchase: client.purchase,
  };
}

/** The tRPC react-query key of `<proc>.list` (same shape as `getQueryKey`; asserted in UT-AP-03). */
export function listQueryKey(proc: ApprovalProc, input: unknown, type: "query" | "infinite") {
  return [[proc, "list"], { input, type }] as const;
}

export const COUNT_STALE_MS = 60_000;
export const LIST_STALE_MS = 30_000;

/** The shared `permission.mine` query (same cache as the page guards and the sidebar). */
export function useMine(): { mine: Mine; isPending: boolean } {
  const mine = authTrpc.permission.mine.useQuery(undefined, { retry: retryTransient, staleTime: 30_000 });
  return { mine: mine.data, isPending: mine.isPending };
}

/** Menus the user may approve (Q-AP-13), in registry order. */
export function useVisibleMenus(): { menus: ApproveMenu[]; mine: Mine; isPending: boolean } {
  const { mine, isPending } = useMine();
  return { menus: visibleMenus(mine, APPROVE_MENUS), mine, isPending };
}

/**
 * FE-AP-003: one `{ status: PENDING_APPROVAL, limit: 1 }` list per counted menu → `total`. Refetched on window focus
 * once stale (60 s) and after every approval (invalidation); no interval polling.
 */
export function useApprovalCounts(mine: Mine): { countOf: (menu: ApproveMenu) => CountState | undefined; counts: CountState[]; menus: AvailableMenu[] } {
  const utils = masterTrpc.useUtils();
  const clients = documentClients(utils.client);
  const menus = countedMenus(mine, APPROVE_MENUS);
  const results = useQueries({
    queries: menus.map((menu) => ({
      queryKey: listQueryKey(menu.proc, COUNT_INPUT, "query"),
      queryFn: () => clients[menu.proc].list.query(COUNT_INPUT),
      staleTime: COUNT_STALE_MS,
      retry: retryTransient,
      refetchOnWindowFocus: true,
    })),
  });
  const counts: CountState[] = results.map((result) => ({ status: result.status, total: result.data?.total }));
  const byProc = new Map(menus.map((menu, index) => [menu.slug, counts[index]]));
  return { countOf: (menu) => byProc.get(menu.slug), counts, menus };
}

/** FE-AP-004: pending documents of one menu, 50 a page, newest first from the API (sorted on the client). */
export function usePendingList(menu: AvailableMenu, q: string | undefined, enabled: boolean) {
  const utils = masterTrpc.useUtils();
  const list = documentClients(utils.client)[menu.proc].list;
  const input = pendingListInput(q);
  return useInfiniteQuery({
    queryKey: listQueryKey(menu.proc, input, "infinite"),
    queryFn: ({ pageParam }) => list.query(pageParam ? { ...input, cursor: pageParam } : input),
    initialPageParam: null as string | null,
    getNextPageParam: (page: PendingPage) => page.nextCursor ?? undefined,
    staleTime: LIST_STALE_MS,
    retry: retryTransient,
    refetchOnWindowFocus: true,
    enabled,
  });
}

/** After an approval: this document's list / get (counts included) and the stock lists it moves. */
export function invalidateAfterApprove(queryClient: QueryClient, proc: ApprovalProc) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: [[proc]] }),
    queryClient.invalidateQueries({ queryKey: [["memoStock"]] }),
  ]);
}

/** FE-AP-005: `get` (current version and lines) and `approve` with that version. */
export function useApproveCalls(menu: AvailableMenu) {
  const utils = masterTrpc.useUtils();
  const queryClient = useQueryClient();
  const document = documentClients(utils.client)[menu.proc];
  const prepare = useCallback(async (id: string) => {
    const detail = await document.get.query({ id });
    return { version: detail.version, lineCount: detail.lines?.length ?? 0 };
  }, [document]);
  const approve = useCallback((id: string, expectedVersion: number) => document.approve.mutate({ id, expectedVersion }), [document]);
  const invalidate = useCallback(() => invalidateAfterApprove(queryClient, menu.proc), [menu.proc, queryClient]);
  const refetchAccess = useCallback(() => queryClient.invalidateQueries({ queryKey: [["permission", "mine"]] }), [queryClient]);
  return { prepare, approve, invalidate, refetchAccess };
}

/** The tRPC react-query key of `<proc>.get` (shares the cache with the document page). */
export function detailQueryKey(proc: ApprovalProc, id: string) {
  return [[proc, "get"], { input: { id }, type: "query" }] as const;
}

/** Rev 2 (FE-AP-014): the document behind the preview modal, fetched again every time the modal opens. */
export function useDocumentPreview(menu: AvailableMenu, id: string | null) {
  const utils = masterTrpc.useUtils();
  const document = documentClients(utils.client)[menu.proc];
  return useQuery({
    queryKey: detailQueryKey(menu.proc, id ?? ""),
    queryFn: () => document.get.query({ id: id ?? "" }),
    enabled: id !== null,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    retry: retryTransient,
  });
}

/** The company currency (Value column, Q-AP-17); same query and cache as the document forms' rate pickers. */
export function useBaseCurrency(): string | null {
  const rates = masterTrpc.currency.options.useQuery(undefined, { staleTime: 60_000, retry: retryTransient });
  return rates.data?.baseCode ?? null;
}

/** C-AP-01: the sidebar Approve total (sum of the visible menus' counts; null = no badge). */
export function useApprovalTotal(): number | null {
  const { mine } = useMine();
  return approvalTotal(useApprovalCounts(mine).counts);
}
