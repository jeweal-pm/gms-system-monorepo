/**
 * App Shell tabs (app-shell-tabs UI rev 1, ADR-0037): the tab list as plain data. Every change is a pure
 * function so the rules (T-01 one tab per page, T-04 limit, T-06 close order, T-07 storage) are unit tested
 * without React. The provider in tab-host.tsx owns the state and the side effects (navigation, storage).
 */

export const MAX_TABS = 15;
export const HOME_PATH = "/";
export const HOME_TITLE = "Home";
export const TAB_LIMIT_MESSAGE = `Close a tab to open another (${MAX_TABS} tabs open)`;

/**
 * `path` identifies the tab (T-01); `url` is where it was last left, with its query (filters). `usedAt` is when it was
 * last opened or shown (epoch ms; owner 2026-11-16: the least recently used tab makes room for a 16th page).
 */
export type Tab = { id: string; path: string; url: string; title: string; usedAt?: number };
/** `activeId` is "" while Home is shown: Home never has a tab (owner 2026-11-03). */
export type TabsState = { tabs: Tab[]; activeId: string };
export type OpenOutcome = "opened" | "switched" | "home" | "limit" | "evicted";
/** Tabs that are never closed to make room: unsaved changes (and, once pinning exists, pinned tabs). */
export type OpenOptions = { now?: number; keep?: ReadonlySet<string> };
/** How long the "Automatically closed …" toast offers Undo (owner 2026-11-16). */
export const TAB_UNDO_MS = 6_000;

/** Owner design 2026-11-16: Automatically closed “Stone Certificate” (least recently used) to open “Stone Shape”. */
export function tabEvictedMessage(closedTitle: string, openedTitle: string): string {
  return `Automatically closed “${closedTitle}” (least recently used) to open “${openedTitle}”`;
}

/**
 * Owner 2026-11-16: the tab that makes room for a new page: the least recently used one that has no unsaved changes
 * (`keep`) and is not the shown one; ties keep the strip order. `undefined` when every tab must stay.
 */
export function leastRecentlyUsed(state: TabsState, keep: ReadonlySet<string> = new Set()): Tab | undefined {
  let pick: Tab | undefined;
  for (const tab of state.tabs) {
    if (tab.id === state.activeId || keep.has(tab.id)) continue;
    if (!pick || (tab.usedAt ?? 0) < (pick.usedAt ?? 0)) pick = tab;
  }
  return pick;
}

export const emptyTabs: TabsState = { tabs: [], activeId: "" };

/**
 * Sections whose sub-pages share one tab (owner 2026-11-09): Approve › {Menu} moves inside the Approve tab
 * instead of opening a tab per menu. The tab keeps the sub-page it was left on in its `url`.
 */
export const TAB_GROUPS: readonly { path: string; title: string }[] = [{ path: "/approve", title: "Approve" }];

export function tabGroup(path: string): { path: string; title: string } | undefined {
  return TAB_GROUPS.find((group) => path === group.path || path.startsWith(`${group.path}/`));
}

