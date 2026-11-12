"use client";

import { Copy, FileSpreadsheet, Pencil, Plus, Printer, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { ScanIcon } from "@/components/ui/scan-icon";
import type { ReactNode } from "react";
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

const NOTE_TONE = { warning: "text-[#B45309]", danger: "text-[#B42318]", muted: "text-[#6B7480]" } as const;
/**
 * Owner 2026-11-10 (design "Status: ● Draft"): every transaction header shows its status beside the number. A new,
 * unsaved document is a Draft. The page's `statusLabels` may rename a status; the dot color is per status.
 */
const DEFAULT_STATUS_TEXT: Record<QuotationStatus, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending Approval",
  APPROVED: "Approved",
  REVISION_REQUESTED: "Revise",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};
const STATUS_DOT: Record<QuotationStatus, string> = {
  DRAFT: "bg-[#ADB1B4]",
  PENDING_APPROVAL: "bg-[#FFAB00]",
  APPROVED: "bg-[#22C55E]",
  REVISION_REQUESTED: "bg-[#FFAB00]",
  REJECTED: "bg-[#DF1016]",
  CANCELLED: "bg-[#6B7480]",
};

export function statusChipText(status: QuotationStatus | undefined, labels: StatusLabels): { label: string; dot: string } {
  const shown = status ?? "DRAFT";
  return { label: labels[shown]?.label ?? DEFAULT_STATUS_TEXT[shown], dot: STATUS_DOT[shown] };
}

export function StatusChip({ status, labels }: { status: QuotationStatus | undefined; labels: StatusLabels }) {
  const chip = statusChipText(status, labels);
  return (
    <span data-status={status ?? "DRAFT"} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#F2F3F4] px-3 text-sm text-[#1C252E]">
      Status:
      <span aria-hidden className={cx("size-2.5 rounded-full", chip.dot)} />
      {chip.label}
    </span>
  );
}

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
  noLabel = "Quotation No.:",
  newHref = "/pre-sale/quotation",
  previewNote = "Number preview — the number is issued when you save.",
  statusLabels = STATUS_LABEL,
  extraActions,
  hideEditDelete = false,
  hideDelete = false,
  statusNote,
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
  /** Label above the number, Create New target, the note under a preview number and status badges (memo documents reuse this header). */
  noLabel?: string;
  newHref?: string;
  previewNote?: string;
  statusLabels?: StatusLabels;
  /** Extra buttons after Delete (Memo Receive's Approve, rev 3). Quotation passes none. */
  extraActions?: ReactNode;
  /** Hides Edit and Delete (a read-only Approved Memo Receive, rev 3). Quotation keeps both. */
  hideEditDelete?: boolean;
  /** Hides only Delete (a Quotation past approval can't be deleted, transaction-soft-delete OQ-1). */
  hideDelete?: boolean;
  /** approval-setup FE-AS-010: the Revise / Reject reason or why the document is read-only, under the badge. */
  statusNote?: { text: string; tone: "warning" | "danger" | "muted" } | null;
}) {
  const editing = mode === "edit";
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 px-6 pt-6 pb-2">
      <div>
        <p className="text-xs text-[#6B7480]">{noLabel}</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          {/* Owner 2026-11-10: the transaction number is 24 px, #1C252E, on every transaction page. */}
          <h1 className="text-[24px] leading-8 font-semibold text-[#1C252E]">{docNo}</h1>
          {/* TODO: scan barcode / เปิดเอกสารจากเลข */}
          <IconButton label="Scan" className="bg-[#F6F7F8]">
            <ScanIcon />
          </IconButton>
          <StatusChip status={status} labels={statusLabels} />
        </div>
        {isPreview && <p className="mt-1 text-xs text-[#6B7480]">{previewNote}</p>}
        {statusNote && (
          <p className={cx("mt-1 max-w-xl text-xs break-words", NOTE_TONE[statusNote.tone])}>{statusNote.text}</p>
        )}
        {!statusNote && statusReason && (status === "REJECTED" || status === "CANCELLED") && (
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
              href={newHref}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#E3E6EA] px-4 text-sm text-[#6B7480] hover:bg-[#F6F7F8]"
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
          {!hideEditDelete && (
            <>
              <Button variant="primary" onClick={actions.onEdit} disabled={editing || !canEdit} className="min-w-24">
                <Pencil className="size-4" /> Edit
              </Button>
              {!hideDelete && (
                <Button variant="danger" onClick={actions.onDelete} disabled={editing || !canDelete || saving} className="min-w-24">
                  <Trash2 className="size-4" /> Delete
                </Button>
              )}
            </>
          )}
          {extraActions}
        </div>
      </div>
    </div>
  );
}
