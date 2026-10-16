"use client";

import { cx, focusRing } from "./button";

type SwitchProps = {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  readOnly?: boolean;
  /** Uses `aria-disabled` (stays focusable so the hint can be read) and blocks changes. */
  disabled?: boolean;
  /** Visible hint linked with `aria-describedby`, e.g. why the switch is disabled. */
  hint?: string;
};

/** C-07: `role="switch"` with a visible label. */
export function Switch({ id, label, checked, onChange, readOnly = false, disabled = false, hint }: SwitchProps) {
  const locked = readOnly || disabled;
  return (
    <div className="flex items-center gap-2">
      {hint && <span id={`${id}-hint`} className="text-gms-label text-gms-text-secondary">{hint}</span>}
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-readonly={readOnly || undefined}
        aria-disabled={disabled || undefined}
        aria-labelledby={`${id}-label`}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onClick={() => {
          if (!locked) onChange(!checked);
        }}
        className={cx(
          "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-gms-primary" : "bg-gms-text-placeholder",
          locked && "cursor-default opacity-70",
          disabled && "cursor-not-allowed",
          focusRing,
        )}
      >
        <span className={cx("inline-block h-[18px] w-[18px] rounded-full bg-gms-surface transition-transform", checked ? "translate-x-[19px]" : "translate-x-[3px]")} />
      </button>
      <span id={`${id}-label`} className="text-gms-label text-gms-text">{label}</span>
    </div>
  );
}
