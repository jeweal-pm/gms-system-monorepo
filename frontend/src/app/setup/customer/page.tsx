"use client";

import { AppShell, type Breadcrumb } from "@/features/home/app-shell";
import { CustomerPage } from "@/features/customer/customer-page";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Setup", href: "/setup" }, { label: "Customer" }];

export default function SetupCustomerPage() {
  return (
    <AppShell breadcrumbs={breadcrumbs}>
      <CustomerPage />
    </AppShell>
  );
}
