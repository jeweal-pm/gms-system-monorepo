"use client";

import { Copy, FileSpreadsheet, Pencil, Plus, Printer, RefreshCw, ScanLine, Trash2 } from "lucide-react";
import Link from "next/link";
import type { QuotationStatus } from "../../schema";
import { Button, cx, IconButton } from "../ui";

export type HeaderActions = {
  onCancel: () => void;
  onSave: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRefresh: () => void;
};

/** No approval step (owner 2026-10-27): a saved quotation shows no status badge; only rejected/cancelled rows do. */
export type StatusLabels = Partial<Record<QuotationStatus, { label: string; tone: string }>>;

const STATUS_LABEL: StatusLabels = {
  REJECTED: { label: "Rejected", tone: "bg-[#FDECEC] text-[#B42318]" },
  CANCELLED: { label: "Cancelled", tone: "bg-[#EEF0F2] text-[#6B7480] line-through" },
};

export function QuotationHeader({
  docNo,
  isPreview,
  status,
  statusReason,
  mode,
  saving,
  canSave,
  canCreate,
  canEdit,
  canDelete,
  actions,
  title = "Quotation No.:",
  createHref = "/pre-sale/quotation",
  statusLabels = STATUS_LABEL,
}: {
  docNo: string;
  isPreview: boolean;
  /** Undefined for a new, unsaved quotation. */
  status?: QuotationStatus;
  statusReason?: string;
  mode: "view" | "edit";
  saving: boolean;
  canSave: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  actions: HeaderActions;
  /** Reused by Memo Receive (ADR-0033 D5); the defaults are the Quotation page. */
  title?: string;
  createHref?: string;
  statusLabels?: StatusLabels;
}) {
  const editing = mode === "edit";
  const badge = status ? statusLabels[status] : undefined;
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 px-6 pt-6 pb-2">
      <div>
        <p className="text-xs text-[#6B7480]">{title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className={cx("text-[28px] leading-none font-medium", isPreview ? "text-[#6B7480]" : "text-[#1C252E]")}>
            {docNo}
          </h1>
          {badge && <span className={cx("rounded-full px-3 py-1 text-xs font-medium", badge.tone)}>{badge.label}</span>}
          {/* TODO: scan barcode / เปิดเอกสารจากเลข */}
          <IconButton label="Scan" className="bg-[#F6F7F8]">
            <ScanLine className="size-4" />
          </IconButton>
        </div>
        {isPreview && <p className="mt-1 text-xs text-[#6B7480]">Number preview — the number is issued when you save.</p>}
        {statusReason && (status === "REJECTED" || status === "CANCELLED") && (
          <p className="mt-1 max-w-xl text-xs break-words text-[#B42318]">Reason: {statusReason}</p>
        )}
      </div>

      <div className="flex flex-col items-end gap-3">
        <div className="flex items-center gap-1">
          {/* Print / Excel ยังไม่มี implementation */}
          <IconButton label="Print" disabled>
            <Printer className="size-4" />
          </IconButton>
          <IconButton label="Export Excel" disabled className="text-[#1D6F42]">
            <FileSpreadsheet className="size-4" />
          </IconButton>
          <IconButton label="Duplicate" disabled={isPreview || !canCreate} onClick={actions.onDuplicate}>
            <Copy className="size-4" />
          </IconButton>
          <IconButton label="Refresh" disabled={isPreview || saving} onClick={actions.onRefresh}>
            <RefreshCw className="size-4" />
          </IconButton>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canCreate && (
            <Link
              href={createHref}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#E3E6EA] px-4 text-sm text-[#6B7480] hover:bg-[#F6F7F8]"
            >
              <Plus className="size-4" /> Create New
            </Link>
          )}
          <Button onClick={actions.onCancel} disabled={!editing || saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={actions.onSave} disabled={!editing || saving || !canSave} className="min-w-24">
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button variant="primary" onClick={actions.onEdit} disabled={editing || !canEdit} className="min-w-24">
            <Pencil className="size-4" /> Edit
          </Button>
          <Button variant="danger" onClick={actions.onDelete} disabled={editing || !canDelete || saving} className="min-w-24">
            <Trash2 className="size-4" /> Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
