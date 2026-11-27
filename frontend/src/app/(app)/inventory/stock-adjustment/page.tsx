"use client";

import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { StockAdjustmentPage } from "@/features/stock-adjustment/components/StockAdjustmentPage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Inventory" }, { label: "Stock Adjustment" }];

export default function StockAdjustmentRoutePage() {
  return <TabPage breadcrumbs={breadcrumbs}><StockAdjustmentPage /></TabPage>;
}
