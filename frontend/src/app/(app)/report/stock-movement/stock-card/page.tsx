"use client";

import { Suspense } from "react";
import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { StockCardListPage } from "@/features/stock-card/components/stock-card-list-page";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Stock Movement" }, { label: "Stock Card" }];

/** stock-card UI rev 1 (ADR-0056): Home › Stock Movement › Stock Card. */
export default function StockCardRoute() {
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      {/* Filters live in the URL search params, read on the client. */}
      <Suspense fallback={<p className="p-10 text-gms-body text-gms-text-secondary">Loading…</p>}>
        <StockCardListPage />
      </Suspense>
    </TabPage>
  );
}
