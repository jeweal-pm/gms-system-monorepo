"use client";

import { skipToken, useIsFetching } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { useCallback, useMemo } from "react";
import { authTrpc } from "@/lib/auth-trpc";
import { masterTrpc } from "@/lib/master-trpc";
import { retryTransient } from "@/lib/trpc-error";

/**
 * Currency data hooks over the typed master tRPC client (`currency.*`, data-fetching.md). Bounds: 50 rows
 * per page, reads retried at most twice for transient failures, mutations never retried.
 */

export const CURRENCY_PAGE_SIZE = 50;

export function useCurrencyList(q: string) {
  return masterTrpc.currency.list.useInfiniteQuery(
    { q: q === "" ? undefined : q, limit: CURRENCY_PAGE_SIZE },
    { getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined, staleTime: 30_000, retry: retryTransient },
  );
}

/** Total and base currency code from the unfiltered first page (shared with the drawer's query). */
export function useCurrencyOverview(): { total: number | undefined; baseCode: string | null | undefined } {
  const first = useCurrencyList("").data?.pages[0];
  return { total: first?.total, baseCode: first?.baseCode };
}

export function useCurrencyDetail(id: string | null) {
  return masterTrpc.currency.get.useQuery(id === null ? skipToken : { id }, { staleTime: 30_000, retry: retryTransient });
}

export function useCurrencyLoader() {
  const utils = masterTrpc.useUtils();
  return useCallback((id: string) => utils.currency.get.fetch({ id }, { staleTime: 30_000, retry: retryTransient }), [utils]);
}

export function useCurrencyMutations() {
  const create = masterTrpc.currency.create.useMutation({ retry: false, gcTime: 0 });
  const update = masterTrpc.currency.update.useMutation({ retry: false, gcTime: 0 });
  const remove = masterTrpc.currency.delete.useMutation({ retry: false, gcTime: 0 });
  return { create, update, remove };
}

export function useCurrencyCache() {
  const utils = masterTrpc.useUtils();
  const authUtils = authTrpc.useUtils();
  return useMemo(
    () => ({
      invalidateLists: () => utils.currency.list.invalidate(),
      resetDetail: (id: string) => utils.currency.get.reset({ id }),
      /** Currency selects on other pages read these (SA-CUR-05), so every write refreshes them. */
      invalidateOptions: () =>
        Promise.all([
          utils.currency.options.invalidate(),
          utils.companyProfile.options.invalidate(),
          utils.vendor.options.invalidate(),
          utils.customer.options.invalidate(),
        ]),
      recheckAccess: () => authUtils.permission.mine.invalidate(),
    }),
    [utils, authUtils],
  );
}

export function useCurrencyListsFetching(): boolean {
  return useIsFetching({ queryKey: getQueryKey(masterTrpc.currency.list) }) > 0;
}
