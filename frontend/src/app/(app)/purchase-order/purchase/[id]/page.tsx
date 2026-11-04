"use client";

import { use } from "react";
import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { EditPurchasePage } from "@/features/purchase/components/PurchasePage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Purchase Order" }, { label: "Purchase", href: "/purchase-order/purchase" }];

/** Purchase Order › Purchase, a saved document (purchase UI rev 1, FE-PU-002). */
export default function PurchaseDetailRoutePage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = use(params);
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <EditPurchasePage id={id} />
    </TabPage>
  );
}
