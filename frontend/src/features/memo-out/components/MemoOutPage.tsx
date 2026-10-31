"use client";

import { QuotationInfoForm } from "@/features/quotation/components/info/QuotationInfoForm";
import { QUOTATION_KIND, type DocumentKind } from "@/features/quotation/document-kind";
import { QuotationOptionsContext } from "@/features/quotation/options-context";
import { DocumentDaybook, documentAccess, useDocumentAccess } from "@/features/trade-document/document-api";
import { APPROVAL_STATUS_LABELS, DocumentForm, type DocumentFormConfig } from "@/features/trade-document/document-form";
import { MemoStockModal } from "@/features/trade-document/memo-stock-modal";
import {
  emptyMemoOut,
  fromMemoOut,
  MEMO_OUT_HREF,
  mapMemoOutSaveError,
  memoOutHref,
  memoOutLoadError,
  memoOutSchema,
  memoStockToOutLine,
  pickedStockIds,
  toMemoOutInput,
  useMemoOutApi,
  useMemoOutDaybook,
  useMemoOutDetail,
  type MemoOutFormValues,
  type MemoOutInput,
  type MemoOutLine,
  type MemoOutOptions,
} from "../api";

export { MEMO_OUT_HREF };

/** UX only (the server checks every call): `memo-out:VIEW` from the existing catalog leaf. */
export function canViewMemoOut(mine: Parameters<typeof documentAccess>[0]): boolean {
  return documentAccess(mine, "memo-out").view;
}

function MemoOutDaybook() {
  const daybook = useMemoOutDaybook();
  return (
    <DocumentDaybook
      plural="memo outs"
      href={memoOutHref}
      state={{
        isPending: daybook.isPending,
        isError: daybook.isError,
        errorMessage: daybook.error ? memoOutLoadError(daybook.error) : undefined,
        items: (daybook.data?.items ?? []).map((item) => ({ id: item.id, docNo: item.docNo, docDate: item.docDate, status: item.status, name: String(item.customerName ?? "") })),
      }}
    />
  );
}

/**
 * From Stock rows take part or all of their Memo Stock item (Q-MO-10); the rest is the Quotation table and panel.
 * memo-out rev 3 (owner 2026-10-31): every row comes from From Stock, so there is no Add row and no keying in by hand.
 */
export const MEMO_OUT_KIND: DocumentKind = { ...QUOTATION_KIND, stockQuantity: true, pickOnly: true, emptyRowText: "Empty row · click to pick From Stock", documentNote: { ...QUOTATION_KIND.documentNote, hint: "Printed on the memo out for the customer" } };

const stockRowCount = (lines: readonly unknown[]) => lines.filter((line) => Boolean((line as Partial<MemoOutLine>).memoStockId)).length;

/**
 * memo-out UI rev 2 + SA rev 2 (owner 2026-10-31): the Quotation layout with a customer and both addresses; the number
 * comes from Document Setup › Memo Out. From Stock picks Memo Stock items (every vendor), which Approve cuts into
 * Reserve; rows can't be keyed in by hand (rev 3). Saved memo outs wait as Pending Approval.
 */
const CONFIG: DocumentFormConfig<MemoOutFormValues, MemoOutInput, MemoOutOptions> = {
  noun: "memo out",
  noLabel: "Memo Out No.:",
  newHref: MEMO_OUT_HREF,
  detailHref: memoOutHref,
  schema: memoOutSchema,
  empty: emptyMemoOut,
  toInput: toMemoOutInput,
  useApi: useMemoOutApi,
  partyId: (values) => values?.customerId,
  // The memo out options have the quotation options shape, so the quotation header fields read them as is.
  header: ({ options }) => (
    <QuotationOptionsContext.Provider value={options}>
      <QuotationInfoForm />
    </QuotationOptionsContext.Provider>
  ),
  mapSaveError: mapMemoOutSaveError,
  pickLabel: "From Stock",
  pickHint: "Pick stones from stock (Memo Stock)",
  kind: MEMO_OUT_KIND,
  picker: {
    blockedReason: () => null,
    render: ({ values, onClose, onAdd }) => (
      <MemoStockModal
        title="From Stock"
        showPrice={false}
        emptyText="No stock with anything pending."
        pickedIds={pickedStockIds(values.lines)}
        onCancel={onClose}
        onConfirm={(items) => onAdd(items.map(memoStockToOutLine))}
      />
    ),
    addedToast: (count) => `Added ${count} item${count === 1 ? "" : "s"} from Stock`,
  },
  approval: {
    statusLabels: APPROVAL_STATUS_LABELS,
    pendingStatus: "PENDING_APPROVAL",
    confirmTitle: "Approve Memo Out",
    confirmBody: (lines) => {
      const count = stockRowCount(lines);
      return count === 0
        ? "Approve this Memo Out? It has no stock items, so nothing is cut. It can no longer be edited."
        : `Approve this Memo Out? Its ${count} stock ${count === 1 ? "item is" : "items are"} cut from Memo Stock and it can no longer be edited.`;
    },
  },
  notePlaceholder: "e.g. On memo until the due date. Return any stones not bought.",
  noteHint: "Printed on the memo out for the customer",
  daybook: <MemoOutDaybook />,
};

const message = "p-10 text-gms-body text-gms-text-secondary";
const DENIED = "You don't have permission to view memo outs.";

/** `/memo/memo-out` — a new memo out. */
export function MemoOutPage() {
  const access = useDocumentAccess("memo-out");
  if (!access) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>{DENIED}</p>;
  return <DocumentForm config={CONFIG} canAdd={access.add} canEdit={access.edit} canDelete={access.delete} canApprove={access.approve} />;
}

/** `/memo/memo-out/[id]` — a saved memo out. */
export function EditMemoOutPage({ id }: { id: string }) {
  const access = useDocumentAccess("memo-out");
  const detail = useMemoOutDetail(access?.view ? id : null);
  if (!access || (access.view && detail.isPending)) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>{DENIED}</p>;
  if (detail.isError || !detail.data) return <p className={message}>{detail.error ? memoOutLoadError(detail.error) : "Memo out not found."}</p>;
  return <DocumentForm key={`${id}:${detail.data.version}`} config={CONFIG} initial={fromMemoOut(detail.data)} canAdd={access.add} canEdit={access.edit} canDelete={access.delete} canApprove={access.approve} />;
}
