"use client";

import type { Ref, TextareaHTMLAttributes } from "react";
import { cx } from "@/components/ui/button";
import { fieldFocusClass, readOnlyControlClass } from "@/components/ui/outlined-field";

type PlainTextFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & {
  id: string;
  /** The section title labels the box (UI revision 3 has no field label). */
  labelledBy: string;
  error?: string;
  ref?: Ref<HTMLTextAreaElement>;
};

/**
 * Company Bank Details (UI revision 3 R3-07, SA-CP-13): a plain multi-line text box with a vertical
 * resize handle. The value is text only; it is never rendered as HTML.
 */
export function PlainTextField({ id, labelledBy, error, readOnly, className, ref, ...props }: PlainTextFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className={className}>
      <textarea
        ref={ref}
        id={id}
        aria-labelledby={labelledBy}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        readOnly={readOnly}
        disabled={readOnly}
        rows={5}
        className={cx(
          "block min-h-[120px] w-full resize-y rounded-gms-md border px-4 py-3 text-gms-body text-gms-text placeholder:text-gms-text-placeholder transition-colors",
          error ? "border-gms-danger bg-gms-danger-subtle" : readOnly ? "border-gms-border bg-gms-field-disabled" : "border-gms-border bg-gms-surface hover:border-gms-text-placeholder",
          readOnly && readOnlyControlClass,
          fieldFocusClass,
        )}
        {...props}
      />
      {error && (
        <p id={errorId} className="mt-1 pl-4 text-gms-label italic text-gms-danger">
          {error}
        </p>
      )}
    </div>
  );
}
