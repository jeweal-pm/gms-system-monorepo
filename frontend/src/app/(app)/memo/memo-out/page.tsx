"use client";

import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { MemoOutPage } from "@/features/memo-out/components/MemoOutPage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Memo" }, { label: "Memo Out" }];

/** Memo › Memo Out (memo-out UI rev 1, FE-MO-001: page structure). */
export default function MemoOutRoutePage() {
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <MemoOutPage />
    </TabPage>
  );
}
