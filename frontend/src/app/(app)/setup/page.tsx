"use client";

import { Suspense } from "react";
import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { SetupLanding } from "@/features/setup/setup-landing";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Setup" }];

/** app-navigation FE-NAV-006: Setup landing page (S3); revision 2 adds `?dialog=master-code`. */
export default function SetupPage() {
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      {/* SetupLanding reads the search params (`?dialog=master-code`). */}
      <Suspense fallback={null}>
        <SetupLanding />
      </Suspense>
    </TabPage>
  );
}
