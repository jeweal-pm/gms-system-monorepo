"use client";

import { useParams } from "next/navigation";
import { AppShell, type Breadcrumb } from "@/features/home/app-shell";
import { EditMemoOutReturnPage } from "@/features/memo-out-return/components/MemoOutReturnPage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Memo" }, { label: "Memo Out Return", href: "/memo/memo-out-return" }];

/** Memo › Memo Out Return, a saved document (memo-out-return SA rev 1). */
export default function MemoOutReturnDetailRoutePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <AppShell breadcrumbs={breadcrumbs}>
      <EditMemoOutReturnPage id={id} />
    </AppShell>
  );
}
