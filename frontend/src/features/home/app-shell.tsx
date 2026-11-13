"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ToastProvider } from "@/components/ui/toast";
import { DecimalSetupProvider } from "@/features/decimal-setup/number-format-provider";
import { authClient } from "@/lib/auth-client";
import { clearAccountCache } from "@/lib/session-cache";
import { Breadcrumbs } from "./breadcrumbs";
import { contextNavFor } from "./navigation";
import { Sidebar } from "./sidebar";
import { SidebarContextPanel } from "./sidebar-context-panel";
import { SidebarRail, type SidebarFocusRequest } from "./sidebar-rail";
import { TabBar } from "./tabs/tab-bar";
import { forgetTabsOnSignOut, TabPanels, TabsProvider, useTabs } from "./tabs/tab-host";
import { Topbar, topbarIconButton } from "./topbar";
import { resetSidebarPreference, useIsNarrowScreen, useSidebarCollapsed } from "./use-sidebar-collapsed";
import { stopNotificationStreams } from "@/features/notifications/stream";

export type { Breadcrumb } from "./navigation";

/** A refused session check (429 / 5xx / network) is retried after this delay instead of signing out. */
export const SESSION_RETRY_MS = 5_000;

export type SessionView = "loading" | "ready" | "retry" | "signed-out";

/**
 * What the shell shows (INV-20261102-001). Only a completed check that says "no session" signs the user out. A check
 * that failed (rate limited, server down) keeps the last known session on screen, so unsaved work stays; with no known
 * session yet it shows a retry notice instead of the login page.
 */
export function sessionView(state: { hasSession: boolean; hasLastSession: boolean; failed: boolean; isPending: boolean; isChecked: boolean }): SessionView {
  if (state.failed && state.hasLastSession) return "ready";
  // The shared store can hold a stale result from another page, so wait for this mount's fresh check.
  if (state.isPending || !state.isChecked) return "loading";
  if (state.hasSession) return "ready";
  return state.failed ? "retry" : "signed-out";
}
const sidebarContainerId = "app-sidebar";

/**
 * Authenticated application shell (C-01, FE-UP-017): Sidebar + Topbar (tab bar) + breadcrumbs + content.
 * app-shell-tabs (ADR-0037): rendered once by the `(app)` route-group layout; pages hand their content and
 * breadcrumbs over with `<TabPage>` and stay alive in their tabs. The session guard (fresh check, redirect
 * to /login, loading skeleton, sign-out) is as before, except that a signed-in shell is never swapped for
 * the skeleton again (that would drop every open tab).
 */
