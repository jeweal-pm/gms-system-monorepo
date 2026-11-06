"use client";

import { Suspense } from "react";
import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { PurchaseOutstandingPage } from "@/features/purchase-outstanding/page";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Purchase Order" }, { label: "Purchase Outstanding" }];

/** purchase-outstanding UI rev 1 (ADR-0044): Home › Purchase Order › Purchase Outstanding. */
export default function PurchaseOutstandingRoute() {
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      {/* Filters live in the URL search params, read on the client. */}
      <Suspense fallback={<p className="p-10 text-gms-body text-gms-text-secondary">Loading…</p>}>
        <PurchaseOutstandingPage />
      </Suspense>
    </TabPage>
  );
}
