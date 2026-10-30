"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { cx, focusRing } from "@/components/ui/button";

/**
 * Column widths of the outstanding table (owner note 2026-10-30): the info part (expand · Doc · Due · Vendor) starts at
 * 30% of the table and the number part (bucket Pcs / Weight, Price) at 70%. Headers can be dragged at their right edge
 * (cursor col-resize). Widths live only in component state, so a reload or Refresh brings the default back.
 */
export type ColumnKind = "expand" | "docNo" | "dueDate" | "vendor" | "pcs" | "weight" | "price";
export type TableColumn = { key: string; kind: ColumnKind };

export const EXPAND_WIDTH = 40;
export const MIN_COLUMN_WIDTH = 56;
/** Used before the table is measured (server render, tests). */
export const FALLBACK_TABLE_WIDTH = 1200;
const INFO_SHARE = 0.3;
const INFO_SPLIT: Partial<Record<ColumnKind, number>> = { docNo: 0.36, dueDate: 0.28, vendor: 0.36 };
const NUMBER_UNITS: Partial<Record<ColumnKind, number>> = { pcs: 1, weight: 1, price: 1.6 };
const MIN_DEFAULT: Record<ColumnKind, number> = { expand: EXPAND_WIDTH, docNo: 112, dueDate: 104, vendor: 150, pcs: 64, weight: 80, price: 150 };

/** Default widths in px for a table `tableWidth` wide: 30% info / 70% numbers, never under the readable minimum. */
export function defaultColumnWidths(columns: readonly TableColumn[], tableWidth: number): Record<string, number> {
  const width = tableWidth > 0 ? tableWidth : FALLBACK_TABLE_WIDTH;
  const info = Math.max(0, width * INFO_SHARE - EXPAND_WIDTH);
  const units = columns.reduce((sum, column) => sum + (NUMBER_UNITS[column.kind] ?? 0), 0);
  const numbers = width * (1 - INFO_SHARE);
  const widths: Record<string, number> = {};
  for (const column of columns) {
    const share = column.kind === "expand" ? EXPAND_WIDTH : INFO_SPLIT[column.kind] !== undefined ? info * INFO_SPLIT[column.kind]! : units > 0 ? (numbers * (NUMBER_UNITS[column.kind] ?? 0)) / units : 0;
    widths[column.key] = Math.max(MIN_DEFAULT[column.kind], Math.floor(share));
  }
  return widths;
}

/** Left offsets of the frozen columns: each starts where the previous one ends. */
export function stickyOffsets(columns: readonly TableColumn[], widths: Record<string, number>, frozen: number): number[] {
  const offsets: number[] = [];
  let left = 0;
  for (const column of columns.slice(0, frozen)) {
    offsets.push(left);
    left += widths[column.key] ?? 0;
  }
  return offsets;
}

/** Measures the scroll box and keeps the dragged widths (state only) over the defaults. */
export function useColumnWidths(columns: readonly TableColumn[]): {
  boxRef: RefObject<HTMLDivElement | null>;
  widths: Record<string, number>;
  resize: (key: string, width: number) => void;
  reset: (key: string) => void;
} {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  const [custom, setCustom] = useState<Record<string, number>>({});

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => setBoxWidth(box.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const widths = { ...defaultColumnWidths(columns, boxWidth), ...pick(custom, columns) };
  const resize = useCallback((key: string, width: number) => setCustom((prev) => ({ ...prev, [key]: Math.max(MIN_COLUMN_WIDTH, Math.round(width)) })), []);
  const reset = useCallback((key: string) => setCustom((prev) => Object.fromEntries(Object.entries(prev).filter(([name]) => name !== key))), []);
  return { boxRef, widths, resize, reset };
}

function pick(custom: Record<string, number>, columns: readonly TableColumn[]) {
  return Object.fromEntries(columns.flatMap((column) => (custom[column.key] === undefined ? [] : [[column.key, custom[column.key]]])));
}

/** Drag handle on a header's right edge; arrows resize by 16 px, double click restores the default width. */
export function ResizeHandle({ label, width, onResize, onReset }: { label: string; width: number; onResize: (width: number) => void; onReset: () => void }) {
  const start = useRef<{ x: number; width: number } | null>(null);
  const onPointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    start.current = { x: event.clientX, width };
  };
  const onPointerMove = (event: PointerEvent<HTMLSpanElement>) => {
    if (start.current) onResize(start.current.width + event.clientX - start.current.x);
  };
  const stop = () => {
    start.current = null;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    onResize(width + (event.key === "ArrowRight" ? 16 : -16));
  };
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${label} column`}
      aria-valuenow={width}
      aria-valuemin={MIN_COLUMN_WIDTH}
      tabIndex={0}
      title="Drag to resize · double click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      onClick={(event) => event.stopPropagation()}
      className={cx("absolute top-0 right-0 z-10 h-full w-2 cursor-col-resize touch-none select-none after:absolute after:inset-y-1 after:right-0 after:w-px hover:after:bg-gms-primary", focusRing)}
    />
  );
}
