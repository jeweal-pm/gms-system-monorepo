/**
 * App Shell tabs (app-shell-tabs UI rev 1, ADR-0037): the tab list as plain data. Every change is a pure
 * function so the rules (T-01 one tab per page, T-04 limit, T-06 close order, T-07 storage) are unit tested
 * without React. The provider in tab-host.tsx owns the state and the side effects (navigation, storage).
 */

export const MAX_TABS = 15;
export const HOME_PATH = "/";
export const HOME_TITLE = "Home";
export const TAB_LIMIT_MESSAGE = `Close a tab to open another (${MAX_TABS} tabs open)`;

/** `path` identifies the tab (T-01); `url` is where it was last left, with its query (filters). */
export type Tab = { id: string; path: string; url: string; title: string };
/** `activeId` is "" while Home is shown: Home never has a tab (owner 2026-11-03). */
export type TabsState = { tabs: Tab[]; activeId: string };
export type OpenOutcome = "opened" | "switched" | "home" | "limit";

export const emptyTabs: TabsState = { tabs: [], activeId: "" };

/** The tab key of a URL: its path without query, hash or trailing slash. */
export function tabPath(url: string): string {
  const path = url.split(/[?#]/, 1)[0] || HOME_PATH;
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

export function activeTab(state: TabsState): Tab | undefined {
  return state.tabs.find((tab) => tab.id === state.activeId);
}

/**
 * T-01 / T-04: a page that has a tab switches to it (and keeps where it was left only when the URL has no
 * query of its own); a new page opens a tab after the active one, unless 15 are open. Home opens no tab and
 * leaves every tab inactive (owner 2026-11-03).
 */
export function openUrl(state: TabsState, url: string, title: string, newId: string): { state: TabsState; outcome: OpenOutcome } {
  const path = tabPath(url);
  if (path === HOME_PATH) return { state: state.activeId === "" ? state : { ...state, activeId: "" }, outcome: "home" };
  const existing = state.tabs.find((tab) => tab.path === path);
  if (existing) {
    const tabs = state.tabs.map((tab) => (tab.id === existing.id ? { ...tab, url } : tab));
    return { state: { tabs, activeId: existing.id }, outcome: "switched" };
  }
  if (state.tabs.length >= MAX_TABS) return { state, outcome: "limit" };
  const tab: Tab = { id: newId, path, url, title };
  const at = state.tabs.findIndex((candidate) => candidate.id === state.activeId);
  const tabs = at < 0 ? [...state.tabs, tab] : [...state.tabs.slice(0, at + 1), tab, ...state.tabs.slice(at + 1)];
  return { state: { tabs, activeId: newId }, outcome: "opened" };
}

/** T-06: closing the active tab shows its right neighbour, else its left one; closing the last tab shows Home. */
export function closeTab(state: TabsState, id: string): TabsState {
  const at = state.tabs.findIndex((tab) => tab.id === id);
  if (at < 0) return state;
  const tabs = state.tabs.filter((tab) => tab.id !== id);
  if (state.activeId !== id) return { tabs, activeId: state.activeId };
  return { tabs, activeId: (tabs[at] ?? tabs[at - 1])?.id ?? "" };
}

/** Close all closes every tab and shows Home (Q-TAB-06; Home has no tab since 2026-11-03). */
export function closeAllTabs(): TabsState {
  return emptyTabs;
}

/**
 * T-09: a page that moves to another URL in place (a new document saved, a deleted one back to New) keeps
 * its tab. When another tab already has that page, this tab closes and that one is shown instead.
 */
export function retargetTab(state: TabsState, id: string, url: string): TabsState {
  const path = tabPath(url);
  const other = state.tabs.find((tab) => tab.path === path && tab.id !== id);
  if (other) {
    const tabs = state.tabs.filter((tab) => tab.id !== id).map((tab) => (tab.id === other.id ? { ...tab, url } : tab));
    return { tabs, activeId: other.id };
  }
  return { ...state, tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, path, url } : tab)) };
}

