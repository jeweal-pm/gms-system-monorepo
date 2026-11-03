"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { useDebouncedSearch } from "@/features/partner/hooks";
import { printDateFormatter } from "@/features/partner/components/partner-page-parts";
import {
  isPermissionDenied,
  loadErrorMessage,
  useDocItems,
  useMemoOutstandingAccess,
  useRefreshAll,
  VENDOR_REPORT,
  type MemoOutstandingAccess,
  type OutstandingReport,
} from "../api";
import {
  activeSort,
  clearFilters,
  createViewStore,
  DEFAULT_VIEW,
  formatDate,
  hasFilters,
  isDocOpen,
  listStateToSearch,
  openDocIds,
  parseListState,
  printRows,
  toggleSort,
  visibleRows,
  withFilters,
  type ListState,
  type ReportSpec,
  type SubtaskMode,
  type VendorItem,
  type VendorOption,
  type ViewPrefs,
} from "../model";
import { CustomizeViewPanel } from "./customize-view-panel";
import { Filters, SelectionBar, Toolbar } from "./filter-bar";
import { OutstandingTable, TableSkeleton } from "./outstanding-table";
import { KpiCards, Pager } from "./parts";
import { OutstandingPrintView } from "./print-view";
import { ReportSpecContext } from "./report-context";

const message = "p-10 text-gms-body text-gms-text-secondary";

/** One store per report and browser tab; blocked storage falls back to memory (ui-spec Customize view). */
const viewStores = new Map<string, ReturnType<typeof createViewStore>>();
function viewStoreOf(spec: ReportSpec) {
  const key = `gms.${spec.key}.view.v1`;
  let store = viewStores.get(key);
  if (!store) {
    store = createViewStore(() => (typeof window === "undefined" ? undefined : window.localStorage), key);
    viewStores.set(key, store);
  }
  return store;
}
const serverView = () => DEFAULT_VIEW;

/** `/memo/memo-outstanding/vendor`: needs memo-outstanding-vendor VIEW (the server checks every call). */
export function MemoOutstandingVendorPage() {
  return <MemoOutstandingPage report={VENDOR_REPORT} />;
}

/** A memo outstanding report page (From Vendor / From Customer): needs its leaf's VIEW (the server checks every call). */
export function MemoOutstandingPage({ report }: { report: OutstandingReport }) {
  const access = useMemoOutstandingAccess(report.spec.menuKey);
  if (!access) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>{report.spec.noAccess}</p>;
  return (
    <ReportSpecContext.Provider value={report.spec}>
      <OutstandingReport access={access} report={report} />
    </ReportSpecContext.Provider>
  );
}

/** Filter summary for the print header. */
export function filterSummary(state: ListState, vendors: readonly VendorOption[] | undefined, party = "Vendor"): string[] {
  const lines: string[] = [];
  if (state.q.trim()) lines.push(`Search: ${state.q.trim()}`);
  if (state.vendorIds.length) lines.push(`${party}: ${state.vendorIds.map((id) => vendors?.find((vendor) => vendor.id === id)?.name ?? id).join(", ")}`);
  if (state.from || state.to) lines.push(`Doc date: ${state.from ? formatDate(state.from) : "…"} – ${state.to ? formatDate(state.to) : "…"}`);
  return lines;
}

