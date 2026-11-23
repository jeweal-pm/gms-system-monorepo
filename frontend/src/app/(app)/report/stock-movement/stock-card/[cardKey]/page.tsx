"use client";

import { Suspense, use } from "react";
import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { StockCardDetailPage } from "@/features/stock-card/components/stock-card-detail-page";
import { STOCK_CARD_HREF } from "@/features/stock-card/model";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Stock Movement" }, { label: "Stock Card", href: STOCK_CARD_HREF }];

/** stock-card UI rev 1 (ADR-0056): one stock card (stone code, location, lot) with its transactions. */
export default function StockCardDetailRoute({ params }: Readonly<{ params: Promise<{ cardKey: string }> }>) {
  const { cardKey } = use(params);
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      {/* Filters live in the URL search params, read on the client. */}
      <Suspense fallback={<p className="p-10 text-gms-body text-gms-text-secondary">Loading…</p>}>
        <StockCardDetailPage cardKey={cardKey} />
      </Suspense>
    </TabPage>
  );
}
