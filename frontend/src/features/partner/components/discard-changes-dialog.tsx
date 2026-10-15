"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { lowerSingular, type PartnerEntity } from "../entity";

type DiscardChangesDialogProps = {
  entity: PartnerEntity;
  open: boolean;
  /** Name typed or loaded; falls back to "this {entity}". */
  name: string;
  onKeep: () => void;
  onDiscard: () => void;
};

/** Partner C-12 (customer FE-CUS-010, vendor FE-VEN-009): "Discard unsaved changes?" Focus starts on "Keep editing"; Esc keeps editing. */
export function DiscardChangesDialog({ entity, open, name, onKeep, onDiscard }: DiscardChangesDialogProps) {
  const subject = name.trim() || `this ${lowerSingular(entity)}`;
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
