"use client";

import { skipToken } from "@tanstack/react-query";
import type { InferQueryLikeData } from "@trpc/react-query/shared";
import { masterTrpc } from "@/lib/master-trpc";
import { retryTransient } from "@/lib/trpc-error";
import type { MemoStockItem } from "./memo-stock-api";

/**
 * load-to-stock FE-LS-P2-01 (ADR-0052 D16, SA rev 2): the customer-side From Stock picker reads `fromStock.list`, ONE
 * list of Memo Stock and our stock merged by master (Ref. Doc Date desc, Stock ID desc, one cursor, 50 a page). Our
 * stock failing → Memo Stock rows only with `ownStock: "UNAVAILABLE"` (a notice, not a page error). Our-stock rows
 * carry no cost: the picker never reads `ownStock.stockPrice`.
 */
export type FromStockPage = InferQueryLikeData<typeof masterTrpc.fromStock.list>;
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
  return masterTrpc.fromStock.list.useInfiniteQuery(enabled ? fromStockInput(filter) : skipToken, {
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 10_000,
    retry: retryTransient,
  });
}

/** Any loaded page had our stock unavailable (the notice row shows; Memo Stock rows stay pickable). */
export const ownStockUnavailable = (pages: readonly Pick<FromStockPage, "ownStock">[] | undefined) => (pages ?? []).some((page) => page.ownStock === "UNAVAILABLE");

export const OWN_STOCK_UNAVAILABLE_TEXT = "Our stock is unavailable";

/** A picker row's key: Memo Stock ids as they are (Memo Return keys stay unchanged); our stock `own:<uuid>` (match by source + id). */
export function pickKey(item: Pick<MemoStockItem, "id">): string {
  return isOwnStockItem(item) ? ownPickKey(item.id) : item.id;
}
export const ownPickKey = (stockUuid: string) => `own:${stockUuid}`;

export const isOwnStockItem = (item: object): boolean => "source" in item && item.source === "OWN_STOCK";
