"use client";

import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { CurrencyPage } from "@/features/currency/currency-page";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Setup", href: "/setup" }, { label: "Currency" }];

/** Setup › Master Code › Currency (currency UI rev 1). */
export default function SetupCurrencyPage() {
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <CurrencyPage />
    </TabPage>
  );
}
