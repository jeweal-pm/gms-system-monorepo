"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { forwardRef, useEffect, useRef, useState, type InputHTMLAttributes } from "react";

/**
 * English date field (owner 2026-10-28: no Thai placeholders). The browser `<input type="date">` shows its
 * placeholder and calendar in the Windows/browser language (e.g. "วว/ดด/ปปปป"), so this field types
 * dd/mm/yyyy itself and opens an English month calendar. The value stays ISO `YYYY-MM-DD` ("" when empty or
 * incomplete), the same as the native input, so schemas and APIs don't change.
 */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10-28" → "28/10/2026"; anything else → "". */
export function formatDateText(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

/** "28/10/2026" → "2026-10-28"; null when incomplete or not a real date. */
export function parseDateText(text: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match) return null;
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1000 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

/** Keeps at most 8 digits and puts the slashes in: "2810" → "28/10". */
export function maskDateText(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  return digits.slice(0, 2) + (digits.length > 2 ? `/${digits.slice(2, 4)}` : "") + (digits.length > 4 ? `/${digits.slice(4)}` : "");
}

/** Six weeks (Sunday first) around a month; `month` is 0-based. */
export function monthGrid(year: number, month: number): { iso: string; day: number; inMonth: boolean }[] {
  const start = new Date(Date.UTC(year, month, 1));
  start.setUTCDate(1 - start.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return { iso: `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`, day: date.getUTCDate(), inMonth: date.getUTCMonth() === month };
  });
}

/** True when both are ISO dates and `iso` is before `min` (Due Date before Doc Date). */
export function isBeforeDate(iso: string | undefined, min: string | undefined): boolean {
  return Boolean(iso && min && /^\d{4}-\d{2}-\d{2}$/.test(iso) && /^\d{4}-\d{2}-\d{2}$/.test(min) && iso < min);
}

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function viewOf(iso: string): { year: number; month: number } {
  const [year, month] = (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : todayIso()).split("-").map(Number);
  return { year, month: month - 1 };
}

export type DateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "type" | "min"> & {
  /** ISO `YYYY-MM-DD`, or "". */
  value: string;
  onChange: (value: string) => void;
  /** Earliest date the calendar offers (ISO); earlier days are greyed out (Due Date ≥ Doc Date, owner 2026-10-29). */
  min?: string;
  wrapperClassName?: string;
};

export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  { value, onChange, onBlur, className, wrapperClassName, disabled, readOnly, min, placeholder = "dd/mm/yyyy", ...props },
  ref,
) {
  const [text, setText] = useState(() => formatDateText(value));
  const [seenValue, setSeenValue] = useState(value);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => viewOf(value));
  const boxRef = useRef<HTMLDivElement>(null);

  // A new value from outside (reset, calendar, load) replaces the text unless the text already means it.
  if (value !== seenValue) {
    setSeenValue(value);
    if ((parseDateText(text) ?? "") !== value) setText(formatDateText(value));
  }

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const pick = (iso: string) => {
    setText(formatDateText(iso));
    onChange(iso);
    setOpen(false);
  };
  const step = (delta: number) => setView(({ year, month }) => ({ year: year + Math.floor((month + delta) / 12), month: (month + delta + 12) % 12 }));
  const today = todayIso();
  const locked = disabled || readOnly;
  const tooEarly = (iso: string) => isBeforeDate(iso, min);

  return (
    <div ref={boxRef} className={`relative ${wrapperClassName ?? ""}`}>
      <input
        ref={ref}
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        value={text}
        className={`peer ${className ?? ""} pr-10`}
        onChange={(event) => {
          const next = maskDateText(event.target.value);
          setText(next);
          onChange(parseDateText(next) ?? "");
        }}
        onBlur={(event) => {
          // An incomplete or impossible date doesn't stay on screen.
          if (text !== "" && parseDateText(text) === null) setText(formatDateText(value));
          onBlur?.(event);
        }}
      />
      <button
        type="button"
        aria-label="Open calendar"
        aria-expanded={open}
        disabled={locked}
        // No hover background on an invalid or locked (disabled / read-only) field (owner 2026-10-29).
        className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-gms-text-secondary hover:bg-gms-page peer-aria-invalid:hover:bg-transparent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-gms-primary"
        onClick={() => {
          setView(viewOf(value));
          setOpen((current) => !current);
        }}
      >
        <CalendarDays className="size-4" aria-hidden />
      </button>
      {open && !locked && (
        // Inside a Field <label>: keep clicks here from re-targeting the text input.
        <div
          role="dialog"
          aria-label="Choose a date"
          className="absolute top-full left-0 z-50 mt-1 w-[280px] rounded-gms-md border border-gms-border bg-gms-surface p-3 text-gms-text shadow-lg"
          onClick={(event) => event.preventDefault()}
        >
          <div className="mb-2 flex items-center justify-between">
            <button type="button" aria-label="Previous month" className="rounded p-1 hover:bg-gms-page" onClick={() => step(-1)}>
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <span className="text-sm font-medium">
              {MONTHS[view.month]} {view.year}
            </span>
            <button type="button" aria-label="Next month" className="rounded p-1 hover:bg-gms-page" onClick={() => step(1)}>
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
          <div className="grid grid-cols-7 text-center text-xs text-gms-text-secondary">
            {WEEKDAYS.map((day) => (
              <span key={day} className="py-1">
                {day}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-sm">
            {monthGrid(view.year, view.month).map((cell) => (
              <button
                key={cell.iso}
                type="button"
                aria-label={formatDateText(cell.iso)}
                aria-pressed={cell.iso === value}
                disabled={tooEarly(cell.iso)}
                className={[
                  "h-8 rounded",
                  tooEarly(cell.iso)
                    ? "cursor-not-allowed text-gms-text-placeholder opacity-50"
                    : [
                        cell.iso === value ? "bg-gms-primary text-white" : "hover:bg-gms-page",
                        !cell.inMonth && cell.iso !== value ? "text-gms-text-placeholder" : "",
                        cell.iso === today && cell.iso !== value ? "font-semibold text-gms-primary" : "",
                      ].join(" "),
                ].join(" ")}
                onClick={() => pick(cell.iso)}
              >
                {cell.day}
              </button>
            ))}
          </div>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              disabled={tooEarly(today)}
              className="rounded px-2 py-1 text-sm font-medium text-gms-primary hover:bg-gms-page disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              onClick={() => pick(today)}
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
