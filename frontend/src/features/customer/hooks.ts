"use client";

import { skipToken, useIsFetching } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { retryTransient } from "@/lib/trpc-error";
import { trpc } from "@/providers/app-providers";
import { toSelectOptions } from "./api";
import { CUSTOMER_PAGE_SIZE } from "./contract";

/**
 * Customer data hooks over the typed tRPC client (`customer.*`, FE-CUS-014; data-fetching.md).
 * Bounds: 50 rows per page, one page request in flight, no polling, options fetched once per
 * session, reads retried at most twice for transient failures, mutations never retried.
 */

/** Existing approved contract; shares the tRPC cache entry with other pages (staleTime as user-permission). */
export function usePermissionMine() {
  return trpc.permission.mine.useQuery(undefined, { retry: retryTransient, staleTime: 30_000 });
}

/** Static per deployment: cached for the session. */
export function useCustomerOptions() {
  return trpc.customer.options.useQuery(undefined, { select: toSelectOptions, staleTime: Infinity, retry: retryTransient });
}

/** Drawer list: keyset pages of 50; a new `q` restarts without a cursor (key includes `q`). */
export function useCustomerList(q: string) {
  return trpc.customer.list.useInfiniteQuery(
    { q: q === "" ? undefined : q, limit: CUSTOMER_PAGE_SIZE },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      staleTime: 30_000,
      retry: retryTransient,
    },
  );
}

/** Unfiltered total for the header and drawer badge (shares the cache of the unfiltered list). */
export function useCustomerTotal(): number | undefined {
  const list = useCustomerList("");
  return list.data?.pages[0]?.total;
}

export function useCustomerDetail(id: string | null) {
  return trpc.customer.get.useQuery(id === null ? skipToken : { id }, { staleTime: 30_000, retry: retryTransient });
}

export function useCreateCustomer() {
  return trpc.customer.create.useMutation({ retry: false, gcTime: 0 });
}

export function useUpdateCustomer() {
  return trpc.customer.update.useMutation({ retry: false, gcTime: 0 });
}

export function useDeleteCustomer() {
  return trpc.customer.delete.useMutation({ retry: false, gcTime: 0 });
}

/** Cache actions used after mutations, Refresh and permission changes. */
export function useCustomerCache() {
  const utils = trpc.useUtils();
  return useMemo(
    () => ({
      invalidateLists: () => utils.customer.list.invalidate(),
      /** Refetches active list pages now (used before allowing a retry after a create timeout). */
      refetchLists: () => utils.customer.list.refetch(),
      invalidateDetail: (id: string) => utils.customer.get.invalidate({ id }),
      resetDetail: (id: string) => utils.customer.get.reset({ id }),
      refetchOptions: () => utils.customer.options.refetch(),
      recheckAccess: () => utils.permission.mine.invalidate(),
    }),
    [utils],
  );
}

/**
 * Loads one customer for the form (selection, Retry, after create/Reload). Reuses a fresh
 * cached entry of the `get` query and shares its key with `useCustomerDetail`.
 */
export function useCustomerLoader() {
  const utils = trpc.useUtils();
  return useCallback((id: string) => utils.customer.get.fetch({ id }, { staleTime: 30_000, retry: retryTransient }), [utils]);
}

/** True while any customer list page is being fetched (Refresh spinner). */
export function useCustomerListsFetching(): boolean {
  return useIsFetching({ queryKey: getQueryKey(trpc.customer.list) }) > 0;
}

/** Trimmed, debounced search text (300 ms); unchanged trimmed text does not change the key. */
export function useDebouncedSearch(raw: string, delayMs = 300): string {
  const trimmed = raw.trim();
  const [debounced, setDebounced] = useState(trimmed);
  const apply = useCallback(() => setDebounced(trimmed), [trimmed]);
  useEffect(() => {
    const timer = window.setTimeout(apply, delayMs);
    return () => window.clearTimeout(timer);
  }, [apply, delayMs]);
  return debounced;
}
