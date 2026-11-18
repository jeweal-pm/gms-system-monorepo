"use client";

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  inventoryApprovalKeys,
  isInventoryApprovalType,
  useInventoryApprovalSettings,
  useInventoryApprovalSummary,
  useInventoryPendingList,
  type InventoryApprovalType,
  type InventoryPendingInput,
} from "@/features/inventory/approval";
import { INVENTORY_QUERY_KEY } from "@/features/inventory/query-keys";
import { getQueryKey } from "@trpc/react-query";
import { useCallback } from "react";
import { authTrpc } from "@/lib/auth-trpc";
import { masterTrpc } from "@/lib/master-trpc";
import { retryTransient } from "@/lib/trpc-error";
import { APPROVE_MENUS, type ApprovalProc, type ApproveMenu, type AvailableMenu } from "./menus";
import type { PreviewDetail } from "./preview";
import { loadToStockDocumentClient, toPendingItem } from "./inventory";
import { approvalTotal, pendingInput, summaryCount, visibleMenus, type ApprovalSummary, type CountState, type Mine, type PendingInput, type ReviewAction, type SortState } from "./model";

/**
 * Approve Center data access (approve-center UI rev 1; phase 2 FE-AP-009/010, approval-setup FE-AS-009/013):
 * `approval.summary` (one count call for the panel, the sidebar badge and the landing), `approval.pending` (server
 * sort / search / keyset paging), and the per-document `get` (preview) / `approve` / `reject` / `requestRevision`.
 * Query keys are the tRPC keys, so a document page's own invalidation refreshes these views and the other way round.
 */

/** The per-document procedures the Approve menu calls, typed to what it reads. */
export type DocumentClient = {
  /** The full detail; the preview modal reads it (`PreviewDetail`). Approvers without VIEW may read PENDING (G11). */
  get: { query(input: { id: string }): Promise<PreviewDetail> };
  approve: { mutate(input: { id: string; expectedVersion: number }): Promise<unknown> };
  reject: { mutate(input: { id: string; expectedVersion: number; reason: string }): Promise<unknown> };
  requestRevision: { mutate(input: { id: string; expectedVersion: number; note: string }): Promise<unknown> };
};

type MasterClient = ReturnType<typeof masterTrpc.useUtils>["client"];

/** Each approvable document's client; checked by the compiler against the real router types. */
export function documentClients(client: MasterClient): Record<ApprovalProc, DocumentClient> {
  return {
    quotation: client.quotation,
    reserve: client.reserve,
    memoReceive: client.memoReceive,
    memoReturn: client.memoReturn,
    memoOut: client.memoOut,
    memoOutReturn: client.memoOutReturn,
    purchaseOrder: client.purchaseOrder,
    purchase: client.purchase,
    // FE-LS-011: Load to Stock is served by backend-api-inventory (REST), adapted to the same surface.
    loadToStock: loadToStockDocumentClient(),
  };
}

export const SUMMARY_STALE_MS = 60_000;
export const LIST_STALE_MS = 30_000;

