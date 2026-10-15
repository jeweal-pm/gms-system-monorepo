"use client";

import { useCallback, useEffect, useState } from "react";
import { retryTransient } from "@/lib/trpc-error";
import { trpc } from "@/providers/app-providers";

/** Existing approved contract; shares the tRPC cache entry with the shell and other pages. */
export function usePermissionMine() {
  return trpc.permission.mine.useQuery(undefined, { retry: retryTransient, staleTime: 30_000 });
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

/** Native prompt on close/reload while the form has unsaved changes. */
export function useUnsavedChangesPrompt(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}
