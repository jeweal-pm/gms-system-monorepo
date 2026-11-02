"use client";

import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { DecimalSetupPage } from "@/features/decimal-setup/decimal-setup-page";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Setup", href: "/setup" }, { label: "Decimal Setup" }];

/** Setup › Decimal Setup (decimal-setup UI rev 1, FE-DEC-001): mock data only. */
export default function SetupDecimalSetupPage() {
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <DecimalSetupPage />
    </TabPage>
  );
}