function OutstandingReport({ access, report }: { access: MemoOutstandingAccess; report: OutstandingReport }) {
  const { spec } = report;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const state = useMemo(() => parseListState(params, spec), [params, spec]);
  const search = listStateToSearch(state, spec);
  const navigate = (next: ListState) => {
    const query = listStateToSearch(next, spec);
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

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

  const viewStore = viewStoreOf(spec);
  const prefs = useSyncExternalStore(viewStore.subscribe, viewStore.read, serverView);
  const setPrefs = (next: ViewPrefs) => viewStore.write(next);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const customizeRef = useRef<HTMLButtonElement>(null);

  const summary = report.useSummary(state, true);
  const list = report.useList(state, true);
  const options = report.useOptions(true);
  const refreshAll = useRefreshAll(spec);
  const [refreshing, setRefreshing] = useState(false);
  // Refresh also brings the dragged column widths back to the default 30% / 70% (owner note 2026-10-30).
  const [layoutKey, setLayoutKey] = useState(0);
  const rows = useMemo(() => list.data?.items ?? [], [list.data]);

  // Rows flipped from the subtask mode's default; reset when the mode changes.
  const [toggled, setToggled] = useState<{ mode: SubtaskMode; ids: ReadonlySet<string> }>({ mode: prefs.subtasks, ids: new Set() });
  const toggledIds = toggled.mode === prefs.subtasks ? toggled.ids : new Set<string>();

  // Selected items belong to the list they were picked from; another page or filter starts empty.
  const [selection, setSelection] = useState<{ scope: string; items: ReadonlyMap<string, string> }>({ scope: search, items: new Map() });
  const selected = useMemo(() => (selection.scope === search ? selection.items : new Map<string, string>()), [selection, search]);
  const selectedIds = useMemo(() => new Set(selected.keys()), [selected]);
  const [selectedOnlyRaw, setSelectedOnly] = useState(false);
  const selectedOnly = selectedOnlyRaw && selected.size > 0;

  const openIds = openDocIds(rows, prefs.subtasks, toggledIds);
  const neededIds = [...new Set([...openIds, ...selected.values()])];
  const items = useDocItems(neededIds, report);
  const itemsByDoc = useMemo(() => items.data ?? new Map<string, VendorItem[]>(), [items.data]);

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

  const toggleOpen = (id: string) => {
    const next = new Set(toggledIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setToggled({ mode: prefs.subtasks, ids: next });
  };
  const toggleItem = (item: VendorItem) => {
    const next = new Map(selected);
    if (next.has(item.id)) next.delete(item.id);
    else next.set(item.id, item.memoReceiveId);
    setSelection({ scope: search, items: next });
  };
  const clearSelection = () => {
    setSelection({ scope: search, items: new Map() });
    setSelectedOnly(false);
  };
  const refresh = async () => {
    setRefreshing(true);
    setLayoutKey((key) => key + 1);
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

  const denied = isPermissionDenied(list.error) || isPermissionDenied(summary.error);
  if (denied) return <p className={message}>{spec.noAccess}</p>;

  const firstLoad = list.isPending;
  const loadFailed = (list.isError && !list.data) || summary.isError;
  const entries = visibleRows(rows, itemsByDoc, selectedIds, selectedOnly);
  const total = list.data?.total ?? 0;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <h1 className="text-gms-title font-medium text-gms-text-heading print:hidden">{spec.title}</h1>
      <div className="print:hidden">
        <KpiCards summary={summary.data} loading={summary.isPending} />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        {selected.size > 0 ? (
          <SelectionBar count={selected.size} selectedOnly={selectedOnly} onSelectedOnly={setSelectedOnly} canPrint={access.print} onPrint={print} onClear={clearSelection} />
        ) : (
          <Filters
            query={query}
            onQuery={setQuery}
            vendors={{ vendors: options.data?.vendors, loading: options.isPending, selected: state.vendorIds, onChange: (vendorIds) => navigate(withFilters(state, { vendorIds })) }}
            from={state.from}
            to={state.to}
            onFrom={(from) => navigate(withFilters(state, { from }))}
            onTo={(to) => navigate(withFilters(state, { to }))}
          />
        )}
        <Toolbar
          mode={prefs.subtasks}
          onMode={(subtasks) => {
            setToggled({ mode: subtasks, ids: new Set() });
            setPrefs({ ...prefs, subtasks });
          }}
          customizeRef={customizeRef}
          customizeOpen={customizeOpen}
          onCustomize={() => setCustomizeOpen(true)}
          canPrint={access.print}
          printDisabled={rows.length === 0}
          onPrint={print}
          refreshing={refreshing}
          onRefresh={() => void refresh()}
        />
      </div>

      <div className="print:hidden">
        {loadFailed ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-gms-md border border-gms-danger bg-gms-danger-subtle px-4 py-3 text-gms-body">
            <span>{loadErrorMessage(list.error ?? summary.error)}</span>
            <Button onClick={() => void refresh()}>Retry</Button>
          </div>
        ) : firstLoad ? (
          <TableSkeleton />
        ) : total === 0 ? (
          <EmptyState filtered={hasFilters(state)} onClear={resetFilters} emptyText={spec.emptyText} />
        ) : (
          <>
            <OutstandingTable
              key={layoutKey}
              entries={entries}
              prefs={prefs}
              sort={activeSort(state)}
              onSort={(key) => navigate(toggleSort(state, key))}
              isOpen={(id) => isDocOpen(id, prefs.subtasks, toggledIds)}
              onToggleOpen={toggleOpen}
              itemsLoading={items.isFetching}
              itemsError={items.isError}
              onRetryItems={() => void items.refetch()}
              selected={selectedIds}
              onToggleItem={toggleItem}
            />
            <Pager
              page={state.page}
              pageSize={state.pageSize}
              total={total}
              onPage={(page) => navigate({ ...state, page })}
              onPageSize={(pageSize) => navigate({ ...state, pageSize, page: 1 })}
            />
          </>
        )}
      </div>

      <CustomizeViewPanel open={customizeOpen} prefs={prefs} onChange={setPrefs} onClose={() => setCustomizeOpen(false)} returnFocus={customizeRef} />
      {access.print && rows.length > 0 && (
        <OutstandingPrintView
          entries={printRows(rows, itemsByDoc, selectedIds)}
          prefs={prefs}
          filters={filterSummary(state, options.data?.vendors, spec.party)}
          scope={selected.size ? "Selected items" : "Current page"}
          printedAt={printedAt}
        />
      )}
    </div>
  );
}

/** Empty states (ui-spec States). */
export function EmptyState({ filtered, onClear, emptyText = "No memo items outstanding from vendors." }: { filtered: boolean; onClear: () => void; emptyText?: string }) {
  return (
    <div className="rounded-gms-md border border-gms-border bg-gms-surface px-6 py-12 text-center">
      <p className="text-gms-body text-gms-text-secondary">{filtered ? "No documents match these filters." : emptyText}</p>
      {filtered && (
        <Button className="mt-3" onClick={onClear}>Clear filters</Button>
      )}
    </div>
  );
}
