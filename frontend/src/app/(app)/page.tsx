"use client";

import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { HomeDashboard } from "@/features/home/home-dashboard";

const breadcrumbs: Breadcrumb[] = [{ label: "Home" }];

export default function HomePage() {
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <HomeDashboard />
    </TabPage>
  );
}
