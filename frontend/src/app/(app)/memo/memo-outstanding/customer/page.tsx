"use client";

import { Suspense } from "react";
import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { MemoOutstandingCustomerPage } from "@/features/memo-outstanding-customer/page";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Memo" }, { label: "From Customer" }];

/** memo-outstanding-customer UI rev 1 (ADR-0039): Home › Memo › From Customer. */
export default function MemoOutstandingCustomerRoute() {
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      {/* Filters live in the URL search params, read on the client. */}
      <Suspense fallback={<p className="p-10 text-gms-body text-gms-text-secondary">Loading…</p>}>
        <MemoOutstandingCustomerPage />
      </Suspense>
    </TabPage>
  );
}
