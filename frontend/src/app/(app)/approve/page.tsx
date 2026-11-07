"use client";

import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { ApproveLanding } from "@/features/approve-center/components/ApproveCenterPage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Approve" }];

/** Approve (approve-center FE-AP-001, Q-AP-04): opens the first menu with pending documents in this tab. */
export default function ApproveRoutePage() {
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <ApproveLanding />
    </TabPage>
  );
}
