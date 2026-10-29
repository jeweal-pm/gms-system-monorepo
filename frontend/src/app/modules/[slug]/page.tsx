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
        <h1 className="text-gms-title font-semibold">{label ?? "Menu not found"}</h1>
        <p className="mt-2 text-gms-body text-[#687887]">This menu is part of the system layout, but its workflow is not available yet.</p>
        <Link className="mt-6 inline-block text-gms-body font-medium text-[#1477db] hover:underline" href="/">Back to Home</Link>
      </div>
    </AppShell>
  );
}
