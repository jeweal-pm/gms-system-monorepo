"use client";

import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { StockTransferLocationPage } from "@/features/stock-transfer-location/components/StockTransferLocationPage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Inventory" }, { label: "Stock Transfer Location" }];

/** Inventory › Stock Transfer Location, a new document (ADR-0060 D12, FE-STL-001). */
export default function StockTransferLocationRoutePage() {
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <StockTransferLocationPage />
    </TabPage>
  );
}
