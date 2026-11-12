"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button, cx, focusRing } from "@/components/ui/button";
import { useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import { useBaseCurrency, useDocumentPreview } from "../api";
import type { AvailableMenu } from "../menus";
import type { ApprovalRow } from "../model";
import { isStillPending, NO_LONGER_PENDING, PREVIEW_LOAD_ERROR, previewView, submittedLine, type PreviewDetail, type PreviewView } from "../preview";
import { ReviewActions } from "./ApprovalTable";

type Props = {
  menu: AvailableMenu;
  /** The row whose number was clicked; null = closed. */
  row: ApprovalRow | null;
  /** The row's approve is running (confirm open or request in flight). */
  busy: boolean;
  /** The last approve failure for this row, shown above the footer (the modal stays open). */
  error: string | null;
  /** `changed` = the document is no longer waiting, so the list should refresh. */
  onClose: (changed: boolean) => void;
  /** Approve / Reject / Revise with the version this modal loaded (the approver decides on what they saw). */
  onApprove: (detail: PreviewDetail) => void;
  onReject: (detail: PreviewDetail) => void;
  onRevise: (detail: PreviewDetail) => void;
};

/**
 * Approve Center UI rev 2 (FE-AP-013…015, owner 2026-11-10): the document behind a pending row, from `<doc>.get`.
 * Native modal `<dialog>` (focus trap, inert background, Esc); the Approve confirm and the Reject… / Revise… dialogs
 * (FE-AP-010) open above it.
 */
export function DocumentPreviewModal({ menu, row, busy, error, onClose, onApprove, onReject, onRevise }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const subId = useId();
  const open = row !== null;
  const preview = useDocumentPreview(menu, row?.id ?? null);
  const baseCurrency = useBaseCurrency();
  const format = useNumberFormat();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      closeRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    }
  }, [open]);

  const detail = preview.data;
  const pending = detail ? isStillPending(detail) : true;
  const stale = Boolean(detail) && !pending;
  const view = detail && pending ? previewView(menu, detail, baseCurrency, format.pricePlaces) : null;
  const canApprove = Boolean(view && detail) && !busy && !preview.isFetching;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={subId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose(stale);
      }}
      className="m-auto max-h-[90vh] w-[min(1086px,calc(100vw-32px))] overflow-hidden rounded-gms-xl bg-gms-surface p-0 text-gms-text shadow-gms-overlay backdrop:bg-black/40"
    >
      {row && (
        <div className="flex max-h-[90vh] flex-col">
          <header className="relative border-b border-gms-border px-6 pt-6 pb-4">
            <span className="inline-flex h-6 items-center rounded-gms-sm bg-gms-warning-subtle px-2 text-gms-label font-medium text-gms-warning-text">Pending approval</span>
            <h2 id={titleId} className="mt-2 text-gms-heading font-semibold">
              {menu.label}
              <span className="ml-2">{row.docNo}</span>
            </h2>
            <p id={subId} className="mt-1 text-gms-label text-gms-text-secondary">
              {submittedLine(row, new Date())}
            </p>
            <button
              ref={closeRef}
              type="button"
              aria-label="Close"
              disabled={busy}
              onClick={() => onClose(stale)}
              className={cx("absolute top-5 right-5 inline-flex size-9 items-center justify-center rounded-gms-md text-gms-text hover:bg-gms-surface-sunken disabled:opacity-40", focusRing)}
            >
              <X aria-hidden size={22} />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {preview.isPending ? (
              <PreviewSkeleton />
            ) : preview.isError && !detail ? (
              <div role="alert" className="flex flex-col items-center gap-3 py-12 text-center text-gms-body">
                {PREVIEW_LOAD_ERROR(row.docNo)}
                <Button onClick={() => void preview.refetch()}>Try again</Button>
              </div>
            ) : !view ? (
              <p role="status" className="py-12 text-center text-gms-body">
                {NO_LONGER_PENDING(row.docNo)}
              </p>
            ) : (
              <PreviewBody view={view} docNo={row.docNo} format={format} />
            )}
          </div>

          <footer className="border-t border-gms-border px-6 py-4">
            {error && (
              <p role="alert" className="mb-3 text-right text-gms-label text-gms-danger">
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-end gap-[9px]">
              <Button disabled={busy} onClick={() => onClose(stale)} className="min-w-[95px]">
                Close
              </Button>
              {pending && (
                <ReviewActions
                  docNo={row.docNo}
                  revisionCount={detail?.revisionCount ?? row.revisionCount}
                  disabled={!canApprove}
                  busy={busy}
                  onReject={() => detail && onReject(detail)}
                  onRevise={() => detail && onRevise(detail)}
                  onApprove={() => detail && onApprove(detail)}
                />
              )}
            </div>
          </footer>
        </div>
      )}
    </dialog>
  );
}

