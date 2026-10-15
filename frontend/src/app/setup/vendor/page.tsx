"use client";

import { AppShell, type Breadcrumb } from "@/features/home/app-shell";
import { VendorPage } from "@/features/vendor/vendor-page";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Setup" }, { label: "Vendor" }];

export default function SetupVendorPage() {
  return (
    <AppShell breadcrumbs={breadcrumbs}>
      <VendorPage />
    </AppShell>
  );
}
