"use client";

import { Copy, FileSpreadsheet, Pencil, Plus, Printer, RefreshCw, ScanLine, Trash2 } from "lucide-react";
import Link from "next/link";
import { Button, cx, IconButton } from "../ui";

export type HeaderActions = {
  onCancel: () => void;
  onSave: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRefresh: () => void;
};

export function QuotationHeader({
  docNo,
  isPreview,
  mode,
  saving,
  canEdit,
  canDelete,
  actions,
}: {
  docNo: string;
  isPreview: boolean;
  mode: "view" | "edit";
  saving: boolean;
  canEdit: boolean;
  canDelete: boolean;
  actions: HeaderActions;
}) {
  const editing = mode === "edit";
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 px-6 pt-6 pb-2">
      <div>
        <p className="text-xs text-[#6B7480]">Quotation No.:</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className={cx("text-[28px] leading-none font-medium", isPreview ? "text-[#6B7480]" : "text-[#1C252E]")}>
            {docNo}
          </h1>
          {/* TODO: scan barcode / เปิดเอกสารจากเลข */}
          <IconButton label="Scan" className="bg-[#F6F7F8]">
            <ScanLine className="size-4" />
          </IconButton>
        </div>
      </div>

      <div className="flex flex-col items-end gap-3">
        <div className="flex items-center gap-1">
          {/* Print / Excel ยังไม่มี implementation */}
          <IconButton label="Print" disabled={isPreview}>
            <Printer className="size-4" />
          </IconButton>
          <IconButton label="Export Excel" disabled={isPreview} className="text-[#1D6F42]">
            <FileSpreadsheet className="size-4" />
          </IconButton>
          <IconButton label="Duplicate" disabled={isPreview} onClick={actions.onDuplicate}>
            <Copy className="size-4" />
          </IconButton>
          <IconButton label="Refresh" disabled={isPreview} onClick={actions.onRefresh}>
            <RefreshCw className="size-4" />
          </IconButton>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/pre-sale/quotation"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#E3E6EA] px-4 text-sm text-[#6B7480] hover:bg-[#F6F7F8]"
          >
            <Plus className="size-4" /> Create New
          </Link>
          <Button onClick={actions.onCancel} disabled={!editing || saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={actions.onSave} disabled={!editing || saving} className="min-w-24">
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button variant="primary" onClick={actions.onEdit} disabled={editing || !canEdit} className="min-w-24">
            <Pencil className="size-4" /> Edit
          </Button>
          <Button variant="danger" onClick={actions.onDelete} disabled={!canDelete || saving} className="min-w-24">
            <Trash2 className="size-4" /> Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
