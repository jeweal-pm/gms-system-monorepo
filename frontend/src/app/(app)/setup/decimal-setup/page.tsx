"use client";

import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { DecimalSetupPage } from "@/features/decimal-setup/decimal-setup-page";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Setup", href: "/setup" }, { label: "Decimal Setup" }];

/** Setup › Decimal Setup (decimal-setup UI rev 2, FE-DEC-103): one Default for the whole website. */
export default function SetupDecimalSetupPage() {
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <DecimalSetupPage />
    </TabPage>
  );
}
