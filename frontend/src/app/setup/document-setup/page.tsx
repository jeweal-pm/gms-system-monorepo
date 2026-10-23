"use client";

import { AppShell, type Breadcrumb } from "@/features/home/app-shell";
import { DocumentSetupPage } from "@/features/document-setup/document-setup-page";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Setup", href: "/setup" }, { label: "Document Setup" }];

/** Setup › Document Setup (document-setup UI rev 1, FE-DS-001). */
export default function SetupDocumentSetupPage() {
  return (
    <AppShell breadcrumbs={breadcrumbs}>
      <DocumentSetupPage />
    </AppShell>
  );
}
