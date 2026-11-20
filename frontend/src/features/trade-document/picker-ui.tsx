"use client";

import { ArrowRight, ChevronsUpDown, MessageSquare, Search, X } from "lucide-react";
import type { KeyboardEvent, ReactNode, Ref } from "react";
import { DateInput } from "@/components/ui/date-input";
import { Button, cx, IconButton } from "@/features/quotation/components/ui";

/**
 * Shared look of every item-picker dialog (owner 2026-11-20, designs 135–148 on the table design system 136): the
 * 1632 × 1000 dialog with its title and ✕, the toolbar (search, Start → Due), the bordered table area that fills the
 * dialog, the grey two-line header with sort glyphs, 56 px top-aligned rows with Default / Hover / Checked states,
 * column-group tints, the lot chip, the note line and the Cancel / OK footer. Pure presentation: each picker keeps its
 * own data, filters and selection.
 */

// ---- classes ----

/** Cell padding: 8 px top / bottom, so a 2-line cell is 56 px and a 3-line cell about 77 px (design 136 §4). */
export const pickerCell = "px-3 py-2 align-top";
export const pickerSub = "mt-1 text-xs leading-4 text-gms-text-secondary";
export const pickerCheckCell = "w-14 px-4 py-[18px] align-top leading-none";
export const pickerIndexCell = "w-8 py-2 align-top text-gms-text-muted";
export const pickerCheckbox = "size-5 accent-gms-primary-strong";

/** Row states (design 136 §1): white, hover #F6FAFA, ticked #E5F3F2. */
export function pickerRowClass(checked: boolean) {
  return cx("cursor-pointer border-b border-gms-border", checked ? "bg-gms-row-active" : "bg-white hover:bg-gms-row-hover");
}

/** Sold rows: 3 px red left accent (DV-10). */
export const pickerMarkedCell = "shadow-[inset_3px_0_0_#DF1016]";

export type PickerGroupTone = "orange" | "green" | "red";
/** Column-group tints (design 136 §2): group header 30 %, sub-header 18 %, cells 8 %. */
export const pickerGroupTone: Record<PickerGroupTone, { head: string; sub: string; cell: string }> = {
  orange: { head: "bg-gms-group-orange-head", sub: "bg-gms-group-orange-sub", cell: "bg-gms-group-orange-cell" },
  green: { head: "bg-gms-group-green-head", sub: "bg-gms-group-green-sub", cell: "bg-gms-group-green-cell" },
  red: { head: "bg-gms-group-red-head", sub: "bg-gms-group-red-sub", cell: "bg-gms-group-red-cell" },
};

// ---- dialog ----

export function PickerDialog({
  titleId,
  title,
  onClose,
  onBackdrop = onClose,
  dialogRef,
  onKeyDown,
  children,
}: {
  titleId: string;
  title: string;
  onClose: () => void;
  /** Backdrop click; undefined leaves the dialog open (e.g. while a nested dialog owns the screen). */
  onBackdrop?: (() => void) | undefined;
  dialogRef?: Ref<HTMLDivElement>;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  children?: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-gms-scrim" onClick={onBackdrop}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className="flex h-[min(1000px,calc(100vh_-_48px))] w-[min(1632px,calc(100vw_-_48px))] flex-col rounded-gms-lg bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex h-[63px] shrink-0 items-center justify-between border-b border-gms-border px-5">
          <h2 id={titleId} className="text-lg font-medium text-[#1C252E]">
            {title}
          </h2>
          <IconButton label="Close" onClick={onClose}>
            <X className="size-5" />
          </IconButton>
        </header>
        <div className="flex min-h-0 flex-1 flex-col px-6 pt-6 pb-6 lg:px-14">{children}</div>
      </div>
    </div>
  );
}

/** Toolbar: optional leading controls (tabs), then search and Start → Due on the right (design: top right). */
export function PickerToolbar({
  lead,
  search,
  dates,
}: {
  lead?: ReactNode;
  search: { value: string; onChange: (text: string) => void; placeholder: string; label: string; maxLength?: number };
  dates: { from: string; to: string; onFrom: (date: string) => void; onTo: (date: string) => void; fromLabel: string; toLabel: string };
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      {lead}
      <label className="ml-auto flex h-9 w-full max-w-[360px] items-center gap-2 rounded-gms-md border border-gms-border bg-white px-3 text-sm">
        <Search aria-hidden className="size-4 shrink-0 text-[#1C252E]" />
        <input
          autoFocus
          value={search.value}
          maxLength={search.maxLength}
          onChange={(event) => search.onChange(event.target.value)}
          placeholder={search.placeholder}
          aria-label={search.label}
          className="w-full bg-transparent outline-none placeholder:text-gms-text-subtle"
        />
      </label>
      <div className="flex h-9 items-center gap-2 rounded-gms-md border border-gms-border bg-white px-3 text-sm text-[#1C252E]">
        <DateInput aria-label={dates.fromLabel} placeholder="Start" value={dates.from} onChange={dates.onFrom} className="w-[110px] bg-transparent outline-none" />
        <ArrowRight aria-hidden className="size-4 text-gms-text-muted" />
        <DateInput aria-label={dates.toLabel} placeholder="Due" value={dates.to} onChange={dates.onTo} className="w-[110px] bg-transparent outline-none" />
      </div>
    </div>
  );
}

