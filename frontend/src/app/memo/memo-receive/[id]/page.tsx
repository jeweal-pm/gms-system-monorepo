"use client";

import { useParams } from "next/navigation";
import { AppShell, type Breadcrumb } from "@/features/home/app-shell";
import { EditMemoReceivePage } from "@/features/memo-receive/components/MemoReceivePage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Memo" }, { label: "Memo Receive", href: "/memo/memo-receive" }];

export default function MemoReceiveDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <AppShell breadcrumbs={breadcrumbs}>
      <EditMemoReceivePage id={id} />
    </AppShell>
  );
}
