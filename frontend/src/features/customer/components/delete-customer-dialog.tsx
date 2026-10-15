"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { DeletePartnerDialog } from "@/features/partner/components/delete-partner-dialog";
import type { PartnerEntity } from "@/features/partner/entity";
import { mapDeleteError } from "../api";
import { useCustomerCache, useDeleteCustomer } from "../hooks";

type DeleteCustomerDialogProps = {
  entity: PartnerEntity;
  customer: { id: string; name: string } | null;
  onClose: () => void;
  /** Called after the customer is deleted, or found to be already gone. */
  onDeleted: (id: string) => void;
};

/**
 * C-17 (FE-CUS-012): runs `customer.delete` behind the shared Partner delete dialog
 * (vendor FE-VEN-001). Failures stay in the dialog; CUSTOMER_NOT_FOUND closes it with an
 * info toast (error-handling.md).
 */
export function DeleteCustomerDialog({ entity, customer, onClose, onDeleted }: DeleteCustomerDialogProps) {
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

  return <DeletePartnerDialog entity={entity} target={customer} pending={deletion.isPending} error={error} onCancel={close} onConfirm={confirm} />;
}
