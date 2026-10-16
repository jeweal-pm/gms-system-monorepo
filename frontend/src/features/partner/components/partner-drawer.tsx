"use client";

import { LoaderCircle, Plus, Search, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button, cx, focusRing } from "@/components/ui/button";
import { Badge, CountBadge } from "@/components/ui/card";
import { lowerPlural, lowerSingular, type PartnerEntity } from "../entity";

/** Row data the drawer needs from an entity's list item. */
export type PartnerListItem = { id: string; name: string; code: string | null; active: boolean };

/** The subset of an infinite list query the drawer reads (tRPC or TanStack `useInfiniteQuery`). */
export type PartnerListQuery<TItem extends PartnerListItem> = {
  data?: { pages: readonly { items: readonly TItem[] }[] };
  error: unknown;
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
  refetch: () => Promise<unknown>;
};

/** DOM id of an entity's drawer (the toggle's `aria-controls`). */
export function partnerDrawerId(entity: PartnerEntity): string {
  return `${lowerPlural(entity)}-drawer`;
}

/** Fixed draft row title, e.g. "New customer" (customer FE-CUS-R3-001, vendor FE-VEN-R4-001). */
export function draftRowTitle(entity: PartnerEntity): string {
  return `New ${lowerSingular(entity)}`;
}

type PartnerDrawerProps<TItem extends PartnerListItem> = {
  entity: PartnerEntity;
  open: boolean;
  /** Unfiltered total (header badge). */
  total: number | undefined;
  /** Search text as typed, and its debounced value used for the query. */
  query: string;
  search: string;
  maxSearchLength: number;
  onQueryChange: (query: string) => void;
  list: PartnerListQuery<TItem>;
  /** Short inline copy for a list load failure. */
  loadErrorMessage: (error: unknown, subject: string) => string;
  /**
   * Whether to show the draft row (false when the user has no ADD permission). Customer rev 3 /
   * vendor rev 4: its title stays "New customer" / "New vendor" and never mirrors the typed Code Name or Name.
   */
  draft: boolean;
  draftSelected: boolean;
  selectedId: string | null;
  onSelectDraft: () => void;
  onSelectItem: (item: TItem) => void;
  onClose: () => void;
};

const rowBase = "flex w-full items-start gap-3 rounded-gms-md border px-3 py-3 text-left transition-colors";
const rowState = (selected: boolean) => (selected ? "border-gms-primary bg-gms-primary-subtle" : "border-transparent hover:bg-gms-surface-sunken");

/**
 * Partner C-11 (customer FE-CUS-009, vendor FE-VEN-008): non-modal list drawer. Server search
 * (debounced by the caller), keyset pages of 50 loaded when the end of the list scrolls into view,
 * with a "Load more" button for keyboard users. Pushes content at ≥1280 px, overlays below (Q-CUS-05).
 * The entity feature owns the query and passes it in.
 */
export function PartnerDrawer<TItem extends PartnerListItem>({
  entity,
  open,
  total,
  query,
  search,
  maxSearchLength,
  onQueryChange,
  list,
  loadErrorMessage,
  draft,
  draftSelected,
  selectedId,
  onSelectDraft,
  onSelectItem,
  onClose,
}: PartnerDrawerProps<TItem>) {
  const sentinelRef = useRef<HTMLLIElement>(null);
  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = list;
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const plural = lowerPlural(entity);

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
      id={partnerDrawerId(entity)}
      aria-label={entity.plural}
      hidden={!open}
      className={cx(
        "absolute inset-y-0 right-0 z-30 w-full shrink-0 flex-col border-l border-gms-border-drawer bg-gms-surface shadow-gms-overlay sm:w-80 xl:static xl:z-auto xl:shadow-none print:hidden",
        open ? "flex" : "hidden",
      )}
    >
      <header className="flex h-[58px] shrink-0 items-center justify-between border-b border-gms-border px-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-gms-text">{entity.plural}</h2>
          {total !== undefined && <CountBadge>{total}</CountBadge>}
        </div>
        <button type="button" aria-label={`Close ${plural} panel`} onClick={onClose} className={cx("rounded-gms-sm p-1 text-gms-text hover:bg-gms-surface-sunken", focusRing)}>
          <X size={20} aria-hidden />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-2 pt-3">
        <label className="relative block">
          <span className="sr-only">{`Search ${plural}`}</span>
          <Search size={18} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gms-text" />
          <input
            type="search"
            value={query}
            maxLength={maxSearchLength}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search name or code name..."
            autoComplete="off"
            className="h-10 w-full rounded-gms-md border border-gms-border bg-gms-surface pl-11 pr-3 text-base text-gms-text outline-none placeholder:text-gms-text-placeholder focus:border-gms-primary focus:ring-2 focus:ring-gms-primary/20"
          />
        </label>

        <ul className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pb-4" aria-label={`${entity.singular} list`} aria-busy={list.isPending || isFetchingNextPage || undefined}>
          {draft && (
            <li>
              <button type="button" aria-current={draftSelected ? "true" : undefined} onClick={onSelectDraft} className={cx(rowBase, rowState(draftSelected), focusRing)}>
                <Plus size={18} className="mt-0.5 shrink-0 text-gms-text" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-gms-text">{draftRowTitle(entity)}</span>
                  <span className="block truncate text-[15px] text-gms-text-secondary">Not saved yet</span>
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
              <p className="text-sm text-gms-text">{loadErrorMessage(list.error, plural)}</p>
              <Button onClick={() => void list.refetch()}>Retry</Button>
            </li>
          )}

          {items.map((item) => {
            const selected = selectedId === item.id;
            return (
              <li key={item.id}>
                <button type="button" aria-current={selected ? "true" : undefined} onClick={() => onSelectItem(item)} className={cx(rowBase, rowState(selected), focusRing)}>
                  <span aria-hidden className={cx("mt-2 h-2 w-2 shrink-0 rounded-full", item.active ? "bg-gms-status-active" : "bg-gms-text-placeholder")} />
                  <span className="min-w-0 flex-1">
                    {/* ADR-0021 §4: Code Name (bold) first, Name second. Legacy rows without a code fall back to a placeholder. */}
                    <span className={cx("block truncate font-semibold", item.code ? "text-gms-text" : "text-gms-text-placeholder")}>
                      {item.code || "No code name"}
                      <span className="sr-only">{item.active ? ", active" : ", inactive"}</span>
                    </span>
                    <span className="block truncate text-sm text-gms-text-secondary">{item.name}</span>
                  </span>
                  {!item.active && <Badge variant="inactive">Inactive</Badge>}
                </button>
              </li>
            );
          })}

          {list.isSuccess && items.length === 0 && (
            <li className="px-3 py-3 text-sm text-gms-text-secondary">{search ? `No ${plural} match "${search}"` : `No ${plural} yet`}</li>
          )}

          {isFetchingNextPage && (
            <li className="flex items-center gap-2 px-3 py-3 text-sm text-gms-text-secondary">
              <LoaderCircle size={16} className="animate-spin" aria-hidden />
              Loading more…
            </li>
          )}

          {list.isError && items.length > 0 && (
            <li role="alert" className="space-y-2 px-3 py-3">
              <p className="text-sm text-gms-text">{loadErrorMessage(list.error, `more ${plural}`)}</p>
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
