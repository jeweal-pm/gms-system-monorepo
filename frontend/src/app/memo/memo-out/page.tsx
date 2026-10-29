"use client";

import { AppShell, type Breadcrumb } from "@/features/home/app-shell";
import { MemoOutPage } from "@/features/memo-out/components/MemoOutPage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Memo" }, { label: "Memo Out" }];

/** Memo › Memo Out (memo-out UI rev 1, FE-MO-001: page structure). */
export default function MemoOutRoutePage() {
  return (
    <AppShell breadcrumbs={breadcrumbs}>
      <MemoOutPage />
    </AppShell>
  );
}
