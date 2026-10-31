"use client";

import { useFormContext } from "react-hook-form";
import { DocumentDaybook, useDocumentAccess } from "@/features/trade-document/document-api";
import { APPROVAL_STATUS_LABELS, DocumentForm, type DocumentFormConfig } from "@/features/trade-document/document-form";
import { returnItemTable } from "@/features/trade-document/return-item-table";
import { VendorDocumentDetails, VendorDocumentInfoForm } from "@/features/trade-document/vendor-info-form";
import { isFilledLine } from "@/features/quotation/schema";
import {
  emptyMemoReturn,
  fromMemoReturn,
  MEMO_RETURN_HREF,
  MEMO_RETURN_NOTE_MAX,
  mapMemoReturnSaveError,
  memoReturnHref,
  memoReturnLoadError,
  memoReturnSchema,
  memoStockToLine,
  pickedStockIds,
  toMemoReturnInput,
  useMemoReturnApi,
  useMemoReturnDaybook,
  useMemoReturnDetail,
  type MemoReturnFormValues,
  type MemoReturnInput,
  type MemoReturnOptions,
} from "../api";
import { MemoStockModal } from "@/features/trade-document/memo-stock-modal";

export { MEMO_RETURN_HREF };

/** memo-return design: checkbox, remove, Add row; Return Pcs fills Return Weight in proportion; STOCK ID first (Memo Stock has no stone code). */
export const MemoReturnItemTable = returnItemTable({ rowControls: true, addRow: true, autoWeight: true, viewStoneCode: false });

/** Header (design 01): a new vendor empties rows picked from the previous vendor's Memo Stock. */
function MemoReturnInfoForm({ options }: { options: MemoReturnOptions | undefined }) {
  const { getValues, setValue } = useFormContext<MemoReturnFormValues>();
  const onVendorChange = () => {
    const lines = getValues("lines");
    if (lines.some(isFilledLine)) setValue("lines", lines.map((line) => (isFilledLine(line) ? emptyMemoReturn().lines[0] : line)), { shouldDirty: true });
  };
  return <VendorDocumentInfoForm options={options} onVendorChange={onVendorChange} />;
}

function MemoReturnDaybook() {
  const daybook = useMemoReturnDaybook();
  return (
    <DocumentDaybook
      plural="memo returns"
      href={memoReturnHref}
      state={{
        isPending: daybook.isPending,
        isError: daybook.isError,
        errorMessage: daybook.error ? memoReturnLoadError(daybook.error) : undefined,
        items: (daybook.data?.items ?? []).map((item) => ({ id: item.id, docNo: item.docNo, docDate: item.docDate, status: item.status, name: String(item.vendorName ?? "") })),
      }}
    />
  );
}

/**
 * memo-return UI rev 1 + SA rev 2 (owner 2026-10-29): vendor document; number from Document Setup › Memo Return.
 * Rows are picked from the vendor's Memo Stock (items of approved memo receives) and only their Return quantity is
 * edited, so there is no row editor. A saved document opens in view mode with the "Memo Return Details" card; it
 * waits as Pending Approval, and Approve takes the returned quantity off Memo Stock (Q-MR-15).
 */
const CONFIG: DocumentFormConfig<MemoReturnFormValues, MemoReturnInput, MemoReturnOptions> = {
  noun: "memo return",
  noLabel: "Memo Return No.:",
  newHref: MEMO_RETURN_HREF,
  detailHref: memoReturnHref,
  schema: memoReturnSchema,
  empty: emptyMemoReturn,
  toInput: toMemoReturnInput,
  useApi: useMemoReturnApi,
  partyId: (values) => values?.vendorId,
  header: ({ options }) => <MemoReturnInfoForm options={options} />,
  viewHeader: ({ values, options }) => <VendorDocumentDetails title="Memo Return Details" values={values} options={options} />,
  mapSaveError: mapMemoReturnSaveError,
  pickLabel: "Memo Stock",
  pickHint: "Pick stones still out on memo from this vendor",
  emptyRowText: "Empty row · click to pick from Memo Stock",
  itemTable: MemoReturnItemTable,
  rowEditor: false,
  picker: {
    blockedReason: (values) => (!values.vendorId ? "Choose a vendor first" : !values.currency ? "Choose a currency first" : null),
    render: ({ values, onClose, onAdd }) => (
      <MemoStockModal
        title="Add Memo Stock"
        vendorId={values.vendorId}
        currency={values.currency}
        showPrice
        emptyText={`No memo stock from this vendor in ${values.currency}.`}
        pickedIds={pickedStockIds(values.lines)}
        onCancel={onClose}
        onConfirm={(items) => onAdd(items.map(memoStockToLine))}
      />
    ),
    addedToast: (count) => `Added ${count} item${count === 1 ? "" : "s"} from Memo Stock`,
  },
  approval: {
    statusLabels: APPROVAL_STATUS_LABELS,
    pendingStatus: "PENDING_APPROVAL",
    confirmTitle: "Approve Memo Return",
    confirmBody: ({ length: count }) => `Approve this Memo Return? Its ${count} ${count === 1 ? "item goes" : "items go"} back to the vendor and come off Memo Stock. It can no longer be edited.`,
  },
  noteMax: MEMO_RETURN_NOTE_MAX,
  notePlaceholder: "e.g. Returned in good condition.",
  noteHint: "Printed on the memo return for the vendor",
  daybook: <MemoReturnDaybook />,
};

const message = "p-10 text-gms-body text-gms-text-secondary";
const DENIED = "You don't have permission to view memo returns.";

/** `/memo/memo-return` — a new memo return. */
export function MemoReturnPage() {
  const access = useDocumentAccess("memo-return");
  if (!access) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>{DENIED}</p>;
  return <DocumentForm config={CONFIG} canAdd={access.add} canEdit={access.edit} canDelete={access.delete} canApprove={access.approve} />;
}

/** `/memo/memo-return/[id]` — a saved memo return. */
export function EditMemoReturnPage({ id }: { id: string }) {
  const access = useDocumentAccess("memo-return");
  const detail = useMemoReturnDetail(access?.view ? id : null);
  if (!access || (access.view && detail.isPending)) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>{DENIED}</p>;
  if (detail.isError || !detail.data) return <p className={message}>{detail.error ? memoReturnLoadError(detail.error) : "Memo return not found."}</p>;
  return <DocumentForm key={`${id}:${detail.data.version}`} config={CONFIG} initial={fromMemoReturn(detail.data)} canAdd={access.add} canEdit={access.edit} canDelete={access.delete} canApprove={access.approve} />;
}
