"use client";

import { QuotationInfoForm } from "@/features/quotation/components/info/QuotationInfoForm";
import { emptyQuotation } from "@/features/quotation/lib/defaults";
import { QuotationOptionsContext } from "@/features/quotation/options-context";
import { quotationSchema, type QuotationFormValues } from "@/features/quotation/schema";
import { DocumentDaybook, documentAccess, useDocumentAccess } from "@/features/trade-document/document-api";
import { DocumentForm, type DocumentFormConfig } from "@/features/trade-document/document-form";
import {
  fromMemoOut,
  MEMO_OUT_HREF,
  mapMemoOutSaveError,
  memoOutHref,
  memoOutLoadError,
  toMemoOutInput,
  useMemoOutApi,
  useMemoOutDaybook,
  useMemoOutDetail,
  type MemoOutInput,
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
 * memo-out UI rev 1 + SA rev 1 (owner 2026-10-28): the Quotation layout with a customer and both addresses;
 * the number comes from Document Setup › Memo Out. From Stock waits for the inventory service.
 */
const CONFIG: DocumentFormConfig<QuotationFormValues, MemoOutInput, MemoOutOptions> = {
  noun: "memo out",
  noLabel: "Memo Out No.:",
  newHref: MEMO_OUT_HREF,
  detailHref: memoOutHref,
  schema: quotationSchema,
  empty: emptyQuotation,
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
  pickHint: "Stock isn't available yet",
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
  return <DocumentForm config={CONFIG} canAdd={access.add} canEdit={access.edit} canDelete={access.delete} />;
}

/** `/memo/memo-out/[id]` — a saved memo out. */
export function EditMemoOutPage({ id }: { id: string }) {
  const access = useDocumentAccess("memo-out");
  const detail = useMemoOutDetail(access?.view ? id : null);
  if (!access || (access.view && detail.isPending)) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>{DENIED}</p>;
  if (detail.isError || !detail.data) return <p className={message}>{detail.error ? memoOutLoadError(detail.error) : "Memo out not found."}</p>;
  return <DocumentForm key={`${id}:${detail.data.version}`} config={CONFIG} initial={fromMemoOut(detail.data)} canAdd={access.add} canEdit={access.edit} canDelete={access.delete} />;
}
