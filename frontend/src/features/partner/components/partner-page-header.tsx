"use client";

import { CopyPlus, FileSpreadsheet, Pencil, Plus, Printer, RotateCw, Trash2 } from "lucide-react";
import type { Ref } from "react";
import { Button, IconButton, cx } from "@/components/ui/button";
import { lowerSingular, type PartnerEntity } from "../entity";

/**
 * Page mode (ADR-0021 §3, same model as User & Permission / ADR-0020):
 * `create` = new draft, `view` = saved record read-only, `edit` = saved record being edited,
 * `none` = nothing selected and no ADD permission.
 */
export type PartnerMode = "create" | "view" | "edit" | "none";

type PartnerPageHeaderProps = {
  entity: PartnerEntity;
  formId: string;
  mode: PartnerMode;
  /** Saved record name shown as the title in view/edit mode (undefined while it loads). */
  recordName: string | undefined;
  total: number | undefined;
  /** A saved record is open and loaded (Print / Duplicate / Edit / Delete). */
  savedLoaded: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** `{entity}:PRINT`; without it the Print button stays visible but disabled (owner 2026-10-17). */
  canPrint: boolean;
  /** The saved record was found deleted on Save: Edit and Save are unavailable for it. */
  gone?: boolean;
  submitting: boolean;
  deleting: boolean;
  refreshing: boolean;
  onPrint: () => void;
  onDuplicate: () => void;
  onRefresh: () => void;
  onCreate: () => void;
  onCancel: () => void;
  onEdit: () => void;
  onDelete: () => void;
  deleteButtonRef?: Ref<HTMLButtonElement>;
};

/** Title: "Add {Entity}" in create mode, the record name in view/edit mode (ADR-0021 §3). */
export function partnerTitle(entity: PartnerEntity, mode: PartnerMode, recordName: string | undefined): string {
  // VIEW-only users land on the Add page with everything disabled (owner 2026-10-17).
  if (mode === "create" || mode === "none") return `Add ${entity.singular}`;
  if ((mode === "view" || mode === "edit") && recordName) return recordName;
  return entity.singular;
}

/** Enabled state of the five header buttons for a mode (ADR-0021 §3; mirrors the User & Permission header). */
export function partnerHeaderButtons(input: {
  mode: PartnerMode;
  savedLoaded: boolean;
  gone: boolean;
  submitting: boolean;
  deleting: boolean;
}): { create: boolean; cancel: boolean; save: boolean; edit: boolean; delete: boolean } {
  const { mode, savedLoaded, gone, submitting, deleting } = input;
  const busy = submitting || deleting;
  const editing = mode === "create" || mode === "edit";
  return {
    create: mode !== "create" && mode !== "edit" && !busy,
    cancel: editing && !submitting,
    save: editing && !deleting && !gone,
    edit: mode === "view" && savedLoaded && !busy && !gone,
    delete: mode === "view" && savedLoaded && !busy,
  };
}

/**
 * Partner C-03 (customer rev 2 / vendor rev 3, ADR-0021 §3): title + "{Entity} List N", the
 * Print / Excel / Duplicate / Refresh icons, then Create / Cancel / Save / Edit / Delete.
 * Create, Edit and Delete are hidden without ADD / EDIT / DELETE (ADR-0016); Cancel and Save
 * are shown when the user can add or edit. Excel is `aria-disabled` with a tooltip.
 */
export function PartnerPageHeader({
  entity,
  formId,
  mode,
  recordName,
  total,
  savedLoaded,
  canAdd,
  canEdit,
  canDelete,
  canPrint,
  gone = false,
  submitting,
  deleting,
  refreshing,
  onPrint,
  onDuplicate,
  onRefresh,
  onCreate,
  onCancel,
  onEdit,
  onDelete,
  deleteButtonRef,
}: PartnerPageHeaderProps) {
  const noun = lowerSingular(entity);
  const enabled = partnerHeaderButtons({ mode, savedLoaded, gone, submitting, deleting });
  return (
    <div className="mb-4 space-y-3 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          <h1 className="min-w-0 break-words text-gms-title font-medium text-gms-text-heading">{partnerTitle(entity, mode, recordName)}</h1>
          <span className="text-gms-body text-gms-text-secondary">{total === undefined ? `${entity.singular} List` : `${entity.singular} List ${total}`}</span>
        </div>
        <div className="flex items-center gap-1">
          <IconButton label={`Print saved ${noun}`} onClick={onPrint} disabled={!savedLoaded || !canPrint}>
            <Printer size={18} aria-hidden />
          </IconButton>
          <IconButton label="Export to Excel" unavailableReason="Excel export isn't available yet">
            <FileSpreadsheet size={18} className="text-gms-excel" aria-hidden />
          </IconButton>
          <span className="w-3" aria-hidden />
          <IconButton label={`Duplicate ${noun}`} onClick={onDuplicate} disabled={!canAdd || !savedLoaded || submitting || deleting}>
            <CopyPlus size={18} aria-hidden />
          </IconButton>
          <IconButton label="Refresh" onClick={onRefresh} aria-busy={refreshing || undefined} disabled={submitting || deleting}>
            <RotateCw size={18} className={cx(refreshing && "animate-spin")} aria-hidden />
          </IconButton>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2.5">
        {/* Every button stays visible; a missing permission only disables it (owner 2026-10-17). */}
        <Button icon={<Plus size={18} aria-hidden />} onClick={onCreate} disabled={!canAdd || !enabled.create} className="h-[38px] min-w-[132px]">
          {`Create ${entity.singular}`}
        </Button>
        <Button onClick={onCancel} disabled={!enabled.cancel} className="h-[38px] min-w-[100px]">
          Cancel
        </Button>
        <Button
          type="submit"
          form={formId}
          variant="primary"
          loading={submitting}
          loadingLabel="Saving..."
          disabled={!enabled.save}
          className="h-[38px] min-w-[100px]"
        >
          Save
        </Button>
        <Button variant="primary" icon={<Pencil size={16} aria-hidden />} onClick={onEdit} disabled={!canEdit || !enabled.edit} className="h-[38px] min-w-[100px]">
          Edit
        </Button>
        <Button
          ref={deleteButtonRef}
          variant="danger"
          icon={<Trash2 size={16} aria-hidden />}
          onClick={onDelete}
          disabled={!canDelete || !enabled.delete}
          className="h-[38px] min-w-[100px]"
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
