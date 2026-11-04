"use client";

import { use } from "react";
import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { EditPurchaseOrderPage } from "@/features/purchase-order/components/PurchaseOrderPage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Purchase Order" }, { label: "Purchase Order (PO)", href: "/purchase/purchase-order" }];

export default function PurchaseOrderDetailRoutePage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = use(params);
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <EditPurchaseOrderPage id={id} />
    </TabPage>
  );
}
