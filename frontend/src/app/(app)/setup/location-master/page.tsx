"use client";

import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { LocationMasterPage } from "@/features/location-master/location-master-page";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Setup", href: "/setup" }, { label: "Location Master" }];

/** Setup › Master Code › Location Master (location-master UI rev 1, ADR-0052). */
export default function SetupLocationMasterPage() {
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <LocationMasterPage />
    </TabPage>
  );
}
