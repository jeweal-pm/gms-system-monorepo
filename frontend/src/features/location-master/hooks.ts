"use client";

import { skipToken, useIsFetching } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { useCallback, useMemo } from "react";
import { authTrpc } from "@/lib/auth-trpc";
import { masterTrpc } from "@/lib/master-trpc";
import { retryTransient } from "@/lib/trpc-error";

/**
 * Location Master data hooks over the typed master tRPC client (`locationMaster.*`, data-fetching.md). Bounds: 50 rows
 * per page, reads retried at most twice for transient failures, mutations never retried.
 */

export const LOCATION_PAGE_SIZE = 50;

export function useLocationList(q: string) {
  return masterTrpc.locationMaster.list.useInfiniteQuery(
    { q: q === "" ? undefined : q, limit: LOCATION_PAGE_SIZE },
    { getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined, staleTime: 30_000, retry: retryTransient },
  );
}

/** Total from the unfiltered first page (shared with the drawer's query). */
export function useLocationTotal(): number | undefined {
  return useLocationList("").data?.pages[0]?.total;
}

export function useLocationDetail(id: string | null) {
  return masterTrpc.locationMaster.get.useQuery(id === null ? skipToken : { id }, { staleTime: 30_000, retry: retryTransient });
}

export function useLocationLoader() {
  const utils = masterTrpc.useUtils();
  return useCallback((id: string) => utils.locationMaster.get.fetch({ id }, { staleTime: 30_000, retry: retryTransient }), [utils]);
}

export function useLocationMutations() {
  const create = masterTrpc.locationMaster.create.useMutation({ retry: false, gcTime: 0 });
  const update = masterTrpc.locationMaster.update.useMutation({ retry: false, gcTime: 0 });
  const remove = masterTrpc.locationMaster.delete.useMutation({ retry: false, gcTime: 0 });
  return { create, update, remove };
}

export function useLocationCache() {
  const utils = masterTrpc.useUtils();
  const authUtils = authTrpc.useUtils();
  return useMemo(
    () => ({
      invalidateLists: () => utils.locationMaster.list.invalidate(),
      resetDetail: (id: string) => utils.locationMaster.get.reset({ id }),
      /** The Purchase Order / Purchase Location dropdowns read these (SA-LM-04), so every write refreshes them. */
      invalidateOptions: () => Promise.all([utils.purchaseOrder.options.invalidate(), utils.purchase.options.invalidate()]),
      recheckAccess: () => authUtils.permission.mine.invalidate(),
    }),
    [utils, authUtils],
  );
}

export function useLocationListsFetching(): boolean {
  return useIsFetching({ queryKey: getQueryKey(masterTrpc.locationMaster.list) }) > 0;
}
