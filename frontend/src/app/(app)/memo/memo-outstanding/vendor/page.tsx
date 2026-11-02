"use client";

import { Suspense } from "react";
import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { MemoOutstandingVendorPage } from "@/features/memo-outstanding-vendor/components/memo-outstanding-vendor-page";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Memo" }, { label: "From Vendor" }];

/** memo-outstanding-vendor UI rev 1: Home › Memo › From Vendor (the design's "Vender" is a typo, Q-MOV-01). */
export default function MemoOutstandingVendorRoute() {
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      {/* Filters live in the URL search params, read on the client. */}
      <Suspense fallback={<p className="p-10 text-gms-body text-gms-text-secondary">Loading…</p>}>
        <MemoOutstandingVendorPage />
      </Suspense>
    </TabPage>
  );
}