export function updateTab(state: TabsState, id: string, patch: Partial<Pick<Tab, "title" | "url">>): TabsState {
  const tab = state.tabs.find((candidate) => candidate.id === id);
  if (!tab || Object.entries(patch).every(([key, value]) => tab[key as keyof Tab] === value)) return state;
  return { ...state, tabs: state.tabs.map((candidate) => (candidate.id === id ? { ...candidate, ...patch } : candidate)) };
}

/**
 * T-03: the page name (last breadcrumb); a document page adds its number ("Memo Out · MO-1"), or reads
 * "New Memo Out" before its first save. `docNo` undefined = not a document page.
 */
export function tabTitle(pageTitle: string, docNo: string | null | undefined): string {
  if (docNo === undefined) return pageTitle;
  return docNo ? `${pageTitle} · ${docNo}` : `New ${pageTitle}`;
}

/** Until a page tells its own title (or after a reload), the last path segment in words. */
export function fallbackTitle(path: string): string {
  if (path === HOME_PATH) return HOME_TITLE;
  const segment = decodeURIComponentSafe(path.slice(path.lastIndexOf("/") + 1));
  return segment.replace(/-/g, " ").replace(/^\w/, (letter) => letter.toUpperCase()) || HOME_TITLE;
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/* ---------- T-07: the tab list per user in this browser ---------- */

const STORAGE_PREFIX = "gms.tabs.v1:";
const MAX_URL_LENGTH = 2048;
const MAX_TITLE_LENGTH = 200;

export function tabsStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function serializeTabs(state: TabsState): string {
  const active = state.tabs.findIndex((tab) => tab.id === state.activeId);
  return JSON.stringify({ tabs: state.tabs.map(({ url, title }) => ({ url, title })), active });
}

/** Same-origin app paths only ("/x", never "//host" or a scheme). */
function isAppUrl(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_URL_LENGTH && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\");
}

/** Stored text from an older version, another app or a hand edit is ignored rather than trusted. */
export function parseStoredTabs(raw: string | null, newId: () => string): TabsState | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null || !Array.isArray((data as { tabs?: unknown }).tabs)) return null;
  const tabs: Tab[] = [];
  const active = (data as { active?: unknown }).active;
  let activeId = "";
  for (const [index, entry] of (data as { tabs: unknown[] }).tabs.entries()) {
    if (tabs.length >= MAX_TABS) break;
    if (typeof entry !== "object" || entry === null) continue;
    const { url, title } = entry as { url?: unknown; title?: unknown };
    if (!isAppUrl(url)) continue;
    const path = tabPath(url);
    // A Home tab stored before 2026-11-03 is dropped: Home has no tab now.
    if (path === HOME_PATH || tabs.some((tab) => tab.path === path)) continue;
    const name = typeof title === "string" && title.trim() ? title.slice(0, MAX_TITLE_LENGTH) : fallbackTitle(path);
    const tab = { id: newId(), path, url, title: name };
    if (index === active) activeId = tab.id;
    tabs.push(tab);
  }
  if (tabs.length === 0) return null;
  return { tabs, activeId: activeId || tabs[0].id };
}

/**
 * Q-TAB-03 / T-05: the question asked before closing, or null when nothing unsaved would be lost.
 * `id` = close that tab; omitted = Close all.
 */
export function discardQuestion(tabs: readonly { id: string; title: string; dirty: boolean }[], id?: string): string | null {
  if (id !== undefined) {
    const tab = tabs.find((candidate) => candidate.id === id);
    return tab?.dirty ? `Discard unsaved changes in ${tab.title}?` : null;
  }
  const dirty = tabs.filter((tab) => tab.dirty);
  if (dirty.length === 0) return null;
  return dirty.length === 1 ? `Discard unsaved changes in ${dirty[0].title}?` : `Discard unsaved changes in ${dirty.length} tabs?`;
}
