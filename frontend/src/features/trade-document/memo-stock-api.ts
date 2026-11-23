"use client";

import { skipToken } from "@tanstack/react-query";
import type { InferQueryLikeData } from "@trpc/react-query/shared";
import { masterTrpc } from "@/lib/master-trpc";
import { retryTransient } from "@/lib/trpc-error";
import { documentLoadError } from "./document-api";

/**
 * Memo Stock lots (lot-based-stock FE-LOT-002, ADR-0055): `memoStock.lots` — one row per lot (`LotGroupRow`) of the
 * vendor's approved memo receives with something pending, newest receive first, 50 a page. Memo Return reads it for its
 * vendor + currency; no Stock ID is listed or searched (owner Q-LOT-10).
 */
export type MemoStockItem = InferQueryLikeData<typeof masterTrpc.memoStock.lots>["items"][number];
export type MemoStockFilter = { vendorId?: string; currency?: string; q: string; from: string; to: string };
export const MEMO_STOCK_PAGE_SIZE = 50;

/** A vendor-scoped list waits for both its vendor and currency (the lots query needs both). */
export function memoStockInput(filter: MemoStockFilter) {
  if (!filter.vendorId || !filter.currency) return null;
  return {
    vendorId: filter.vendorId,
    currency: filter.currency,
    limit: MEMO_STOCK_PAGE_SIZE,
    ...(filter.q.trim() ? { q: filter.q.trim() } : {}),
    ...(filter.from ? { from: filter.from } : {}),
    ...(filter.to ? { to: filter.to } : {}),
  };
}

export function useMemoStock(filter: MemoStockFilter) {
  return masterTrpc.memoStock.lots.useInfiniteQuery(memoStockInput(filter) ?? skipToken, {
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 10_000,
    retry: retryTransient,
  });
}

export const memoStockLoadError = (error: unknown) => documentLoadError(error, "MEMO_STOCK", "memo stock", "memo stock");
