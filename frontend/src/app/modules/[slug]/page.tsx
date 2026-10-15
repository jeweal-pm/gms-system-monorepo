"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/features/home/app-shell";
import { moduleBreadcrumbs } from "@/features/home/navigation";

export default function ModulePlaceholderPage() {
  const params = useParams<{ slug: string }>();
  const { label, breadcrumbs } = moduleBreadcrumbs(params.slug);

  return (
    <AppShell breadcrumbs={breadcrumbs}>
      <div className="mx-auto max-w-[760px] px-6 py-12 sm:px-10">
        <h1 className="text-xl font-semibold">{label ?? "ไม่พบเมนู"}</h1>
        <p className="mt-2 text-sm text-[#687887]">เมนูนี้แสดงในโครงระบบเริ่มต้นแล้ว แต่ยังไม่มี workflow ในเอกสารที่ให้มา</p>
        <Link className="mt-6 inline-block text-sm font-medium text-[#1477db] hover:underline" href="/">กลับหน้า Home</Link>
      </div>
    </AppShell>
  );
}
