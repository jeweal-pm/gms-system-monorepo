"use client";

import { Check } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cx } from "@/components/ui/button";
import type { SubtaskView } from "../permission-utils";

type SubtaskViewMenuProps = {
  value: SubtaskView;
  onChange: (value: SubtaskView) => void;
  disabled?: boolean;
};

const OPTIONS: readonly { value: SubtaskView; label: string; hint?: string }[] = [
  { value: "collapsed", label: "Collapsed", hint: "(default)" },
  { value: "expanded", label: "Expanded" },
];

/** Design icon (owner 2026-11-03): a panel with a chevron above two lines. */
function SubtasksIcon() {
  return (
    <svg data-icon="show-subtasks" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11.9997 2.6665H3.99967C3.06625 2.6665 2.59954 2.6665 2.24302 2.84816C1.92942 3.00795 1.67445 3.26292 1.51466 3.57652C1.33301 3.93304 1.33301 4.39975 1.33301 5.33317C1.33301 6.26659 1.33301 6.7333 1.51466 7.08984C1.67445 7.40344 1.92942 7.65837 2.24302 7.81817C2.59954 7.99984 3.06625 7.99984 3.99967 7.99984H11.9997C12.9331 7.99984 13.3998 7.99984 13.7563 7.81817C14.0699 7.65837 14.3249 7.40344 14.4847 7.08984C14.6663 6.7333 14.6663 6.26659 14.6663 5.33317C14.6663 4.39975 14.6663 3.93304 14.4847 3.57652C14.3249 3.26292 14.0699 3.00795 13.7563 2.84816C13.3998 2.6665 12.9331 2.6665 11.9997 2.6665Z" />
      <path d="M11.9997 4.66652C11.9997 4.66652 11.0177 5.99984 10.6663 5.99984C10.3149 5.99984 9.33301 4.6665 9.33301 4.6665" />
      <path d="M1.33301 10.6665H9.33301" />
      <path d="M1.33301 13.3335H9.33301" />
    </svg>
  );
}

/**
 * "Show subtasks" menu (owner design 2026-11-03), replacing Expand All / Collapse All: an icon button
 * left of the permission counter opens "Collapsed (default)" / "Expanded" with a check on the current
 * view. Choosing one collapses or expands every group. Keyboard as SectionFilter: Enter/Space/ArrowDown
 * open; ArrowUp/Down, Home/End move; Enter/Space choose; Escape/Tab close.
 */
export function SubtaskViewMenu({ value, onChange, disabled = false }: SubtaskViewMenuProps) {
  const baseId = useId();
  const listId = `${baseId}-list`;
  const headingId = `${baseId}-heading`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selectedIndex = Math.max(0, OPTIONS.findIndex((option) => option.value === value));

  // Close when the pointer goes down outside the control.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function openList() {
    setActive(selectedIndex);
    setOpen(true);
    requestAnimationFrame(() => listRef.current?.focus());
  }

  function choose(index: number) {
    const option = OPTIONS[index];
    if (option) onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onListKeyDown(event: React.KeyboardEvent<HTMLUListElement>) {
    const last = OPTIONS.length - 1;
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
        aria-label={`Show subtasks: ${OPTIONS[selectedIndex].label}`}
        title="Show subtasks"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            openList();
          }
        }}
        // Owner 2026-11-03: white at rest, grey on hover and while the menu is open.
        className={cx(
          "inline-flex size-8 items-center justify-center rounded-gms-md text-gms-text outline-none hover:bg-gms-surface-sunken disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-gms-surface",
          open ? "bg-gms-surface-sunken" : "bg-gms-surface",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gms-primary",
        )}
      >
        <SubtasksIcon />
      </button>
      {open && (
        <div className="absolute top-full right-0 z-30 mt-2 min-w-[270px] rounded-gms-lg border border-gms-border bg-gms-surface p-1.5 shadow-gms-overlay">
          <p id={headingId} className="px-3 pt-1.5 pb-2 text-gms-label text-gms-text-secondary">Show subtasks</p>
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-labelledby={headingId}
            aria-activedescendant={`${baseId}-option-${active}`}
            onKeyDown={onListKeyDown}
            className="outline-none"
          >
            {OPTIONS.map((option, index) => {
              const isSelected = index === selectedIndex;
              return (
                <li
                  key={option.value}
                  id={`${baseId}-option-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  onPointerEnter={() => setActive(index)}
                  onClick={() => choose(index)}
                  className={cx(
                    "flex cursor-pointer items-center justify-between gap-3 rounded-gms-md px-3 py-2.5 text-gms-body text-gms-text",
                    index === active && "bg-gms-nav-active",
                    isSelected && "font-medium",
                  )}
                >
                  <span>
                    {option.label}
                    {option.hint && <span className="ml-1 text-gms-label font-normal text-gms-text-secondary">{option.hint}</span>}
                  </span>
                  {isSelected && <Check size={18} aria-hidden className="shrink-0 text-gms-primary" />}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
