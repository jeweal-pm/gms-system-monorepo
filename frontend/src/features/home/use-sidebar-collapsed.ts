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
