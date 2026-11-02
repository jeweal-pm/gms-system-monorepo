"use client";

import { useParams } from "next/navigation";
import { AppShell, type Breadcrumb } from "@/features/home/app-shell";
import { EditReservePage } from "@/features/reserve/components/ReservePage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Pre-Sale" }, { label: "Reserve", href: "/pre-sale/reserve" }];

/** Pre-Sale › Reserve, a saved document (reserve SA rev 1). */
export default function ReserveDetailRoutePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <AppShell breadcrumbs={breadcrumbs}>
      <EditReservePage id={id} />
    </AppShell>
  );
}
