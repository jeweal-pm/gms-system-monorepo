"use client";

import { use } from "react";
import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { EditMergeSplitPage } from "@/features/merge-split/components/MergeSplitPage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Inventory" }, { label: "Merge/Split", href: "/inventory/merge-split" }];

/** Inventory › Merge/Split, a saved document (merge-split UI rev 1, FE-MS-001). */
export default function MergeSplitDetailRoutePage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = use(params);
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <EditMergeSplitPage id={id} />
    </TabPage>
  );
}
