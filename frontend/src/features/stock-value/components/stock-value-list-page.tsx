"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { DateRange, EmptyCard, ErrorBanner, LocationSelect, SearchBox, TableSkeleton, ToolIcons } from "@/features/stock-card/components/parts";
import { Pager } from "@/features/memo-outstanding-vendor/components/parts";
import { useDebouncedSearch } from "@/features/partner/hooks";
import { printDateFormatter } from "@/features/partner/components/partner-page-parts";
import { isPermissionDenied, loadErrorMessage, useRefreshStockValue, useStockValueAccess, useStockValueCards, useStockValueOptions } from "../api";
import {
  activeListSort,
  asOfNote,
  clearFilters,
  filterSummary,
  hasFilters,
  NO_ACCESS,
  pageToClamp,
  parseListState,
  stateToSearch,
  stockValueHref,
  toggleSort,
  withFilters,
  type ListState,
} from "../model";
import type { ValueRow } from "../types";
import { createViewStore, DEFAULT_VIEW, rememberListSearch, type ViewPrefs } from "../view-prefs";
import { ListPrintContent, StockValuePrintView } from "./print-view";
import { StockValueTable } from "./stock-value-table";
import { StockValueViewPanel } from "./view-panel";

const message = "p-10 text-gms-body text-gms-text-secondary";
const SEARCH_TEXT = "Search stone code, lot or vendor";

/** One store per browser tab; blocked storage falls back to memory. */
let viewStore: ReturnType<typeof createViewStore> | undefined;
const store = () => (viewStore ??= createViewStore(() => (typeof window === "undefined" ? undefined : window.localStorage)));
const serverView = () => DEFAULT_VIEW;

/** `/report/stock-movement/stock-value`: needs stock-value VIEW (the server checks every call). */
export function StockValueListPage() {
  const access = useStockValueAccess();
  if (!access) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>{NO_ACCESS}</p>;
  return <StockValueList canPrint={access.print} />;
}

