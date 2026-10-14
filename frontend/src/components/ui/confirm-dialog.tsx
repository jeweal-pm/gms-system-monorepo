"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "./button";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  body: string;
  cancelLabel: string;
  confirmLabel: string;
  pendingLabel: string;
  pending: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * C-19: native modal <dialog> (showModal handles the focus trap and inert
 * background). Focus starts on the safe action, Esc maps to cancel except
 * while pending, and focus returns to the trigger on close.
 */
export function ConfirmDialog({ open, title, body, cancelLabel, confirmLabel, pendingLabel, pending, error, onCancel, onConfirm }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    }
  }, [open]);

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
      <h2 id={titleId} className="border-b border-gms-divider-dialog px-5 py-4 text-xl font-bold leading-7">{title}</h2>
      <div className="border-b border-gms-divider-dialog px-5 py-4">
        <p id={bodyId} className="text-base leading-6">{body}</p>
        {error && <p role="alert" className="mt-3 text-sm text-gms-danger">{error}</p>}
      </div>
      <div className="flex justify-end gap-3 px-5 py-3.5">
        <Button ref={cancelRef} variant="secondary" disabled={pending} onClick={onCancel} className="disabled:opacity-100">
          {cancelLabel}
        </Button>
        <Button variant="danger" loading={pending} loadingLabel={pendingLabel} onClick={onConfirm} className="min-w-[118px]">
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
