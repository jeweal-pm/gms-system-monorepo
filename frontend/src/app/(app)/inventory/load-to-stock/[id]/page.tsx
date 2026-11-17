"use client";

import { use } from "react";
import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { EditLoadToStockPage } from "@/features/load-to-stock/components/LoadToStockPage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Inventory" }, { label: "Load to Stock", href: "/inventory/load-to-stock" }];

/** Inventory › Load to Stock, a saved document (load-to-stock UI rev 1, FE-LS-002). */
export default function LoadToStockDetailRoutePage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = use(params);
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <EditLoadToStockPage id={id} />
    </TabPage>
  );
}
