"use client";

import { Minimize, Scan } from "lucide-react";
import { useSyncExternalStore } from "react";
import { NotificationsBell } from "@/features/notifications/components/NotificationsBell";
import { AccountMenu, type AccountMenuUser } from "./account-menu";
import { LanguageMenu } from "./language-menu";

export const topbarIconButton =
  "relative flex size-8 shrink-0 items-center justify-center rounded-gms-md text-gms-text transition-colors hover:bg-gms-nav-active focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gms-primary";

/* ---------- Live clock: "Thu 1 Oct 2026, 09:30 AM" in the viewer's time zone ---------- */

function subscribeToMinute(onChange: () => void) {
  let timeoutId = 0;
  const schedule = () => {
    timeoutId = window.setTimeout(() => {
      onChange();
      schedule();
    }, 60_000 - (Date.now() % 60_000) + 50);
  };
  schedule();
  return () => window.clearTimeout(timeoutId);
}
const currentMinute = () => Math.floor(Date.now() / 60_000);
const noMinuteOnServer = () => null;

// en-US parts give "Thu", "Oct", "09", "AM"; the source order is weekday day month year, time.
const clockFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

function formatClock(date: Date) {
  const parts = clockFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("weekday")} ${part("day")} ${part("month")} ${part("year")}, ${part("hour")}:${part("minute")} ${part("dayPeriod")}`;
}

function HeaderClock() {
  // Null on the server and during hydration, so the first client render matches.
  const minute = useSyncExternalStore(subscribeToMinute, currentMinute, noMinuteOnServer);
  const date = minute === null ? null : new Date(minute * 60_000);
  return (
    <span className="mr-2.5 hidden min-w-[150px] items-center gap-1.5 text-gms-label leading-5 whitespace-nowrap text-gms-text-muted md:flex">
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-gms-success" />
      {date && <time dateTime={date.toISOString()}>{formatClock(date)}</time>}
    </span>
  );
}

/* ---------- Fullscreen toggle (Fullscreen API) ---------- */

function subscribeToFullscreen(onChange: () => void) {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}
const readFullscreen = () => document.fullscreenElement !== null;
const readFullscreenEnabled = () => document.fullscreenEnabled;
const serverFalse = () => false;
const serverTrue = () => true;

function FullscreenButton() {
  const isFullscreen = useSyncExternalStore(subscribeToFullscreen, readFullscreen, serverFalse);
  const isEnabled = useSyncExternalStore(subscribeToFullscreen, readFullscreenEnabled, serverTrue);
  if (!isEnabled) return null;

  function toggle() {
    const request = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    // A rejected request (e.g. blocked by the browser) leaves the page as it was.
    request.catch(() => undefined);
  }

  const label = isFullscreen ? "Exit full screen" : "Enter full screen";
  const Icon = isFullscreen ? Minimize : Scan;
  return (
    <button type="button" onClick={toggle} aria-label={label} title={label} className={topbarIconButton}>
      <Icon aria-hidden size={20} strokeWidth={1.5} />
    </button>
  );
}

/* ---------- Topbar ---------- */

/**
 * C-01 topbar (FE-UP-017, source 07-topbar.png): 48 px, 1 px #E3E7EC bottom border; app-shell-tabs
 * (source 01): the tab bar fills it from the sidebar edge, then clock, fullscreen, bell and avatar.
 * The breadcrumbs moved to their own row below.
 */
export function Topbar({
  tabs,
  user,
  onSignOut,
}: Readonly<{
  tabs: React.ReactNode;
  user: AccountMenuUser;
  onSignOut: () => void | Promise<void>;
}>) {
  return (
    // Owner 2026-11-12: no hamburger; on every width the sidebar's own expand / collapse toggle opens the menu.
    <header className="flex h-gms-topbar shrink-0 items-stretch gap-3 border-b border-gms-border-header bg-gms-page pl-2 pr-4 md:pr-6">
      {tabs}
      <div className="flex shrink-0 items-center gap-2 border-l border-gms-border-header pl-3">
        <HeaderClock />
        {/* Owner design 2026-11-12: language, notifications, full screen, account. */}
        <LanguageMenu topbarIconButton={topbarIconButton} />
        <NotificationsBell />
        <FullscreenButton />
        <AccountMenu user={user} onSignOut={onSignOut} />
      </div>
    </header>
  );
}
