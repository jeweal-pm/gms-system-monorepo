"use client";

import { useParams } from "next/navigation";
import { AppShell, type Breadcrumb } from "@/features/home/app-shell";
import { EditMemoOutPage } from "@/features/memo-out/components/MemoOutPage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Memo" }, { label: "Memo Out", href: "/memo/memo-out" }];

/** Memo › Memo Out, a saved document (memo-out SA rev 1). */
export default function MemoOutDetailRoutePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <AppShell breadcrumbs={breadcrumbs}>
      <EditMemoOutPage id={id} />
    </AppShell>
  );
}
