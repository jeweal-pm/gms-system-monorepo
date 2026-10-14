"use client";

import { Check, ChevronDown, X } from "lucide-react";
import { useId, useState, type KeyboardEvent, type Ref } from "react";
import type { LocationOption } from "../../api";
import { cx } from "./button";
import { FieldShell, fieldBoxClass } from "./outlined-field";

type MultiSelectProps = {
  id: string;
  label: string;
  options: readonly LocationOption[];
  value: string[];
  onChange: (value: string[]) => void;
  onBlur: () => void;
  error?: string;
  required?: boolean;
  readOnly?: boolean;
  status?: "loading" | "error" | "ready";
  comboboxRef?: Ref<HTMLDivElement>;
};

/**
 * C-12: select-only combobox with a multi-select listbox (WAI-ARIA APG).
 * Keys: ArrowUp/ArrowDown/Home/End move, Enter/Space toggle, Escape closes,
 * Backspace removes the last chip. Chips outside the combobox have their own
 * remove buttons.
 */
export function MultiSelect({ id, label, options, value, onChange, onBlur, error, required, readOnly, status = "ready", comboboxRef }: MultiSelectProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = value.map((entry) => options.find((option) => option.id === entry) ?? { id: entry, label: entry });
  const hasOptions = status === "ready" && options.length > 0;
  const optionId = (index: number) => `${listId}-option-${index}`;

  function toggle(optionIdValue: string) {
    onChange(value.includes(optionIdValue) ? value.filter((entry) => entry !== optionIdValue) : [...value, optionIdValue]);
  }

  function openList() {
    if (readOnly) return;
    setActiveIndex(0);
    setOpen(true);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (readOnly) return;
    const last = options.length - 1;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) openList();
        else setActiveIndex((index) => Math.min(index + 1, last));
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!open) openList();
        else setActiveIndex((index) => Math.max(index - 1, 0));
        break;
      case "Home":
        if (open) { event.preventDefault(); setActiveIndex(0); }
        break;
      case "End":
        if (open) { event.preventDefault(); setActiveIndex(Math.max(last, 0)); }
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (!open) openList();
        else if (hasOptions && options[activeIndex]) toggle(options[activeIndex].id);
        break;
      case "Escape":
        if (open) { event.preventDefault(); setOpen(false); }
        break;
      case "Backspace":
        if (value.length > 0) { event.preventDefault(); onChange(value.slice(0, -1)); }
        break;
    }
  }

  return (
    <FieldShell id={id} label={label} required={required} error={error} labelAsText>
      <div
        className={cx(
          fieldBoxClass({ invalid: Boolean(error), readOnly }),
          "relative flex items-center gap-2 pl-4 pr-3",
          !readOnly && "cursor-pointer focus-within:border-gms-primary focus-within:ring-2 focus-within:ring-gms-primary/20",
        )}
        onClick={() => {
          if (open) setOpen(false);
          else openList();
          document.getElementById(id)?.focus();
        }}
      >
        {selected.length > 0 && (
          <ul aria-label={`Selected ${label}`} className="flex min-w-0 flex-wrap gap-1.5">
            {selected.map((option) => (
              <li key={option.id} className="inline-flex h-7 items-center gap-1.5 rounded-gms-sm bg-gms-surface-sunken pl-2 pr-1.5 text-[13px] text-gms-text">
                {option.label}
                {!readOnly && (
                  <button
                    type="button"
                    aria-label={`Remove ${option.label}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onChange(value.filter((entry) => entry !== option.id));
                    }}
                    className="rounded-gms-sm p-0.5 text-gms-text-secondary hover:text-gms-text focus-visible:outline-2 focus-visible:outline-gms-primary"
                  >
                    <X size={12} aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div
          ref={comboboxRef}
          id={id}
          role="combobox"
          tabIndex={0}
          aria-labelledby={`${id}-label`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && hasOptions ? optionId(activeIndex) : undefined}
          aria-required={required || undefined}
          aria-readonly={readOnly || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            setOpen(false);
            onBlur();
          }}
          className="flex h-full min-w-0 flex-1 items-center justify-end outline-none"
        >
          {selected.length === 0 && <span className="mr-auto text-gms-text-placeholder">Select location</span>}
          <ChevronDown size={18} className={cx("shrink-0 text-gms-text-secondary transition-transform", open && "rotate-180")} aria-hidden />
        </div>
        <ul
          id={listId}
          role="listbox"
          aria-multiselectable="true"
          aria-labelledby={`${id}-label`}
          hidden={!open}
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-auto rounded-gms-md border border-gms-border bg-gms-surface py-1 shadow-gms-overlay"
        >
          {status === "loading" && <li className="px-4 py-2 text-sm text-gms-text-secondary">Loading…</li>}
          {status === "error" && <li className="px-4 py-2 text-sm text-gms-danger">Couldn&apos;t load locations.</li>}
          {status === "ready" && options.length === 0 && <li className="px-4 py-2 text-sm text-gms-text-secondary">No locations</li>}
          {hasOptions &&
            options.map((option, index) => {
              const isSelected = value.includes(option.id);
              return (
                <li
                  key={option.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggle(option.id);
                  }}
                  className={cx(
                    "flex cursor-pointer items-center gap-2 px-4 py-2 text-sm text-gms-text",
                    index === activeIndex && "bg-gms-surface-sunken",
                  )}
                >
                  <span className="inline-flex w-4 justify-center text-gms-primary">{isSelected && <Check size={14} aria-hidden />}</span>
                  {option.label}
                </li>
              );
            })}
        </ul>
      </div>
    </FieldShell>
  );
}
