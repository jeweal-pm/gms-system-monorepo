"use client";

import { CopyPlus, FileSpreadsheet, Pencil, Plus, Printer, RotateCw, Trash2 } from "lucide-react";
import type { Ref } from "react";
import { Button, IconButton, cx } from "@/components/ui/button";

export type PageMode = "create" | "view" | "edit";

type PageHeaderProps = {
  formId: string;
  mode: PageMode;
  /** Number of saved users in the list ("User List N"); undefined while loading. */
  total: number | undefined;
  saving: boolean;
  deleting: boolean;
  /** A saved user is open and its details are loaded (Print / Duplicate / Edit). */
  savedLoaded: boolean;
  /** Delete is unavailable for a Super Admin or the signed-in user. */
  deleteBlockedReason: string | null;
  refreshing: boolean;
  onPrint: () => void;
  onDuplicate: () => void;
  onRefresh: () => void;
  onCreateUser: () => void;
  onCancel: () => void;
  onEdit: () => void;
  onDelete: () => void;
  deleteButtonRef?: Ref<HTMLButtonElement>;
};

/**
 * C-03 / C-04 / C-05, UI revision 2 (rev2-02/03, ADR-0020 §4).
 * View mode: Create User / Edit / Delete enabled, Cancel / Save faded.
 * Create or edit mode: Cancel / Save enabled, Create User / Edit / Delete faded.
 */
export function PageHeader({
  formId,
  mode,
  total,
  saving,
  deleting,
  savedLoaded,
  deleteBlockedReason,
  refreshing,
  onPrint,
  onDuplicate,
  onRefresh,
  onCreateUser,
  onCancel,
  onEdit,
  onDelete,
  deleteButtonRef,
}: PageHeaderProps) {
  const editing = mode !== "view";
  const busy = saving || deleting;
  return (
    <div className="mb-4 space-y-3 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          <h1 className="text-2xl font-medium leading-8 text-gms-text-heading">Add User and Permission</h1>
          <span className="text-sm text-gms-text-secondary">{total === undefined ? "User List" : `User List ${total}`}</span>
        </div>
        <div className="flex items-center gap-1">
          <IconButton label="Print saved user" onClick={onPrint} disabled={!savedLoaded || mode !== "view"}>
            <Printer size={18} aria-hidden />
          </IconButton>
          <IconButton label="Export to Excel" unavailableReason="Excel export isn't available yet">
            <FileSpreadsheet size={18} className="text-gms-excel" aria-hidden />
          </IconButton>
          <span className="w-3" aria-hidden />
          <IconButton label="Duplicate user" onClick={onDuplicate} disabled={!savedLoaded || busy}>
            <CopyPlus size={18} aria-hidden />
          </IconButton>
          <IconButton label="Refresh" onClick={onRefresh} aria-busy={refreshing || undefined} disabled={busy}>
            <RotateCw size={18} className={cx(refreshing && "animate-spin")} aria-hidden />
          </IconButton>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2.5">
        <Button icon={<Plus size={18} aria-hidden />} onClick={onCreateUser} disabled={editing || busy} className="h-[38px] min-w-[132px]">
          Create User
        </Button>
        <Button onClick={onCancel} disabled={!editing || saving} className="h-[38px] min-w-[100px]">
          Cancel
        </Button>
        <Button
          type="submit"
          form={formId}
          variant="primary"
          loading={saving}
          loadingLabel="Saving..."
          disabled={!editing || deleting}
          className="h-[38px] min-w-[100px]"
        >
          Save
        </Button>
        <Button
          variant="primary"
          icon={<Pencil size={16} aria-hidden />}
          onClick={onEdit}
          disabled={editing || !savedLoaded || busy}
          className="h-[38px] min-w-[100px]"
        >
          Edit
        </Button>
        <Button
          ref={deleteButtonRef}
          variant="danger"
          icon={<Trash2 size={16} aria-hidden />}
          onClick={onDelete}
          disabled={editing || !savedLoaded || busy || deleteBlockedReason !== null}
          title={!editing && deleteBlockedReason ? deleteBlockedReason : undefined}
          className="h-[38px] min-w-[100px]"
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
