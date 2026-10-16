"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cx } from "@/components/ui/button";

export type SectionOption = { value: string; label: string };

type SectionFilterProps = {
  options: readonly SectionOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

/**
 * Permissions section filter (owner design 2026-10-16): "All Permissions" plus one entry per top-level
 * menu (Dashboard, Setup, Pre-Sale, Memo, …), selected entry with a check mark. A listbox button
 * instead of a native select, so a mouse click shows no green focus border (keyboard focus keeps a
 * visible ring). Keyboard: Enter/Space/ArrowDown open; ArrowUp/Down, Home/End move; Enter/Space
 * choose; Escape/Tab close.
 */
export function SectionFilter({ options, value, onChange, disabled = false }: SectionFilterProps) {
  const baseId = useId();
  const listId = `${baseId}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options[selectedIndex];

  // Close when the pointer goes down outside the control.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keep the active option visible while moving with the keyboard.
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function openList() {
    setActive(selectedIndex);
    setOpen(true);
    requestAnimationFrame(() => listRef.current?.focus());
  }

  function choose(index: number) {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onListKeyDown(event: React.KeyboardEvent<HTMLUListElement>) {
    const last = options.length - 1;
    const moves: Record<string, number> = { ArrowDown: Math.min(active + 1, last), ArrowUp: Math.max(active - 1, 0), Home: 0, End: last };
    if (event.key in moves) {
      event.preventDefault();
      setActive(moves[event.key]);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(active);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`Show permissions: ${selected?.label ?? ""}`}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            openList();
          }
        }}
        className={cx(
          "inline-flex h-10 min-w-[150px] items-center justify-between gap-3 rounded-gms-md border border-gms-border bg-gms-surface pl-3 pr-2.5 text-gms-label text-gms-text outline-none disabled:opacity-60",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gms-primary",
        )}
      >
        <span className="truncate">{selected?.label}</span>
        <ChevronDown size={16} aria-hidden className={cx("shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label="Permission sections"
          aria-activedescendant={`${baseId}-option-${active}`}
          onKeyDown={onListKeyDown}
          className="absolute top-full left-0 z-30 mt-1 max-h-72 min-w-[210px] overflow-y-auto rounded-gms-lg border border-gms-border bg-gms-surface p-1.5 shadow-gms-overlay outline-none"
        >
          {options.map((option, index) => {
            const isSelected = index === selectedIndex;
            return (
              <li
                key={option.value}
                id={`${baseId}-option-${index}`}
                data-index={index}
                role="option"
                aria-selected={isSelected}
                onPointerEnter={() => setActive(index)}
                onClick={() => choose(index)}
                className={cx(
                  "flex cursor-pointer items-center justify-between gap-3 rounded-gms-md px-3 py-2 text-gms-body text-gms-text",
                  index === active && "bg-gms-nav-active",
                  isSelected && "font-medium",
                )}
              >
                <span className="truncate">{option.label}</span>
                {isSelected && <Check size={16} aria-hidden className="shrink-0 text-gms-text" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