/** The tRPC react-query key of `approval.summary` (asserted against `getQueryKey` in the tests). */
export const summaryQueryKey = () => getQueryKey(masterTrpc.approval.summary, undefined, "query");
/** The tRPC react-query key of one `approval.pending` infinite list. */
export const pendingQueryKey = (input: PendingInput) => getQueryKey(masterTrpc.approval.pending, input, "infinite");

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
 * FE-AP-009 / FE-AS-009: one `approval.summary` call (counts and each type's setting) for the menus the user may
 * approve. `staleTime` 60 s, refetched on window focus and after every approve / reject / revise; no polling. Without
 * any approvable menu no request is made.
 */
export function useApprovalCounts(mine: Mine): { countOf: (menu: ApproveMenu) => CountState | undefined; counts: CountState[]; refetch: () => Promise<unknown> } {
  const menus = visibleMenus(mine, APPROVE_MENUS).filter((menu) => menu.availability === "available");
  const masterEnabled = menus.some((menu) => !isInventoryApprovalType(menu.type));
  // FE-LS-011 (ADR-0052 D12): inventory types count from backend-api-inventory; their on/off from its settings.
  const inventoryEnabled = menus.some((menu) => isInventoryApprovalType(menu.type));
  const summary = masterTrpc.approval.summary.useQuery(undefined, {
    staleTime: SUMMARY_STALE_MS,
    retry: retryTransient,
    refetchOnWindowFocus: true,
    enabled: masterEnabled,
  });
  const inventorySummary = useInventoryApprovalSummary(inventoryEnabled);
  const inventorySettings = useInventoryApprovalSettings(inventoryEnabled);
  const state = { status: summary.status, data: summary.data };
  const inventoryState = inventoryCountState(inventorySummary, inventorySettings);
  const countOf = (menu: ApproveMenu) => {
    if (isInventoryApprovalType(menu.type)) return inventoryEnabled ? summaryCount(inventoryState, menu) : undefined;
    return masterEnabled ? summaryCount(state, menu) : undefined;
  };
  const counts = menus.map(countOf).filter((count): count is CountState => count !== undefined);
  return { countOf, counts, refetch: () => Promise.all([summary.refetch(), inventoryEnabled ? inventorySummary.refetch() : null]) };
}

type QueryState<T> = { status: "pending" | "error" | "success"; data?: T };

/** Inventory summary + settings -> master's summary shape (`types` = each inventory type's setting). */
export function inventoryCountState(
  summary: QueryState<{ items: readonly { type: string; count: number }[]; countCap: number }>,
  settings: QueryState<{ items: readonly { type: string; requireApproval: boolean }[] }>,
): { status: CountState["status"]; data?: ApprovalSummary } {
  if (summary.status === "error" || settings.status === "error") return { status: "error" };
  if (summary.status !== "success" || settings.status !== "success" || !summary.data || !settings.data) return { status: "pending" };
  return {
    status: "success",
    data: { items: summary.data.items, countCap: summary.data.countCap, types: settings.data.items.map((item) => ({ type: item.type, requireApproval: item.requireApproval })) },
  };
}

/** FE-AP-009: pending documents of one menu, 50 a page, in the server's sort; search on the server. */
export function usePendingList(menu: AvailableMenu, q: string | undefined, sort: SortState, enabled = true) {
  const inventory = isInventoryApprovalType(menu.type);
  const input = pendingInput(menu, q, sort);
  const master = masterTrpc.approval.pending.useInfiniteQuery(input, {
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: LIST_STALE_MS,
    retry: retryTransient,
    refetchOnWindowFocus: true,
    enabled: enabled && !inventory,
  });
  // FE-LS-011: the inventory list in master's row shape (same table, paging, search and sort).
  const baseCurrency = useBaseCurrency();
  const inventoryList = useInventoryPendingList(inventoryPendingInput(input, menu.type), enabled && inventory);
  if (!inventory) return master;
  const data = inventoryList.data
    ? { ...inventoryList.data, pages: inventoryList.data.pages.map((page) => ({ nextCursor: page.nextCursor, items: page.items.map((item) => toPendingItem(item, baseCurrency ?? "")) })) }
    : undefined;
  return { ...inventoryList, data } as unknown as typeof master;
}

export const inventoryPendingInput = (input: PendingInput, type: string): InventoryPendingInput => ({ ...input, type: type as InventoryApprovalType });

/**
 * After an approve / reject / revise: the Approve views (summary + every pending list), the document's own list / get,
 * the approval-setting waiting counts and, after an approve, the stock lists it moves.
 */
export function invalidateAfterReview(queryClient: QueryClient, proc: ApprovalProc, action: ReviewAction) {
  // FE-LS-011: an inventory review refreshes every inventory read (its list, document, picker, summary, settings).
  if (proc === "loadToStock") return Promise.all([queryClient.invalidateQueries({ queryKey: INVENTORY_QUERY_KEY }), queryClient.invalidateQueries({ queryKey: [["purchase"]] })]);
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: [["approval"]] }),
    queryClient.invalidateQueries({ queryKey: [[proc]] }),
    queryClient.invalidateQueries({ queryKey: [["approvalSetting"]] }),
    ...(action === "approve" ? [queryClient.invalidateQueries({ queryKey: [["memoStock"]] })] : []),
  ]);
}

/** FE-AP-005 / FE-AP-010: the row's version goes straight into approve / reject / requestRevision (no `get` first). */
export function useReviewCalls(menu: AvailableMenu) {
  const utils = masterTrpc.useUtils();
  const queryClient = useQueryClient();
  const document = documentClients(utils.client)[menu.proc];
  const approve = useCallback((id: string, expectedVersion: number) => document.approve.mutate({ id, expectedVersion }), [document]);
  const reject = useCallback((id: string, expectedVersion: number, reason: string) => document.reject.mutate({ id, expectedVersion, reason }), [document]);
  const requestRevision = useCallback((id: string, expectedVersion: number, note: string) => document.requestRevision.mutate({ id, expectedVersion, note }), [document]);
  const invalidate = useCallback((action: ReviewAction = "approve") => invalidateAfterReview(queryClient, menu.proc, action), [menu.proc, queryClient]);
  const refetchAccess = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [["permission", "mine"]] }),
        queryClient.invalidateQueries({ queryKey: [["approval"]] }),
        queryClient.invalidateQueries({ queryKey: [...INVENTORY_QUERY_KEY, "approval"] }),
      ]),
    [queryClient],
  );
  const inventory = isInventoryApprovalType(menu.type);
  const resetPaging = useCallback(
    (input: PendingInput) => queryClient.resetQueries({ queryKey: inventory ? inventoryApprovalKeys.pending(inventoryPendingInput(input, menu.type)) : pendingQueryKey(input) }),
    [queryClient, inventory, menu.type],
  );
  return { approve, reject, requestRevision, invalidate, refetchAccess, resetPaging };
}

/** The tRPC react-query key of `<proc>.get` (shares the cache with the document page). */
export function detailQueryKey(proc: ApprovalProc, id: string) {
  if (proc === "loadToStock") return [...INVENTORY_QUERY_KEY, "load-to-stock", "preview", id] as const;
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
