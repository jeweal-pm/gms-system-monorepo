"use client";

import Link from "next/link";
import { AppShell } from "./app-shell";
import { navigationGroups, navigationHref } from "./navigation";
import { trpc } from "@/providers/app-providers";

export function HomeDashboard() {
  const shortcuts = trpc.dashboard.shortcutGroups.useQuery(undefined, { retry: false });
  const groups = shortcuts.data ?? navigationGroups;

  return (
    <AppShell>
      <div className="mx-auto max-w-[1080px] px-6 pb-10 pt-10 sm:px-10">
        <div className="mb-7">
          <h1 className="text-gms-title font-semibold tracking-tight text-[#19232a]">Shortcuts</h1>
          <p className="mt-1 text-gms-label text-[#84919a]">{groups.length} groups · {groups.reduce((total, group) => total + group.items.length, 0)} shortcuts</p>
        </div>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="ทางลัด">
          {groups.map((group) => (
            <article key={group.title} className="min-h-[148px] rounded-[9px] border border-[#d5dfe4] px-4 py-4 shadow-[0_1px_2px_rgba(20,40,50,0.02)]">
              <h2 className="mb-3 text-gms-heading font-semibold text-[#1d272d]">{group.title}</h2>
              <ul className="space-y-0.5">
                {group.items.map((item) => <li key={item.slug}><Link href={navigationHref(item)} className="block rounded px-0 py-1.5 text-gms-label text-[#556874] transition hover:text-[#006c68] hover:underline">{item.label}</Link></li>)}
              </ul>
            </article>
          ))}
        </section>
        {shortcuts.isError && <p className="mt-4 text-gms-label text-amber-700">กำลังแสดงเมนูเริ่มต้น เนื่องจากเชื่อมต่อบริการเมนูไม่ได้</p>}
      </div>
    </AppShell>
  );
}
