"use client";

import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { PurchasePage } from "@/features/purchase/components/PurchasePage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Purchase Order" }, { label: "Purchase" }];

/** Purchase Order › Purchase, a new document (purchase UI rev 1, FE-PU-002). */
export default function PurchaseRoutePage() {
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <PurchasePage />
    </TabPage>
  );
}
