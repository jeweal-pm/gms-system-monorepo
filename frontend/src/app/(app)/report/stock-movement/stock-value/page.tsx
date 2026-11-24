"use client";

import { Suspense } from "react";
import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { StockValueListPage } from "@/features/stock-value/components/stock-value-list-page";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Stock Movement" }, { label: "Stock Value" }];

/** stock-value UI rev 1 (ADR-0057): Home › Stock Movement › Stock Value. */
export default function StockValueRoute() {
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      {/* Filters live in the URL search params, read on the client. */}
      <Suspense fallback={<p className="p-10 text-gms-body text-gms-text-secondary">Loading…</p>}>
        <StockValueListPage />
      </Suspense>
    </TabPage>
  );
}
