"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type DiscardChangesDialogProps = {
  open: boolean;
  /** Name typed or loaded; falls back to "this customer". */
  name: string;
  onKeep: () => void;
  onDiscard: () => void;
};

/** C-17 (FE-CUS-010): "Discard unsaved changes?" Focus starts on "Keep editing"; Esc keeps editing. */
export function DiscardChangesDialog({ open, name, onKeep, onDiscard }: DiscardChangesDialogProps) {
  const subject = name.trim() || "this customer";
  return (
    <ConfirmDialog
      open={open}
      title="Discard unsaved changes?"
      body={`Your changes to ${subject} haven't been saved.`}
      cancelLabel="Keep editing"
      confirmLabel="Discard"
      pendingLabel="Discarding..."
      pending={false}
      onCancel={onKeep}
      onConfirm={onDiscard}
    />
  );
}
