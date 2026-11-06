"use client";

import { MemoOutstandingPage } from "@/features/memo-outstanding-vendor/components/memo-outstanding-vendor-page";
import { PURCHASE_OUTSTANDING_REPORT } from "./api";

/** `/purchase-order/purchase-outstanding`: the shared report page on approved Memo Receives (needs purchase-outstanding VIEW, ADR-0044). */
export function PurchaseOutstandingPage() {
  return <MemoOutstandingPage report={PURCHASE_OUTSTANDING_REPORT} />;
}
