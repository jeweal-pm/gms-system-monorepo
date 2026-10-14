"use client";

import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import { cx } from "./button";

export function fieldBoxClass({ invalid, readOnly }: { invalid?: boolean; readOnly?: boolean }) {
  return cx(
    "h-[52px] w-full rounded-gms-md border text-base text-gms-text transition-colors",
    invalid ? "border-gms-danger bg-gms-danger-subtle" : "border-gms-border bg-gms-surface",
    readOnly ? "cursor-default" : !invalid && "hover:border-gms-text-placeholder",
  );
}

export const fieldFocusClass = "outline-none focus:border-gms-primary focus:ring-2 focus:ring-gms-primary/20";
export const fieldFocusWithinClass = "focus-within:border-gms-primary focus-within:ring-2 focus-within:ring-gms-primary/20";

type FieldShellProps = {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  /** Use when the labelled control is not a native input (combobox). */
  labelAsText?: boolean;
  children: ReactNode;
  className?: string;
};

/**
 * C-09 notched outline: the label sits on the top border. The required "*"
 * is visual; controls also set aria-required. Errors render below in italics.
 */
export function FieldShell({ id, label, required, error, labelAsText, children, className }: FieldShellProps) {
  const labelClass = cx(
    "absolute -top-2 left-3 z-10 bg-gms-surface px-1 text-xs font-semibold leading-4",
    error ? "text-gms-danger" : "text-gms-text",
  );
  const labelContent = (
    <>
      {label}
      {required && <span aria-hidden className="ml-0.5 text-gms-danger">*</span>}
    </>
  );
  return (
    <div className={cx("relative", className)}>
      {labelAsText ? (
        <span id={`${id}-label`} className={labelClass}>{labelContent}</span>
      ) : (
        <label id={`${id}-label`} htmlFor={id} className={labelClass}>{labelContent}</label>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1 pl-4 text-[13px] italic leading-[18px] text-gms-danger">
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
  ref?: Ref<HTMLInputElement>;
};

/** C-09 / C-10 OutlinedTextField (also used for the password field). */
export function TextField({ id, label, error, required, readOnly, className, ref, ...props }: TextFieldProps) {
  return (
    <FieldShell id={id} label={label} required={required} error={error} className={className}>
      <input
        ref={ref}
        id={id}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        readOnly={readOnly}
        className={cx(fieldBoxClass({ invalid: Boolean(error), readOnly }), "px-4 placeholder:text-gms-text-placeholder", fieldFocusClass)}
        {...props}
      />
    </FieldShell>
  );
}
