"use client";

import { useParams } from "next/navigation";
import { AppShell, type Breadcrumb } from "@/features/home/app-shell";
import { EditQuotationPage } from "@/features/quotation/components/QuotationPage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Pre-Sale" }, { label: "Quotation", href: "/pre-sale/quotation" }];

export default function PreSaleQuotationDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <AppShell breadcrumbs={breadcrumbs}>
      <EditQuotationPage id={id} />
    </AppShell>
  );
}
