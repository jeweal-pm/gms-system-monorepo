"use client";

import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { ApprovalSetupPage } from "@/features/approval-setup/components/ApprovalSetupPage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Setup", href: "/setup" }, { label: "Approval" }];

/** Setup › Approval (approval-setup UI rev 1, FE-AS-002). */
export default function SetupApprovalPage() {
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <ApprovalSetupPage />
    </TabPage>
  );
}
