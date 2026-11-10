"use client";

import { usePathname, useRouter } from "next/navigation";
import { Activity, createContext, Fragment, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import type { Breadcrumb } from "../navigation";
import {
  activeTab,
  closeAllTabs,
  closeTab,
  discardQuestion,
  emptyTabs,
  fallbackTitle,
  HOME_PATH,
  HOME_TITLE,
  openUrl,
  parseStoredTabs,
  retargetTab,
  serializeTabs,
  TAB_LIMIT_MESSAGE,
  tabPath,
  tabGroup,
  tabsStorageKey,
  tabTitle,
  updateTab,
  type Tab,
  type TabsState,
} from "./tab-state";

/** What a route page hands to the shell: its content element (kept alive per tab) and its breadcrumbs. */
type PageEntry = { element: ReactNode; breadcrumbs: Breadcrumb[]; title: string };
/** Reported by the page while it is shown; not stored (T-07: unsaved data can't survive a reload). */
type TabMeta = { dirty?: boolean; docNo?: string | null };
type PendingClose = { kind: "one"; id: string } | { kind: "all" } | null;

export type TabView = Tab & { dirty: boolean };

type TabsApi = {
  tabs: TabView[];
  activeId: string;
  breadcrumbs: Breadcrumb[];
  select: (id: string) => void;
  close: (id: string) => void;
  closeAll: () => void;
};

/** `openPaths` changes when tabs open or close, so a waiting route page registers once its tab exists. */
type RegistryApi = { register: (path: string, entry: PageEntry) => void; openPaths: string };
type TabControls = { report: (meta: TabMeta) => void; retarget: (url: string) => void };

const TabsContext = createContext<TabsApi | null>(null);
const RegistryContext = createContext<RegistryApi | null>(null);
const TabControlsContext = createContext<TabControls | null>(null);

const HOME_BREADCRUMBS: Breadcrumb[] = [{ label: HOME_TITLE }];

let tabCounter = 0;
const newTabId = () => `tab-${++tabCounter}`;

function currentUrl() {
  return `${window.location.pathname}${window.location.search}`;
}

function readStoredTabs(userId: string): TabsState | null {
  try {
    return parseStoredTabs(window.localStorage.getItem(tabsStorageKey(userId)), newTabId);
  } catch {
    return null;
  }
}

export function useTabs(): TabsApi | null {
  return useContext(TabsContext);
}

/**
 * ADR-0037: owns the tab list for the signed-in user. The browser URL decides the active tab (T-01, T-08):
 * every navigation (sidebar, link, Back/Forward) opens or switches a tab; tab clicks navigate.
 */
export function TabsProvider({ userId, children }: Readonly<{ userId: string; children: ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  // T-07: the shell mounts this only on the client after the session check, so the stored list and the
  // URL are read once here: the URL's page opens in (or switches to) its tab within the stored list.
  const [initial] = useState(() => {
    const stored = readStoredTabs(userId) ?? emptyTabs;
    const url = currentUrl();
    const result = openUrl(stored, url, fallbackTitle(tabPath(url)), newTabId());
    return { ...result, path: window.location.pathname };
  });
  const [state, setState] = useState<TabsState>(initial.state);
  const stateRef = useRef(state);
  const [entries, setEntries] = useState<ReadonlyMap<string, PageEntry>>(() => new Map());
  const [meta, setMeta] = useState<Readonly<Record<string, TabMeta>>>({});
  const [pendingClose, setPendingClose] = useState<PendingClose>(null);
  const views = useMemo(() => state.tabs.map((tab) => ({ ...tab, dirty: Boolean(meta[tab.id]?.dirty) })), [meta, state.tabs]);
  const syncedPath = useRef<string>(initial.path);

  const commit = useCallback((next: TabsState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  /** T-04: a 16th page is refused; the address bar goes back to the shown tab (or Home). */
  const refuse = useCallback(() => {
    toast.show("warning", TAB_LIMIT_MESSAGE);
    const back = activeTab(stateRef.current);
    syncedPath.current = back?.path ?? HOME_PATH;
    router.replace(back?.url ?? HOME_PATH, { scroll: false });
  }, [router, toast]);

  // A reload on a 16th page (15 stored tabs) is refused like any other.
  useEffect(() => {
    if (initial.outcome === "limit") refuse();
  }, [initial, refuse]);

  // T-01 / T-08: every later navigation shows the page at the URL in its tab.
  useEffect(() => {
    if (syncedPath.current === pathname) return;
    syncedPath.current = pathname;
    const url = currentUrl();
    const result = openUrl(stateRef.current, url, fallbackTitle(tabPath(url)), newTabId());
    if (result.outcome === "limit") refuse();
    else commit(result.state);
  }, [commit, pathname, refuse]);

  // An empty list is stored too, so tabs closed with Close all don't come back after a reload.
  useEffect(() => {
    try {
      window.localStorage.setItem(tabsStorageKey(userId), serializeTabs(state));
    } catch {
      // Private mode or full storage: the tabs simply don't come back after a reload.
    }
  }, [state, userId]);

  // Hidden tabs' own beforeunload prompts are paused with their effects, so the shell asks for them.
  const anyDirty = Object.values(meta).some((entry) => entry.dirty);
  useEffect(() => {
    if (!anyDirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [anyDirty]);

  /** No tab = Home (the last tab closed, or Close all). */
  const navigateTo = useCallback((tab: Tab | undefined) => {
    syncedPath.current = tab?.path ?? HOME_PATH;
    router.push(tab?.url ?? HOME_PATH, { scroll: false });
  }, [router]);

  /** Remember where the shown tab was left (its filters live in the query) before leaving it. */
  const rememberActiveUrl = useCallback(() => {
    const current = activeTab(stateRef.current);
    if (current && tabPath(currentUrl()) === current.path) commit(updateTab(stateRef.current, current.id, { url: currentUrl() }));
  }, [commit]);

  const select = useCallback((id: string) => {
    if (id === stateRef.current.activeId) return;
    rememberActiveUrl();
    commit({ ...stateRef.current, activeId: id });
    navigateTo(activeTab(stateRef.current));
  }, [commit, navigateTo, rememberActiveUrl]);

  const forget = useCallback((removed: Tab[]) => {
    if (removed.length === 0) return;
    setEntries((current) => {
      const next = new Map(current);
      for (const tab of removed) next.delete(tab.path);
      return next;
    });
    setMeta((current) => {
      const next = { ...current };
      for (const tab of removed) delete next[tab.id];
      return next;
    });
  }, []);

  const apply = useCallback((next: TabsState) => {
    const before = stateRef.current;
    const kept = new Set(next.tabs.map((tab) => tab.id));
    forget(before.tabs.filter((tab) => !kept.has(tab.id)));
    commit(next);
    if (next.activeId !== before.activeId) navigateTo(activeTab(next));
  }, [commit, forget, navigateTo]);

  const close = useCallback((id: string) => {
    if (discardQuestion(views, id)) setPendingClose({ kind: "one", id });
    else apply(closeTab(stateRef.current, id));
  }, [apply, views]);

  const closeAll = useCallback(() => {
    if (discardQuestion(views)) setPendingClose({ kind: "all" });
    else apply(closeAllTabs());
  }, [apply, views]);

  const confirmClose = () => {
    if (pendingClose?.kind === "one") apply(closeTab(stateRef.current, pendingClose.id));
    else if (pendingClose?.kind === "all") apply(closeAllTabs());
    setPendingClose(null);
  };

  const register = useCallback((path: string, entry: PageEntry) => {
    const tab = stateRef.current.tabs.find((candidate) => candidate.path === path);
    if (!tab) return; // a refused 16th page (T-04) renders once on its way back
    setEntries((current) => {
      const previous = current.get(path);
      if (previous && previous.element === entry.element && previous.title === entry.title && previous.breadcrumbs === entry.breadcrumbs) return current;
      return new Map(current).set(path, entry);
    });
  }, []);

  const report = useCallback((id: string, patch: TabMeta) => {
    setMeta((current) => {
      const previous = current[id] ?? {};
      if (Object.entries(patch).every(([key, value]) => previous[key as keyof TabMeta] === value)) return current;
      return { ...current, [id]: { ...previous, ...patch } };
    });
  }, []);

  const retarget = useCallback((id: string, url: string) => {
    const from = stateRef.current.tabs.find((tab) => tab.id === id);
    const next = retargetTab(stateRef.current, id, url);
    const moved = next.tabs.find((tab) => tab.id === id);
    if (from && moved && from.path !== moved.path) {
      setEntries((current) => {
        const entry = current.get(from.path);
        if (!entry || current.has(moved.path)) return current;
        const map = new Map(current);
        map.delete(from.path);
        return map.set(moved.path, entry);
      });
    }
    syncedPath.current = tabPath(url);
    apply(next);
    if (next.activeId === stateRef.current.activeId) router.replace(url, { scroll: false });
  }, [apply, router]);

  // Titles follow the page name and the document number (T-03) and are kept for the next reload.
  useEffect(() => {
    let next = stateRef.current;
    for (const tab of next.tabs) {
      const entry = entries.get(tab.path);
      if (entry) next = updateTab(next, tab.id, { title: tabTitle(entry.title, meta[tab.id]?.docNo) });
    }
    if (next !== stateRef.current) commit(next);
  }, [commit, entries, meta]);

  const active = activeTab(state);
  const tabsApi = useMemo<TabsApi>(
    () => ({ tabs: views, activeId: state.activeId, breadcrumbs: active ? entries.get(active.path)?.breadcrumbs ?? [] : HOME_BREADCRUMBS, select, close, closeAll }),
    [active, close, closeAll, entries, select, state.activeId, views],
  );
  const openPaths = state.tabs.map((tab) => tab.path).join(" ");
  const registryApi = useMemo<RegistryApi>(() => ({ register, openPaths }), [openPaths, register]);
  const controls = useMemo(() => ({ report, retarget }), [report, retarget]);

  const question = pendingClose ? discardQuestion(views, pendingClose.kind === "one" ? pendingClose.id : undefined) : null;

  return (
    <TabsContext.Provider value={tabsApi}>
      <RegistryContext.Provider value={registryApi}>
        <TabEntriesContext.Provider value={{ state, entries, controls }}>{children}</TabEntriesContext.Provider>
      </RegistryContext.Provider>
      <ConfirmDialog
        open={pendingClose !== null}
        title="Unsaved changes"
        body={question ?? ""}
        cancelLabel="Cancel"
        confirmLabel="Discard"
        pendingLabel="Closing…"
        pending={false}
        onCancel={() => setPendingClose(null)}
        onConfirm={confirmClose}
      />
    </TabsContext.Provider>
  );
}

type EntriesValue = { state: TabsState; entries: ReadonlyMap<string, PageEntry>; controls: { report: (id: string, meta: TabMeta) => void; retarget: (id: string, url: string) => void } };
const TabEntriesContext = createContext<EntriesValue | null>(null);

/**
 * T-02: every open tab's page stays mounted; hidden ones sit in `<Activity mode="hidden">` (DOM and React
 * state kept, effects paused). `children` is the route Next.js rendered: its page registers itself and
 * renders nothing, so what remains visible is only a not-found page or a tab whose page hasn't loaded yet.
 */
export function TabPanels({ children }: Readonly<{ children: ReactNode }>) {
  const value = useContext(TabEntriesContext);
  if (!value) return <>{children}</>;
  const { state, entries, controls } = value;
  const active = activeTab(state);
  const showRoute = !active || !entries.get(active.path);
  return (
    <>
      {state.tabs.map((tab) => {
        const entry = entries.get(tab.path);
        if (!entry) return null;
        return (
          <Activity key={tab.id} mode={tab.id === state.activeId ? "visible" : "hidden"} name={tab.path}>
            <TabPane tabId={tab.id} controls={controls}>{entry.element}</TabPane>
          </Activity>
        );
      })}
      <div className={showRoute ? "h-full overflow-auto" : "hidden"}>{children}</div>
    </>
  );
}

/** Each tab scrolls on its own, and gets its scroll position back when shown again. */
function TabPane({ tabId, controls, children }: Readonly<{ tabId: string; controls: EntriesValue["controls"]; children: ReactNode }>) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollTop = useRef(0);
  const value = useMemo<TabControls>(() => ({ report: (meta) => controls.report(tabId, meta), retarget: (url) => controls.retarget(tabId, url) }), [controls, tabId]);
  // Runs again each time the tab is shown (Activity re-runs effects).
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = scrollTop.current;
  }, []);
  return (
    <div ref={ref} onScroll={(event) => (scrollTop.current = event.currentTarget.scrollTop)} className="h-full overflow-auto">
      <TabControlsContext.Provider value={value}>{children}</TabControlsContext.Provider>
    </div>
  );
}

/**
 * A route page's content inside the App Shell (ADR-0037 decision 1). The element is captured with its props
 * (a detail page's id included), so a hidden tab keeps showing its own record. Home has no tab (owner
 * 2026-11-03): it renders in place and is not kept alive.
 */
export function TabPage({ breadcrumbs, children }: Readonly<{ breadcrumbs: Breadcrumb[]; children: ReactNode }>) {
  const registry = useContext(RegistryContext);
  const pathname = usePathname();
  const path = tabPath(pathname ?? HOME_PATH);
  const tabbed = registry !== null && path !== HOME_PATH;
  // A grouped section (Approve) keeps its section name on the tab; the breadcrumbs still name the sub-page.
  const group = tabGroup(path);
  const title = group?.title ?? breadcrumbs[breadcrumbs.length - 1]?.label ?? fallbackTitle(path);
  // Keyed by the real pathname so moving to another sub-page of a group starts that page fresh.
  const element = useMemo(() => (group ? <Fragment key={pathname}>{children}</Fragment> : children), [children, group, pathname]);
  useLayoutEffect(() => {
    if (tabbed) registry.register(path, { element, breadcrumbs, title });
  });
  return tabbed ? null : <>{children}</>;
}

/** Q-TAB-03: marks the page's tab with unsaved changes (the dot, and a confirm before it closes). */
export function useTabDirty(dirty: boolean) {
  const tab = useContext(TabControlsContext);
  useEffect(() => {
    tab?.report({ dirty });
  }, [tab, dirty]);
}

/** T-03: a document page reports its number; `undefined` = a new document ("New Memo Out"). */
export function useTabDocument(docNo: string | undefined) {
  const tab = useContext(TabControlsContext);
  useEffect(() => {
    tab?.report({ docNo: docNo ?? null });
  }, [tab, docNo]);
}

/**
 * T-09: navigation that moves the page in place (a new document saved to its id, a deleted one back to New)
 * keeps the same tab instead of opening another. Outside the tabs it is a plain `router.replace`.
 */
export function useTabReplace(): (href: string) => void {
  const tab = useContext(TabControlsContext);
  const router = useRouter();
  return useCallback((href: string) => {
    if (tab) tab.retarget(href);
    else router.replace(href);
  }, [router, tab]);
}
