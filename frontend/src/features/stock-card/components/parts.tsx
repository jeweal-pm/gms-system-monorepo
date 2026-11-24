"use client";

import { ArrowRight, Columns3, RotateCw, Search } from "lucide-react";
import { type ReactNode, type RefObject } from "react";
import { Button, cx, focusRing, IconButton } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { SortIcon } from "@/components/ui/sort-icon";
import { pickerGroupTone, type PickerGroupTone } from "@/features/trade-document/picker-ui";
import { PrintExcel } from "@/features/memo-outstanding-vendor/components/filter-bar";
import { rangeProblem, SEARCH_MAX, type SortDir } from "../model";

const dateBox = "h-9 w-[110px] bg-transparent text-gms-body placeholder:text-gms-text-secondary";

/** Sortable column header: a button with the shared sort glyph; the `th` carries `aria-sort`. */
export function SortTh<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  rowSpan,
  className,
  align = "left",
}: {
  label: string;
  /** Omit for a column the server cannot sort. */
  sortKey?: K;
  sort: { key: K; dir: SortDir };
  onSort: (key: K) => void;
  rowSpan?: number;
  className?: string;
  align?: "left" | "right";
}) {
  const active = sortKey !== undefined && sort.key === sortKey;
  return (
    <th
      scope="col"
      rowSpan={rowSpan}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
      className={cx("px-3 py-2 align-middle text-sm font-medium whitespace-nowrap", align === "right" ? "text-right" : "text-left", className)}
    >
      {sortKey === undefined ? (
        label
      ) : (
        <button type="button" onClick={() => onSort(sortKey)} aria-label={`Sort by ${label}`} className={cx("inline-flex items-center gap-1.5 rounded", align === "right" && "flex-row-reverse", focusRing)}>
          <span>{label}</span>
          <SortIcon direction={active ? sort.dir : undefined} className="shrink-0" />
        </button>
      )}
    </th>
  );
}

/** Sub-header of a column group (18 % tint, h-8): sortable, right-aligned. */
export function GroupSortTh<K extends string>({ label, tone, sortKey, sort, onSort, title }: { label: string; tone: PickerGroupTone; sortKey?: K; sort: { key: K; dir: SortDir }; onSort: (key: K) => void; title?: string }) {
  const active = sortKey !== undefined && sort.key === sortKey;
  return (
    <th scope="col" title={title} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined} className={cx("h-8 px-3 text-right text-sm font-medium", pickerGroupTone[tone].sub)}>
      {sortKey === undefined ? (
        label
      ) : (
        <button type="button" onClick={() => onSort(sortKey)} aria-label={`Sort by ${label}`} className={cx("inline-flex flex-row-reverse items-center gap-1.5 rounded", focusRing)}>
          <span>{label}</span>
          <SortIcon direction={active ? sort.dir : undefined} className="shrink-0" />
        </button>
      )}
    </th>
  );
}

/** Non-sortable header cell with the grey chevrons removed (the `#` and checkbox columns). */
export const PlainTh = ({ children, rowSpan, className }: { children?: ReactNode; rowSpan?: number; className?: string }) => (
  <th scope="col" rowSpan={rowSpan} className={cx("px-3 py-2 align-middle text-sm font-medium", className)}>
    {children}
  </th>
);

/** Search box (300 ms debounce lives in the page). */
export function SearchBox({ value, onChange, placeholder, label }: { value: string; onChange: (text: string) => void; placeholder: string; label: string }) {
  return (
    <label className="flex h-9 w-full items-center gap-2 rounded-gms-md border border-gms-border bg-white px-3 text-sm sm:w-[360px]">
      <Search aria-hidden className="size-4 shrink-0 text-gms-text-heading" />
      <input
        type="search"
        value={value}
        maxLength={SEARCH_MAX}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="w-full bg-transparent outline-none placeholder:text-gms-text-subtle"
      />
    </label>
  );
}

