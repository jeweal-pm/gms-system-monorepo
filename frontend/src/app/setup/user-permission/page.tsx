"use client";

import { AppShell } from "@/features/home/app-shell";
import { UserPermissionPage } from "@/features/user-permission/user-permission-page";

export default function SetupUserPermissionPage() {
  return (
    <AppShell breadcrumb="Home › Setup › User and permission">
      <UserPermissionPage />
    </AppShell>
  );
}
