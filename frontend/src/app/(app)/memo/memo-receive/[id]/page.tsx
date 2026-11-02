"use client";

import { use } from "react";
import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { EditMemoReceivePage } from "@/features/memo-receive/components/MemoReceivePage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Memo" }, { label: "Memo Receive", href: "/memo/memo-receive" }];

export default function MemoReceiveDetailRoutePage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = use(params);
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <EditMemoReceivePage id={id} />
    </TabPage>
  );
}
