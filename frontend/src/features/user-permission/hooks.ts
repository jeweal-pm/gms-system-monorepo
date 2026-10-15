"use client";

import { skipToken } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { retryTransient } from "@/lib/trpc-error";
import { trpc } from "@/providers/app-providers";
import {
  toLocationOptions,
  toPermissionCatalog,
  toUserDetail,
  toUserList,
  type CreateUserInput,
  type UpdateUserInput,
} from "./api";

/**
 * TanStack Query hooks over the typed tRPC client (UI revision 2).
 * Keys are the tRPC keys for each procedure; bounds follow data-fetching.md.
 * Mutations are never retried (QueryClient default for mutations is 0).
 */

export function usePermissionMine() {
  return trpc.permission.mine.useQuery(undefined, { retry: retryTransient, staleTime: 30_000 });
}

export function useUserList() {
  return trpc.userAdmin.list.useQuery(undefined, { select: toUserList, staleTime: 30_000, retry: retryTransient });
}

export function useUserDetail(id: string | null) {
  return trpc.userAdmin.get.useQuery(id === null ? skipToken : { id }, { select: toUserDetail, retry: retryTransient });
}

/** The catalog changes only on deploy, so it is cached for the session. */
export function usePermissionCatalog() {
  return trpc.permission.catalog.useQuery(undefined, { select: toPermissionCatalog, staleTime: Infinity, retry: retryTransient });
}

export function useLocationOptions() {
  return trpc.userAdmin.locationOptions.useQuery(undefined, { select: toLocationOptions, staleTime: 5 * 60_000, retry: retryTransient });
}

/**
 * Create and update are deliberately not `useMutation`: mutation state keeps
 * its variables (which can include a password) in the MutationCache. The
 * vanilla client call keeps the input only for the duration of the request.
 * Resolves `null` without a request while a save is already in flight.
 */
export function useSaveUser() {
  const utils = trpc.useUtils();
  const [isPending, setIsPending] = useState(false);
  const inFlight = useRef(false);

  const run = useCallback(async <T,>(call: () => Promise<T>): Promise<T | null> => {
    if (inFlight.current) return null;
    inFlight.current = true;
    setIsPending(true);
    try {
      return await call();
    } finally {
      inFlight.current = false;
      setIsPending(false);
    }
  }, []);

  const create = useCallback((input: CreateUserInput) => run(() => utils.client.userAdmin.create.mutate(input)), [run, utils]);
  const update = useCallback((input: UpdateUserInput) => run(() => utils.client.userAdmin.update.mutate(input)), [run, utils]);

  return { create, update, isPending };
}

/** Delete variables are only the user ID; `gcTime: 0` drops the finished mutation. */
export function useDeleteUser() {
  return trpc.userAdmin.delete.useMutation({ gcTime: 0, retry: false });
}
