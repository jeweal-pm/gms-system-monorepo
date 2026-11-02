"use client";

import { use } from "react";
import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { EditReservePage } from "@/features/reserve/components/ReservePage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Pre-Sale" }, { label: "Reserve", href: "/pre-sale/reserve" }];

/** Pre-Sale › Reserve, a saved document (reserve SA rev 1). */
export default function ReserveDetailRoutePage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = use(params);
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <EditReservePage id={id} />
    </TabPage>
  );
}
