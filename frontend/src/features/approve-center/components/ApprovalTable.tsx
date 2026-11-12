"use client";

import { Inbox, Info, LoaderCircle } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cx, focusRing } from "@/components/ui/button";
import { TriStateCheckbox } from "@/components/ui/checkbox";
import { SortIcon } from "@/components/ui/sort-icon";
import { useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import type { ApproveMenu, AvailableMenu } from "../menus";
import {
  ariaSort,
  canRevise,
  detailSubLine,
  headerCheckState,
  RESUBMITTED_TEXT,
  REVISE_LIMIT_REASON,
  shortDate,
  submittedTime,
  submitterText,
  type ApprovalRow,
  type SortKey,
  type SortState,
} from "../model";

/** C-AP-06 column set (source 02 widths as min-widths; Detail takes the rest). */
const COLUMNS: { key: string; label: string; sort?: SortKey; className: string; align?: "right" }[] = [
  { key: "select", label: "", className: "w-12" },
  { key: "index", label: "#", className: "w-10" },
  { key: "document", label: "Document", sort: "document", className: "min-w-[124px]" },
  { key: "detail", label: "Detail", sort: "detail", className: "min-w-[200px] w-full" },
  { key: "qty", label: "Qty", sort: "qty", className: "min-w-[120px]", align: "right" },
  { key: "value", label: "Value", sort: "value", className: "min-w-[200px]", align: "right" },
  { key: "submitted", label: "Submitted", sort: "submitted", className: "min-w-[145px]" },
  { key: "status", label: "Status", className: "min-w-[130px]" },
  { key: "action", label: "Action", className: "min-w-[320px] sticky right-0" },
];

const th = "h-[55px] border-b-2 border-gms-border bg-gms-page px-3 text-left text-gms-body font-semibold whitespace-nowrap text-gms-text";

export function TableHead({ sort, onSort, selectAll }: { sort?: SortState; onSort?: (key: SortKey) => void; selectAll?: ReactNode }) {
  return (
    <thead className="sticky top-0 z-10">
      <tr>
        {COLUMNS.map((column) => {
          const sortable = Boolean(column.sort && sort && onSort);
          return (
            <th
              key={column.key}
              scope="col"
              aria-sort={sortable && column.sort && sort ? ariaSort(sort, column.sort) : undefined}
              className={cx(th, column.className, column.align === "right" && "text-right")}
            >
              {column.key === "select" ? (
                selectAll
              ) : sortable && column.sort ? (
                <button
                  type="button"
                  onClick={() => column.sort && onSort?.(column.sort)}
                  className={cx("inline-flex items-center gap-1.5 rounded-gms-sm", column.align === "right" && "flex-row-reverse", focusRing)}
                >
                  {column.label}
                  <SortIcon direction={sort?.key === column.sort ? sort.dir : undefined} />
                </button>
              ) : (
                column.label
              )}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

/**
 * C-AP-13 disabled state: #F8F8F8 / #A9A9A9, no border, 14 px info icon (#DF1016) at the top right; `aria-disabled`
 * keeps it focusable so the tooltip is reachable by keyboard (FE-AP-007).
 */
export function UnavailableAction({ label, reason }: { label: string; reason: string }) {
  const tipId = useId();
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-disabled="true"
        aria-describedby={tipId}
        onClick={(event) => event.preventDefault()}
        className={cx("inline-flex h-9 min-w-[95px] cursor-not-allowed items-center justify-center rounded-gms-md bg-gms-field-disabled px-4 text-gms-body font-medium text-gms-checkbox-readonly", focusRing)}
      >
        {label}
      </button>
      <Info aria-hidden size={14} className="pointer-events-none absolute -top-1.5 -right-1.5 rounded-full bg-gms-surface text-gms-danger" />
      <span
        id={tipId}
        role="tooltip"
        className="pointer-events-none absolute right-0 bottom-full z-30 mb-1 hidden whitespace-nowrap rounded-gms-sm bg-gms-text px-2 py-1 text-gms-label text-gms-on-primary group-focus-within:block group-hover:block"
      >
        {reason}
      </span>
    </span>
  );
}

export type RowError = { message: string; link: boolean };

const actionBase = "inline-flex h-9 min-w-[95px] items-center justify-center gap-2 rounded-gms-md px-4 text-gms-body font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const actionClass = {
  reject: cx(actionBase, "border border-gms-danger bg-gms-surface text-gms-danger hover:bg-gms-danger-subtle", focusRing),
  revise: cx(actionBase, "border border-gms-warning-text bg-gms-surface text-gms-warning-text hover:bg-gms-warning-subtle", focusRing),
  approve: cx(actionBase, "bg-gms-primary text-gms-on-primary hover:bg-gms-primary-strong", focusRing),
};

/**
 * C-AP-13 (FE-AP-010 / FE-AS-013): Reject… (outline red), Revise… (outline amber; disabled with the info tooltip once the
 * document was sent back, ADR-0050), Approve (filled). Shared by the table rows and the preview modal footer.
 */
export function ReviewActions({ docNo, revisionCount, disabled, busy, approveIndex, describedBy, onReject, onRevise, onApprove }: {
  docNo: string;
  revisionCount: number;
  disabled: boolean;
  busy: boolean;
  /** The table row index (`data-approve-index`, focus after a row leaves); omitted in the modal. */
  approveIndex?: number;
  describedBy?: string;
  onReject: () => void;
  onRevise: () => void;
  onApprove: () => void;
}) {
  return (
    <div className="flex items-center gap-[9px]">
      <button type="button" aria-haspopup="dialog" aria-label={`Reject ${docNo}…`} disabled={disabled} onClick={onReject} className={actionClass.reject}>
        Reject…
      </button>
      {canRevise({ revisionCount }) ? (
        <button type="button" aria-haspopup="dialog" aria-label={`Revise ${docNo}…`} disabled={disabled} onClick={onRevise} className={actionClass.revise}>
          Revise…
        </button>
      ) : (
        <UnavailableAction label="Revise…" reason={REVISE_LIMIT_REASON} />
      )}
      <button
        type="button"
        data-approve-index={approveIndex}
        aria-label={`Approve ${docNo}`}
        disabled={disabled}
        aria-busy={busy || undefined}
        aria-describedby={describedBy}
        onClick={onApprove}
        className={actionClass.approve}
      >
        {busy && <LoaderCircle aria-hidden size={16} className="animate-spin" />}
        Approve
      </button>
    </div>
  );
}

type TableProps = {
  menu: AvailableMenu;
  rows: readonly ApprovalRow[];
  sort: SortState;
  onSort: (key: SortKey) => void;
  selected: ReadonlySet<string>;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
  /** Rows whose get/approve is running (spinner, actions off). */
  busyIds: ReadonlySet<string>;
  /** Every row's actions are off (bulk approve running). */
  locked: boolean;
  errors: ReadonlyMap<string, RowError>;
  onApprove: (row: ApprovalRow, index: number) => void;
  onReject: (row: ApprovalRow, index: number) => void;
  onRevise: (row: ApprovalRow, index: number) => void;
  /** Rev 2 (FE-AP-013, Q-AP-19): the document number opens the preview modal; it no longer navigates. */
  onOpen: (row: ApprovalRow) => void;
};

/** C-AP-06: semantic table of the loaded pending rows (FE-AP-004…007). */
export function ApprovalTable({ menu, rows, sort, onSort, selected, onToggleRow, onToggleAll, busyIds, locked, errors, onApprove, onReject, onRevise, onOpen }: TableProps) {
  const format = useNumberFormat();
  return (
    <table className="w-full border-separate border-spacing-0 text-gms-body text-gms-text">
      <TableHead sort={sort} onSort={onSort} selectAll={<TriStateCheckbox label="Select all" state={headerCheckState(rows, selected)} onToggle={onToggleAll} />} />
      <tbody>
        {rows.map((row, index) => {
          const busy = busyIds.has(row.id);
          const error = errors.get(row.id);
          const errorId = `approve-error-${row.id}`;
          const td = "border-b border-gms-border px-3 py-2 align-middle";
          return (
            <tr key={row.id} className="h-14 bg-gms-surface" data-row-id={row.id}>
              <td className={td}>
                <TriStateCheckbox label={`Select ${row.docNo}`} state={selected.has(row.id) ? "checked" : "unchecked"} onToggle={() => onToggleRow(row.id)} />
              </td>
              <td className={cx(td, "tabular-nums")}>{index + 1}</td>
              <td className={td}>
                <button type="button" data-preview-id={row.id} aria-haspopup="dialog" onClick={() => onOpen(row)} className={cx("rounded-gms-sm font-medium text-gms-text underline", focusRing)}>
                  {row.docNo}
                </button>
                <span className="block text-gms-label text-gms-text-secondary">{shortDate(row.docDate)}</span>
              </td>
              <td className={td}>
                <span className="block">{row.partyName}</span>
                <span className="block text-gms-label text-gms-text-secondary">{detailSubLine(menu, row)}</span>
              </td>
              <td className={cx(td, "text-right tabular-nums")}>
                {`${row.totalPcs} pcs`}
                <span className="block text-gms-label text-gms-text-secondary">{`${format.weight(row.totalWeightCt)} cts`}</span>
              </td>
              <td className={cx(td, "text-right whitespace-nowrap tabular-nums")}>
                {format.money(row.grandTotal)} {row.currency}
              </td>
              <td className={td}>
                <span className="block whitespace-nowrap">{submitterText(row)}</span>
                <span className="block text-gms-label whitespace-nowrap text-gms-text-secondary">{submittedTime(row.submittedAt)}</span>
                {row.revisionCount >= 1 && <span className="block text-gms-label whitespace-nowrap text-gms-warning-text">{RESUBMITTED_TEXT}</span>}
              </td>
              <td className={td}>
                <span className="inline-flex h-6 min-w-[60px] items-center justify-center rounded-gms-sm bg-gms-warning-subtle px-2 text-gms-label font-medium text-gms-warning-text">Pending</span>
              </td>
              <td className={cx(td, "sticky right-0 bg-gms-surface")}>
                <ReviewActions
                  docNo={row.docNo}
                  revisionCount={row.revisionCount}
                  disabled={busy || locked}
                  busy={busy}
                  approveIndex={index}
                  describedBy={error ? errorId : undefined}
                  onReject={() => onReject(row, index)}
                  onRevise={() => onRevise(row, index)}
                  onApprove={() => onApprove(row, index)}
                />
                {error && (
                  <p id={errorId} className="mt-1 max-w-[320px] text-gms-label text-gms-danger">
                    {error.message}
                    {error.link && (
                      <>
                        {" "}
                        <button type="button" aria-haspopup="dialog" onClick={() => onOpen(row)} className={cx("underline", focusRing)}>
                          Open {row.docNo}
                        </button>
                      </>
                    )}
                  </p>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** First-page loading: header + 5 skeleton rows of 56 px. */
export function SkeletonRows() {
  return (
    <table className="w-full border-separate border-spacing-0" aria-busy="true">
      <TableHead />
      <tbody>
        {Array.from({ length: 5 }, (_, index) => (
          <tr key={index} className="h-14">
            {COLUMNS.map((column) => (
              <td key={column.key} className="border-b border-gms-border px-3">
                <span className="block h-3 animate-pulse rounded-gms-sm bg-gms-surface-sunken" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** C-AP-14: tray icon, title and text (source 01), with an optional action. */
export function ApprovalEmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div role="status" className="flex flex-col items-center gap-2 px-4 pt-[100px] pb-16 text-center">
      <Inbox aria-hidden size={48} strokeWidth={1.25} className="text-gms-text-placeholder" />
      <p className="text-gms-heading font-semibold text-gms-text">{title}</p>
      <p className="text-gms-body text-gms-text-secondary">{text}</p>
      {action}
    </div>
  );
}

/** Not-available inventory menus (FE-AP-008): provisional header + "Not available yet"; no API call. */
export function ProvisionalTable({ menu, title, text }: { menu: ApproveMenu; title: string; text: string }) {
  return (
    <div aria-label={`${menu.label} approvals`}>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0">
          <TableHead />
        </table>
      </div>
      <ApprovalEmptyState title={title} text={text} />
    </div>
  );
}
