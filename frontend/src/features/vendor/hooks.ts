"use client";

import { skipToken, useIsFetching } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { useCallback, useMemo } from "react";
import { toSelectOptions } from "@/features/partner/options";
import { retryTransient } from "@/lib/trpc-error";
import { trpc } from "@/providers/app-providers";
import { VENDOR_PAGE_SIZE } from "./contract";

/**
 * Vendor data hooks over the typed tRPC client (`vendor.*`, FE-VEN-010; data-fetching.md).
 * Bounds: 50 rows per page, one page request in flight, no polling, options fetched once per
 * session (own `vendor.options` cache entry), reads retried at most twice for transient failures,
 * mutations never retried. `permission.mine` is shared in features/partner/hooks.ts.
 */

/** Static per deployment: cached for the session. */
export function useVendorOptions() {
  return trpc.vendor.options.useQuery(undefined, { select: toSelectOptions, staleTime: Infinity, retry: retryTransient });
}

/** Drawer list: keyset pages of 50; a new `q` restarts without a cursor (key includes `q`). */
export function useVendorList(q: string) {
  return trpc.vendor.list.useInfiniteQuery(
    { q: q === "" ? undefined : q, limit: VENDOR_PAGE_SIZE },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      staleTime: 30_000,
      retry: retryTransient,
    },
  );
}

/** Unfiltered total for the header and drawer badge (shares the cache of the unfiltered list). */
export function useVendorTotal(): number | undefined {
  const list = useVendorList("");
  return list.data?.pages[0]?.total;
}

export function useVendorDetail(id: string | null) {
  return trpc.vendor.get.useQuery(id === null ? skipToken : { id }, { staleTime: 30_000, retry: retryTransient });
}

export function useCreateVendor() {
  return trpc.vendor.create.useMutation({ retry: false, gcTime: 0 });
}

export function useUpdateVendor() {
  return trpc.vendor.update.useMutation({ retry: false, gcTime: 0 });
}

export function useDeleteVendor() {
  return trpc.vendor.delete.useMutation({ retry: false, gcTime: 0 });
}

/** Cache actions used after mutations, Refresh and permission changes. */
export function useVendorCache() {
  const utils = trpc.useUtils();
  return useMemo(
    () => ({
      invalidateLists: () => utils.vendor.list.invalidate(),
      /** Refetches active list pages now (used before allowing a retry after a create timeout). */
      refetchLists: () => utils.vendor.list.refetch(),
      invalidateDetail: (id: string) => utils.vendor.get.invalidate({ id }),
      resetDetail: (id: string) => utils.vendor.get.reset({ id }),
      refetchOptions: () => utils.vendor.options.refetch(),
      recheckAccess: () => utils.permission.mine.invalidate(),
    }),
    [utils],
  );
}

/**
 * Loads one vendor for the form (selection, Retry, after create/Reload). Reuses a fresh cached
 * entry of the `get` query and shares its key with `useVendorDetail`.
 */
export function useVendorLoader() {
  const utils = trpc.useUtils();
  return useCallback((id: string) => utils.vendor.get.fetch({ id }, { staleTime: 30_000, retry: retryTransient }), [utils]);
}

/** True while any vendor list page is being fetched (Refresh spinner). */
export function useVendorListsFetching(): boolean {
  return useIsFetching({ queryKey: getQueryKey(trpc.vendor.list) }) > 0;
}
