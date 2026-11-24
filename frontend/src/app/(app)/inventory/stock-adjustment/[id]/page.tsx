"use client";

import { use } from "react";
import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { EditStockAdjustmentPage } from "@/features/stock-adjustment/components/StockAdjustmentPage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Inventory" }, { label: "Stock Adjustment" }];

export default function StockAdjustmentDetailRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TabPage breadcrumbs={breadcrumbs}><EditStockAdjustmentPage id={id} /></TabPage>;
}
