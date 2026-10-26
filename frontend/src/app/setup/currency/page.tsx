"use client";

import { AppShell, type Breadcrumb } from "@/features/home/app-shell";
import { CurrencyPage } from "@/features/currency/currency-page";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Setup", href: "/setup" }, { label: "Currency" }];

/** Setup › Master Code › Currency (currency UI rev 1). */
export default function SetupCurrencyPage() {
  return (
    <AppShell breadcrumbs={breadcrumbs}>
      <CurrencyPage />
    </AppShell>
  );
}
