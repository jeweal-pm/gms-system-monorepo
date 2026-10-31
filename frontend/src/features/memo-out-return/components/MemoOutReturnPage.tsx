"use client";

import { QuotationInfoForm } from "@/features/quotation/components/info/QuotationInfoForm";
import { QuotationOptionsContext } from "@/features/quotation/options-context";
import { DocumentDaybook, useDocumentAccess } from "@/features/trade-document/document-api";
import { APPROVAL_STATUS_LABELS, DocumentForm, type DocumentFormConfig } from "@/features/trade-document/document-form";
import {
  emptyMemoOutReturn,
  fromMemoOutReturn,
  MEMO_OUT_RETURN_HREF,
  MEMO_OUT_RETURN_NOTE_MAX,
  mapMemoOutReturnSaveError,
  memoOutReturnHref,
  memoOutReturnLoadError,
  memoOutReturnSchema,
  outstandingToLine,
  pickedOutLineIds,
  toMemoOutReturnInput,
  useMemoOutReturnApi,
  useMemoOutReturnDaybook,
  useMemoOutReturnDetail,
  type MemoOutReturnFormValues,
  type MemoOutReturnInput,
  type MemoOutReturnOptions,
} from "../api";
import { MemoOutstandingModal } from "./MemoOutstandingModal";
import { ReturnItemTable } from "./ReturnItemTable";

export { MEMO_OUT_RETURN_HREF, MEMO_OUT_RETURN_NOTE_MAX };

function MemoOutReturnDaybook() {
  const daybook = useMemoOutReturnDaybook();
  return (
    <DocumentDaybook
      plural="memo out returns"
      href={memoOutReturnHref}
      state={{
        isPending: daybook.isPending,
        isError: daybook.isError,
        errorMessage: daybook.error ? memoOutReturnLoadError(daybook.error) : undefined,
        items: (daybook.data?.items ?? []).map((item) => ({ id: item.id, docNo: item.docNo, docDate: item.docDate, status: item.status, name: String(item.customerName ?? "") })),
      }}
    />
  );
}

/**
 * memo-out-return UI rev 4 + SA rev 2 (owner 2026-10-31): the customer brings back what a Memo Out lent. The header is
 * Memo Out's (customer, Shipping / Invoice address); the number comes from Document Setup › Memo Out Return. Rows come
 * only from Memo Outstanding (the customer's approved Memo Out From Stock lines) and only their Return quantity is
 * edited. Saved returns wait as Pending Approval; Approve brings the stones back to Memo Stock (Q-MOR-14/16).
 */
const CONFIG: DocumentFormConfig<MemoOutReturnFormValues, MemoOutReturnInput, MemoOutReturnOptions> = {
  noun: "memo out return",
  noLabel: "Memo Out Return No.:",
  newHref: MEMO_OUT_RETURN_HREF,
  detailHref: memoOutReturnHref,
  schema: memoOutReturnSchema,
  empty: emptyMemoOutReturn,
  toInput: toMemoOutReturnInput,
  useApi: useMemoOutReturnApi,
  partyId: (values) => values?.customerId,
  // The options have the quotation options shape, so the quotation header fields read them as is.
  header: ({ options }) => (
    <QuotationOptionsContext.Provider value={options}>
      <QuotationInfoForm />
    </QuotationOptionsContext.Provider>
  ),
  mapSaveError: mapMemoOutReturnSaveError,
  pickLabel: "Memo Outstanding",
  pickHint: "Pick stones this customer still has on memo",
  emptyRowText: "Empty row · click to pick from Memo Outstanding",
  itemTable: ReturnItemTable,
  rowEditor: false,
  picker: {
    blockedReason: (values) => (!values.customerId ? "Choose a customer first" : !values.currency ? "Choose a currency first" : null),
    render: ({ values, onClose, onAdd }) => (
      <MemoOutstandingModal
        customerId={values.customerId}
        currency={values.currency}
        excludeReturnId={values.id}
        pickedIds={pickedOutLineIds(values.lines)}
        onCancel={onClose}
        onConfirm={(items) => onAdd(items.map(outstandingToLine))}
      />
    ),
    addedToast: (count) => `Added ${count} item${count === 1 ? "" : "s"} from Memo Outstanding`,
  },
  approval: {
    statusLabels: APPROVAL_STATUS_LABELS,
    pendingStatus: "PENDING_APPROVAL",
    confirmTitle: "Approve Memo Out Return",
    confirmBody: ({ length: count }) => `Approve this Memo Out Return? Its ${count} ${count === 1 ? "item comes" : "items come"} back to stock. It can no longer be edited.`,
  },
  noteMax: MEMO_OUT_RETURN_NOTE_MAX,
  notePlaceholder: "e.g. Returned in good condition; 1 stone kept for decision.",
  noteHint: "Printed on the memo out return",
  daybook: <MemoOutReturnDaybook />,
};

const message = "p-10 text-gms-body text-gms-text-secondary";
const DENIED = "You don't have permission to view memo out returns.";

/** `/memo/memo-out-return` — a new memo out return. */
export function MemoOutReturnPage() {
  const access = useDocumentAccess("memo-out-return");
  if (!access) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>{DENIED}</p>;
  return <DocumentForm config={CONFIG} canAdd={access.add} canEdit={access.edit} canDelete={access.delete} canApprove={access.approve} />;
}

/** `/memo/memo-out-return/[id]` — a saved memo out return. */
export function EditMemoOutReturnPage({ id }: { id: string }) {
  const access = useDocumentAccess("memo-out-return");
  const detail = useMemoOutReturnDetail(access?.view ? id : null);
  if (!access || (access.view && detail.isPending)) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>{DENIED}</p>;
  if (detail.isError || !detail.data) return <p className={message}>{detail.error ? memoOutReturnLoadError(detail.error) : "Memo out return not found."}</p>;
  return <DocumentForm key={`${id}:${detail.data.version}`} config={CONFIG} initial={fromMemoOutReturn(detail.data)} canAdd={access.add} canEdit={access.edit} canDelete={access.delete} canApprove={access.approve} />;
}
