"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "@/features/quotation/components/ui";
import {
  PickerDialog,
  PickerFooter,
  PickerFrame,
  PickerLoadMore,
  PickerMessage,
  PickerTh,
  PickerToolbar,
  pickerCheckbox,
  pickerCheckCell,
  pickerHead,
  pickerIndexCell,
  pickerMarkedCell,
  pickerRowClass,
  type PickerHeaderCell,
} from "./picker-ui";

/**
 * Stock picker shell (purchase UI rev 2, R2-MS / R2-PO, FE-PU-008; moved from `purchase/components/purchase-picker.tsx`
 * by sale FE-SL-001 so other documents reuse it without importing a Purchase file). Purchase's "Add Memo Stock" and
 * "Add Purchase Order" dialogs share it, and Sale's "Add From Reserve" builds on it (FE-SL-004). It holds the toolbar (segmented tabs with counts, search with a 250 ms debounce, Start → Due), the
 * one-row header, collapsible groups with a running #, select all over the expanded groups, checked rows kept across
 * filters, Load more, per-tab loading / error / empty texts, the footer with "N selected" and OK, Escape, backdrop,
 * focus trap and focus return. The thin pickers give it the data hook, groups, columns and cells.
 * `MemoStockModal` (Memo Return, Memo Out) is a separate component (Q-PU-23). Rev 3 (owner 2026-11-04): a picker may
 * pass no tabs (no tab bar) and `flat` (no group header rows); Add Purchase Order uses both.
 */

export type PickerFilter<S extends string> = { status: S; q: string; from: string; to: string };
export type PickerTab<S extends string> = { id: S; label: string; count: number | undefined };
export type PickerGroup<R> = { id: string; label: string; count: number; tone: "sold" | "neutral"; rows: R[] };
/** One header cell (design 136: no vertical dividers; groups are shown by tint, not by lines). */
export type PickerColumn = Omit<PickerHeaderCell, "rowSpan">;
/** What a picker's data hook returns: the loaded rows (all pages) and the server's counts for the current filters. */
export type PickerData<R> = {
  rows: R[];
  isPending: boolean;
  isError: boolean;
  error: unknown;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
};

/** The thin picker's fixed settings and row rendering. */
export type StockPickerProps<R, S extends string> = {
  title: string;
  /** The tabs with the server's counts for the current search and dates; none → no tab bar (Add Purchase Order, rev 3). */
  tabs: PickerTab<S>[];
  /** Flat list: the groups' header rows are not shown (Add Purchase Order looks like the From Stock picker, rev 3). */
  flat?: boolean;
  searchPlaceholder: string;
  searchLabel: string;
  dateLabels: { from: string; to: string };
  columns: PickerColumn[];
  /** The loaded rows (already without the excluded ones) → groups in display order. */
  groups: (rows: R[]) => PickerGroup<R>[];
  rowKey: (row: R) => string;
  rowLabel: (row: R) => string;
  /** Sold rows get the 3 px red left marker (DV-10). */
  rowMarked?: (row: R) => boolean;
  /** The cells after the checkbox and # (one per column). */
  cells: (row: R) => ReactNode;
  emptyText: (tab: S, filtered: boolean) => string;
  loadError: (error: unknown) => string;
  /** Rows already on the document are left out. */
  excluded: ReadonlySet<string>;
  onCancel: () => void;
  onConfirm: (rows: R[]) => void;
};

// ---- pure helpers (UT-PU-07) ----

/** Groups without rows are hidden; every other group keeps its place. */
export const shownGroups = <R,>(groups: readonly PickerGroup<R>[]) => groups.filter((group) => group.rows.length > 0);

/** The running # of each group's first row: numbers run across all groups, collapsed ones included (source 04). */
export function groupStarts<R>(groups: readonly PickerGroup<R>[]): number[] {
  let next = 1;
  return groups.map((group) => {
    const start = next;
    next += group.rows.length;
    return start;
  });
}

/** The rows "select all" covers: every loaded row of the expanded groups. */
export const expandedRows = <R,>(groups: readonly PickerGroup<R>[], collapsed: ReadonlySet<string>) =>
  groups.filter((group) => !collapsed.has(group.id)).flatMap((group) => group.rows);

/** Header checkbox state over the expanded rows. */
export function selectAllState<R>(rows: readonly R[], checked: ReadonlyMap<string, R>, key: (row: R) => string) {
  return { disabled: rows.length === 0, checked: rows.length > 0 && rows.every((row) => checked.has(key(row))) };
}

/** Select all on → check every expanded row; off → uncheck them. Rows checked under other filters stay checked. */
export function toggleAll<R>(rows: readonly R[], checked: ReadonlyMap<string, R>, key: (row: R) => string): Map<string, R> {
  const next = new Map(checked);
  const all = selectAllState(rows, checked, key).checked;
  for (const row of rows) {
    if (all) next.delete(key(row));
    else next.set(key(row), row);
  }
  return next;
}

