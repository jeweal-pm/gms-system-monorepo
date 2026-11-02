"use client";

import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { CompanyProfilePage } from "@/features/company-profile/company-profile-page";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Setup", href: "/setup" }, { label: "Company Profile" }];

/** company-profile FE-CP-001: Setup › Company Profile. */
export default function SetupCompanyProfilePage() {
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <CompanyProfilePage />
    </TabPage>
  );
}
