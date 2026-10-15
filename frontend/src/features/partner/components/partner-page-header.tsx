"use client";

import { CopyPlus, FileSpreadsheet, Plus, Printer, RotateCw, Save, Trash2 } from "lucide-react";
import type { Ref } from "react";
import { Button, IconButton, cx } from "@/components/ui/button";
import { lowerSingular, type PartnerEntity } from "../entity";

export type PartnerMode = "draft" | "edit" | "view" | "none";

type PartnerPageHeaderProps = {
  entity: PartnerEntity;
  formId: string;
  mode: PartnerMode;
  total: number | undefined;
  /** A saved record is open and loaded (Print / Duplicate). */
  savedLoaded: boolean;
  canAdd: boolean;
  canDelete: boolean;
  submitting: boolean;
  deleting: boolean;
  refreshing: boolean;
  onPrint: () => void;
  onDuplicate: () => void;
  onRefresh: () => void;
  onDelete: () => void;
  deleteButtonRef?: Ref<HTMLButtonElement>;
};

function title(entity: PartnerEntity, mode: PartnerMode): string {
  if (mode === "draft") return `Add ${entity.singular}`;
  if (mode === "edit") return `Edit ${entity.singular}`; // Q-CUS-03 default
  return entity.singular; // VIEW only / nothing selected
}

/**
 * Partner C-03 (customer FE-CUS-005, vendor FE-VEN-004): title per mode, "{Entity} list {total}"
 * and the toolbar. Buttons the user may not use are hidden; Excel is the only `aria-disabled`
 * button. Delete sits between Refresh and the primary button (Q-CUS-02).
 */
export function PartnerPageHeader({
  entity,
  formId,
  mode,
  total,
  savedLoaded,
  canAdd,
  canDelete,
  submitting,
  deleting,
  refreshing,
  onPrint,
  onDuplicate,
  onRefresh,
  onDelete,
  deleteButtonRef,
}: PartnerPageHeaderProps) {
  const saved = mode === "edit" || mode === "view";
  const noun = lowerSingular(entity);
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 print:hidden">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
        <h1 className="text-2xl font-medium leading-8 text-gms-text-heading">{title(entity, mode)}</h1>
        <span className="text-sm text-gms-text-secondary">{total === undefined ? `${entity.singular} list` : `${entity.singular} list ${total}`}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <IconButton label={`Print saved ${noun}`} onClick={onPrint} disabled={!savedLoaded}>
          <Printer size={18} aria-hidden />
        </IconButton>
        <IconButton label="Export to Excel" unavailableReason="Excel export isn't available yet">
          <FileSpreadsheet size={18} className="text-gms-excel" aria-hidden />
        </IconButton>
        <span className="w-3" aria-hidden />
        {canAdd && (
          <IconButton label={`Duplicate ${noun}`} onClick={onDuplicate} disabled={!savedLoaded || submitting || deleting}>
            <CopyPlus size={18} aria-hidden />
          </IconButton>
        )}
        <IconButton label="Refresh" onClick={onRefresh} aria-busy={refreshing || undefined} disabled={submitting || deleting}>
          <RotateCw size={18} className={cx(refreshing && "animate-spin")} aria-hidden />
        </IconButton>
        {saved && canDelete && (
          <Button ref={deleteButtonRef} variant="danger" icon={<Trash2 size={16} aria-hidden />} onClick={onDelete} disabled={submitting || deleting} className="ml-2">
            Delete
          </Button>
        )}
        {mode === "draft" && (
          <Button
            type="submit"
            form={formId}
            variant="primary"
            loading={submitting}
            loadingLabel="Creating..."
            icon={<Plus size={18} aria-hidden />}
            className="ml-3 min-w-[170px]"
          >
            {`Create ${entity.singular}`}
          </Button>
        )}
        {mode === "edit" && (
          <Button
            type="submit"
            form={formId}
            variant="primary"
            loading={submitting}
            loadingLabel="Saving..."
            icon={<Save size={18} aria-hidden />}
            className="ml-3 min-w-[120px]"
            disabled={deleting}
          >
            Save
          </Button>
        )}
      </div>
    </div>
  );
}
