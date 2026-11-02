"use client";

import { AppShell, type Breadcrumb } from "@/features/home/app-shell";
import { ReservePage } from "@/features/reserve/components/ReservePage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Pre-Sale" }, { label: "Reserve" }];

/** Pre-Sale › Reserve, a new document (reserve UI rev 1). */
export default function ReserveRoutePage() {
  return (
    <AppShell breadcrumbs={breadcrumbs}>
      <ReservePage />
    </AppShell>
  );
}
