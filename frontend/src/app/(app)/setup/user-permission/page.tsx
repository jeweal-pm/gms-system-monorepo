"use client";

import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { UserPermissionPage } from "@/features/user-permission/user-permission-page";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Setup", href: "/setup" }, { label: "User and permission" }];

export default function SetupUserPermissionPage() {
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <UserPermissionPage />
    </TabPage>
  );
}
