"use client";

import { Suspense } from "react";
import { AppShell, type Breadcrumb } from "@/features/home/app-shell";
import { MemoOutstandingVendorPage } from "@/features/memo-outstanding-vendor/components/memo-outstanding-vendor-page";

/** memo-outstanding-vendor UI rev 1: Home › Memo › From Vendor (the design's "Vender" is a typo, Q-MOV-01). */
const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Memo" }, { label: "From Vendor" }];

export default function MemoOutstandingVendorRoute() {
  return (
    <AppShell breadcrumbs={breadcrumbs}>
      {/* Filters live in the URL search params, read on the client. */}
      <Suspense fallback={<p className="p-10 text-gms-body text-gms-text-secondary">Loading…</p>}>
        <MemoOutstandingVendorPage />
      </Suspense>
    </AppShell>
  );
}
