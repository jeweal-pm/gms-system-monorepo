"use client";

import { skipToken, useIsFetching } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { useCallback, useMemo } from "react";
import { retryTransient } from "@/lib/trpc-error";
import { trpc } from "@/providers/app-providers";
import type { StoneDetail, StoneListItem, StoneOptions } from "./api";
import type { StoneKind } from "./kinds";

/**
 * Stone Master data hooks over the typed tRPC client (`stoneMaster.<kind>.*`, data-fetching.md).
 * Every kind router has the same procedures; their payloads differ, so a page reads them through
 * the view types in api.ts. Bounds: 50 rows per page, options ≤ 1,000 per kind (staleTime 60 s),
 * reads retried at most twice for transient failures, mutations never retried.
 */

type KindRouter = typeof trpc.stoneMaster.group;
type KindUtils = ReturnType<typeof trpc.useUtils>["stoneMaster"]["group"];

function kindRouter(kind: StoneKind): KindRouter {
  return (trpc.stoneMaster as unknown as Record<StoneKind, KindRouter>)[kind];
}

function kindUtils(utils: ReturnType<typeof trpc.useUtils>, kind: StoneKind): KindUtils {
  return (utils.stoneMaster as unknown as Record<StoneKind, KindUtils>)[kind];
}

export const STONE_PAGE_SIZE = 50;

type ListPage = { items: StoneListItem[]; nextCursor: string | null; total: number };

export function useStoneList(kind: StoneKind, q: string) {
  const query = kindRouter(kind).list.useInfiniteQuery(
    { q: q === "" ? undefined : q, limit: STONE_PAGE_SIZE },
    { getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined, staleTime: 30_000, retry: retryTransient },
  );
  return query as unknown as Omit<typeof query, "data"> & { data?: { pages: ListPage[] } };
}

export function useStoneTotal(kind: StoneKind): number | undefined {
  return useStoneList(kind, "").data?.pages[0]?.total;
}

export function useStoneDetail(kind: StoneKind, id: string | null) {
  const query = kindRouter(kind).get.useQuery(id === null ? skipToken : { id }, { staleTime: 30_000, retry: retryTransient });
  return query as unknown as Omit<typeof query, "data" | "refetch"> & { data?: StoneDetail; refetch: () => Promise<{ data?: StoneDetail }> };
}

export function useStoneLoader(kind: StoneKind) {
  const utils = trpc.useUtils();
  return useCallback(
    (id: string) => kindUtils(utils, kind).get.fetch({ id }, { staleTime: 30_000, retry: retryTransient }) as unknown as Promise<StoneDetail>,
    [utils, kind],
  );
}

type MutationArgs = Record<string, unknown>;
type Mutation<TResult> = { mutateAsync: (input: MutationArgs) => Promise<TResult>; mutate: (input: MutationArgs, options?: { onSuccess?: () => void; onError?: (error: unknown) => void }) => void; isPending: boolean; reset: () => void };

export function useStoneMutations(kind: StoneKind) {
  const router = kindRouter(kind);
  const create = router.create.useMutation({ retry: false, gcTime: 0 });
  const update = router.update.useMutation({ retry: false, gcTime: 0 });
  const remove = router.delete.useMutation({ retry: false, gcTime: 0 });
  return {
    create: create as unknown as Mutation<{ id: string; updatedAt: string }>,
    update: update as unknown as Mutation<{ id: string; updatedAt: string }>,
    remove: remove as unknown as Mutation<{ ok: true }>,
  };
}

export function useStoneCache(kind: StoneKind) {
  const utils = trpc.useUtils();
  return useMemo(
    () => ({
      invalidateLists: () => kindUtils(utils, kind).list.invalidate(),
      refetchLists: () => kindUtils(utils, kind).list.refetch(),
      resetDetail: (id: string) => kindUtils(utils, kind).get.reset({ id }),
      /** Selects on other pages read these, so every save refreshes them. */
      invalidateOptions: () => utils.stoneMaster.options.invalidate(),
      recheckAccess: () => utils.permission.mine.invalidate(),
    }),
    [utils, kind],
  );
}

export function useStoneListsFetching(kind: StoneKind): boolean {
  return useIsFetching({ queryKey: getQueryKey(kindRouter(kind).list) }) > 0;
}

type OptionKindInput = "group" | "size" | "shape" | "color" | "cutting" | "clarity" | "quality" | "stone-name";

/** Select options for the page (SA-SM-08); `include` keeps the saved record's inactive choices. */
export function useStoneOptions(kinds: readonly OptionKindInput[], include: readonly string[]) {
  const query = trpc.stoneMaster.options.useQuery(
    kinds.length === 0 ? skipToken : { kinds: [...kinds], include: [...include].slice(0, 20) },
    { staleTime: 60_000, retry: retryTransient },
  );
  return query as unknown as Omit<typeof query, "data"> & { data?: StoneOptions };
}
