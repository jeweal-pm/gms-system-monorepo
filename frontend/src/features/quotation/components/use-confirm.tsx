"use client";

import { useCallback, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export type ConfirmRequest = { title: string; body: string; cancelLabel: string; confirmLabel: string };

export const DISCARD_CHANGES_CONFIRM: ConfirmRequest = {
  title: "Discard unsaved changes?",
  body: "Your changes to this document haven't been saved.",
  cancelLabel: "Keep editing",
  confirmLabel: "Discard",
};

export function deleteDocumentConfirm(docNo: string | undefined): ConfirmRequest {
  return {
    title: docNo ? `Delete ${docNo}?` : "Delete this document?",
    body: "The document will be permanently deleted. This can't be undone.",
    cancelLabel: "Keep document",
    confirmLabel: "Delete",
  };
}

/**
 * Transaction pages ask through the app's ConfirmDialog instead of `window.confirm` (owner 2026-11-04):
 * `await confirm(request)` is true only when the person picks the confirm button; render `dialog` once.
 */
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback(
    (next: ConfirmRequest) =>
      new Promise<boolean>((resolve) => {
        resolveRef.current?.(false);
        resolveRef.current = resolve;
        setRequest(next);
      }),
    [],
  );

  const settle = (ok: boolean) => {
    resolveRef.current?.(ok);
    resolveRef.current = null;
    setRequest(null);
  };

  const dialog = (
    <ConfirmDialog
      open={request !== null}
      title={request?.title ?? ""}
      body={request?.body ?? ""}
      cancelLabel={request?.cancelLabel ?? "Cancel"}
      confirmLabel={request?.confirmLabel ?? "OK"}
      pendingLabel=""
      pending={false}
      onCancel={() => settle(false)}
      onConfirm={() => settle(true)}
    />
  );

  return { confirm, dialog };
}
