"use client";

import { Suspense, use } from "react";
import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { StockValueDetailPage } from "@/features/stock-value/components/stock-value-detail-page";
import { STOCK_VALUE_HREF } from "@/features/stock-value/model";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Stock Movement" }, { label: "Stock Value", href: STOCK_VALUE_HREF }];

/** stock-value UI rev 1 (ADR-0057): one stock card (stone code, location, lot) with its transactions. */
export default function StockValueDetailRoute({ params }: Readonly<{ params: Promise<{ cardKey: string }> }>) {
  const { cardKey } = use(params);
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      {/* Filters live in the URL search params, read on the client. */}
      <Suspense fallback={<p className="p-10 text-gms-body text-gms-text-secondary">Loading…</p>}>
        <StockValueDetailPage cardKey={cardKey} />
      </Suspense>
    </TabPage>
  );
}
