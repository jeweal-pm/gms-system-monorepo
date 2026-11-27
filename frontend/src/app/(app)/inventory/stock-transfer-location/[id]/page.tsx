"use client";

import { use } from "react";
import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { EditStockTransferLocationPage } from "@/features/stock-transfer-location/components/StockTransferLocationPage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Inventory" }, { label: "Stock Transfer Location", href: "/inventory/stock-transfer-location" }];

/** Inventory › Stock Transfer Location, a saved document (ADR-0060 D12, FE-STL-001). */
export default function StockTransferLocationDetailRoutePage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = use(params);
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <EditStockTransferLocationPage id={id} />
    </TabPage>
  );
}
