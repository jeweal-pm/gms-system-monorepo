"use client";

import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { NewPurchaseOrderPage } from "@/features/purchase-order/components/PurchaseOrderPage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Purchase Order" }, { label: "Purchase Order (PO)" }];

export default function PurchaseOrderRoutePage() {
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <NewPurchaseOrderPage />
    </TabPage>
  );
}