/** The bordered table area that fills the dialog, scrolling under a sticky header, with the footer at its bottom. */
export function PickerFrame({ children, footer, minWidth = "min-w-[1200px]" }: { children: ReactNode; footer: ReactNode; minWidth?: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-gms-md border border-gms-border">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className={cx("w-full border-collapse text-sm text-[#1C252E]", minWidth)}>{children}</table>
      </div>
      {footer}
    </div>
  );
}

/** The grey sticky header (#E9EDED). */
export const pickerHead = "sticky top-0 z-10 bg-gms-table-head text-left";

/** Cancel / OK (OK disabled until something is ticked); "N selected" on the left for screen readers and sighted users. */
export function PickerFooter({ count, onCancel, onOk }: { count: number; onCancel: () => void; onOk: () => void }) {
  return (
    <footer className="flex h-[60px] shrink-0 items-center justify-end gap-2 border-t border-gms-border px-6">
      <span aria-live="polite" className="mr-auto text-sm font-medium text-[#1C252E]">
        {count > 0 ? `${count} selected` : ""}
      </span>
      <Button className="min-w-24" onClick={onCancel}>
        Cancel
      </Button>
      <Button
        variant={count > 0 ? "primary" : "ghost"}
        className="min-w-24 disabled:bg-gms-surface-sunken disabled:text-gms-text-placeholder"
        disabled={count === 0}
        onClick={onOk}
      >
        OK
      </Button>
    </footer>
  );
}

/** Loading / error / empty text across the table. */
export function PickerMessage({ span, children, error = false }: { span: number; children: ReactNode; error?: boolean }) {
  return (
    <tr>
      <td colSpan={span} className={cx("py-16 text-center", error ? "text-[#E5484D]" : "text-gms-text-muted")}>
        {children}
      </td>
    </tr>
  );
}

export function PickerLoadMore({ span, loading, onMore }: { span: number; loading: boolean; onMore: () => void }) {
  return (
    <tr>
      <td colSpan={span} className="py-4 text-center">
        <Button size="sm" disabled={loading} onClick={onMore}>
          {loading ? "Loading…" : "Load more"}
        </Button>
      </td>
    </tr>
  );
}

// ---- header ----

export type PickerHeaderCell = {
  title: string;
  sub?: string;
  right?: boolean;
  className?: string;
  /** Title in capitals (design: attribute columns such as LOCATION, STONE, CER TYPE, PCS, PRICE). */
  upper?: boolean;
  /** Sub-label as written (design: "Doc Date", "Lot"); otherwise in capitals (STOCK ID · LOT, SHAPE · SIZE). */
  plainSub?: boolean;
  /** Rows the cell spans (2 when the header has a column-group row). */
  rowSpan?: number;
};

/** Two-line header: main label (14 px medium) with the small sub-label under it and the sort glyph (DV-12: not sorting). */
export function PickerTh({ title, sub, right, className, rowSpan, upper, plainSub }: PickerHeaderCell) {
  return (
    <th scope="col" rowSpan={rowSpan} className={cx("px-3 py-2 align-middle font-medium whitespace-nowrap", right && "text-right", className)}>
      <span className={cx("inline-flex items-center gap-1.5", right && "flex-row-reverse")}>
        <span className="leading-tight">
          <span className={cx("block text-sm", upper && "uppercase")}>{title}</span>
          {sub && <span className={cx("mt-0.5 block text-xs font-normal text-gms-text-muted", !plainSub && "uppercase")}>{sub}</span>}
        </span>
        <ChevronsUpDown className="size-3 shrink-0 text-gms-text-subtle" aria-hidden />
      </span>
    </th>
  );
}

/** A column group's title over its sub-columns (design: PENDING orange, OUTSTANDING green). */
export function PickerGroupTh({ title, span, tone }: { title: string; span: number; tone: PickerGroupTone }) {
  return (
    <th scope="colgroup" colSpan={span} className={cx("h-9 px-3 text-center text-sm font-medium uppercase", pickerGroupTone[tone].head)}>
      {title}
    </th>
  );
}

export function PickerGroupSubTh({ title, tone, className }: { title: string; tone: PickerGroupTone; className?: string }) {
  return (
    <th scope="col" className={cx("h-8 px-3 text-right text-sm font-medium", pickerGroupTone[tone].sub, className)}>
      {title}
    </th>
  );
}

// ---- cell pieces ----

/** Lot chip (design: yellow); the warning tokens keep AA contrast for 12 px text. */
export function PickerLot({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-gms-sm bg-gms-warning-subtle px-1.5 py-px font-mono text-xs leading-4 text-gms-warning-text">{children}</span>;
}

/** Cer Type chip (design: light grey). */
export function PickerChip({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-gms-sm bg-[#EEF0F2] px-1.5 py-0.5 text-sm leading-4 font-medium text-[#1C252E]">{children}</span>;
}

/** Item note under the identity: speech-bubble icon + text. */
export function PickerNote({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return (
    <div className={cx(pickerSub, "flex items-center gap-1.5")}>
      <MessageSquare className="size-3 shrink-0" aria-hidden /> {text}
    </div>
  );
}
