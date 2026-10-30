"use client";

import { DocumentDaybook, useDocumentAccess } from "@/features/trade-document/document-api";
import { DocumentForm, type DocumentFormConfig } from "@/features/trade-document/document-form";
import { VendorDocumentInfoForm } from "@/features/trade-document/vendor-info-form";
import {
  emptyMemoOutReturn,
  fromMemoOutReturn,
  MEMO_OUT_RETURN_HREF,
  MEMO_OUT_RETURN_NOTE_MAX,
  mapMemoOutReturnSaveError,
  memoOutReturnHref,
  memoOutReturnLoadError,
  memoOutReturnSchema,
  toMemoOutReturnInput,
  useMemoOutReturnApi,
  useMemoOutReturnDaybook,
  useMemoOutReturnDetail,
  type MemoOutReturnFormValues,
  type MemoOutReturnInput,
  type MemoOutReturnOptions,
} from "../api";
import { ReturnItemTable } from "./ReturnItemTable";

export { MEMO_OUT_RETURN_HREF, MEMO_OUT_RETURN_NOTE_MAX };

/** Header of memo-out-return source 01 (shared with memo return). */
export const MemoOutReturnInfoForm = VendorDocumentInfoForm;

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
        items: (daybook.data?.items ?? []).map((item) => ({ id: item.id, docNo: item.docNo, docDate: item.docDate, status: item.status, name: String(item.vendorName ?? "") })),
      }}
    />
  );
}

/**
 * memo-out-return UI rev 3 + SA rev 1 (owner 2026-10-28): vendor document; number from Document Setup › Memo Out
 * Return. Rows are picked from Memo Stock and only their Return quantity is edited, so there is no row editor;
 * the Memo Stock / Memo Outstanding picker waits for a vendor memo source.
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
  partyId: (values) => values?.vendorId,
  header: ({ options }) => <MemoOutReturnInfoForm options={options} />,
  mapSaveError: mapMemoOutReturnSaveError,
  pickLabel: "Memo Outstanding",
  pickHint: "Memo Outstanding isn't available yet",
  emptyRowText: "Empty row · click to pick from Memo Stock",
  itemTable: ReturnItemTable,
  rowEditor: false,
  emptyRowNotice: "Memo Stock isn't available yet",
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
  return <DocumentForm config={CONFIG} canAdd={access.add} canEdit={access.edit} canDelete={access.delete} />;
}

/** `/memo/memo-out-return/[id]` — a saved memo out return. */
export function EditMemoOutReturnPage({ id }: { id: string }) {
  const access = useDocumentAccess("memo-out-return");
  const detail = useMemoOutReturnDetail(access?.view ? id : null);
  if (!access || (access.view && detail.isPending)) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>{DENIED}</p>;
  if (detail.isError || !detail.data) return <p className={message}>{detail.error ? memoOutReturnLoadError(detail.error) : "Memo out return not found."}</p>;
  return <DocumentForm key={`${id}:${detail.data.version}`} config={CONFIG} initial={fromMemoOutReturn(detail.data)} canAdd={access.add} canEdit={access.edit} canDelete={access.delete} />;
}
