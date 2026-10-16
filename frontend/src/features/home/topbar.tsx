"use client";

import { Bell, Menu, Minimize, Scan } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AccountMenu, type AccountMenuUser } from "./account-menu";
import { Breadcrumbs } from "./breadcrumbs";
import type { Breadcrumb } from "./navigation";

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

/* ---------- Notifications placeholder (no notification feature yet) ---------- */

function NotificationsButton() {
  const [notice, setNotice] = useState<string | null>(null);
  const timeoutRef = useRef(0);
  useEffect(() => () => window.clearTimeout(timeoutRef.current), []);

  function showNotice() {
    window.clearTimeout(timeoutRef.current);
    setNotice("Notifications aren't available yet.");
    timeoutRef.current = window.setTimeout(() => setNotice(null), 3000);
  }

  return (
    <div className="relative">
      <button type="button" onClick={showNotice} aria-label="Notifications" title="Notifications" className={topbarIconButton}>
        <Bell aria-hidden size={20} strokeWidth={1.5} />
        {/* Decorative dot from the source image; there is no unread-count contract yet. */}
        <span aria-hidden className="absolute right-1 top-[5px] size-[5px] rounded-full bg-gms-info-dot" />
      </button>
      <div role="status" aria-live="polite" className="absolute right-0 top-10 z-50">
        {notice && (
          <p className="rounded-gms-md border border-gms-border bg-gms-surface px-3 py-2 text-gms-label whitespace-nowrap text-gms-text shadow-gms-overlay">{notice}</p>
        )}
      </div>
    </div>
  );
}

/* ---------- Topbar ---------- */

/**
 * C-01 topbar (FE-UP-017, source 07-topbar.png): 48 px, white, 1 px #E3E7EC bottom border,
 * 24 px side padding; breadcrumbs left; clock, fullscreen, bell and avatar right.
 */
export function Topbar({
  breadcrumbs,
  user,
  onSignOut,
  menuButtonRef,
  isNavigationOpen,
  onOpenNavigation,
}: Readonly<{
  breadcrumbs: Breadcrumb[];
  user: AccountMenuUser;
  onSignOut: () => void | Promise<void>;
  menuButtonRef: React.RefObject<HTMLButtonElement | null>;
  isNavigationOpen: boolean;
  onOpenNavigation: () => void;
}>) {
  return (
    <header className="flex h-gms-topbar shrink-0 items-center gap-3 border-b border-gms-border-header bg-gms-surface px-4 md:px-6">
      <button
        ref={menuButtonRef}
        type="button"
        onClick={onOpenNavigation}
        aria-label="Open main menu"
        aria-expanded={isNavigationOpen}
        aria-controls="mobile-navigation"
        className={`${topbarIconButton} -ml-1.5 md:hidden`}
      >
        <Menu aria-hidden size={20} strokeWidth={1.5} />
      </button>
      <div className="min-w-0 flex-1">
        <Breadcrumbs items={breadcrumbs} />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <HeaderClock />
        <FullscreenButton />
        <NotificationsButton />
        <AccountMenu user={user} onSignOut={onSignOut} />
      </div>
    </header>
  );
}
