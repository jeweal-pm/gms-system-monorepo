"use client";

import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import { cx } from "./button";

export function fieldBoxClass({ invalid, readOnly, disabled }: { invalid?: boolean; readOnly?: boolean; disabled?: boolean }) {
  if (disabled) {
    // Disabled (customer C-07, e.g. State/City before a Country): grey fill, grey text, no hover border.
    return "h-[52px] w-full cursor-not-allowed rounded-gms-md border border-gms-border bg-gms-field-disabled text-gms-body text-gms-checkbox-readonly transition-colors";
  }
  // Read-only (a loaded record in view mode, owner 2026-10-16): #F8F8F8 fill, 1 px #EDEDED border,
  // dark value text (disabled keeps grey text).
  return cx(
    "h-[52px] w-full rounded-gms-md border text-gms-body text-gms-text transition-colors",
    invalid ? "border-gms-danger bg-gms-danger-subtle" : readOnly ? "border-gms-border bg-gms-field-disabled" : "border-gms-border bg-gms-surface",
    readOnly ? "cursor-default" : !invalid && "hover:border-gms-text-placeholder",
  );
}

/**
 * Read-only controls are also `disabled` (owner 2026-10-16: not focusable or selectable in view mode)
 * but keep the dark value text: undo the browser's dimmed disabled text (opacity, WebKit text fill).
 */
export const readOnlyControlClass = "cursor-default disabled:opacity-100 disabled:[-webkit-text-fill-color:currentColor]";

export const fieldFocusClass = "outline-none focus:border-gms-primary focus:ring-2 focus:ring-gms-primary/20";
export const fieldFocusWithinClass = "focus-within:border-gms-primary focus-within:ring-2 focus-within:ring-gms-primary/20";

type FieldShellProps = {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  /** Use when the labelled control is not a native input (combobox). */
  labelAsText?: boolean;
  /** Field state, so the label's lower half matches the field fill. */
  readOnly?: boolean;
  disabled?: boolean;
  /**
   * `notch` (default): the label sits across the top border. `above`: the label sits above the field
   * with no background at all (company profile, owner 2026-10-16) and reserves its own 22 px, so the
   * grid gap between rows stays intact.
   */
  labelPosition?: LabelPosition;
  children: ReactNode;
  className?: string;
};

export type LabelPosition = "notch" | "above";

/**
 * The label sits across the top border: its upper half is transparent (the card or panel behind
 * shows through, owner 2026-10-16), the lower half from 6 px uses the field fill so the border line
 * does not cross the text.
 */
function labelBackground({ invalid, readOnly, disabled }: { invalid: boolean; readOnly?: boolean; disabled?: boolean }) {
  if (disabled || readOnly) return "bg-[linear-gradient(to_bottom,transparent_6px,var(--color-gms-field-disabled)_6px)]";
  if (invalid) return "bg-[linear-gradient(to_bottom,transparent_6px,var(--color-gms-danger-subtle)_6px)]";
  return "bg-[linear-gradient(to_bottom,transparent_6px,var(--color-gms-surface)_6px)]";
}

/**
 * C-09 notched outline: the label sits on the top border. The required "*"
 * is visual; controls also set aria-required. Errors render below in italics.
 */
export function FieldShell({ id, label, required, error, labelAsText, readOnly, disabled, labelPosition = "notch", children, className }: FieldShellProps) {
  const labelClass = cx(
    "absolute z-[1] text-gms-label font-semibold leading-4",
    labelPosition === "above" ? "top-0 left-1" : cx("-top-2 left-3 px-1", labelBackground({ invalid: Boolean(error), readOnly, disabled })),
    error ? "text-gms-danger" : "text-gms-text",
  );
  const labelContent = (
    <>
      {label}
      {required && <span aria-hidden className="ml-0.5 text-gms-danger">*</span>}
    </>
  );
  return (
    <div className={cx("relative", labelPosition === "above" && "pt-[22px]", className)}>
      {labelAsText ? (
        <span id={`${id}-label`} className={labelClass}>{labelContent}</span>
      ) : (
        <label id={`${id}-label`} htmlFor={id} className={labelClass}>{labelContent}</label>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1 pl-4 text-gms-label italic text-gms-danger">
          {error}
        </p>
      )}
    </div>
  );
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  id: string;
  label: string;
  error?: string;
  labelPosition?: LabelPosition;
  /** Decorative icon at the right edge (e.g. a chevron on a free-text field styled as a dropdown); hidden in read-only view. */
  endIcon?: ReactNode;
  ref?: Ref<HTMLInputElement>;
};

/** C-09 / C-10 OutlinedTextField (also used for the password field). */
export function TextField({ id, label, error, required, readOnly, disabled, labelPosition, endIcon, className, ref, ...props }: TextFieldProps) {
  const showEndIcon = Boolean(endIcon) && !readOnly;
  const input = (
    <input
      ref={ref}
      id={id}
      aria-required={required || undefined}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      readOnly={readOnly}
      disabled={disabled || readOnly}
      className={cx(
        fieldBoxClass({ invalid: Boolean(error) && !disabled, readOnly, disabled }),
        showEndIcon ? "pl-4 pr-11" : "px-4",
        readOnly && !disabled && readOnlyControlClass,
        disabled ? "placeholder:text-gms-checkbox-readonly" : "placeholder:text-gms-text-placeholder",
        fieldFocusClass,
      )}
      {...props}
    />
  );
  return (
    <FieldShell id={id} label={label} required={required} error={error} readOnly={readOnly} disabled={disabled} labelPosition={labelPosition} className={className}>
      {showEndIcon ? (
        <div className="relative">
          {input}
          <span aria-hidden className={cx("pointer-events-none absolute right-4 top-1/2 -translate-y-1/2", disabled ? "text-gms-checkbox-readonly" : "text-gms-text")}>
            {endIcon}
          </span>
        </div>
      ) : (
        input
      )}
    </FieldShell>
  );
}
