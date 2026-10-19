"use client";

import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { clearAccountCache } from "@/lib/session-cache";
import { contextNavFor, type Breadcrumb } from "./navigation";
import { Sidebar } from "./sidebar";
import { SidebarContextPanel } from "./sidebar-context-panel";
import { SidebarRail, type SidebarFocusRequest } from "./sidebar-rail";
import { Topbar, topbarIconButton } from "./topbar";
import { useSidebarCollapsed } from "./use-sidebar-collapsed";

export type { Breadcrumb } from "./navigation";

const defaultBreadcrumbs: Breadcrumb[] = [{ label: "Home" }];
const sidebarContainerId = "app-sidebar";

/**
 * Authenticated application shell (C-01, FE-UP-017): Sidebar + Topbar + content slot.
 * Every signed-in page renders inside it and passes its breadcrumbs as data; the last item
 * is the current page. The session guard (fresh check, redirect to /login, loading
 * skeleton, sign-out) is unchanged from the previous AppShell.
 */
export function AppShell({ children, breadcrumbs = defaultBreadcrumbs }: Readonly<{ children: React.ReactNode; breadcrumbs?: Breadcrumb[] }>) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const { data: session, isPending, refetch } = authClient.useSession();
  const [isSessionChecked, setIsSessionChecked] = useState(false);
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  // FE-NAV-003: expanded sidebar or collapsed rail at ≥ md (server/hydration render: expanded).
  const [isSidebarCollapsed, setSidebarCollapsed] = useSidebarCollapsed();
  const [animateSidebarWidth, setAnimateSidebarWidth] = useState(false);
  // Revision 2: context routes (Setup › Partner master) show the rail + context panel. Expanding there
  // opens the full sidebar for this page only; the stored preference is not changed. Each page renders
  // its own AppShell, so this resets on navigation.
  const contextNav = contextNavFor(pathname);
  const [isContextExpanded, setIsContextExpanded] = useState(false);
  const showRail = contextNav ? !isContextExpanded : isSidebarCollapsed;
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
    if (isSessionChecked && !isPending && !session) router.replace("/login");
  }, [isPending, isSessionChecked, router, session]);

  async function handleSignOut() {
    await authClient.signOut();
    clearAccountCache(queryClient);
    router.replace("/login");
    router.refresh();
  }

  function switchSidebar(collapsed: boolean, request: SidebarFocusRequest) {
    focusRequestRef.current = request;
    setAnimateSidebarWidth(true);
    if (contextNav) setIsContextExpanded(!collapsed);
    else setSidebarCollapsed(collapsed);
  }

  function closeNavigation(returnFocus: boolean) {
    setIsNavigationOpen(false);
    if (returnFocus) menuButtonRef.current?.focus();
  }

  if (isPending || (!session && !isSessionChecked)) return <AppShellSkeleton />;

  if (!session) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-gms-surface">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-gms-md bg-gms-surface px-3 py-2 text-gms-body text-gms-text shadow-gms-overlay focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      {/* Only one of sidebar / rail is rendered, so landmarks and focus order stay single. The width
          animates 150 ms after a user toggle only (not on the hydration switch), none with reduced motion. */}
      <aside
        id={sidebarContainerId}
        className={`hidden h-screen shrink-0 overflow-hidden md:block ${
          showRail ? (contextNav ? "w-[calc(var(--spacing-gms-rail)+var(--spacing-gms-sidebar))]" : "w-gms-rail") : "w-gms-sidebar"
        } ${
          animateSidebarWidth ? "transition-[width] duration-150 ease-out motion-reduce:transition-none" : ""
        }`}
      >
        {showRail ? (
          <div className="flex h-full">
            <SidebarRail pathname={pathname} controlsId={sidebarContainerId} takeFocusRequest={takeFocusRequest} onExpand={(request) => switchSidebar(false, request)} />
            {contextNav && <SidebarContextPanel nav={contextNav} pathname={pathname} />}
          </div>
        ) : (
          <Sidebar
            pathname={pathname}
            collapse={{ controlsId: sidebarContainerId, takeFocusRequest, onCollapse: () => switchSidebar(true, { target: "toggle" }) }}
          />
        )}
      </aside>

      {isNavigationOpen && <MobileNavigation pathname={pathname} onClose={closeNavigation} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          breadcrumbs={breadcrumbs}
          user={{ name: session.user.name, username: session.user.username ?? "" }}
          onSignOut={handleSignOut}
          menuButtonRef={menuButtonRef}
          isNavigationOpen={isNavigationOpen}
          onOpenNavigation={() => setIsNavigationOpen(true)}
        />
        <main id="main-content" tabIndex={-1} className="min-h-0 flex-1 overflow-auto outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * Below `md` the sidebar opens as a modal drawer from the topbar menu button (FE-NAV-004): always the
 * expanded sidebar, no collapse toggle or rail; the focus trap skips links inside closed disclosures.
 */
function MobileNavigation({ pathname, onClose }: Readonly<{ pathname: string; onClose: (returnFocus: boolean) => void }>) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose(true);
      return;
    }
    if (event.key !== "Tab") return;
    const focusables = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []).filter((element) => !element.closest("[hidden]"));
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <div aria-hidden className="absolute inset-0 bg-black/30" onClick={() => onClose(false)} />
      <div
        ref={panelRef}
        id="mobile-navigation"
        role="dialog"
        aria-modal="true"
        aria-label="Main menu"
        onKeyDown={handleKeyDown}
        className="absolute inset-y-0 left-0 max-w-[85vw] shadow-gms-overlay"
      >
        <Sidebar pathname={pathname} onNavigate={() => onClose(false)} className="max-w-[85vw]" />
        <button ref={closeButtonRef} type="button" onClick={() => onClose(true)} aria-label="Close main menu" className={`${topbarIconButton} absolute right-2 top-[18px]`}>
          <X aria-hidden size={20} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

function AppShellSkeleton() {
  return (
    <div className="flex h-screen overflow-hidden bg-gms-surface" aria-busy="true" aria-label="Loading application">
      <aside className="hidden w-gms-sidebar shrink-0 flex-col gap-[15px] border-r border-gms-border bg-gms-surface-muted px-[14px] py-4 md:flex">
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
