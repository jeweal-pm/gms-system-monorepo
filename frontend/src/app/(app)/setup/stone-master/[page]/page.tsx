"use client";

import { notFound } from "next/navigation";
import { use } from "react";
import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { stonePageBySlug } from "@/features/stone-master/kinds";
import { StoneMasterPage } from "@/features/stone-master/stone-master-page";

/** Setup › Stone Master › one of the nine pages (FE-SM-002); unknown slugs are 404. */
export default function SetupStoneMasterPage({ params }: Readonly<{ params: Promise<{ page: string }> }>) {
  const page = stonePageBySlug(use(params).page);
  if (!page) notFound();
  const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Setup", href: "/setup" }, { label: page.navLabel }];
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <StoneMasterPage page={page} />
    </TabPage>
  );
}
