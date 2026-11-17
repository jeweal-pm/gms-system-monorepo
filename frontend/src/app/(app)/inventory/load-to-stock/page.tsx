"use client";

import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { LoadToStockPage } from "@/features/load-to-stock/components/LoadToStockPage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Inventory" }, { label: "Load to Stock" }];

/** Inventory › Load to Stock, a new document (load-to-stock UI rev 1, FE-LS-002). */
export default function LoadToStockRoutePage() {
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <LoadToStockPage />
    </TabPage>
  );
}
