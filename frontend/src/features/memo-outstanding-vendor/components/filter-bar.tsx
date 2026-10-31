"use client";

import { ArrowRight, Check, ChevronDown, Columns3, FileSpreadsheet, ListTree, Printer, RotateCw, Search, UserRound, X } from "lucide-react";
import { useCallback, useRef, useState, type RefObject } from "react";
import { cx, focusRing, IconButton } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { dateRangeProblem, SEARCH_MAX, VENDOR_FILTER_MAX, type SubtaskMode, type VendorOption } from "../model";
import { trapTab, useDismiss } from "./parts";

export const EXCEL_UNAVAILABLE = "Excel export isn't available yet";

type VendorFilterProps = { vendors: readonly VendorOption[] | undefined; loading: boolean; selected: readonly string[]; onChange: (ids: string[]) => void };

/** Vendor multi-select popover (D 02): checkboxes by name and a "Clear" link. */
export function VendorFilter({ vendors, loading, selected, onChange }: VendorFilterProps) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, box, trigger, close);
  const toggle = (id: string, checked: boolean) => {
    const next = checked ? [...selected, id] : selected.filter((entry) => entry !== id);
    onChange(next.slice(0, VENDOR_FILTER_MAX));
  };
  return (
    <div className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Select a vendor to filter the results."
        onClick={() => setOpen((current) => !current)}
        className={cx("inline-flex h-9 items-center gap-2 rounded-gms-md border bg-gms-surface px-3 text-gms-body", selected.length ? "border-gms-primary text-gms-primary" : "border-gms-border text-gms-text", focusRing)}
      >
        <UserRound size={16} aria-hidden />
        {selected.length ? `Vendor (${selected.length})` : "Vendor"}
        <ChevronDown size={16} aria-hidden />
      </button>
      {open && (
        <div
          ref={box}
          role="dialog"
          aria-label="Filter by vendor"
          onKeyDown={(event) => trapTab(event, box.current)}
          className="absolute top-full left-0 z-40 mt-1 w-[240px] rounded-gms-md border border-gms-border bg-gms-surface py-2 shadow-lg"
        >
          <div className="flex items-center justify-between px-3 pb-1">
            <span className="text-gms-label text-gms-text-secondary">Vendor</span>
            <button type="button" className={cx("rounded px-1 text-gms-label font-medium text-gms-primary disabled:opacity-40", focusRing)} disabled={selected.length === 0} onClick={() => onChange([])}>
              Clear
            </button>
          </div>
          <ul className="max-h-[260px] overflow-y-auto">
            {loading && <li className="px-3 py-2 text-gms-body text-gms-text-secondary">Loading…</li>}
            {!loading && (vendors?.length ?? 0) === 0 && <li className="px-3 py-2 text-gms-body text-gms-text-secondary">No vendors</li>}
            {vendors?.map((vendor) => {
              const checked = selected.includes(vendor.id);
              return (
                <li key={vendor.id}>
                  <label className="flex cursor-pointer items-center justify-between gap-3 px-3 py-1.5 text-gms-body hover:bg-gms-surface-sunken">
                    <span className="min-w-0 truncate" title={vendor.name}>{vendor.name}</span>
                    <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        // The first box takes focus when the popover opens.
                        autoFocus={vendor.id === vendors[0]?.id}
                        onChange={(event) => toggle(vendor.id, event.target.checked)}
                        className={cx("h-4 w-4 appearance-none rounded-gms-sm border", checked ? "border-gms-primary bg-gms-primary" : "border-gms-border bg-gms-surface", focusRing)}
                      />
                      {checked && <Check size={12} strokeWidth={3} className="pointer-events-none absolute text-gms-on-primary" aria-hidden />}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

type FiltersProps = {
  query: string;
  onQuery: (value: string) => void;
  vendors: VendorFilterProps;
  from: string;
  to: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
};

const dateBox = "h-9 w-[140px] rounded-gms-md border border-gms-border bg-gms-surface px-3 text-gms-body placeholder:text-gms-text-secondary";

/** Search "Search Doc No. / Vendor", Vendor popover, Doc Date range Start → Due (Q-MOV-03). */
export function Filters({ query, onQuery, vendors, from, to, onFrom, onTo }: FiltersProps) {
  const problem = dateRangeProblem(from, to);
  return (
    <div className="flex flex-wrap items-start gap-2.5">
      <label className="relative block w-full sm:w-[260px]">
        <span className="sr-only">Search Doc No. / Vendor</span>
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gms-text-secondary" aria-hidden />
        <input
          type="search"
          value={query}
          maxLength={SEARCH_MAX}
          placeholder="Search Doc No. / Vendor"
          onChange={(event) => onQuery(event.target.value)}
          className={cx("h-9 w-full rounded-gms-md border border-gms-border bg-gms-surface pr-3 pl-9 text-gms-body", focusRing)}
        />
      </label>
      <VendorFilter {...vendors} />
      <div>
        <div className="flex items-center gap-1.5" role="group" aria-label="Doc date range">
          <DateInput aria-label="Doc date from" placeholder="Start" value={from} onChange={onFrom} className={dateBox} aria-invalid={problem ? true : undefined} />
          <ArrowRight size={16} className="text-gms-text-secondary" aria-hidden />
          <DateInput aria-label="Doc date to" placeholder="Due" value={to} onChange={onTo} className={dateBox} aria-invalid={problem ? true : undefined} />
        </div>
        {problem && <p role="alert" className="mt-1 text-gms-label text-gms-danger">{problem}</p>}
      </div>
    </div>
  );
}

type SubtasksMenuProps = { mode: SubtaskMode; onMode: (mode: SubtaskMode) => void };

/** Show subtasks (D 03): Collapsed (default) / Expanded, kept per browser. */
export function SubtasksMenu({ mode, onMode }: SubtasksMenuProps) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, box, trigger, close);
  const choose = (next: SubtaskMode) => {
    onMode(next);
    setOpen(false);
    trigger.current?.focus();
  };
  const item = (value: SubtaskMode, label: string, hint?: string) => (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={mode === value}
      autoFocus={mode === value}
      onClick={() => choose(value)}
      className={cx("flex w-full items-center justify-between gap-6 rounded-gms-sm px-3 py-2 text-left text-gms-body", mode === value ? "bg-gms-surface-sunken" : "hover:bg-gms-surface-sunken", focusRing)}
    >
      <span>
        {label} {hint && <span className="text-gms-label text-gms-text-secondary">{hint}</span>}
      </span>
      {mode === value && <Check size={16} className="text-gms-primary" aria-hidden />}
    </button>
  );
  return (
    <div className="relative">
      <IconButton ref={trigger} label="Show subtasks" aria-haspopup="menu" aria-expanded={open} title="Display subtasks under each task." onClick={() => setOpen((current) => !current)}>
        <ListTree size={18} aria-hidden />
      </IconButton>
      {open && (
        <div
          ref={box}
          role="menu"
          aria-label="Show subtasks"
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const items = Array.from(box.current?.querySelectorAll<HTMLElement>("[role=menuitemradio]") ?? []);
              const index = items.indexOf(document.activeElement as HTMLElement);
              items[(index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
            }
            if (event.key === "Tab") close();
          }}
          className="absolute top-full right-0 z-40 mt-1 w-[200px] rounded-gms-md border border-gms-border bg-gms-surface p-1.5 shadow-lg"
        >
          <p className="px-3 py-1 text-gms-label text-gms-text-secondary">Show subtasks</p>
          {item("collapsed", "Collapsed", "(default)")}
          {item("expanded", "Expanded")}
        </div>
      )}
    </div>
  );
}

type ToolbarProps = {
  mode: SubtaskMode;
  onMode: (mode: SubtaskMode) => void;
  customizeRef: RefObject<HTMLButtonElement | null>;
  customizeOpen: boolean;
  onCustomize: () => void;
  canPrint: boolean;
  printDisabled: boolean;
  onPrint: () => void;
  refreshing: boolean;
  onRefresh: () => void;
};

/** Right-side toolbar: Show subtasks, Customize view, Print (PRINT only), Excel (unavailable), Refresh. */
export function Toolbar({ mode, onMode, customizeRef, customizeOpen, onCustomize, canPrint, printDisabled, onPrint, refreshing, onRefresh }: ToolbarProps) {
  return (
    <div className="flex items-center gap-1">
      <SubtasksMenu mode={mode} onMode={onMode} />
      <IconButton ref={customizeRef} label="Customize view" aria-haspopup="dialog" aria-expanded={customizeOpen} onClick={onCustomize}>
        <Columns3 size={18} aria-hidden />
      </IconButton>
      <span className="mx-1 h-5 w-px bg-gms-border" aria-hidden />
      <PrintExcel canPrint={canPrint} printDisabled={printDisabled} onPrint={onPrint} printLabel="Print current page" />
      <IconButton label="Refresh" onClick={onRefresh} aria-busy={refreshing || undefined}>
        <RotateCw size={18} className={cx(refreshing && "animate-spin")} aria-hidden />
      </IconButton>
    </div>
  );
}

/** Print is hidden without PRINT (ui-spec); Excel stays unavailable in revision 1 (Q-MOV-08). */
export function PrintExcel({ canPrint, printDisabled, onPrint, printLabel }: { canPrint: boolean; printDisabled: boolean; onPrint: () => void; printLabel: string }) {
  return (
    <>
      {canPrint && (
        <IconButton label={printLabel} onClick={onPrint} disabled={printDisabled}>
          <Printer size={18} aria-hidden />
        </IconButton>
      )}
      <IconButton label="Export to Excel" unavailableReason={EXCEL_UNAVAILABLE}>
        <FileSpreadsheet size={18} className="text-gms-excel" aria-hidden />
      </IconButton>
    </>
  );
}

type SelectionBarProps = {
  count: number;
  selectedOnly: boolean;
  onSelectedOnly: (value: boolean) => void;
  canPrint: boolean;
  onPrint: () => void;
  onClear: () => void;
};

/** Replaces the filter bar while items are selected (D 04 / D 07). */
export function SelectionBar({ count, selectedOnly, onSelectedOnly, canPrint, onPrint, onClear }: SelectionBarProps) {
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-3" role="region" aria-label="Selected items">
      <span className="text-gms-body font-medium" aria-live="polite">{`${count} selected`}</span>
      <button
        type="button"
        role="switch"
        aria-checked={selectedOnly}
        onClick={() => onSelectedOnly(!selectedOnly)}
        title="Show selected rows only."
        className={cx("inline-flex items-center gap-2 rounded-gms-md px-1 text-gms-body", focusRing)}
      >
        <span className={cx("relative inline-flex h-5 w-8 items-center rounded-full transition-colors", selectedOnly ? "bg-gms-primary" : "bg-gms-text-placeholder")}>
          <span className={cx("inline-block h-4 w-4 rounded-full bg-gms-surface transition-transform", selectedOnly ? "translate-x-[14px]" : "translate-x-[2px]")} />
        </span>
        Show selected rows only
      </button>
      <PrintExcel canPrint={canPrint} printDisabled={false} onPrint={onPrint} printLabel="Print selected items" />
      <button type="button" onClick={onClear} className={cx("inline-flex h-9 items-center gap-1.5 rounded-gms-md px-2 text-gms-body hover:bg-gms-surface-sunken", focusRing)}>
        <X size={16} aria-hidden />
        Clear
      </button>
    </div>
  );
}
