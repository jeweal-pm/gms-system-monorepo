"use client";

import { LoaderCircle, Plus, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, cx, focusRing } from "@/components/ui/button";
import { Badge, CountBadge } from "@/components/ui/card";
import { isPermissionDenied, loadErrorMessage } from "../api";
import { CUSTOMER_SEARCH_MAX, type CustomerListItem } from "../contract";
import { useCustomerCache, useCustomerList, useDebouncedSearch } from "../hooks";

export const CUSTOMERS_DRAWER_ID = "customers-drawer";

type CustomersDrawerProps = {
  open: boolean;
  /** Unfiltered total (header badge). */
  total: number | undefined;
  /** Draft row content (typed Name / Code Name), or null when the user has no ADD permission. */
  draft: { name: string; code: string } | null;
  draftSelected: boolean;
  selectedId: string | null;
  onSelectDraft: () => void;
  onSelectCustomer: (customer: CustomerListItem) => void;
  onClose: () => void;
};

const rowBase = "flex w-full items-start gap-3 rounded-gms-md border px-3 py-3 text-left transition-colors";
const rowState = (selected: boolean) => (selected ? "border-gms-primary bg-gms-primary-subtle" : "border-transparent hover:bg-gms-surface-sunken");

/**
 * C-15 / C-16 (FE-CUS-009): non-modal Customers drawer. Server search (debounced 300 ms),
 * keyset pages of 50 loaded when the end of the list scrolls into view, with a
 * "Load more" button for keyboard users. Pushes content at ≥1280 px, overlays below (Q-CUS-05).
 */
export function CustomersDrawer({ open, total, draft, draftSelected, selectedId, onSelectDraft, onSelectCustomer, onClose }: CustomersDrawerProps) {
  const [query, setQuery] = useState("");
  const search = useDebouncedSearch(query);
  const list = useCustomerList(search);
  const sentinelRef = useRef<HTMLLIElement>(null);
  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = list;
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const cache = useCustomerCache();
  const lostAccess = isPermissionDenied(list.error);

  // Permission removed mid-session: re-check so the page guard updates (FE-CUS-004).
  useEffect(() => {
    if (lostAccess) void cache.recheckAccess();
  }, [cache, lostAccess]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!open || !sentinel || !hasNextPage || isError) return;
    const observer = new IntersectionObserver((entries) => {
      // At most one page request in flight.
      if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [open, hasNextPage, isFetchingNextPage, isError, fetchNextPage]);

  const loadMore = () => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  };

  return (
    <aside
      id={CUSTOMERS_DRAWER_ID}
      aria-label="Customers"
      hidden={!open}
      className={cx(
        "absolute inset-y-0 right-0 z-30 w-full shrink-0 flex-col border-l border-gms-border-drawer bg-gms-surface shadow-gms-overlay sm:w-80 xl:static xl:z-auto xl:shadow-none print:hidden",
        open ? "flex" : "hidden",
      )}
    >
      <header className="flex h-[58px] shrink-0 items-center justify-between border-b border-gms-border px-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-gms-text">Customers</h2>
          {total !== undefined && <CountBadge>{total}</CountBadge>}
        </div>
        <button type="button" aria-label="Close customers panel" onClick={onClose} className={cx("rounded-gms-sm p-1 text-gms-text hover:bg-gms-surface-sunken", focusRing)}>
          <X size={20} aria-hidden />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-2 pt-3">
        <label className="relative block">
          <span className="sr-only">Search customers</span>
          <Search size={18} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gms-text" />
          <input
            type="search"
            value={query}
            maxLength={CUSTOMER_SEARCH_MAX}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or code name..."
            autoComplete="off"
            className="h-10 w-full rounded-gms-md border border-gms-border bg-gms-surface pl-11 pr-3 text-base text-gms-text outline-none placeholder:text-gms-text-placeholder focus:border-gms-primary focus:ring-2 focus:ring-gms-primary/20"
          />
        </label>

        <ul className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pb-4" aria-label="Customer list" aria-busy={list.isPending || isFetchingNextPage || undefined}>
          {draft && (
            <li>
              <button type="button" aria-current={draftSelected ? "true" : undefined} onClick={onSelectDraft} className={cx(rowBase, rowState(draftSelected), focusRing)}>
                <Plus size={18} className="mt-0.5 shrink-0 text-gms-text" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-gms-text">{draft.name.trim() || "New customer"}</span>
                  <span className="block truncate text-[15px] text-gms-text-secondary">{draft.code.trim() || "Not saved yet"}</span>
                </span>
                <Badge variant="draft">Draft</Badge>
              </button>
            </li>
          )}

          {list.isPending &&
            Array.from({ length: 3 }, (_, index) => (
              <li key={`skeleton-${index}`} aria-hidden className="space-y-2 px-3 py-3">
                <div className="h-4 w-1/2 animate-pulse rounded bg-gms-surface-sunken" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-gms-surface-sunken" />
              </li>
            ))}

          {list.isError && items.length === 0 && (
            <li role="alert" className="space-y-2 px-3 py-3">
              <p className="text-sm text-gms-text">{loadErrorMessage(list.error, "customers")}</p>
              <Button onClick={() => void list.refetch()}>Retry</Button>
            </li>
          )}

          {items.map((customer) => {
            const selected = selectedId === customer.id;
            return (
              <li key={customer.id}>
                <button type="button" aria-current={selected ? "true" : undefined} onClick={() => onSelectCustomer(customer)} className={cx(rowBase, rowState(selected), focusRing)}>
                  <span aria-hidden className={cx("mt-2 h-2 w-2 shrink-0 rounded-full", customer.active ? "bg-gms-status-active" : "bg-gms-text-placeholder")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-gms-text">
                      {customer.name}
                      <span className="sr-only">{customer.active ? ", active" : ", inactive"}</span>
                    </span>
                    {customer.code ? (
                      <span className="block truncate text-sm text-gms-text-secondary">{customer.code}</span>
                    ) : (
                      <span className="block truncate text-sm text-gms-text-placeholder">No code name</span>
                    )}
                  </span>
                  {!customer.active && <Badge variant="inactive">Inactive</Badge>}
                </button>
              </li>
            );
          })}

          {list.isSuccess && items.length === 0 && (
            <li className="px-3 py-3 text-sm text-gms-text-secondary">{search ? `No customers match "${search}"` : "No customers yet"}</li>
          )}

          {isFetchingNextPage && (
            <li className="flex items-center gap-2 px-3 py-3 text-sm text-gms-text-secondary">
              <LoaderCircle size={16} className="animate-spin" aria-hidden />
              Loading more…
            </li>
          )}

          {list.isError && items.length > 0 && (
            <li role="alert" className="space-y-2 px-3 py-3">
              <p className="text-sm text-gms-text">{loadErrorMessage(list.error, "more customers")}</p>
              <Button onClick={loadMore}>Retry</Button>
            </li>
          )}

          {hasNextPage && !isFetchingNextPage && !isError && (
            <li ref={sentinelRef} className="px-3 py-2">
              <Button onClick={loadMore} className="w-full">
                Load more
              </Button>
            </li>
          )}
        </ul>
      </div>
    </aside>
  );
}