function StockValueList({ canPrint }: { canPrint: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const state = useMemo(() => parseListState(params), [params]);
  const search = stateToSearch(state);
  const navigate = (next: ListState) => {
    const query = stateToSearch(next);
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  // "‹ Stock Value" on a detail page returns to these filters.
  useEffect(() => {
    rememberListSearch(search, window.sessionStorage);
  }, [search]);

  // Search waits 300 ms after typing; the URL keeps the applied text.
  const [query, setQuery] = useState(state.q);
  const debounced = useDebouncedSearch(query);
  const latest = useRef({ state, navigate });
  useEffect(() => {
    latest.current = { state, navigate };
  });
  useEffect(() => {
    const current = latest.current;
    if (debounced !== current.state.q.trim()) current.navigate(withFilters(current.state, { q: debounced }));
  }, [debounced]);

  const prefs = useSyncExternalStore(store().subscribe, store().read, serverView);
  const setPrefs = (next: ViewPrefs) => store().write(next);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const customizeRef = useRef<HTMLButtonElement>(null);

  const cards = useStockValueCards(state, true);
  const options = useStockValueOptions(true);
  const refreshAll = useRefreshStockValue();
  const [refreshing, setRefreshing] = useState(false);
  const rows = useMemo(() => cards.data?.items ?? [], [cards.data]);
  const total = cards.data?.total ?? 0;

  // A filter can leave fewer pages than the URL asks for: back to page 1 (URL replaced).
  const clamp = cards.data ? pageToClamp(state.page, cards.data.total, state.pageSize) : null;
  useEffect(() => {
    if (clamp !== null) latest.current.navigate({ ...latest.current.state, page: clamp });
  }, [clamp]);

  // Ticked rows belong to the list they were ticked on; another page or filter starts empty.
  const [selection, setSelection] = useState<{ scope: string; rows: ReadonlyMap<string, ValueRow> }>({ scope: search, rows: new Map() });
  const selected = useMemo(() => (selection.scope === search ? selection.rows : new Map<string, ValueRow>()), [selection, search]);
  const selectedKeys = useMemo(() => new Set(selected.keys()), [selected]);
  const toggle = (row: ValueRow) => {
    const next = new Map(selected);
    if (next.has(row.cardKey)) next.delete(row.cardKey);
    else next.set(row.cardKey, row);
    setSelection({ scope: search, rows: next });
  };

  const [printedAt, setPrintedAt] = useState("");
  useEffect(() => {
    const handler = () => flushSync(() => setPrintedAt(printDateFormatter.format(new Date())));
    window.addEventListener("beforeprint", handler);
    return () => window.removeEventListener("beforeprint", handler);
  }, []);
  const print = () => {
    flushSync(() => setPrintedAt(printDateFormatter.format(new Date())));
    window.print();
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await refreshAll();
    } finally {
      setRefreshing(false);
    }
  };
  const resetFilters = () => {
    setQuery("");
    navigate(clearFilters(state));
  };

  if (isPermissionDenied(cards.error)) return <p className={message}>{NO_ACCESS}</p>;

  const loadFailed = cards.isError && !cards.data;
  const printRows = selected.size > 0 ? rows.filter((row) => selectedKeys.has(row.cardKey)) : rows;
  const asOf = cards.data?.mode === "RANGE" ? cards.data.asOf : null;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <h1 className="text-gms-title font-medium text-gms-text-heading print:hidden">Stock Value</h1>
      <div className="space-y-4 rounded-gms-lg bg-gms-surface p-4 sm:p-6 print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-start gap-2.5">
            <SearchBox value={query} onChange={setQuery} placeholder={SEARCH_TEXT} label={SEARCH_TEXT} />
            <LocationSelect value={state.location} locations={options.data?.locations} loading={options.isPending} onChange={(location) => navigate(withFilters(state, { location }))} />
            <DateRange from={state.from} to={state.to} onFrom={(from) => navigate(withFilters(state, { from }))} onTo={(to) => navigate(withFilters(state, { to }))} label="Date range" />
          </div>
          <ToolIcons
            customizeRef={customizeRef}
            customizeOpen={customizeOpen}
            onCustomize={() => setCustomizeOpen(true)}
            canPrint={canPrint}
            printDisabled={rows.length === 0}
            printLabel={selected.size > 0 ? "Print selected rows" : "Print current page"}
            onPrint={print}
            refreshing={refreshing}
            onRefresh={() => void refresh()}
          />
        </div>

        {asOf && <p className="text-gms-label text-gms-text-secondary">{asOfNote(asOf)}</p>}

        {loadFailed ? (
          <ErrorBanner message={loadErrorMessage(cards.error)} onRetry={() => void refresh()} />
        ) : cards.isPending ? (
          <TableSkeleton label="Loading stock value" />
        ) : total === 0 ? (
          hasFilters(state) ? <EmptyCard message="No stock matches these filters." onClear={resetFilters} /> : <EmptyCard message="No stock to show." />
        ) : (
          <>
            <StockValueTable
              rows={rows}
              totals={cards.data!.totals}
              page={state.page}
              pageSize={state.pageSize}
              prefs={prefs}
              sort={activeListSort(state)}
              onSort={(key) => navigate(toggleSort(state, activeListSort(state), key))}
              selected={selectedKeys}
              onToggle={toggle}
              onOpen={(cardKey) => router.push(stockValueHref(cardKey))}
            />
            <Pager page={state.page} pageSize={state.pageSize} total={total} onPage={(page) => navigate({ ...state, page })} onPageSize={(pageSize) => navigate({ ...state, pageSize, page: 1 })} />
          </>
        )}
      </div>

      <StockValueViewPanel open={customizeOpen} prefs={prefs} onChange={setPrefs} onClose={() => setCustomizeOpen(false)} returnFocus={customizeRef} />
      {canPrint && cards.data && rows.length > 0 && (
        <StockValuePrintView>
          <ListPrintContent
            rows={printRows}
            totals={cards.data.totals}
            prefs={prefs}
            scope={selected.size > 0 ? "Selected rows" : "Current page"}
            asOf={asOf}
            filters={filterSummary(state)}
            printedAt={printedAt}
          />
        </StockValuePrintView>
      )}
    </div>
  );
}
