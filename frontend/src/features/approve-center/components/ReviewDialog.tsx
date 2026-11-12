"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button, cx, focusRing } from "@/components/ui/button";
import { REVIEW_REASON_MAX, reviewReasonError, reviewText, type ReviewKind } from "../model";

type Props = {
  /** null = closed. */
  target: { kind: ReviewKind; docNo: string } | null;
  pending: boolean;
  /** A server field error (VALIDATION_ERROR on reason / note) or another failure kept in the dialog. */
  error: string | null;
  onCancel: () => void;
  /** Called with the trimmed reason once it passes the client check. */
  onSubmit: (reason: string) => void;
};

/**
 * FE-AP-010 / FE-AS-013 (ADR-0050 Q-AS-32): Reject… and Revise… ask for a required reason (1–500 characters). Native
 * modal `<dialog>` like `ConfirmDialog` (focus trap, Esc = Cancel unless pending); focus starts in the reason field and
 * returns to the trigger on close. The reason is plain text; line breaks are kept.
 */
export function ReviewDialog({ target, pending, error, onCancel, onSubmit }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const bodyId = useId();
  const fieldId = useId();
  const errorId = useId();
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const open = target !== null;
  // A new target starts with an empty field (state adjusted during render, keyed on the target).
  const key = target ? `${target.kind}:${target.docNo}` : null;
  const [shownKey, setShownKey] = useState<string | null>(key);
  if (key !== shownKey) {
    setShownKey(key);
    setReason("");
    setLocalError(null);
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      fieldRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    }
  }, [open]);

  const text = target ? reviewText(target.kind, target.docNo) : null;
  const shownError = localError ?? error;

  function submit() {
    if (!target || pending) return;
    const problem = reviewReasonError(target.kind, reason);
    setLocalError(problem);
    if (problem) {
      fieldRef.current?.focus();
      return;
    }
    onSubmit(reason.trim());
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
      className="m-auto w-[min(640px,calc(100vw-32px))] rounded-gms-xl bg-gms-surface p-0 text-gms-text shadow-gms-overlay backdrop:bg-black/30"
    >
      {text && target && (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <h2 id={titleId} className="border-b border-gms-divider-dialog px-5 py-4 text-gms-heading font-bold">
            {text.title}
          </h2>
          <div className="border-b border-gms-divider-dialog px-5 py-4">
            <p id={bodyId} className="text-gms-body">
              {text.body}
            </p>
            <label htmlFor={fieldId} className="mt-4 block text-gms-label font-medium text-gms-text">
              {text.label} <span aria-hidden className="text-gms-danger">*</span>
            </label>
            <textarea
              ref={fieldRef}
              id={fieldId}
              name={target.kind === "reject" ? "reason" : "note"}
              value={reason}
              required
              rows={4}
              maxLength={REVIEW_REASON_MAX}
              disabled={pending}
              aria-invalid={shownError ? true : undefined}
              aria-describedby={shownError ? errorId : undefined}
              onChange={(event) => {
                setReason(event.target.value);
                if (localError) setLocalError(null);
              }}
              className={cx(
                "mt-1 block w-full resize-y rounded-gms-md border bg-gms-surface px-3 py-2 text-gms-body text-gms-text",
                shownError ? "border-gms-danger" : "border-gms-border",
                focusRing,
              )}
            />
            <div className="mt-1 flex items-start justify-between gap-3 text-gms-label">
              <span id={errorId} role={shownError ? "alert" : undefined} className="text-gms-danger">
                {shownError}
              </span>
              <span className="shrink-0 text-gms-text-secondary tabular-nums">
                {reason.length}/{REVIEW_REASON_MAX}
              </span>
            </div>
          </div>
          <div className="flex justify-end gap-3 px-5 py-3.5">
            <Button variant="secondary" disabled={pending} onClick={onCancel} className="disabled:opacity-100">
              Cancel
            </Button>
            <Button type="submit" variant={target.kind === "reject" ? "danger" : "primary"} loading={pending} loadingLabel={text.pendingLabel} className="min-w-[118px]">
              {text.confirmLabel}
            </Button>
          </div>
        </form>
      )}
    </dialog>
  );
}
