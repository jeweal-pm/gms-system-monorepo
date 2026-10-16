"use client";

import { Check, Minus } from "lucide-react";
import { useEffect, useRef, useState, type Ref } from "react";
import { cx, focusRing } from "./button";

export type CheckState = "checked" | "unchecked" | "indeterminate";

type TriStateCheckboxProps = {
  label: string;
  state: CheckState;
  onToggle: () => void;
};

/**
 * C-14: native checkbox with a custom box. Indeterminate is set through the
 * DOM property, which exposes aria-checked="mixed".
 */
export function TriStateCheckbox({ label, state, onToggle }: TriStateCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "indeterminate";
  }, [state]);

  const filled = state !== "unchecked";

  return (
    <span className="relative inline-flex h-[22px] w-[22px] items-center justify-center">
      <input
        ref={ref}
        type="checkbox"
        aria-label={label}
        checked={state === "checked"}
        onChange={onToggle}
        className={cx(
          "peer h-[22px] w-[22px] cursor-pointer appearance-none rounded-gms-sm border transition-colors",
          filled ? "border-gms-primary bg-gms-primary" : "border-gms-border bg-gms-surface hover:border-gms-text-placeholder",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gms-primary",
        )}
      />
      {state === "checked" && <Check size={15} strokeWidth={3} className="pointer-events-none absolute text-gms-on-primary" aria-hidden />}
      {state === "indeterminate" && <Minus size={15} strokeWidth={3} className="pointer-events-none absolute text-gms-on-primary" aria-hidden />}
    </span>
  );
}

/** Read-only cell (grey check, no box) as in S5; used when viewing a saved user. */
export function ReadOnlyCheck({ label, state }: { label: string; state: CheckState }) {
  const text = state === "checked" ? "allowed" : state === "indeterminate" ? "partly allowed" : "not allowed";
  return (
    <span className="inline-flex h-[22px] w-[22px] items-center justify-center text-gms-checkbox-readonly">
      {state === "checked" && <Check size={18} aria-hidden />}
      {state === "indeterminate" && <Minus size={18} aria-hidden />}
      <span className="sr-only">{`${label}: ${text}`}</span>
    </span>
  );
}

/**
 * Disabled matrix cell that keeps the box (user-permission rev2 view mode and
 * the locked Super Admin matrix): faint box, grey check. A native disabled
 * checkbox, so its checked/mixed state is still announced.
 */
export function DisabledCheckbox({ label, state, describedBy }: { label: string; state: CheckState; describedBy?: string }) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "indeterminate";
  }, [state]);

  return (
    <span className="relative inline-flex h-[22px] w-[22px] items-center justify-center">
      <input
        ref={ref}
        type="checkbox"
        aria-label={label}
        aria-describedby={describedBy}
        checked={state === "checked"}
        disabled
        readOnly
        className="h-[22px] w-[22px] cursor-not-allowed appearance-none rounded-gms-sm border border-gms-border bg-gms-field-disabled"
      />
      {state === "checked" && <Check size={15} strokeWidth={2.5} className="pointer-events-none absolute text-gms-checkbox-readonly" aria-hidden />}
      {state === "indeterminate" && <Minus size={15} strokeWidth={2.5} className="pointer-events-none absolute text-gms-checkbox-readonly" aria-hidden />}
    </span>
  );
}

type LabeledCheckboxProps = {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /**
   * Checked and not changeable (for example the only default address). Uses
   * `aria-disabled` so the control stays focusable and its hint can be read.
   */
  locked?: boolean;
  /** Visible hint linked with `aria-describedby`, shown while locked. */
  hint?: string;
  readOnly?: boolean;
  inputRef?: Ref<HTMLInputElement>;
};

/**
 * Checkbox with a visible label (customer C-12): 20 px box; unchecked has a
 * 1 px primary border (sampled), checked is primary-filled with a white check.
 */
export function LabeledCheckbox({ id, label, checked, onChange, locked = false, hint, readOnly = false, inputRef }: LabeledCheckboxProps) {
  const blocked = locked || readOnly;
  const hasHint = Boolean(hint) && locked && !readOnly;
  // The hint is always the accessible description; it becomes visible after an attempt to change the locked box.
  const [attempted, setAttempted] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <label htmlFor={id} className={cx("inline-flex items-center gap-2.5 text-gms-body text-gms-text", blocked ? "cursor-default" : "cursor-pointer")}>
        <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
          <input
            ref={inputRef}
            id={id}
            type="checkbox"
            checked={checked}
            aria-disabled={blocked || undefined}
            aria-readonly={readOnly || undefined}
            aria-describedby={hasHint ? `${id}-hint` : undefined}
            onChange={(event) => {
              if (!blocked) onChange(event.target.checked);
              else if (locked) setAttempted(true);
            }}
            className={cx(
              "h-5 w-5 appearance-none rounded-gms-sm border border-gms-primary transition-colors",
              checked ? "bg-gms-primary" : "bg-gms-surface",
              blocked ? "cursor-default" : "cursor-pointer",
              readOnly && "opacity-70",
              focusRing,
            )}
          />
          {checked && <Check size={14} strokeWidth={3} className="pointer-events-none absolute text-gms-on-primary" aria-hidden />}
        </span>
        {label}
      </label>
      {hasHint && (
        <span id={`${id}-hint`} className={cx("text-gms-label text-gms-text-secondary", !attempted && "sr-only")}>
          {hint}
        </span>
      )}
    </div>
  );
}
