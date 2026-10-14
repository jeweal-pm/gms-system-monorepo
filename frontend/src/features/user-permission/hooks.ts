"use client";

import { skipToken } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { trpc } from "@/providers/app-providers";
import {
  retryTransient,
  toLocationOptions,
  toPermissionCatalog,
  toUserDetail,
  toUserList,
  type CreateUserInput,
} from "./api";

/**
 * TanStack Query hooks over the typed tRPC client (FE-UP-012 / FE-UP-014).
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
 * Create is deliberately not a `useMutation`: mutation state keeps its
 * variables (which include the password) in the MutationCache. The vanilla
 * client call keeps the input only for the duration of the request.
 */
export function useCreateUser() {
  const utils = trpc.useUtils();
  const [isPending, setIsPending] = useState(false);
  const inFlight = useRef(false);
  /** Resolves `null` without a request when a create is already in flight (double submit). */
  const create = useCallback(
    async (input: CreateUserInput) => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setIsPending(true);
      try {
        return await utils.client.userAdmin.create.mutate(input);
      } finally {
        inFlight.current = false;
        setIsPending(false);
      }
    },
    [utils],
  );
  return { create, isPending };
}

/** Delete variables are only the user ID; `gcTime: 0` drops the finished mutation. */
export function useDeleteUser() {
  return trpc.userAdmin.delete.useMutation({ gcTime: 0, retry: false });
}
