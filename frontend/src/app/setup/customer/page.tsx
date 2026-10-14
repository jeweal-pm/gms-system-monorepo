"use client";

import { AppShell } from "@/features/home/app-shell";
import { CustomerPage } from "@/features/customer/customer-page";

export default function SetupCustomerPage() {
  return (
    <AppShell breadcrumb="Home › Setup › Customer">
      <CustomerPage />
    </AppShell>
  );
}
