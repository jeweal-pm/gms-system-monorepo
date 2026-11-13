"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Per-browser sidebar preference (FE-NAV-003, D-06): `localStorage["gms.sidebar.collapsed"]`
 * holds "1" (rail) or "0" (expanded). It is a viewer convenience only:
 * - every storage access is wrapped in try/catch; blocked storage falls back to an in-memory
 *   value, so the toggle still works for the current page view and the next load starts expanded;
 * - the server snapshot is always "expanded", so the server and the hydration render match and
 *   storage is read only on the client after hydration;
 * - other tabs follow changes through the `storage` event.
 */
const storageKey = "gms.sidebar.collapsed";
const listeners = new Set<() => void>();
let memoryValue: boolean | null = null;

function readCollapsed(): boolean {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored !== null) return stored === "1";
  } catch {
    // Storage unavailable (private mode, blocked site data): use the in-memory value.
  }
  return memoryValue ?? false;
}

function writeCollapsed(collapsed: boolean) {
  memoryValue = collapsed;
  try {
    window.localStorage.setItem(storageKey, collapsed ? "1" : "0");
  } catch {
    // Not persisted; the in-memory value keeps the current page view consistent.
  }
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) onChange();
  };
  listeners.add(onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

const expandedOnServer = () => false;

export function useSidebarCollapsed(): [collapsed: boolean, setCollapsed: (collapsed: boolean) => void] {
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, expandedOnServer);
  const setCollapsed = useCallback((next: boolean) => writeCollapsed(next), []);
  return [collapsed, setCollapsed];
}

/** Owner 2026-11-11: signing out forgets the preference, so the next sign-in starts with the sidebar open. */
export function resetSidebarPreference() {
  memoryValue = null;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Nothing stored.
  }
  for (const listener of listeners) listener();
}

/** Below Tailwind's `lg` (1024 px) the sidebar is the icon rail by default (owner 2026-11-12). */
export const NARROW_SCREEN_QUERY = "(max-width: 1023.98px)";

function subscribeToNarrow(onChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  const query = window.matchMedia(NARROW_SCREEN_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const readNarrow = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(NARROW_SCREEN_QUERY).matches;
const wideOnServer = () => false;

/** True on screens narrower than `lg`; the server and hydration render assume a wide screen. */
export function useIsNarrowScreen(): boolean {
  return useSyncExternalStore(subscribeToNarrow, readNarrow, wideOnServer);
}
