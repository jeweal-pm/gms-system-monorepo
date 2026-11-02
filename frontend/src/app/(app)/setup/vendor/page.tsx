"use client";

import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { VendorPage } from "@/features/vendor/vendor-page";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Setup", href: "/setup" }, { label: "Vendor" }];

export default function SetupVendorPage() {
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <VendorPage />
    </TabPage>
  );
}
