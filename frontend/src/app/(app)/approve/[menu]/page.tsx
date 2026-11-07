"use client";

import { use } from "react";
import { TabPage } from "@/features/home/tabs/tab-host";
import { ApproveMenuPage } from "@/features/approve-center/components/ApproveCenterPage";
import { approveBreadcrumbs } from "@/features/approve-center/menus";

/** Approve › {Menu} (approve-center FE-AP-001); an unknown slug shows "Menu not found". */
export default function ApproveMenuRoutePage({ params }: Readonly<{ params: Promise<{ menu: string }> }>) {
  const { menu } = use(params);
  return (
    <TabPage breadcrumbs={approveBreadcrumbs(menu)}>
      <ApproveMenuPage slug={menu} />
    </TabPage>
  );
}
