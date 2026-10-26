"use client";

import { fromQuotation, loadErrorMessage, useQuotationAccess, useQuotationDetail } from "../api";
import { QuotationForm } from "./QuotationForm";

const message = "p-10 text-gms-body text-gms-text-secondary";

/** `/pre-sale/quotation` — no list page yet, so it opens a new quotation. */
export function NewQuotationPage() {
  const access = useQuotationAccess();
  if (!access) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>You don&apos;t have permission to view quotations.</p>;
  return <QuotationForm access={access} />;
}

export function EditQuotationPage({ id }: { id: string }) {
  const access = useQuotationAccess();
  const detail = useQuotationDetail(access?.view ? id : null);
  if (!access || (access.view && detail.isPending)) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>You don&apos;t have permission to view quotations.</p>;
  if (detail.isError || !detail.data) return <p className={message}>{detail.error ? loadErrorMessage(detail.error) : "Quotation not found."}</p>;
  return <QuotationForm key={`${id}:${detail.data.version}`} access={access} initial={fromQuotation(detail.data)} />;
}
