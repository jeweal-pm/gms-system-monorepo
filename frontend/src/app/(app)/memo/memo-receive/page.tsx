"use client";

import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { NewMemoReceivePage } from "@/features/memo-receive/components/MemoReceivePage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Memo" }, { label: "Memo Receive" }];

export default function MemoReceiveRoutePage() {
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <NewMemoReceivePage />
    </TabPage>
  );
}
