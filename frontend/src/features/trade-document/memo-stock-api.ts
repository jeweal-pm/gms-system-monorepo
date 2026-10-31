"use client";

import { skipToken } from "@tanstack/react-query";
import type { InferQueryLikeData } from "@trpc/react-query/shared";
import { masterTrpc } from "@/lib/master-trpc";
import { retryTransient } from "@/lib/trpc-error";
import { documentLoadError } from "./document-api";

/**
 * Memo Stock list (memo-receive SA-MR-11, memo-out SA-MO-15): items of approved memo receives with something pending,
 * newest receive first, 50 a page. Memo Return reads its vendor's items in its currency; Memo Out From Stock reads
 * every vendor's (no vendor, no currency).
 */
export type MemoStockItem = InferQueryLikeData<typeof masterTrpc.memoStock.list>["items"][number];
export type MemoStockFilter = { vendorId?: string; currency?: string; q: string; from: string; to: string };
export const MEMO_STOCK_PAGE_SIZE = 50;

/** A vendor-scoped list waits for both its vendor and currency; without a vendor it lists every vendor. */
export function memoStockInput(filter: MemoStockFilter) {
  if (filter.vendorId !== undefined && !(filter.vendorId && filter.currency)) return null;
  return {
    ...(filter.vendorId ? { vendorId: filter.vendorId, currency: filter.currency } : {}),
    limit: MEMO_STOCK_PAGE_SIZE,
    ...(filter.q.trim() ? { q: filter.q.trim() } : {}),
    ...(filter.from ? { from: filter.from } : {}),
    ...(filter.to ? { to: filter.to } : {}),
  };
}

export function useMemoStock(filter: MemoStockFilter) {
  return masterTrpc.memoStock.list.useInfiniteQuery(memoStockInput(filter) ?? skipToken, {
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 10_000,
    retry: retryTransient,
  });
}

export const memoStockLoadError = (error: unknown) => documentLoadError(error, "MEMO_STOCK", "memo stock", "memo stock");
