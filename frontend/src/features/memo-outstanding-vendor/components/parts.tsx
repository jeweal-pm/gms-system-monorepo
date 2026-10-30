"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, type KeyboardEvent, type RefObject } from "react";
import { cx, focusRing } from "@/components/ui/button";
import { dueLabel, formatMoney, pageNumbers, PAGE_SIZES, showingText, totalPages, type PageSize, type VendorSummary } from "../model";

/** Keeps Tab inside `container` (popover / panel focus trap, ui-spec Accessibility). */
export function trapTab(event: KeyboardEvent, container: HTMLElement | null) {
  if (event.key !== "Tab" || !container) return;
  const focusables = Array.from(container.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled])"));
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/** Closes an open popover on an outside press or Escape; focus goes back to its trigger. */
export function useDismiss(open: boolean, box: RefObject<HTMLElement | null>, trigger: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onClose();
      trigger.current?.focus();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, box, trigger, onClose]);
}

const toneClass = { overdue: "text-gms-danger", soon: "text-gms-warning-text", later: "text-gms-text-secondary" } as const;

export function DueLabel({ dueInDays }: { dueInDays: number }) {
  const { text, tone } = dueLabel(dueInDays);
  return <span className={cx("text-gms-label", toneClass[tone])}>{text}</span>;
}

function Kpi({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-gms-md border border-gms-border bg-gms-surface px-3 py-2.5">
      <p className="text-gms-label text-gms-text-secondary">{label}</p>
      <p className="mt-1 flex items-baseline gap-1.5">{children}</p>
    </div>
  );
}

const big = "text-gms-title font-semibold";
const unit = "text-gms-label text-gms-text-secondary";

/** Four KPI cards following the current filters (ui-spec Layout); skeletons while loading. */
export function KpiCards({ summary, loading }: { summary: VendorSummary | undefined; loading: boolean }) {
  if (loading || !summary) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy="true" aria-label="Loading totals">
        {[0, 1, 2, 3].map((index) => <div key={index} className="h-[66px] animate-pulse rounded-gms-md bg-gms-surface-sunken" />)}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi label="Documents"><span className={cx(big, "text-gms-text-heading")}>{summary.documents}</span><span className={unit}>doc.</span></Kpi>
      <Kpi label="Overdue"><span className={cx(big, "text-gms-danger")}>{summary.overdue}</span><span className={unit}>doc.</span></Kpi>
      <Kpi label="Due in 7 days"><span className={cx(big, "text-gms-warning-text")}>{summary.dueIn7Days}</span><span className={unit}>doc.</span></Kpi>
      <Kpi label={`Grand total (${summary.companyCurrency})`}><span className={cx(big, "text-gms-text-heading")}>{formatMoney(summary.grandTotal)}</span></Kpi>
    </div>
  );
}

type PagerProps = { page: number; pageSize: PageSize; total: number; onPage: (page: number) => void; onPageSize: (size: PageSize) => void };

/** Footer: "Showing a–b out of n items", page size 10 / 25 / 50, numbered pager with ‹ ›. */
export function Pager({ page, pageSize, total, onPage, onPageSize }: PagerProps) {
  const pages = totalPages(total, pageSize);
  const step = "inline-flex h-8 min-w-8 items-center justify-center rounded-gms-md border border-gms-border px-2 text-gms-body disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <nav aria-label="Pagination" className="mt-3 flex flex-wrap items-center justify-between gap-3 print:hidden">
      <p className="text-gms-label text-gms-text-secondary">{showingText(page, pageSize, total)}</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="mov-page-size">Rows per page</label>
        <select
          id="mov-page-size"
          value={pageSize}
          onChange={(event) => onPageSize(Number(event.target.value) as PageSize)}
          className={cx("h-8 rounded-gms-md border border-gms-border bg-gms-surface px-2 text-gms-body", focusRing)}
        >
          {PAGE_SIZES.map((size) => <option key={size} value={size}>{`${size} / page`}</option>)}
        </select>
        <button type="button" aria-label="Previous page" className={cx(step, focusRing)} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft size={16} aria-hidden />
        </button>
        {pageNumbers(page, pages).map((entry, index) =>
          entry === "…" ? (
            <span key={`gap-${index}`} className="px-1 text-gms-text-secondary" aria-hidden>…</span>
          ) : (
            <button
              key={entry}
              type="button"
              aria-label={`Page ${entry}`}
              aria-current={entry === page ? "page" : undefined}
              className={cx(step, focusRing, entry === page ? "border-gms-text bg-gms-text text-gms-on-primary" : "bg-gms-surface")}
              onClick={() => onPage(entry)}
            >
              {entry}
            </button>
          ),
        )}
        <button type="button" aria-label="Next page" className={cx(step, focusRing)} disabled={page >= pages} onClick={() => onPage(page + 1)}>
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>
    </nav>
  );
}
