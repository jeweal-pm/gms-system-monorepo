"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { DeletePartnerDialog } from "@/features/partner/components/delete-partner-dialog";
import type { PartnerEntity } from "@/features/partner/entity";
import { mapDeleteError } from "../api";
import { useDeleteVendor, useVendorCache } from "../hooks";

type DeleteVendorDialogProps = {
  entity: PartnerEntity;
  vendor: { id: string; name: string } | null;
  onClose: () => void;
  /** Called after the vendor is deleted, or found to be already gone. */
  onDeleted: (id: string) => void;
};

/**
 * C-12 (FE-VEN-009/011): runs `vendor.delete` behind the shared Partner delete dialog. Failures stay
 * in the dialog; VENDOR_NOT_FOUND closes it with an info toast (error-handling.md).
 */
export function DeleteVendorDialog({ entity, vendor, onClose, onDeleted }: DeleteVendorDialogProps) {
  const toast = useToast();
  const cache = useVendorCache();
  const deletion = useDeleteVendor();
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
    if (!vendor || deletion.isPending) return;
    const { id } = vendor;
    setError(undefined);
    deletion.mutate(
      { id },
      {
        onSuccess: () => finish(id, "success", "Vendor deleted"),
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

  return <DeletePartnerDialog entity={entity} target={vendor} pending={deletion.isPending} error={error} onCancel={close} onConfirm={confirm} />;
}
