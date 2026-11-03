"use client";

import { MemoOutstandingPage } from "@/features/memo-outstanding-vendor/components/memo-outstanding-vendor-page";
import { CUSTOMER_REPORT } from "./api";

/** `/memo/memo-outstanding/customer`: the shared report page on approved Memo Outs (needs memo-outstanding-customer VIEW). */
export function MemoOutstandingCustomerPage() {
  return <MemoOutstandingPage report={CUSTOMER_REPORT} />;
}
