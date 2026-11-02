"use client";

import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { MemoReturnPage } from "@/features/memo-return/components/MemoReturnPage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Memo" }, { label: "Memo Return" }];

/** Memo › Memo Return (memo-return UI rev 1 + SA rev 1). */
export default function MemoReturnRoutePage() {
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <MemoReturnPage />
    </TabPage>
  );
}
