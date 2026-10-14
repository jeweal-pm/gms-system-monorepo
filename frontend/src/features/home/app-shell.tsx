"use client";

import { Bell, CircleHelp, House, LayoutDashboard, LogOut, Menu, Settings, TableProperties, UsersRound, Gem, FileText, Warehouse } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { GmsMark } from "./gms-mark";
import { navigationGroups, reportLibraryItems } from "./navigation";

const icons = [LayoutDashboard, FileText, Warehouse, UsersRound, Gem, TableProperties, Settings];
const headerDateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Bangkok",
  dateStyle: "medium",
  timeStyle: "short",
});

export function AppShell({ children, breadcrumb = "Home" }: Readonly<{ children: React.ReactNode; breadcrumb?: string }>) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending, refetch } = authClient.useSession();
  const [isSessionChecked, setIsSessionChecked] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [headerDate, setHeaderDate] = useState("");
  const accountMenuRef = useRef<HTMLDivElement>(null);

  // The shared session store can still hold a signed-out result from before login,
  // so redirect only after a fresh session check for this mount.
  useEffect(() => {
    void refetch().finally(() => setIsSessionChecked(true));
  }, [refetch]);

  useEffect(() => {
    if (isSessionChecked && !isPending && !session) router.replace("/login");
  }, [isPending, isSessionChecked, router, session]);

  useEffect(() => {
    const updateHeaderDate = () => setHeaderDate(headerDateFormatter.format(new Date()));
    updateHeaderDate();
    const intervalId = window.setInterval(updateHeaderDate, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!isAccountMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) setIsAccountMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsAccountMenuOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAccountMenuOpen]);

  async function handleSignOut() {
    setIsAccountMenuOpen(false);
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (isPending || (!session && !isSessionChecked)) {
    return (
      <div className="flex min-h-screen bg-white" aria-busy="true" aria-label="Loading application">
        <aside className="hidden w-[187px] shrink-0 border-r border-[#e0e6e9] px-5 pt-5 md:block">
          <div className="mb-8 h-8 w-28 animate-pulse rounded bg-slate-100" />
          <div className="space-y-4">
            {Array.from({ length: 12 }, (_, index) => <div key={index} className="h-3 animate-pulse rounded bg-slate-100" style={{ width: `${58 + (index % 3) * 12}%` }} />)}
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-[46px] shrink-0 items-center justify-between border-b border-[#e0e6e9] px-5">
            <div className="h-3 w-16 animate-pulse rounded bg-slate-100" />
            <div className="h-6 w-24 animate-pulse rounded-full bg-slate-100" />
          </header>
          <main className="flex-1 p-6 md:p-12">
            <div className="mx-auto max-w-[1035px]">
              <div className="mb-3 h-5 w-32 animate-pulse rounded bg-slate-100" />
              <div className="mb-7 h-3 w-48 animate-pulse rounded bg-slate-100" />
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-xl border border-slate-100 bg-slate-50" />)}
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="flex h-screen min-h-[640px] overflow-hidden bg-white">
      <aside className="hidden w-[187px] shrink-0 flex-col border-r border-[#e0e6e9] bg-white px-5 pt-5 md:flex">
        <Link href="/" className="mb-6 block"><GmsMark /></Link>
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pb-3" aria-label="เมนูหลัก">
          <Link href="/" className={`flex h-9 items-center gap-2 rounded-md px-2 text-[13px] ${pathname === "/" ? "bg-[#eaf3ff] font-medium text-[#1677ed]" : "text-[#344451] hover:bg-slate-50"}`}><House size={15} />Home</Link>
          {navigationGroups.map((group, groupIndex) => (
            <div key={group.title} className="contents">
              <div className={groupIndex === 1 || groupIndex === 3 || groupIndex === 6 ? "mt-4 border-t border-[#e7ecef] pt-3" : "mt-3"}>
                {groupIndex > 0 && <h2 className="mb-1.5 text-[9px] font-medium uppercase tracking-wide text-[#98a4ad]">{group.title}</h2>}
                {group.items.map((item, index) => {
                  const Icon = icons[(groupIndex + index) % icons.length];
                  const active = pathname === `/modules/${item.slug}`;
                  return <Link key={item.slug} href={`/modules/${item.slug}`} className={`flex h-[29px] items-center gap-2 rounded px-1.5 text-[11px] ${active ? "bg-[#eaf3ff] text-[#1677ed]" : "text-[#344451] hover:bg-slate-50"}`}><Icon size={13} strokeWidth={1.8} />{item.label}</Link>;
                })}
              </div>
            {groupIndex === 7 && (
              <div className="mt-4 border-t border-[#e7ecef] pt-3">
                <h2 className="mb-1.5 text-[9px] font-medium uppercase tracking-wide text-[#98a4ad]">Report Library</h2>
                {reportLibraryItems.map((item, index) => {
                  const Icon = icons[(index + 2) % icons.length];
                  return <Link key={item.slug} href={`/modules/${item.slug}`} className="flex h-[29px] items-center gap-2 rounded px-1.5 text-[11px] text-[#344451] hover:bg-slate-50"><Icon size={13} strokeWidth={1.8} />{item.label}</Link>;
                })}
              </div>
            )}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[46px] shrink-0 items-center justify-between border-b border-[#e0e6e9] px-5">
          <div className="flex items-center gap-3 text-[13px] text-[#51616d]"><Menu size={17} className="md:hidden" />{breadcrumb}</div>
          <div className="flex items-center gap-5 text-[11px] text-[#687887]">
            <span className="hidden items-center gap-1.5 lg:flex"><i className="h-1.5 w-1.5 rounded-full bg-[#168052]" />{headerDate}</span>
            <Link href="/settings/profile" className="hover:text-[#006c68]">Settings</Link>
            <button aria-label="ช่วยเหลือ" className="hidden sm:block"><CircleHelp size={14} /></button>
            <button aria-label="การแจ้งเตือน" className="hidden sm:block"><Bell size={14} /></button>
            <div ref={accountMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setIsAccountMenuOpen((open) => !open)}
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={isAccountMenuOpen}
                aria-controls="account-menu"
                className="flex h-[23px] w-[23px] items-center justify-center rounded-full bg-[#17212a] text-[9px] font-semibold text-white"
              >
                {session.user.name.slice(0, 2).toUpperCase() || <UsersRound size={12} />}
              </button>
              {isAccountMenuOpen && (
                <div id="account-menu" role="menu" aria-label="Account" className="absolute right-0 top-8 z-50 w-60 rounded-xl border border-[#e0e6e9] bg-white p-2 text-left shadow-[0_12px_32px_rgba(20,40,50,0.16)]">
                  <div className="px-3 py-2">
                    <p className="truncate text-xs font-semibold text-[#25333b]">{session.user.name}</p>
                    <p className="mt-1 truncate text-[11px] text-[#74828b]">{session.user.email}</p>
                  </div>
                  <div className="my-1 border-t border-[#edf0f2]" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleSignOut}
                    className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-xs font-medium text-[#a63232] transition hover:bg-[#fff2f1]"
                  >
                    <LogOut size={14} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