/** The tab key of a URL: its path without query, hash or trailing slash; a grouped sub-page keys to its section. */
export function tabPath(url: string): string {
  const raw = url.split(/[?#]/, 1)[0] || HOME_PATH;
  const path = raw.length > 1 && raw.endsWith("/") ? raw.slice(0, -1) : raw;
  return tabGroup(path)?.path ?? path;
}

/** Pages outside the signed-in app; they never open a tab (owner 2026-11-11: a "Login" tab stayed after sign-out). */
const NON_TAB_PATHS = ["/login"];

export function isTabPath(path: string): boolean {
  return !NON_TAB_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function activeTab(state: TabsState): Tab | undefined {
  return state.tabs.find((tab) => tab.id === state.activeId);
}

/**
 * T-01 / T-04: a page that has a tab switches to it (and keeps where it was left only when the URL has no
 * query of its own); a new page opens a tab after the active one. Home opens no tab and leaves every tab inactive
 * (owner 2026-11-03). With 15 open (owner 2026-11-16) the least recently used tab without unsaved changes closes to
 * make room ("evicted", reported for the Undo toast); only when every tab must stay is the page refused ("limit").
 */
export function openUrl(
  state: TabsState,
  url: string,
  title: string,
  newId: string,
  { now = Date.now(), keep }: OpenOptions = {},
): { state: TabsState; outcome: OpenOutcome; evicted?: { tab: Tab; index: number } } {
  const path = tabPath(url);
  if (!isTabPath(path)) return { state, outcome: "home" };
  if (path === HOME_PATH) return { state: state.activeId === "" ? state : { ...state, activeId: "" }, outcome: "home" };
  const existing = state.tabs.find((tab) => tab.path === path);
  if (existing) {
    const tabs = state.tabs.map((tab) => (tab.id === existing.id ? { ...tab, url, usedAt: now } : tab));
    return { state: { tabs, activeId: existing.id }, outcome: "switched" };
  }
  let base = state;
  let evicted: { tab: Tab; index: number } | undefined;
  if (state.tabs.length >= MAX_TABS) {
    const victim = leastRecentlyUsed(state, keep);
    if (!victim) return { state, outcome: "limit" };
    evicted = { tab: victim, index: state.tabs.findIndex((tab) => tab.id === victim.id) };
    base = { ...state, tabs: state.tabs.filter((tab) => tab.id !== victim.id) };
  }
  const tab: Tab = { id: newId, path, url, title, usedAt: now };
  const at = base.tabs.findIndex((candidate) => candidate.id === base.activeId);
  const tabs = at < 0 ? [...base.tabs, tab] : [...base.tabs.slice(0, at + 1), tab, ...base.tabs.slice(at + 1)];
  return evicted ? { state: { tabs, activeId: newId }, outcome: "evicted", evicted } : { state: { tabs, activeId: newId }, outcome: "opened" };
}

/**
 * Undo of an automatic close (owner 2026-11-16): the page opened in its place closes again (unless it now has
 * unsaved changes), the closed tab comes back where it was, and the tab shown before (`previousActiveId`) is shown.
 * Nothing changes when there is no room for it any more.
 */
export function undoEviction(state: TabsState, evicted: { tab: Tab; index: number }, openedId: string, previousActiveId: string, keepOpened: boolean): TabsState {
  if (state.tabs.some((tab) => tab.path === evicted.tab.path)) return state;
  const tabs = keepOpened ? [...state.tabs] : state.tabs.filter((tab) => tab.id !== openedId);
  if (tabs.length >= MAX_TABS) return state;
  tabs.splice(Math.min(evicted.index, tabs.length), 0, evicted.tab);
  const activeId = tabs.some((tab) => tab.id === previousActiveId) ? previousActiveId : evicted.tab.id;
  return { tabs, activeId };
}

/**
 * Owner 2026-11-16: a link inside a page (a daybook row, Create New, a document number) moves the shown tab to that
 * page instead of opening another tab; only the sidebar opens or switches tabs (`openUrl`). A page that already has
 * a tab still switches to it (one tab per page, T-01). `null` when there is no shown tab to move (Home) or the URL
 * is Home or outside the app, so the caller falls back to `openUrl`.
 */
export function navigateInTab(state: TabsState, url: string, title: string, now = Date.now()): TabsState | null {
  const path = tabPath(url);
  if (path === HOME_PATH || !isTabPath(path)) return null;
  const shown = activeTab(state);
  if (!shown) return null;
  const other = state.tabs.find((tab) => tab.path === path);
  if (other) return { activeId: other.id, tabs: state.tabs.map((tab) => (tab.id === other.id ? { ...tab, url, usedAt: now } : tab)) };
  return { ...state, tabs: state.tabs.map((tab) => (tab.id === shown.id ? { ...tab, path, url, title, usedAt: now } : tab)) };
}

/** Showing a tab marks it used (owner 2026-11-16, least recently used order). */
export function touchTab(state: TabsState, id: string, now = Date.now()): TabsState {
  if (!state.tabs.some((tab) => tab.id === id)) return state;
  return { activeId: id, tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, usedAt: now } : tab)) };
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
  const group = tabGroup(path);
  if (group) return group.title;
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
  return JSON.stringify({ tabs: state.tabs.map(({ url, title, usedAt }) => ({ url, title, ...(usedAt === undefined ? {} : { usedAt }) })), active });
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
    const { url, title, usedAt } = entry as { url?: unknown; title?: unknown; usedAt?: unknown };
    if (!isAppUrl(url)) continue;
    const path = tabPath(url);
    // A Home tab stored before 2026-11-03 is dropped: Home has no tab now.
    if (path === HOME_PATH || !isTabPath(path) || tabs.some((tab) => tab.path === path)) continue;
    const name = typeof title === "string" && title.trim() ? title.slice(0, MAX_TITLE_LENGTH) : fallbackTitle(path);
    // A list stored before 2026-11-16 has no usage time: its strip order stands in (left = used longest ago).
    const used = typeof usedAt === "number" && Number.isFinite(usedAt) && usedAt >= 0 ? usedAt : index;
    const tab: Tab = { id: newId(), path, url, title: name, usedAt: used };
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
