"use client";

import { AppShell, type Breadcrumb } from "@/features/home/app-shell";
import { NewQuotationPage } from "@/features/quotation/components/QuotationPage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Pre-Sale" }, { label: "Quotation" }];

export default function PreSaleQuotationPage() {
  return (
    <AppShell breadcrumbs={breadcrumbs}>
      <NewQuotationPage />
    </AppShell>
  );
}
