"use client";

import { CopyPlus, FileSpreadsheet, Plus, Printer, RotateCw } from "lucide-react";
import { Button, IconButton, cx } from "@/components/ui/button";

type PageHeaderProps = {
  formId: string;
  mode: "draft" | "view";
  creating: boolean;
  duplicateDisabled: boolean;
  refreshing: boolean;
  onPrint: () => void;
  onExport: () => void;
  onDuplicate: () => void;
  onRefresh: () => void;
  onNewUser: () => void;
};

/** C-03 / C-04 / C-05: title, subtitle and toolbar (S1-S3, S5). */
export function PageHeader({ formId, mode, creating, duplicateDisabled, refreshing, onPrint, onExport, onDuplicate, onRefresh, onNewUser }: PageHeaderProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 className="text-2xl font-medium leading-8 text-gms-text-heading">Add User and Permission</h1>
        {/* Literal source text; whether it is real UI copy is Q-UP-18. */}
        <span className="text-sm text-gms-text-secondary">User list 1</span>
      </div>
      <div className="flex items-center gap-1">
        <IconButton label="Print" onClick={onPrint}>
          <Printer size={18} aria-hidden />
        </IconButton>
        <IconButton label="Export to Excel" onClick={onExport}>
          <FileSpreadsheet size={18} className="text-gms-excel" aria-hidden />
        </IconButton>
        <IconButton label="Duplicate user" onClick={onDuplicate} disabled={duplicateDisabled}>
          <CopyPlus size={18} aria-hidden />
        </IconButton>
        <IconButton label="Refresh" onClick={onRefresh} aria-busy={refreshing || undefined}>
          <RotateCw size={18} className={cx(refreshing && "animate-spin")} aria-hidden />
        </IconButton>
        {mode === "draft" ? (
          <Button
            type="submit"
            form={formId}
            variant="primary"
            loading={creating}
            loadingLabel="Creating..."
            icon={<Plus size={18} aria-hidden />}
            className="ml-3 min-w-[152px]"
          >
            Create User
          </Button>
        ) : (
          <Button variant="primary" onClick={onNewUser} icon={<Plus size={18} aria-hidden />} className="ml-3 min-w-[152px]">
            Create User
          </Button>
        )}
      </div>
    </div>
  );
}
