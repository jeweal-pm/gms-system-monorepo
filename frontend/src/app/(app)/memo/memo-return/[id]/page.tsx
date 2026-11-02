"use client";

import { use } from "react";
import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { EditMemoReturnPage } from "@/features/memo-return/components/MemoReturnPage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Memo" }, { label: "Memo Return", href: "/memo/memo-return" }];

/** Memo › Memo Return, a saved document (memo-return SA rev 1). */
export default function MemoReturnDetailRoutePage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = use(params);
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <EditMemoReturnPage id={id} />
    </TabPage>
  );
}