export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const { data: currentSession, isPending, error: sessionError, refetch } = authClient.useSession();
  const [isSessionChecked, setIsSessionChecked] = useState(false);
  // The last session this shell saw; kept while a session check fails (INV-20261102-001).
  const [lastSession, setLastSession] = useState(currentSession);
  if (currentSession && currentSession !== lastSession) setLastSession(currentSession);
  const view = sessionView({
    hasSession: Boolean(currentSession),
    hasLastSession: Boolean(lastSession),
    failed: Boolean(sessionError),
    isPending,
    isChecked: isSessionChecked,
  });
  const session = currentSession ?? (view === "ready" ? lastSession : null);
  // FE-NAV-003: expanded sidebar or collapsed rail at ≥ md (server/hydration render: expanded).
  const [isSidebarCollapsed, setSidebarCollapsed] = useSidebarCollapsed();
  const [animateSidebarWidth, setAnimateSidebarWidth] = useState(false);
  // Revision 2: context routes (Setup › Partner master) show the rail + context panel. Expanding there
  // opens the full sidebar for this page only; the stored preference is not changed, and another page
  // starts collapsed again.
  const contextNav = contextNavFor(pathname);
  const [contextExpandedFor, setContextExpandedFor] = useState<string | null>(null);
  const isContextExpanded = contextExpandedFor === pathname;
  // Owner 2026-11-12: below `lg` the sidebar starts as the icon rail on every page; expanding opens the full sidebar
  // over the content for this page only (the stored preference is for wide screens and is not changed).
  const isNarrow = useIsNarrowScreen();
  const [narrowExpandedFor, setNarrowExpandedFor] = useState<string | null>(null);
  const isNarrowExpanded = isNarrow && narrowExpandedFor === pathname;
  const showRail = isNarrow ? !isNarrowExpanded : contextNav ? !isContextExpanded : isSidebarCollapsed;
  const focusRequestRef = useRef<SidebarFocusRequest | null>(null);
  const takeFocusRequest = useCallback(() => {
    const request = focusRequestRef.current;
    focusRequestRef.current = null;
    return request;
  }, []);

  // The shared session store can still hold a signed-out result from before login,
  // so redirect only after a fresh session check for this mount.
  useEffect(() => {
    void refetch().finally(() => setIsSessionChecked(true));
  }, [refetch]);

  useEffect(() => {
    if (view === "signed-out") router.replace("/login");
  }, [router, view]);

  // A refused check is retried quietly; the page stays as it is.
  useEffect(() => {
    if (!sessionError) return;
    const timer = setTimeout(() => void refetch(), SESSION_RETRY_MS);
    return () => clearTimeout(timer);
  }, [refetch, sessionError]);

  async function handleSignOut() {
    // ADR-0049: the notification stream closes before the session ends (no reconnect with a dead session).
    stopNotificationStreams();
    await authClient.signOut();
    // Owner 2026-11-11: after sign-out the tab bar is empty and the sidebar is back to its default (open).
    if (session) forgetTabsOnSignOut(session.user.id);
    resetSidebarPreference();
    clearAccountCache(queryClient);
    router.replace("/login");
    router.refresh();
  }

  // The toggle sits in a different place in each state (rail: its own top row; full sidebar: the logo row), so after a
  // switch focus is moved to the new one.
  const focusToggleRef = useRef(false);
  useEffect(() => {
    if (!focusToggleRef.current) return;
    focusToggleRef.current = false;
    document.getElementById(sidebarContainerId)?.querySelector<HTMLElement>("[data-sidebar-toggle]")?.focus();
  }, [showRail]);

  /** Owner 2026-11-11: expand / collapse from the panel-icon toggle. */
  function toggleSidebar() {
    focusToggleRef.current = true;
    switchSidebar(!showRail, null);
  }

  function switchSidebar(collapsed: boolean, request: SidebarFocusRequest | null) {
    focusRequestRef.current = request;
    if (isNarrow) {
      setNarrowExpandedFor(collapsed ? null : pathname);
      return;
    }
    setAnimateSidebarWidth(true);
    if (contextNav) setContextExpandedFor(collapsed ? null : pathname);
    else setSidebarCollapsed(collapsed);
  }

  // The overlaid sidebar (narrow screens) closes with Escape, like other overlays; focus returns to the toggle.
  useEffect(() => {
    if (!isNarrowExpanded) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      focusToggleRef.current = true;
      setNarrowExpandedFor(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isNarrowExpanded]);

  // A signed-in shell is never swapped for the skeleton again (that would drop every open tab).
  if (!session) {
    if (view === "retry") {
      return (
        <div role="status" className="flex h-screen items-center justify-center bg-gms-surface p-6 text-center text-gms-body text-gms-text-secondary">
          Can&apos;t confirm your session right now. Trying again…
        </div>
      );
    }
    return view === "signed-out" ? null : <AppShellSkeleton />;
  }

  return (
    // Owner 2026-11-11 ("content scrolls into empty space"): `relative` contains absolutely placed descendants such as
    // sr-only labels deep in long tables, which otherwise made the whole document taller than the screen; `overflow-clip`
    // (unlike hidden) can't be scrolled by scrollIntoView / focus either.
    <div className="relative flex h-screen overflow-clip bg-gms-surface">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-gms-md bg-gms-surface px-3 py-2 text-gms-body text-gms-text shadow-gms-overlay focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      {/* Only one of sidebar / rail is rendered, so landmarks and focus order stay single. The width
          animates 150 ms after a user toggle only (not on the hydration switch), none with reduced motion.
          Owner 2026-11-12: below `lg` (1024 px) the rail is always shown (no hamburger drawer); expanding there lays the
          full sidebar over the content with a backdrop, while a rail-wide spacer keeps the page where it was. */}
      {isNarrowExpanded && (
        <>
          <div aria-hidden className="w-gms-rail shrink-0" />
          <div aria-hidden data-sidebar-backdrop className="fixed inset-0 z-30 bg-black/30" onClick={() => setNarrowExpandedFor(null)} />
        </>
      )}
      <aside
        id={sidebarContainerId}
        className={`h-screen shrink-0 overflow-hidden ${
          isNarrowExpanded
            ? "fixed inset-y-0 left-0 z-40 w-gms-sidebar max-w-[85vw] shadow-gms-overlay"
            : showRail
              ? contextNav && !isNarrow
                ? "w-[calc(var(--spacing-gms-rail)+var(--spacing-gms-sidebar))]"
                : "w-gms-rail"
              : "w-gms-sidebar"
        } ${
          animateSidebarWidth ? "transition-[width] duration-150 ease-out motion-reduce:transition-none" : ""
        }`}
      >
        {showRail ? (
          <div className="flex h-full">
            {/* Owner design 2026-11-11: on the rail the toggle is the rail's first item, above a short divider and the logo. */}
            <SidebarRail
              pathname={pathname}
              takeFocusRequest={takeFocusRequest}
              onExpand={(request) => switchSidebar(false, request)}
              toggle={<SidebarToggleButton expanded={false} controlsId={sidebarContainerId} onToggle={toggleSidebar} />}
            />
            {/* The context panel needs a wide screen; on narrow screens its pages are one expand away. */}
            {contextNav && !isNarrow && <SidebarContextPanel nav={contextNav} pathname={pathname} />}
          </div>
        ) : (
          // Owner design 2026-11-11: on the full sidebar it sits at the right of the GMS logo; the menu starts at the top.
          <Sidebar
            pathname={pathname}
            collapse={{ takeFocusRequest }}
            onNavigate={isNarrow ? () => setNarrowExpandedFor(null) : undefined}
            headerAction={<SidebarToggleButton expanded controlsId={sidebarContainerId} onToggle={toggleSidebar} />}
          />
        )}
      </aside>

      {/* decimal-setup FE-DEC-102: one website-wide number format for every tab (signed-in shell only). */}
      <DecimalSetupProvider>
        <ToastProvider>
          <TabsProvider key={session.user.id} userId={session.user.id}>
            <div className="flex min-w-0 flex-1 flex-col">
              <Topbar
                tabs={<ShellTabBar />}
                user={{ name: session.user.name, username: session.user.username ?? "" }}
                onSignOut={handleSignOut}
              />
              <ShellBreadcrumbs />
              {/* Each tab scrolls inside its own pane (TabPanels), so it keeps its scroll position. */}
              <main id="main-content" tabIndex={-1} className="relative min-h-0 flex-1 overflow-clip outline-none">
                <TabPanels>{children}</TabPanels>
              </main>
            </div>
          </TabsProvider>
        </ToastProvider>
      </DecimalSetupProvider>
    </div>
  );
}

