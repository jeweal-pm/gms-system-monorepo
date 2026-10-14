"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { mapDeleteError } from "../api";
import { useCustomerCache, useDeleteCustomer } from "../hooks";

type DeleteCustomerDialogProps = {
  customer: { id: string; name: string } | null;
  onClose: () => void;
  /** Called after the customer is deleted, or found to be already gone. */
  onDeleted: (id: string) => void;
};

/**
 * C-17 (FE-CUS-012): permanent-delete confirmation. Focus starts on "Keep customer" and
 * returns to the Delete button; Esc is ignored while deleting (ConfirmDialog). Failures stay
 * in the dialog; CUSTOMER_NOT_FOUND closes it with an info toast (error-handling.md).
 */
export function DeleteCustomerDialog({ customer, onClose, onDeleted }: DeleteCustomerDialogProps) {
  const toast = useToast();
  const cache = useCustomerCache();
  const deletion = useDeleteCustomer();
  const [error, setError] = useState<string | undefined>();

  function close() {
    setError(undefined);
    deletion.reset();
    onClose();
  }

  function finish(id: string, tone: "success" | "info", message: string) {
    toast.show(tone, message);
    close();
    onDeleted(id);
    void cache.resetDetail(id);
    void cache.invalidateLists();
  }

  function confirm() {
    if (!customer || deletion.isPending) return;
    const { id } = customer;
    setError(undefined);
    deletion.mutate(
      { id },
      {
        onSuccess: () => finish(id, "success", "Customer deleted"),
        onError: (cause) => {
          const outcome = mapDeleteError(cause);
          if (outcome.kind === "gone") {
            finish(id, "info", outcome.message);
            return;
          }
          setError(outcome.message);
          if (outcome.recheckAccess) void cache.recheckAccess();
        },
      },
    );
  }

  return (
    <ConfirmDialog
      open={customer !== null}
      title={`Delete ${customer?.name ?? "customer"}?`}
      body="The customer and all of its addresses will be permanently deleted. Documents that already use this customer keep their own copy of its name. This can't be undone."
      cancelLabel="Keep customer"
      confirmLabel="Delete"
      pendingLabel="Deleting..."
      pending={deletion.isPending}
      error={error}
      onCancel={close}
      onConfirm={confirm}
    />
  );
}
