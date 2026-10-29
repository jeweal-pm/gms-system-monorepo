"use client";

import { AppShell, type Breadcrumb } from "@/features/home/app-shell";
import { NewMemoReceivePage } from "@/features/memo-receive/components/MemoReceivePage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Memo" }, { label: "Memo Receive" }];

export default function MemoReceivePage() {
  return (
    <AppShell breadcrumbs={breadcrumbs}>
      <NewMemoReceivePage />
    </AppShell>
  );
}
