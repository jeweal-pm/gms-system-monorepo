import type { QueryClient } from "@tanstack/react-query";

/**
 * Drops every cached query when the signed-in account changes (sign-in success, sign-out).
 * The QueryClient lives in the root layout and survives client-side navigation, so without this
 * the next account briefly reuses the previous account's data, e.g. `permission.mine` hiding
 * menus from a Super Admin until a refresh (owner report 2026-10-17).
 */
export function clearAccountCache(queryClient: QueryClient): void {
  void queryClient.cancelQueries();
  queryClient.clear();
}
