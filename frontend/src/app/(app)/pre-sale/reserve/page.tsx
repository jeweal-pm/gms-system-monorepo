"use client";

import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { ReservePage } from "@/features/reserve/components/ReservePage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Pre-Sale" }, { label: "Reserve" }];

/** Pre-Sale › Reserve, a new document (reserve UI rev 1). */
export default function ReserveRoutePage() {
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <ReservePage />
    </TabPage>
  );
}