/** The owner's panel icon (2026-11-11 SVG), 18 × 18 px in #1C252E (owner 2026-11-11). */
export const SIDEBAR_TOGGLE_ICON_SIZE = 18;

export function SidebarPanelIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden width={SIDEBAR_TOGGLE_ICON_SIZE} height={SIDEBAR_TOGGLE_ICON_SIZE} viewBox="0 0 16 16" fill="none" className={className}>
      <path
        d="M6 2V14M6 2H3.33333C2.59695 2 2 2.59695 2 3.33333V12.6667C2 13.403 2.59695 14 3.33333 14H6M6 2H12.6667C13.403 2 14 2.59695 14 3.33333V12.6667C14 13.403 13.403 14 12.6667 14H6"
        stroke="currentColor"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Expand / collapse the sidebar (rail ⇄ full sidebar). */
export function SidebarToggleButton({ expanded, controlsId, onToggle }: { expanded: boolean; controlsId: string; onToggle: () => void }) {
  const label = expanded ? "Collapse sidebar" : "Expand sidebar";
  return (
    <button type="button" data-sidebar-toggle aria-label={label} title={label} aria-expanded={expanded} aria-controls={controlsId} onClick={onToggle} className={topbarIconButton}>
      <SidebarPanelIcon className="text-[#1C252E]" />
    </button>
  );
}

function ShellTabBar() {
  const tabs = useTabs();
  if (!tabs) return null;
  return <TabBar tabs={tabs.tabs} activeId={tabs.activeId} onSelect={tabs.select} onClose={tabs.close} onCloseAll={tabs.closeAll} />;
}

/** Source 01: the active page's breadcrumbs sit in their own row under the tab bar. */
function ShellBreadcrumbs() {
  const breadcrumbs = useTabs()?.breadcrumbs ?? [];
  return (
    <div className="flex h-11 shrink-0 items-center border-b border-gms-border-header bg-gms-surface px-4 md:px-6">
      {breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}
    </div>
  );
}

function AppShellSkeleton() {
  return (
    <div className="relative flex h-screen overflow-clip bg-gms-surface" aria-busy="true" aria-label="Loading application">
      <aside className="hidden w-gms-sidebar shrink-0 flex-col gap-[15px] border-r border-gms-border bg-gms-surface-muted px-[14px] py-4 lg:flex">
        <div className="h-9 w-[131px] animate-pulse rounded-gms-sm bg-gms-surface-sunken" />
        <div className="mt-4 space-y-4 px-2.5">
          {Array.from({ length: 14 }, (_, index) => (
            <div key={index} className="h-3 animate-pulse rounded-gms-sm bg-gms-surface-sunken" style={{ width: `${48 + (index % 3) * 14}%` }} />
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-gms-topbar shrink-0 items-center justify-between border-b border-gms-border-header px-4 md:px-6">
          <div className="h-3 w-40 animate-pulse rounded-gms-sm bg-gms-surface-sunken" />
          <div className="size-[30px] animate-pulse rounded-full bg-gms-surface-sunken" />
        </header>
        <main className="flex-1 p-6 md:p-12">
          <div className="mx-auto max-w-[1035px]">
            <div className="mb-3 h-5 w-32 animate-pulse rounded-gms-sm bg-gms-surface-sunken" />
            <div className="mb-7 h-3 w-48 animate-pulse rounded-gms-sm bg-gms-surface-sunken" />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="h-36 animate-pulse rounded-gms-lg border border-gms-border bg-gms-surface-muted" />
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
