"use client";

import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { SalePage } from "@/features/sale/components/SalePage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Sale" }, { label: "Sale" }];

/** Sale › Sale, a new document (sale UI rev 1, FE-SL-002). Not linked from the sidebar until FE-SL-008. */
export default function SaleRoutePage() {
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <SalePage />
    </TabPage>
  );
}
