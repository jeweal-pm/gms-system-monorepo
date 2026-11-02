"use client";

import { use } from "react";
import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { EditMemoOutReturnPage } from "@/features/memo-out-return/components/MemoOutReturnPage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Memo" }, { label: "Memo Out Return", href: "/memo/memo-out-return" }];

/** Memo › Memo Out Return, a saved document (memo-out-return SA rev 1). */
export default function MemoOutReturnDetailRoutePage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = use(params);
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <EditMemoOutReturnPage id={id} />
    </TabPage>
  );
}
