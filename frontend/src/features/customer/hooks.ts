"use client";

import { skipToken, useIsFetching } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { useCallback, useMemo } from "react";
import { toSelectOptions } from "@/features/partner/options";
import { retryTransient } from "@/lib/trpc-error";
import { masterTrpc } from "@/lib/master-trpc";
import { authTrpc } from "@/lib/auth-trpc";
import { CUSTOMER_PAGE_SIZE } from "./contract";

/**
 * Customer data hooks over the typed api-master tRPC client (`customer.*`, FE-CUS-014; data-fetching.md).
 * Bounds: 50 rows per page, one page request in flight, no polling, options fetched once per
 * session, reads retried at most twice for transient failures, mutations never retried.
 * `permission.mine` and the debounced search hook are shared in features/partner/hooks.ts.
 */

/** Static per deployment: cached for the session. */
export function useCustomerOptions() {
  return masterTrpc.customer.options.useQuery(undefined, { select: toSelectOptions, staleTime: Infinity, retry: retryTransient });
}

/** Drawer list: keyset pages of 50; a new `q` restarts without a cursor (key includes `q`). */
export function useCustomerList(q: string) {
  return masterTrpc.customer.list.useInfiniteQuery(
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

/**
 * ADR-0021 §2: suggested next Code Name (`{ code: "C001" }`). Requested only in create mode with
 * ADD (the gateway requires `customer:ADD`); always refetched when create mode starts, never polled.
 */
export function useCustomerNextCode(enabled: boolean) {
  return masterTrpc.customer.nextCode.useQuery(undefined, { enabled, staleTime: 0, gcTime: 60_000, retry: retryTransient, refetchOnWindowFocus: false });
}

export function useCustomerDetail(id: string | null) {
  return masterTrpc.customer.get.useQuery(id === null ? skipToken : { id }, { staleTime: 30_000, retry: retryTransient });
}

export function useCreateCustomer() {
  return masterTrpc.customer.create.useMutation({ retry: false, gcTime: 0 });
}

export function useUpdateCustomer() {
  return masterTrpc.customer.update.useMutation({ retry: false, gcTime: 0 });
}

export function useDeleteCustomer() {
  return masterTrpc.customer.delete.useMutation({ retry: false, gcTime: 0 });
}

/** Cache actions used after mutations, Refresh and permission changes. */
export function useCustomerCache() {
  const utils = masterTrpc.useUtils();
  const authUtils = authTrpc.useUtils();
  return useMemo(
    () => ({
      invalidateLists: () => utils.customer.list.invalidate(),
      /** Refetches active list pages now (used before allowing a retry after a create timeout). */
      refetchLists: () => utils.customer.list.refetch(),
      invalidateDetail: (id: string) => utils.customer.get.invalidate({ id }),
      resetDetail: (id: string) => utils.customer.get.reset({ id }),
      refetchOptions: () => utils.customer.options.refetch(),
      recheckAccess: () => authUtils.permission.mine.invalidate(),
    }),
    [utils, authUtils],
  );
}

/**
 * Loads one customer for the form (selection, Retry, after create/Reload). Reuses a fresh
 * cached entry of the `get` query and shares its key with `useCustomerDetail`.
 */
export function useCustomerLoader() {
  const utils = masterTrpc.useUtils();
  return useCallback((id: string) => utils.customer.get.fetch({ id }, { staleTime: 30_000, retry: retryTransient }), [utils]);
}

/** True while any customer list page is being fetched (Refresh spinner). */
export function useCustomerListsFetching(): boolean {
  return useIsFetching({ queryKey: getQueryKey(masterTrpc.customer.list) }) > 0;
}
