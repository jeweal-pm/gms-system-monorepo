"use client";

import { use } from "react";
import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { EditMemoOutPage } from "@/features/memo-out/components/MemoOutPage";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Memo" }, { label: "Memo Out", href: "/memo/memo-out" }];

/** Memo › Memo Out, a saved document (memo-out SA rev 1). */
export default function MemoOutDetailRoutePage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = use(params);
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <EditMemoOutPage id={id} />
    </TabPage>
  );
}
