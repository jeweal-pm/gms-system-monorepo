"use client";

import { AppShell, type Breadcrumb } from "@/features/home/app-shell";
import { CompanyProfilePage } from "@/features/company-profile/company-profile-page";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Setup", href: "/setup" }, { label: "Company Profile" }];

/** company-profile FE-CP-001: Setup › Company Profile. */
export default function SetupCompanyProfilePage() {
  return (
    <AppShell breadcrumbs={breadcrumbs}>
      <CompanyProfilePage />
    </AppShell>
  );
}
