"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  approvalSettingsSchema,
  approvalSettingUpdateSchema,
  approvalSummarySchema,
  INVENTORY_APPROVAL_TYPES,
  pendingPageSchema,
  type InventoryApprovalType,
  type InventoryPendingItem,
} from "@/features/load-to-stock/types";
import { inventoryRequest, type InventoryClientDeps } from "@/lib/inventory-client";
import { retryTransient } from "@/lib/trpc-error";
import { INVENTORY_QUERY_KEY } from "./query-keys";

/**
 * ADR-0052 D8 / D12 (FE-LS-009, FE-LS-011, FE-LS-014): the inventory approval platform. The three inventory types'
 * switches live in `backend-api-inventory` (`GET/PUT /approval-settings`), and its Approve Center summary / pending
 * lists sit beside master's (`GET /approval/summary`, `GET /approval/pending`).
 */

export { INVENTORY_APPROVAL_TYPES, type InventoryApprovalType };

export const isInventoryApprovalType = (type: string): type is InventoryApprovalType => (INVENTORY_APPROVAL_TYPES as readonly string[]).includes(type);

export const inventoryApprovalKeys = {
  settings: () => [...INVENTORY_QUERY_KEY, "approval-settings"] as const,
  summary: () => [...INVENTORY_QUERY_KEY, "approval", "summary"] as const,
  pending: (input: InventoryPendingInput) => [...INVENTORY_QUERY_KEY, "approval", "pending", input] as const,
};

export type InventoryPendingInput = { type: InventoryApprovalType; q?: string; sort?: string; dir?: "asc" | "desc"; limit: number };

export function inventoryApprovalCalls(deps: InventoryClientDeps = {}) {
  return {
    settings: () => inventoryRequest("/approval-settings", { schema: approvalSettingsSchema }, deps),
    updateSetting: (type: InventoryApprovalType, requireApproval: boolean, expectedVersion: number) =>
      inventoryRequest(`/approval-settings/${encodeURIComponent(type)}`, { method: "PUT", body: { requireApproval, expectedVersion }, schema: approvalSettingUpdateSchema }, deps),
    summary: () => inventoryRequest("/approval/summary", { schema: approvalSummarySchema }, deps),
    pending: (input: InventoryPendingInput, cursor?: string | null) => {
      const query = input.type === "stock-adjustment"
        ? { type: input.type, q: input.q, limit: input.limit, cursor }
        : { type: input.type, q: input.q, sort: input.sort, dir: input.dir, limit: input.limit, cursor };
      return inventoryRequest("/approval/pending", { query, schema: pendingPageSchema }, deps);
    },
  };
}

export const inventoryApprovalApi = inventoryApprovalCalls();

/** Same caching as master's `approvalSetting.list` (APPROVAL_SETTING_QUERY): session cache, refetch on focus. */
export const INVENTORY_SETTING_QUERY = { staleTime: 5 * 60_000, refetchOnWindowFocus: "always" as const, retry: retryTransient };

export function useInventoryApprovalSettings(enabled = true) {
  return useQuery({ queryKey: inventoryApprovalKeys.settings(), queryFn: () => inventoryApprovalApi.settings(), enabled, ...INVENTORY_SETTING_QUERY });
}

export function useInventoryApprovalSummary(enabled: boolean) {
  return useQuery({ queryKey: inventoryApprovalKeys.summary(), queryFn: () => inventoryApprovalApi.summary(), enabled, staleTime: 60_000, retry: retryTransient, refetchOnWindowFocus: true });
}

export function useInventoryPendingList(input: InventoryPendingInput, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: inventoryApprovalKeys.pending(input),
    queryFn: ({ pageParam }) => inventoryApprovalApi.pending(input, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 30_000,
    retry: retryTransient,
    refetchOnWindowFocus: true,
    enabled,
  });
}

/** Inventory waiting counts (`waitingCount`, only with approval-setup:VIEW) → the Setup page's capped `waiting`. */
export function waitingOf(count: { pending: number; revision: number } | null | undefined): number | null {
  if (!count) return null;
  return Math.min(100, count.pending + count.revision);
}

export type { InventoryPendingItem };
