"use client";

import { AppShell, type Breadcrumb } from "@/features/home/app-shell";
import { UserPermissionPage } from "@/features/user-permission/user-permission-page";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Setup" }, { label: "User and permission" }];

export default function SetupUserPermissionPage() {
  return (
    <AppShell breadcrumbs={breadcrumbs}>
      <UserPermissionPage />
    </AppShell>
  );
}
