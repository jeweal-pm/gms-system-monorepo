"use client";

import { skipToken } from "@tanstack/react-query";
import type { InferQueryLikeData } from "@trpc/react-query/shared";
import { masterTrpc } from "@/lib/master-trpc";
import { retryTransient } from "@/lib/trpc-error";

/**
 * lot-based-stock round 1 (ADR-0055 D3, FE-LOT-002): the customer-side From Stock picker (Quotation, Reserve, Memo
 * Out) reads `fromStock.lots`: one row per lot (`LotGroupRow`), our stock first (each of our items its own row this
 * round, owner Q4), then Memo Stock lots, one opaque cursor, 50 a page. Our stock failing → Memo Stock rows only with
 * `ownStock: "UNAVAILABLE"` (a notice, not a page error). Our-stock rows carry no price. Search never matches a Stock ID.
 */
export type FromStockPage = InferQueryLikeData<typeof masterTrpc.fromStock.lots>;
export type FromStockItem = FromStockPage["items"][number];
export type FromStockFilter = { q: string; from: string; to: string };
export const FROM_STOCK_PAGE_SIZE = 50;

export function fromStockInput(filter: FromStockFilter) {
  return {
    limit: FROM_STOCK_PAGE_SIZE,
    ...(filter.q.trim() ? { q: filter.q.trim() } : {}),
    ...(filter.from ? { from: filter.from } : {}),
    ...(filter.to ? { to: filter.to } : {}),
  };
}

export function useFromStock(filter: FromStockFilter, enabled: boolean) {
  return masterTrpc.fromStock.lots.useInfiniteQuery(enabled ? fromStockInput(filter) : skipToken, {
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 10_000,
    retry: retryTransient,
  });
}

/** Any loaded page had our stock unavailable (the notice row shows; Memo Stock rows stay pickable). */
export const ownStockUnavailable = (pages: readonly Pick<FromStockPage, "ownStock">[] | undefined) => (pages ?? []).some((page) => page.ownStock === "UNAVAILABLE");

export const OWN_STOCK_UNAVAILABLE_TEXT = "Our stock is unavailable";

/** A picker row's key: the lot key (opaque; its prefix tells Memo Stock M* from our stock O*). */
export const pickKey = (item: Pick<FromStockItem, "lotKey">): string => item.lotKey;

export const isOwnStockItem = (item: Pick<FromStockItem, "source">): boolean => item.source === "OWN_STOCK";
