"use client";

import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { MergeSplitPage } from "@/features/merge-split/components/MergeSplitPage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Inventory" }, { label: "Merge/Split" }];

/** Inventory › Merge/Split, a new document (merge-split UI rev 1, FE-MS-001). */
export default function MergeSplitRoutePage() {
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <MergeSplitPage />
    </TabPage>
  );
}
