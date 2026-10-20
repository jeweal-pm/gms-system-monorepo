"use client";

import { ChevronDown } from "lucide-react";
import type { Ref, SelectHTMLAttributes } from "react";
import { cx } from "./button";
import { FieldShell, fieldBoxClass, fieldFocusClass, type LabelPosition } from "./outlined-field";

export type SelectOption = { value: string; label: string };

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "children"> & {
  id: string;
  label: string;
  /** Text of the disabled first option shown while no value is chosen. */
  placeholder: string;
  options: readonly SelectOption[];
  error?: string;
  /** Read-only view: rendered like a filled field, but the native select is disabled. */
  readOnly?: boolean;
  /** Options loading state: one disabled "Loading…" option. */
  status?: "loading" | "error" | "ready";
  /** Shown with a Retry action when `status` is "error". */
  loadErrorMessage?: string;
  onRetry?: () => void;
  labelPosition?: LabelPosition;
  ref?: Ref<HTMLSelectElement>;
};

/**
 * Customer C-08: notched outlined field around a native `<select>` (type-to-jump on long
 * lists without a library). Same error / disabled / read-only states as `TextField`.
 */
export function SelectField({
  id,
  label,
  placeholder,
  options,
  error,
  required,
  readOnly = false,
  disabled = false,
  status = "ready",
  loadErrorMessage = "Couldn't load the list.",
  onRetry,
  labelPosition,
  className,
  ref,
  value,
  ...props
}: SelectFieldProps) {
  const empty = value === undefined || value === null || value === "";
  const loading = status === "loading";
  const describedBy = [error ? `${id}-error` : null, status === "error" ? `${id}-load-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <FieldShell id={id} label={label} required={required} error={error} readOnly={readOnly} disabled={disabled} labelPosition={labelPosition} className={className}>
      <div className="relative">
        <select
          ref={ref}
          id={id}
          value={loading ? "" : value}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          aria-readonly={readOnly || undefined}
          aria-busy={loading || undefined}
          disabled={disabled || readOnly}
          className={cx(
            fieldBoxClass({ invalid: Boolean(error) && !disabled, readOnly, disabled }),
            "appearance-none truncate pl-4 pr-11",
            readOnly && "disabled:opacity-100",
            empty || loading ? (disabled ? "text-gms-checkbox-readonly" : "text-gms-text-placeholder") : "",
            !readOnly && !disabled && "cursor-pointer",
            fieldFocusClass,
          )}
          {...props}
        >
          {loading ? (
            <option value="" disabled>
              Loading…
            </option>
          ) : (
            <>
              <option value="" disabled className="bg-gms-surface">
                {placeholder}
              </option>
              {options.map((option) => (
                // The open list keeps a white background while the field itself is red (owner 2026-10-19).
                <option key={option.value} value={option.value} className="bg-gms-surface text-gms-text">
                  {option.label}
                </option>
              ))}
            </>
          )}
        </select>
        {!readOnly && (
          <ChevronDown
            size={20}
            aria-hidden
            className={cx("pointer-events-none absolute right-4 top-1/2 -translate-y-1/2", disabled ? "text-gms-checkbox-readonly" : "text-gms-text")}
          />
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
