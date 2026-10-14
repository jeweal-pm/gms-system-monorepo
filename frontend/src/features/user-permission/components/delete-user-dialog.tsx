"use client";

import { useState } from "react";
import { trpc } from "@/providers/app-providers";
import { mapDeleteError, type UserSummary } from "../api";
import { useDeleteUser } from "../hooks";
import { ConfirmDialog } from "./ui/confirm-dialog";
import { useToast } from "./ui/toast";

type DeleteUserDialogProps = {
  user: UserSummary | null;
  onClose: () => void;
  /** Called after the user is deleted, or found to be already gone. Clears the selection. */
  onDeleted: () => void;
};

/**
 * FE-UP-009 delete confirmation (S4) over `userAdmin.delete` (FE-UP-012).
 * Success: list invalidated, cached detail removed, selection cleared, toast.
 * Failures stay inside the dialog, except USER_NOT_FOUND (already gone).
 * The trigger is not rendered for Super Admin rows (read-only).
 */
export function DeleteUserDialog({ user, onClose, onDeleted }: DeleteUserDialogProps) {
  const toast = useToast();
  const utils = trpc.useUtils();
  const deletion = useDeleteUser();
  const [error, setError] = useState<string | undefined>();

  function close() {
    setError(undefined);
    deletion.reset();
    onClose();
  }

  function finish(id: string, tone: "success" | "info", message: string) {
    toast.show(tone, message);
    close();
    onDeleted();
    void utils.userAdmin.get.reset({ id });
    void utils.userAdmin.list.invalidate();
  }

  function confirm() {
    if (!user || deletion.isPending) return;
    const { id } = user;
    setError(undefined);
    deletion.mutate(
      { id },
      {
        onSuccess: () => finish(id, "success", "User deleted"),
        onError: (cause) => {
          const outcome = mapDeleteError(cause);
          if (outcome.kind === "gone") {
            finish(id, "info", outcome.message);
            return;
          }
          setError(outcome.message);
          if (outcome.recheckAccess) void utils.permission.mine.invalidate();
        },
      },
    );
  }

  return (
    <ConfirmDialog
      open={user !== null}
      title={`Delete ${user?.name ?? "user"}?`}
      body="The account and its permissions will be removed. This can't be undone."
      cancelLabel="Keep user"
      confirmLabel="Delete"
      pendingLabel="Deleting..."
      pending={deletion.isPending}
      error={error}
      onCancel={close}
      onConfirm={confirm}
    />
  );
}