export function toggleRow<R>(checked: ReadonlyMap<string, R>, key: string, row: R): Map<string, R> {
  const next = new Map(checked);
  if (next.has(key)) next.delete(key);
  else next.set(key, row);
  return next;
}

export function toggleGroup(collapsed: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(collapsed);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Arrow keys on the tabs (`role="tablist"`): Left / Right wrap, Home / End jump. Null for any other key. */
export function tabAfterKey(count: number, current: number, key: string): number | null {
  if (key === "ArrowRight") return (current + 1) % count;
  if (key === "ArrowLeft") return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/** Focus trap: the element Tab / Shift+Tab moves to when it would leave the dialog, else null (the browser moves it). */
export function trapTarget(count: number, current: number, shift: boolean): number | null {
  if (count === 0) return null;
  if (shift && current <= 0) return count - 1;
  if (!shift && (current === count - 1 || current < 0)) return 0;
  return null;
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

// ---- view ----

export type PickerViewState<R, S extends string> = {
  tab: S;
  search: string;
  from: string;
  to: string;
  collapsed: ReadonlySet<string>;
  checked: ReadonlyMap<string, R>;
  data: PickerData<R>;
  filtered: boolean;
};

export type PickerViewHandlers<S extends string> = {
  onTab: (tab: S) => void;
  onSearch: (text: string) => void;
  onFrom: (date: string) => void;
  onTo: (date: string) => void;
  onToggleGroup: (id: string) => void;
  onToggleRow: (key: string) => void;
  onToggleAll: () => void;
  onOk: () => void;
};

/** The dialog as a function of its state (static-render tests use it directly). */
export function StockPickerView<R, S extends string>({ props, state, on }: { props: StockPickerProps<R, S>; state: PickerViewState<R, S>; on: PickerViewHandlers<S> }) {
  const titleId = useId();
  const groupId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const tabs = props.tabs;
  const rows = state.data.rows.filter((row) => !props.excluded.has(props.rowKey(row)));
  const groups = shownGroups(props.groups(rows));
  const starts = groupStarts(groups);
  const visible = expandedRows(groups, state.collapsed);
  const all = selectAllState(visible, state.checked, props.rowKey);
  const span = props.columns.length + 2;
  const message = (text: string, error = false) => (
    <tbody>
      <PickerMessage span={span} error={error}>
        {text}
      </PickerMessage>
    </tbody>
  );

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = tabAfterKey(tabs.length, index, event.key);
    if (next === null) return;
    event.preventDefault();
    on.onTab(tabs[next]!.id);
    dialog.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  const onDialogKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab" || !dialog.current) return;
    const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    const target = trapTarget(focusable.length, focusable.indexOf(document.activeElement as HTMLElement), event.shiftKey);
    if (target === null) return;
    event.preventDefault();
    focusable[target]?.focus();
  };

  return (
    <PickerDialog titleId={titleId} title={props.title} onClose={props.onCancel} dialogRef={dialog} onKeyDown={onDialogKey}>
      <PickerToolbar
        lead={
          tabs.length > 0 && (
            <div role="tablist" aria-label={`${props.title} filter`} className="inline-flex h-9 items-center rounded-gms-md bg-gms-page p-0.5 text-[13px]">
              {tabs.map((tab, index) => {
                const selected = tab.id === state.tab;
                const count = tab.count === undefined ? "" : String(tab.count);
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-label={count ? `${tab.label}, ${count}` : tab.label}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => on.onTab(tab.id)}
                    onKeyDown={(event) => onTabKey(event, index)}
                    className={cx("flex h-8 items-center gap-1.5 rounded-md px-3", selected ? "border border-gms-border bg-white text-[#1C252E]" : "text-gms-text-muted")}
                  >
                    {tab.label}
                    {count && <span className="text-gms-text-muted">{count}</span>}
                  </button>
                );
              })}
            </div>
          )
        }
        search={{ value: state.search, onChange: on.onSearch, placeholder: props.searchPlaceholder, label: props.searchLabel }}
        dates={{ from: state.from, to: state.to, onFrom: on.onFrom, onTo: on.onTo, fromLabel: props.dateLabels.from, toLabel: props.dateLabels.to }}
      />
      <PickerFrame footer={<PickerFooter count={state.checked.size} onCancel={props.onCancel} onOk={on.onOk} />}>
        <thead className={pickerHead}>
          <tr className="h-14">
            <th scope="col" className="w-14 px-4">
              <input type="checkbox" aria-label="Select all" className={pickerCheckbox} checked={all.checked} disabled={all.disabled} onChange={on.onToggleAll} />
            </th>
            <th scope="col" className="w-8 text-sm font-medium">#</th>
            {props.columns.map((column) => (
              <PickerTh key={column.title} {...column} />
            ))}
          </tr>
        </thead>
        {state.data.isPending && message("Loading…")}
        {state.data.isError && message(props.loadError(state.data.error), true)}
        {!state.data.isPending && !state.data.isError && groups.length === 0 && message(props.emptyText(state.tab, state.filtered))}
        {groups.map((group, groupIndex) => {
          const open = !state.collapsed.has(group.id);
          const rowsId = `${groupId}-${group.id}`;
          return [
            props.flat ? null : (
              <tbody key={`${group.id}-head`}>
                <tr className={cx("h-10 border-b border-gms-border", group.tone === "sold" ? "bg-gms-group-red-sub" : "bg-gms-group-band")}>
                  <td colSpan={span} className="p-0">
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={rowsId}
                      onClick={() => on.onToggleGroup(group.id)}
                      className="flex h-10 w-full items-center gap-2 px-4 text-left text-sm font-medium text-[#1C252E]"
                    >
                      {open ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
                      <span>{group.label}</span>
                      <span>{group.count}</span>
                    </button>
                  </td>
                </tr>
              </tbody>
            ),
            <tbody key={`${group.id}-rows`} id={rowsId} hidden={!open}>
              {open &&
                group.rows.map((row, index) => {
                  const key = props.rowKey(row);
                  const ticked = state.checked.has(key);
                  return (
                    <tr key={key} onClick={() => on.onToggleRow(key)} className={pickerRowClass(ticked)}>
                      <td className={cx(pickerCheckCell, props.rowMarked?.(row) && pickerMarkedCell)}>
                        <input
                          type="checkbox"
                          aria-label={props.rowLabel(row)}
                          className={pickerCheckbox}
                          checked={ticked}
                          onChange={() => on.onToggleRow(key)}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </td>
                      <td className={pickerIndexCell}>{starts[groupIndex]! + index}</td>
                      {props.cells(row)}
                    </tr>
                  );
                })}
            </tbody>,
          ];
        })}
        {state.data.hasNextPage && (
          <tbody>
            <PickerLoadMore span={span} loading={state.data.isFetchingNextPage} onMore={() => state.data.fetchNextPage()} />
          </tbody>
        )}
      </PickerFrame>
    </PickerDialog>
  );
}

/** Tab, search (debounced 250 ms) and Start → Due of one picker; the thin picker reads its data with `filter`. */
export function usePickerFilters<S extends string>(defaultTab: S) {
  const [tab, setTab] = useState<S>(defaultTab);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQ(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const filter: PickerFilter<S> = { status: tab, q: q.trim(), from, to };
  return { filter, tab, search, from, to, setTab, setSearch, setFrom, setTo };
}
export type PickerFilters<S extends string> = ReturnType<typeof usePickerFilters<S>>;

/** The stateful dialog: checked rows (kept across filters), collapsed groups, Escape and focus return. */
export function StockPicker<R, S extends string>({ filters, data, ...props }: StockPickerProps<R, S> & { filters: PickerFilters<S>; data: PickerData<R> }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState<Map<string, R>>(new Map());
  // Focus returns to the button that opened the dialog (R2-MS "Close"); read on the first render, before autoFocus.
  const [opener] = useState(() => (typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)));
  const restoreFocus = () => setTimeout(() => opener?.focus?.(), 0);
  const close = () => {
    props.onCancel();
    restoreFocus();
  };
  const closeOnEscape = useRef(close);
  useEffect(() => {
    closeOnEscape.current = close;
  });
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => event.key === "Escape" && closeOnEscape.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const groups = shownGroups(props.groups(data.rows.filter((row) => !props.excluded.has(props.rowKey(row)))));
  const { filter } = filters;
  const state: PickerViewState<R, S> = {
    tab: filters.tab, search: filters.search, from: filters.from, to: filters.to, collapsed, checked, data, filtered: Boolean(filter.q || filter.from || filter.to),
  };
  return (
    <StockPickerView
      props={{ ...props, onCancel: close }}
      state={state}
      on={{
        onTab: filters.setTab,
        onSearch: filters.setSearch,
        onFrom: filters.setFrom,
        onTo: filters.setTo,
        onToggleGroup: (id) => setCollapsed((prev) => toggleGroup(prev, id)),
        onToggleRow: (key) => {
          const row = data.rows.find((item) => props.rowKey(item) === key);
          setChecked((prev) => (row === undefined && !prev.has(key) ? prev : toggleRow(prev, key, row ?? prev.get(key)!)));
        },
        onToggleAll: () => setChecked((prev) => toggleAll(expandedRows(groups, collapsed), prev, props.rowKey)),
        onOk: () => {
          props.onConfirm([...checked.values()]);
          restoreFocus();
        },
      }}
    />
  );
}
