"use client";

import { useCallback } from "react";
import { retryTransient } from "@/lib/trpc-error";
import { authTrpc } from "@/lib/auth-trpc";
import { canViewWith, type CanView } from "./navigation";

/**
 * Menu visibility from the existing `permission.mine` contract (owner 2026-10-17): a menu without
 * VIEW is not shown at all. Same query and cache as the page guards. While loading or on error,
 * gated items stay hidden (pages still enforce access themselves).
 */
export function useMenuAccess(): CanView {
  const mine = authTrpc.permission.mine.useQuery(undefined, { retry: retryTransient, staleTime: 30_000 });
  const data = mine.data;
  return useCallback((permission: readonly string[] | undefined) => canViewWith(data, permission), [data]);
}
