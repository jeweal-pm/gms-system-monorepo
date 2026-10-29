"use client";

import { AppShell, type Breadcrumb } from "@/features/home/app-shell";
import { MemoReturnPage } from "@/features/memo-return/components/MemoReturnPage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Memo" }, { label: "Memo Return" }];

/** Memo › Memo Return (memo-return UI rev 1 + SA rev 1). */
export default function MemoReturnRoutePage() {
  return (
    <AppShell breadcrumbs={breadcrumbs}>
      <MemoReturnPage />
    </AppShell>
  );
}
