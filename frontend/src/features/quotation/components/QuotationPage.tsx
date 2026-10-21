"use client";

import { useQuery } from "@tanstack/react-query";
import { getQuotation, quotationKeys } from "../api";
import { QuotationForm } from "./QuotationForm";

/** `/pre-sale/quotation` — ยังไม่มีหน้า list จึงเปิดฟอร์มสร้างใหม่ */
export function NewQuotationPage() {
  return <QuotationForm />;
}

export function EditQuotationPage({ id }: { id: string }) {
  const { data, isLoading } = useQuery({ queryKey: quotationKeys.detail(id), queryFn: () => getQuotation(id) });
  if (isLoading) return <p className="p-10 text-gms-body text-gms-text-secondary">Loading…</p>;
  if (!data) return <p className="p-10 text-gms-body text-gms-text-secondary">Quotation not found.</p>;
  return <QuotationForm key={id} initial={data} />;
}
