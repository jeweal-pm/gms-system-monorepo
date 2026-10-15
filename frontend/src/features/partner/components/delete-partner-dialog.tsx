"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { lowerSingular, type PartnerEntity } from "../entity";

type DeletePartnerDialogProps = {
  entity: PartnerEntity;
  target: { id: string; name: string } | null;
  pending: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Partner C-12 (customer FE-CUS-012, vendor FE-VEN-009): permanent-delete confirmation. Focus
 * starts on "Keep {entity}" and returns to the Delete button; Esc is ignored while deleting
 * (ConfirmDialog). The entity feature runs the mutation and maps its errors.
 */
export function DeletePartnerDialog({ entity, target, pending, error, onCancel, onConfirm }: DeletePartnerDialogProps) {
  const noun = lowerSingular(entity);
  return (
    <ConfirmDialog
      open={target !== null}
      title={`Delete ${target?.name ?? noun}?`}
      body={`The ${noun} and all of its addresses will be permanently deleted. Documents that already use this ${noun} keep their own copy of its name. This can't be undone.`}
      cancelLabel={`Keep ${noun}`}
      confirmLabel="Delete"
      pendingLabel="Deleting..."
      pending={pending}
      error={error}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