type Format = ReturnType<typeof useNumberFormat>;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-gms-label text-gms-text-secondary">{label}</dt>
      <dd className="mt-1 truncate text-gms-body">{children}</dd>
    </div>
  );
}

export function PreviewBody({ view, docNo, format }: { view: PreviewView; docNo: string; format: Format }) {
  const th = "h-14 px-4 text-left text-gms-body font-medium whitespace-nowrap";
  const td = "border-t border-gms-border px-4 py-3 align-middle";
  return (
    <>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-[200px_minmax(0,1fr)_minmax(0,1fr)]">
        <Field label="Doc Date">{view.docDate}</Field>
        <Field label={view.partyLabel}>{view.partyName}</Field>
        <Field label="Currency">{view.currency}</Field>
      </dl>

      <div className="mt-5 overflow-x-auto rounded-gms-lg border border-gms-border">
        <table className="w-full border-separate border-spacing-0 text-gms-body">
          <caption className="sr-only">{docNo} lines</caption>
          <thead className="bg-gms-page">
            <tr>
              <th scope="col" className={cx(th, "w-12")}>#</th>
              <th scope="col" className={th}>Stone code</th>
              <th scope="col" className={th}>
                Stone
                {view.orderedBy && <span className="block text-gms-label font-normal text-gms-text-secondary">Ordered by</span>}
              </th>
              <th scope="col" className={cx(th, "text-right")}>Pcs</th>
              <th scope="col" className={cx(th, "text-right")}>Weight</th>
              <th scope="col" className={cx(th, "text-right")}>Value ({view.valueCurrency})</th>
              <th scope="col" className={th}>Location</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((line) => (
              <tr key={line.key}>
                <td className={cx(td, "tabular-nums")}>{line.index}</td>
                <td className={cx(td, "font-semibold whitespace-nowrap")}>{line.code}</td>
                <td className={td}>
                  {line.stone}
                  {line.orderedBy && <span className="block text-gms-label text-gms-text-secondary">{line.orderedBy}</span>}
                </td>
                <td className={cx(td, "text-right tabular-nums")}>{line.pcs}</td>
                <td className={cx(td, "text-right whitespace-nowrap tabular-nums")}>{format.weight(line.weightCt)} cts</td>
                <td className={cx(td, "text-right font-semibold tabular-nums")}>{format.money(line.value)}</td>
                <td className={cx(td, "whitespace-nowrap")}>{line.location}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gms-page font-semibold">
            <tr>
              <td className={td} />
              <td className={td} colSpan={2}>Total</td>
              <td className={cx(td, "text-right tabular-nums")}>{view.totals.pcs}</td>
              <td className={cx(td, "text-right whitespace-nowrap tabular-nums")}>{format.weight(view.totals.weightCt)} cts</td>
              <td className={cx(td, "text-right tabular-nums")}>{format.money(view.totals.value)}</td>
              <td className={td} />
            </tr>
          </tfoot>
        </table>
      </div>
      {view.grandTotal && (
        <p className="mt-2 text-right text-gms-body">
          Grand total <span className="ml-2 font-semibold tabular-nums">{format.money(view.grandTotal)} {view.valueCurrency}</span>
        </p>
      )}

      <h3 className="mt-6 text-gms-heading font-semibold">Document Note</h3>
      <p className={cx("mt-2 text-gms-body whitespace-pre-line", !view.note && "text-gms-text-secondary")}>{view.note || "No note"}</p>
    </>
  );
}

function PreviewSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading document" className="space-y-3">
      <div className="h-10 w-2/3 animate-pulse rounded-gms-sm bg-gms-surface-sunken" />
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="h-12 animate-pulse rounded-gms-sm bg-gms-surface-sunken" />
      ))}
    </div>
  );
}
