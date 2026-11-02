"use client";

import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { DocumentSetupPage } from "@/features/document-setup/document-setup-page";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Setup", href: "/setup" }, { label: "Document Setup" }];

/** Setup › Document Setup (document-setup UI rev 1, FE-DS-001). */
export default function SetupDocumentSetupPage() {
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <DocumentSetupPage />
    </TabPage>
  );
}
