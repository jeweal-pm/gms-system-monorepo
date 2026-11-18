"use client";

import { use } from "react";
import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { EditSalePage } from "@/features/sale/components/SalePage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Sale" }, { label: "Sale", href: "/sale/sale" }];

/** Sale › Sale, a saved document (sale UI rev 1, FE-SL-002). */
export default function SaleDetailRoutePage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = use(params);
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <EditSalePage id={id} />
    </TabPage>
  );
}
