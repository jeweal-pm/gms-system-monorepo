"use client";

import { customerStockConfig } from "@/features/trade-document/customer-stock-config";
import { daybookLoadError, daybookState, deletedInfo, DocumentDaybook, documentAccess, useDocumentAccess } from "@/features/trade-document/document-api";
import { DocumentForm } from "@/features/trade-document/document-form";
import { fromReserve, mapReserveSaveError, RESERVE_HREF, reserveHref, reserveLoadError, reserveRestoreError, useReserveApi, useReserveDaybook, useReserveDetail } from "../api";

export { RESERVE_HREF };

/** UX only (the server checks every call): `reserve:VIEW` from the existing catalog leaf. */
export function canViewReserve(mine: Parameters<typeof documentAccess>[0]): boolean {
  return documentAccess(mine, "reserve").view;
}

function ReserveDaybook() {
  const daybook = useReserveDaybook();
  return (
    <DocumentDaybook
      plural="reserves"
      href={reserveHref}
      state={daybookState(daybook, (error) => daybookLoadError(error, "reserves"), (item) => String(item.customerName ?? ""))}
    />
  );
}

/**
 * reserve UI rev 1 + SA rev 1 (owner 2026-11-02): the Quotation / Memo Out layout with a customer and both addresses;
 * the number comes from Document Setup › Reserve. One From Stock button (Q-RS-01) picks Memo Stock items, which Approve
 * holds in Reserve for a later Sale; rows keyed in by hand hold nothing (Q-RS-04). Saved reserves wait as Pending
 * Approval.
 */
const CONFIG = customerStockConfig({
  noun: "reserve",
  title: "Reserve",
  newHref: RESERVE_HREF,
  detailHref: reserveHref,
  useApi: useReserveApi,
  mapSaveError: mapReserveSaveError,
  mapRestoreError: reserveRestoreError,
  pickerTitle: "Add From Stock",
  approvedStock: "held for the customer",
  noStock: "held",
  notePlaceholder: "e.g. Held until the due date. 50% deposit, balance before delivery.",
  noteHint: "Printed on the reserve for the customer",
  daybook: <ReserveDaybook />,
});

const message = "p-10 text-gms-body text-gms-text-secondary";
const DENIED = "You don't have permission to view reserves.";

/** `/pre-sale/reserve` — a new reserve. */
export function ReservePage() {
  const access = useDocumentAccess("reserve");
  if (!access) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>{DENIED}</p>;
  return <DocumentForm config={CONFIG} canAdd={access.add} canEdit={access.edit} canDelete={access.delete} canApprove={access.approve} />;
}

/** `/pre-sale/reserve/[id]` — a saved reserve. */
export function EditReservePage({ id }: { id: string }) {
  const access = useDocumentAccess("reserve");
  const detail = useReserveDetail(access?.view ? id : null);
  if (!access || (access.view && detail.isPending)) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>{DENIED}</p>;
  if (detail.isError || !detail.data) return <p className={message}>{detail.error ? reserveLoadError(detail.error) : "Reserve not found."}</p>;
  return <DocumentForm key={`${id}:${detail.data.version}`} config={CONFIG} initial={fromReserve(detail.data)} deleted={deletedInfo(detail.data)} canAdd={access.add} canEdit={access.edit} canDelete={access.delete} canApprove={access.approve} />;
}