/** "All locations" or one location name (Q-SC-05); a location not in the options (still loading, or gone) stays selectable. */
export function LocationSelect({ value, locations, loading, onChange }: { value: string; locations: readonly string[] | undefined; loading: boolean; onChange: (location: string) => void }) {
  const names = locations ?? [];
  const options = value && !names.includes(value) ? [value, ...names] : names;
  return (
    <select
      aria-label="Location"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cx("h-9 max-w-[200px] rounded-gms-md border border-gms-border bg-white px-3 text-sm", value ? "text-gms-primary" : "text-gms-text", focusRing)}
    >
      <option value="">{loading ? "Loading…" : "All locations"}</option>
      {options.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}

/** Start → Due; Due before Start shows the inline problem and the query is not sent. */
export function DateRange({ from, to, onFrom, onTo, label }: { from: string; to: string; onFrom: (date: string) => void; onTo: (date: string) => void; label: string }) {
  const problem = rangeProblem(from, to);
  return (
    <div>
      <div role="group" aria-label={label} className="flex h-9 items-center gap-2 rounded-gms-md border border-gms-border bg-white px-3 text-sm text-gms-text-heading">
        <DateInput aria-label={`${label} from`} placeholder="Start" value={from} onChange={onFrom} className={dateBox} aria-invalid={problem ? true : undefined} />
        <ArrowRight aria-hidden className="size-4 text-gms-text-muted" />
        <DateInput aria-label={`${label} to`} placeholder="Due" value={to} onChange={onTo} className={dateBox} aria-invalid={problem ? true : undefined} />
      </div>
      {problem && (
        <p role="alert" className="mt-1 text-gms-label text-gms-danger">
          {problem}
        </p>
      )}
    </div>
  );
}

type ToolIconsProps = {
  /** List page only: the Customize view button (shown when `onCustomize` is given). */
  customizeRef?: RefObject<HTMLButtonElement | null>;
  customizeOpen?: boolean;
  onCustomize?: () => void;
  canPrint: boolean;
  printDisabled: boolean;
  printLabel: string;
  onPrint: () => void;
  /** List page only; the detail page has no refresh in the design (S6). */
  refreshing?: boolean;
  onRefresh?: () => void;
};

/** Right-side icons: columns, print (PRINT grant), Excel (unavailable), refresh. */
export function ToolIcons({ customizeRef, customizeOpen, onCustomize, canPrint, printDisabled, printLabel, onPrint, refreshing, onRefresh }: ToolIconsProps) {
  return (
    <div className="flex items-center gap-1">
      {onCustomize && (
        <IconButton ref={customizeRef} label="Customize view" aria-haspopup="dialog" aria-expanded={customizeOpen} onClick={onCustomize}>
          <Columns3 size={18} aria-hidden />
        </IconButton>
      )}
      <PrintExcel canPrint={canPrint} printDisabled={printDisabled} onPrint={onPrint} printLabel={printLabel} />
      {onRefresh && (
        <IconButton label="Refresh" onClick={onRefresh} aria-busy={refreshing || undefined}>
          <RotateCw size={18} className={cx(refreshing && "animate-spin")} aria-hidden />
        </IconButton>
      )}
    </div>
  );
}

/** Error banner with Retry (the filters stay). */
export function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-gms-md border border-gms-danger bg-gms-danger-subtle px-4 py-3 text-gms-body">
      <span>{message}</span>
      <Button onClick={onRetry}>Retry</Button>
    </div>
  );
}

/** Empty card; with filters on it offers Clear filters. */
export function EmptyCard({ message, onClear }: { message: string; onClear?: () => void }) {
  return (
    <div className="rounded-gms-md border border-gms-border bg-gms-surface px-6 py-12 text-center">
      <p className="text-gms-body text-gms-text-secondary">{message}</p>
      {onClear && (
        <Button className="mt-3" onClick={onClear}>
          Clear filters
        </Button>
      )}
    </div>
  );
}

/** First-load skeleton: eight rows under the visible header (ui-spec States). */
export function TableSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label={label}>
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="h-14 animate-pulse rounded-gms-md bg-gms-surface-sunken" />
      ))}
    </div>
  );
}
