"use client";

import { Suspense } from "react";
import { AppShell, type Breadcrumb } from "@/features/home/app-shell";
import { SetupLanding } from "@/features/setup/setup-landing";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Setup" }];

/** app-navigation FE-NAV-006: Setup landing page (S3); revision 2 adds `?dialog=master-code`. */
export default function SetupPage() {
  return (
    <AppShell breadcrumbs={breadcrumbs}>
      {/* SetupLanding reads the search params (`?dialog=master-code`). */}
      <Suspense fallback={null}>
        <SetupLanding />
      </Suspense>
    </AppShell>
  );
}
