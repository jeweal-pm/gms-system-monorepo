"use client";

import { ChevronDown } from "lucide-react";
import { useId, useMemo, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { cx } from "./button";
import { FieldShell, fieldBoxClass, fieldFocusClass, readOnlyControlClass, type LabelPosition } from "./outlined-field";
import type { SelectOption } from "./select-field";

/** Matches shown at once; typing narrows a longer list (a country can list ~17,000 cities). */
export const COMBOBOX_VISIBLE_MAX = 100;

/** Lower case without accents, so "sao" finds "São Paulo". */
export function normalizeSearch(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Options whose label contains `query`; labels starting with it come first, list order is kept otherwise. */
export function filterOptions<T extends { label: string }>(options: readonly T[], query: string, normalized: readonly string[] = options.map((option) => normalizeSearch(option.label))): T[] {
  const needle = normalizeSearch(query);
  if (!needle) return [...options];
  const starts: T[] = [];
  const contains: T[] = [];
  options.forEach((option, index) => {
    const at = normalized[index].indexOf(needle);
    if (at === 0) starts.push(option);
    else if (at > 0) contains.push(option);
  });
  return [...starts, ...contains];
}

/** The option a typed text names exactly (ignoring case and accents), committed when the field loses focus. */
export function exactOption<T extends { label: string }>(options: readonly T[], query: string): T | undefined {
  const needle = normalizeSearch(query);
  return needle ? options.find((option) => normalizeSearch(option.label) === needle) : undefined;
}

type ComboboxFieldProps = {
  id: string;
  label: string;
  placeholder: string;
  options: readonly SelectOption[];
  /** The chosen option's value ("" = none). */
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  required?: boolean;
  error?: string;
  readOnly?: boolean;
  disabled?: boolean;
  status?: "loading" | "error" | "ready";
  loadErrorMessage?: string;
  onRetry?: () => void;
  labelPosition?: LabelPosition;
  className?: string;
  ref?: Ref<HTMLInputElement>;
};

/**
 * Searchable dropdown (owner 2026-10-19: Country, State/Province and City): type to filter, pick with
 * the mouse or arrow keys + Enter, Escape restores the value. Only listed options can be chosen; a typed
 * text that names an option exactly is taken on blur, clearing the text clears the value. Same outlined
 * states as `SelectField`; the list itself always has a white background, also while the field is invalid.
 */
export function ComboboxField({
  id,
  label,
  placeholder,
  options,
  value,
  onChange,
  onBlur,
  required,
  error,
  readOnly = false,
  disabled = false,
  status = "ready",
  loadErrorMessage = "Couldn't load the list.",
  onRetry,
  labelPosition,
  className,
  ref,
}: ComboboxFieldProps) {
  const listId = `${id}-listbox`;
  const optionIdPrefix = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const loading = status === "loading";
  const inactive = disabled || readOnly || loading;
  const selected = options.find((option) => option.value === value);
  const normalized = useMemo(() => options.map((option) => normalizeSearch(option.label)), [options]);
  const matches = useMemo(() => (open ? filterOptions(options, query ?? "", normalized) : []), [open, options, query, normalized]);
  const visible = matches.slice(0, COMBOBOX_VISIBLE_MAX);
  const shownText = query ?? selected?.label ?? (value || "");
  const describedBy = [error ? `${id}-error` : null, status === "error" ? `${id}-load-error` : null].filter(Boolean).join(" ") || undefined;

  function openList(startAt?: number) {
    if (inactive) return;
    setOpen(true);
    const current = options.findIndex((option) => option.value === value);
    const index = startAt ?? (current >= 0 && current < COMBOBOX_VISIBLE_MAX ? current : 0);
    setActive(index);
    requestAnimationFrame(() => listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" }));
  }

  function close() {
    setOpen(false);
    setQuery(null);
  }

  function choose(option: SelectOption) {
    if (option.value !== value) onChange(option.value);
    close();
  }

  function moveActive(step: number) {
    if (!open) return openList();
    if (visible.length === 0) return;
    const next = (active + step + visible.length) % visible.length;
    setActive(next);
    listRef.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === "Enter") {
      if (!open) return;
      event.preventDefault();
      if (visible[active]) choose(visible[active]);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      close();
    }
  }

  function commitTyped() {
    if (query !== null) {
      if (query.trim() === "") {
        if (value) onChange("");
      } else {
        const exact = exactOption(options, query);
        if (exact && exact.value !== value) onChange(exact.value);
      }
    }
    close();
    onBlur?.();
  }

  const invalid = Boolean(error) && !disabled;
  return (
    <FieldShell id={id} label={label} required={required} error={error} readOnly={readOnly} disabled={disabled} labelPosition={labelPosition} className={className}>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && visible[active] ? `${optionIdPrefix}-${active}` : undefined}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          aria-readonly={readOnly || undefined}
          aria-busy={loading || undefined}
          readOnly={readOnly}
          disabled={disabled || readOnly}
          value={loading ? "" : shownText}
          placeholder={readOnly ? undefined : loading ? "Loading…" : placeholder}
          onChange={(event) => {
            setQuery(event.target.value);
            if (!open) setOpen(true);
            setActive(0);
          }}
          onClick={() => (open ? undefined : openList())}
          onKeyDown={onKeyDown}
          onBlur={commitTyped}
          className={cx(
            fieldBoxClass({ invalid, readOnly, disabled }),
            readOnly ? "px-4" : "pl-4 pr-11",
            readOnly && !disabled && readOnlyControlClass,
            disabled ? "placeholder:text-gms-checkbox-readonly" : "placeholder:text-gms-text-placeholder",
            !inactive && "cursor-text",
            fieldFocusClass,
          )}
        />
        {!readOnly && (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            disabled={inactive}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (open) close();
              else {
                document.getElementById(id)?.focus();
                openList();
              }
            }}
            className={cx("absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center", inactive ? "cursor-not-allowed text-gms-checkbox-readonly" : "cursor-pointer text-gms-text")}
          >
            <ChevronDown size={20} className={cx("transition-transform", open && "rotate-180")} />
          </button>
        )}
        {open && (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-labelledby={`${id}-label`}
            className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-gms-md border border-gms-border bg-gms-surface py-1 text-gms-body text-gms-text shadow-lg"
          >
            {visible.length === 0 ? (
              <li className="px-4 py-2 text-gms-text-placeholder">No matches</li>
            ) : (
              visible.map((option, index) => (
                <li
                  key={option.value}
                  id={`${optionIdPrefix}-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={option.value === value}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(option)}
                  className={cx(
                    "cursor-pointer truncate px-4 py-2",
                    index === active && "bg-gms-surface-sunken",
                    option.value === value && "font-semibold text-gms-primary",
                  )}
                >
                  {option.label}
                </li>
              ))
            )}
            {matches.length > COMBOBOX_VISIBLE_MAX && (
              <li aria-hidden className="border-t border-gms-border px-4 py-2 text-gms-label italic text-gms-text-placeholder">
                {`Showing ${COMBOBOX_VISIBLE_MAX} of ${matches.length.toLocaleString("en-US")} — keep typing to narrow`}
              </li>
            )}
          </ul>
        )}
      </div>
      {status === "error" && (
        <p id={`${id}-load-error`} className="mt-1 flex flex-wrap items-center gap-x-2 pl-4 text-gms-label text-gms-danger">
          {loadErrorMessage}
          {onRetry && (
            <button type="button" onClick={onRetry} className="font-medium text-gms-primary underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-gms-primary">
              Retry
            </button>
          )}
        </p>
      )}
    </FieldShell>
  );
}
