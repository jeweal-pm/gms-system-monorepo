"use client";

import { Check, Minus } from "lucide-react";
import { useEffect, useRef } from "react";
import type { CheckState } from "../../permission-utils";
import { cx } from "./button";

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
