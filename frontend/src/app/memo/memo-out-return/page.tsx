"use client";

import { AppShell, type Breadcrumb } from "@/features/home/app-shell";
import { MemoOutReturnPage } from "@/features/memo-out-return/components/MemoOutReturnPage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Memo" }, { label: "Memo Out Return" }];

/** Memo › Memo Out Return (memo-out-return UI rev 1, FE-MOR-001: page structure). */
export default function MemoOutReturnRoutePage() {
  return (
    <AppShell breadcrumbs={breadcrumbs}>
      <MemoOutReturnPage />
    </AppShell>
  );
}
