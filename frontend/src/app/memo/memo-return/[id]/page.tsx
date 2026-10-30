"use client";

import { useParams } from "next/navigation";
import { AppShell, type Breadcrumb } from "@/features/home/app-shell";
import { EditMemoReturnPage } from "@/features/memo-return/components/MemoReturnPage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Memo" }, { label: "Memo Return", href: "/memo/memo-return" }];

/** Memo › Memo Return, a saved document (memo-return SA rev 1). */
export default function MemoReturnDetailRoutePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <AppShell breadcrumbs={breadcrumbs}>
      <EditMemoReturnPage id={id} />
    </AppShell>
  );
}
