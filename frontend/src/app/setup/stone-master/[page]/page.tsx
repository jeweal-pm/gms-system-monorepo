"use client";

import { notFound, useParams } from "next/navigation";
import { AppShell, type Breadcrumb } from "@/features/home/app-shell";
import { stonePageBySlug } from "@/features/stone-master/kinds";
import { StoneMasterPage } from "@/features/stone-master/stone-master-page";

/** Setup › Stone Master › one of the nine pages (FE-SM-002); unknown slugs are 404. */
export default function SetupStoneMasterPage() {
  const params = useParams<{ page: string }>();
  const page = stonePageBySlug(params.page);
  if (!page) notFound();
  const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Setup", href: "/setup" }, { label: page.navLabel }];
  return (
    <AppShell breadcrumbs={breadcrumbs}>
      <StoneMasterPage page={page} />
    </AppShell>
  );
}
