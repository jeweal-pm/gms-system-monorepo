"use client";

import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { CustomerPage } from "@/features/customer/customer-page";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Setup", href: "/setup" }, { label: "Customer" }];

export default function SetupCustomerPage() {
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <CustomerPage />
    </TabPage>
  );
}
