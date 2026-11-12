"use client";

import { useApprovalSetting } from "@/features/trade-document/approval-flow";
import { flowOf } from "@/features/trade-document/flow-status";

import type { DocumentKind } from "@/features/quotation/document-kind";
import { customerStockConfig } from "@/features/trade-document/customer-stock-config";
import { daybookLoadError, daybookState, deletedInfo, DocumentDaybook, documentAccess, useDocumentAccess } from "@/features/trade-document/document-api";
import { DocumentForm } from "@/features/trade-document/document-form";
import { fromMemoOut, MEMO_OUT_HREF, mapMemoOutSaveError, memoOutHref, memoOutLoadError, memoOutRestoreError, useMemoOutApi, useMemoOutDaybook, useMemoOutDetail } from "../api";
import { DOCUMENT_PHOTOS } from "@/features/trade-document/document-photos";

export { MEMO_OUT_HREF };

/** UX only (the server checks every call): `memo-out:VIEW` from the existing catalog leaf. */
export function canViewMemoOut(mine: Parameters<typeof documentAccess>[0]): boolean {
  return documentAccess(mine, "memo-out").view;
}

function MemoOutDaybook() {
  const daybook = useMemoOutDaybook();
  const { requireApproval } = useApprovalSetting("memo-out");
  return (
    <DocumentDaybook
      requireApproval={requireApproval}
      plural="memo outs"
      href={memoOutHref}
      state={daybookState(daybook, (error) => daybookLoadError(error, "memo outs"), (item) => String(item.customerName ?? ""))}
    />
  );
}

/**
 * memo-out UI rev 2 + SA rev 2 (owner 2026-10-31): the Quotation layout with a customer and both addresses; the number
 * comes from Document Setup › Memo Out. From Stock picks Memo Stock items (every vendor), which Approve cuts into
 * Reserve; rows can't be keyed in by hand (rev 3). Saved memo outs wait as Pending Approval.
 */
const CONFIG = customerStockConfig({
  photos: DOCUMENT_PHOTOS.memoOut,
  noun: "memo out",
  title: "Memo Out",
  newHref: MEMO_OUT_HREF,
  detailHref: memoOutHref,
  useApi: useMemoOutApi,
  mapSaveError: mapMemoOutSaveError,
  mapRestoreError: memoOutRestoreError,
  pickerTitle: "From Stock",
  approvalType: "memo-out",
  notePlaceholder: "e.g. On memo until the due date. Return any stones not bought.",
  noteHint: "Printed on the memo out for the customer",
  daybook: <MemoOutDaybook />,
});

/** From Stock rows take part or all of their item (Q-MO-10); every row comes From Stock (rev 3: no Add row, pick only). */
export const MEMO_OUT_KIND = CONFIG.kind as DocumentKind;

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
  return <DocumentForm key={`${id}:${detail.data.version}`} config={CONFIG} initial={fromMemoOut(detail.data)} deleted={deletedInfo(detail.data)} flow={flowOf(detail.data)} canAdd={access.add} canEdit={access.edit} canDelete={access.delete} />;
}
