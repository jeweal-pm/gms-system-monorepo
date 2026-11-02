"use client";

import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { NewQuotationPage } from "@/features/quotation/components/QuotationPage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Pre-Sale" }, { label: "Quotation" }];

export default function PreSaleQuotationRoutePage() {
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <NewQuotationPage />
    </TabPage>
  );
}
