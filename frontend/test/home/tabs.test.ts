import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement, type FC, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Breadcrumb } from "@/features/home/navigation";
import { TabBar } from "@/features/home/tabs/tab-bar";
import { TabPage } from "@/features/home/tabs/tab-host";
import {
  closeAllTabs,
  closeTab,
  discardQuestion,
  emptyTabs,
  fallbackTitle,
  MAX_TABS,
  openUrl,
  parseStoredTabs,
  retargetTab,
  serializeTabs,
  TAB_LIMIT_MESSAGE,
  tabPath,
  tabsStorageKey,
  tabTitle,
  type TabsState,
} from "@/features/home/tabs/tab-state";

function idGenerator(prefix = "t") {
  let count = 0;
  return () => `${prefix}${++count}`;
}

/** Opens the URLs in order, like a user following the sidebar. */
function openAll(urls: string[], state: TabsState = emptyTabs) {
  const nextId = idGenerator();
  return urls.reduce((current, url) => openUrl(current, url, fallbackTitle(tabPath(url)), nextId()).state, state);
}

const titles = (state: TabsState) => state.tabs.map((tab) => tab.path);
const activePath = (state: TabsState) => state.tabs.find((tab) => tab.id === state.activeId)?.path;

describe("tab list (app-shell-tabs UI rev 1)", () => {
  it("UT-TAB-01 one tab per page: the same page switches, a different document opens another (T-01)", () => {
    const state = openAll(["/", "/pre-sale/quotation", "/memo/memo-out/A"]);
    const again = openUrl(state, "/pre-sale/quotation/", "Quotation", "x");
    expect(again.outcome).toBe("switched");
    expect(again.state.tabs).toHaveLength(2);
    expect(activePath(again.state)).toBe("/pre-sale/quotation");
    const other = openUrl(state, "/memo/memo-out/B", "Memo Out", "y");
    expect(other.outcome).toBe("opened");
    expect(titles(other.state)).toEqual(["/pre-sale/quotation", "/memo/memo-out/A", "/memo/memo-out/B"]);
    // the query (filters) is kept with the tab, not a tab of its own
    const filtered = openUrl(openAll(["/memo/memo-outstanding/vendor"]), "/memo/memo-outstanding/vendor?vendor=V1", "From Vendor", "z");
    expect(filtered.outcome).toBe("switched");
    expect(filtered.state.tabs[0].url).toBe("/memo/memo-outstanding/vendor?vendor=V1");
  });

  it("UT-TAB-01 a new tab opens right after the shown one", () => {
    const state = openAll(["/", "/setup", "/setup/vendor"]);
    const back = openUrl(state, "/setup", "Setup", "x").state;
    expect(titles(openUrl(back, "/setup/customer", "Customer", "y").state)).toEqual(["/setup", "/setup/customer", "/setup/vendor"]);
  });

  it("UT-TAB-06 Home opens no tab and leaves every tab inactive (owner 2026-11-03)", () => {
    const state = openAll(["/setup", "/setup/vendor"]);
    const home = openUrl(state, "/", "Home", "x");
    expect(home.outcome).toBe("home");
    expect(home.state.tabs).toBe(state.tabs);
    expect(home.state.activeId).toBe("");
    expect(openUrl(emptyTabs, "/?from=login", "Home", "y").state).toEqual(emptyTabs);
    // a page opened from Home goes to the end
    expect(titles(openUrl(home.state, "/setup/customer", "Customer", "z").state)).toEqual(["/setup", "/setup/vendor", "/setup/customer"]);
  });

  it("UT-TAB-01 the 16th page is refused and nothing closes by itself (T-04)", () => {
    const urls = Array.from({ length: MAX_TABS }, (_, index) => `/modules/m${index}`);
    const full = openAll(urls);
    expect(full.tabs).toHaveLength(15);
    const refused = openUrl(full, "/setup", "Setup", "x");
    expect(refused.outcome).toBe("limit");
    expect(refused.state).toBe(full);
    expect(TAB_LIMIT_MESSAGE).toBe("Close a tab to open another (15 tabs open)");
    // an open page still switches at the limit
    expect(openUrl(full, "/modules/m3", "M3", "y").outcome).toBe("switched");
  });

  it("UT-TAB-01 closing the shown tab shows the right neighbour, else the left; the last close shows Home (T-06)", () => {
    const state = openAll(["/a", "/b", "/c"]);
    const middle = openUrl(state, "/b", "B", "x").state;
    const closedMiddle = closeTab(middle, middle.activeId);
    expect(titles(closedMiddle)).toEqual(["/a", "/c"]);
    expect(activePath(closedMiddle)).toBe("/c");
    const closedLast = closeTab(closedMiddle, closedMiddle.activeId);
    expect(activePath(closedLast)).toBe("/a");
    // closing a hidden tab keeps the shown one
    const hidden = closeTab(state, state.tabs[0].id);
    expect(activePath(hidden)).toBe("/c");
    const lone = closeTab(closeTab(closedLast, closedLast.tabs[0].id), "nope");
    expect(lone).toEqual({ tabs: [], activeId: "" });
  });

  it("UT-TAB-01 Close all closes every tab and shows Home (Q-TAB-06, owner 2026-11-03)", () => {
    expect(closeAllTabs()).toEqual({ tabs: [], activeId: "" });
  });

  it("UT-TAB-01 titles: page name, document number, New document (T-03)", () => {
    expect(tabTitle("Stone Code", undefined)).toBe("Stone Code");
    expect(tabTitle("Memo Out", "MO-1")).toBe("Memo Out · MO-1");
    expect(tabTitle("Memo Out", null)).toBe("New Memo Out");
    expect(fallbackTitle("/")).toBe("Home");
    expect(fallbackTitle("/setup/company-profile")).toBe("Company profile");
  });

  it("UT-TAB-01 a saved new document keeps its tab under the new path (T-09)", () => {
    const state = openAll(["/", "/memo/memo-out"]);
    const id = state.activeId;
    const saved = retargetTab(state, id, "/memo/memo-out/abc");
    expect(saved.activeId).toBe(id);
    expect(saved.tabs.find((tab) => tab.id === id)).toMatchObject({ path: "/memo/memo-out/abc", url: "/memo/memo-out/abc" });
    // back to New when a New tab is already open: that tab is shown and this one closes
    const both = openAll(["/memo/memo-out", "/memo/memo-out/abc"]);
    const deleted = retargetTab(both, both.activeId, "/memo/memo-out");
    expect(titles(deleted)).toEqual(["/memo/memo-out"]);
    expect(deleted.activeId).toBe(both.tabs[0].id);
  });
});

describe("tab storage per user (T-07)", () => {
  it("UT-TAB-02 the list and the shown tab come back after a reload", () => {
    const state = openAll(["/", "/setup/vendor", "/memo/memo-outstanding/vendor?vendor=V1"]);
    const shown = openUrl(state, "/setup/vendor", "Vendor", "x").state;
    const restored = parseStoredTabs(serializeTabs(shown), idGenerator("r"));
    expect(restored?.tabs.map((tab) => tab.url)).toEqual(["/setup/vendor", "/memo/memo-outstanding/vendor?vendor=V1"]);
    expect(restored?.tabs.find((tab) => tab.id === restored.activeId)?.path).toBe("/setup/vendor");
  });

  it("UT-TAB-06 a Home tab stored before 2026-11-03 is dropped, the shown tab is kept", () => {
    const stored = JSON.stringify({ tabs: [{ url: "/", title: "Home" }, { url: "/a" }, { url: "/b" }], active: 2 });
    const restored = parseStoredTabs(stored, idGenerator("r"));
    expect(restored?.tabs.map((tab) => tab.path)).toEqual(["/a", "/b"]);
    expect(restored?.tabs.find((tab) => tab.id === restored.activeId)?.path).toBe("/b");
    expect(parseStoredTabs(JSON.stringify({ tabs: [{ url: "/" }], active: 0 }), idGenerator())).toBeNull();
    expect(serializeTabs(emptyTabs)).toBe(JSON.stringify({ tabs: [], active: -1 }));
  });

  it("UT-TAB-02 each user has their own key", () => {
    expect(tabsStorageKey("user-1")).not.toBe(tabsStorageKey("user-2"));
  });

  it("UT-TAB-02 bad or foreign stored data is ignored", () => {
    const nextId = idGenerator();
    expect(parseStoredTabs(null, nextId)).toBeNull();
    expect(parseStoredTabs("not json", nextId)).toBeNull();
    expect(parseStoredTabs(JSON.stringify({ tabs: "x" }), nextId)).toBeNull();
    expect(parseStoredTabs(JSON.stringify({ tabs: [{ url: "https://evil.example/" }, { url: "//evil.example" }, { url: "/\\evil" }] }), nextId)).toBeNull();
    const many = { tabs: Array.from({ length: 40 }, (_, index) => ({ url: `/modules/m${index}`, title: "M" })), active: 99 };
    const bounded = parseStoredTabs(JSON.stringify(many), nextId);
    expect(bounded?.tabs).toHaveLength(MAX_TABS);
    expect(bounded?.activeId).toBe(bounded?.tabs[0].id);
    const duplicates = parseStoredTabs(JSON.stringify({ tabs: [{ url: "/a" }, { url: "/a/" }, { url: "/b", title: 5 }] }), nextId);
    expect(duplicates?.tabs.map((tab) => [tab.path, tab.title])).toEqual([["/a", "A"], ["/b", "B"]]);
  });
});

describe("unsaved changes (Q-TAB-03, T-05)", () => {
  const tabs = [
    { id: "1", title: "Memo Out · MO-1", dirty: true },
    { id: "2", title: "Vendor", dirty: false },
    { id: "3", title: "New Quotation", dirty: true },
  ];

  it("UT-TAB-03 closing a tab with unsaved changes asks first; a clean tab closes at once", () => {
    expect(discardQuestion(tabs, "1")).toBe("Discard unsaved changes in Memo Out · MO-1?");
    expect(discardQuestion(tabs, "2")).toBeNull();
  });

  it("UT-TAB-03 Close all asks once with the number of tabs", () => {
    expect(discardQuestion(tabs)).toBe("Discard unsaved changes in 2 tabs?");
    expect(discardQuestion(tabs.slice(0, 2))).toBe("Discard unsaved changes in Memo Out · MO-1?");
    expect(discardQuestion([tabs[1]])).toBeNull();
  });
});

describe("tab bar (sources 03–07)", () => {
  const noop = () => undefined;
  const tab = (id: string, path: string, title: string, dirty = false) => ({ id, path, url: path, title, dirty });

  it("UT-TAB-04 tabs, the active one, the unsaved dot, close buttons and the count box", () => {
    const html = renderToStaticMarkup(
      createElement(TabBar, { tabs: [tab("1", "/setup/customer", "Customer", true), tab("2", "/setup/vendor", "Vendor")], activeId: "2", onSelect: noop, onClose: noop, onCloseAll: noop }),
    );
    expect(html).toContain('role="tablist"');
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html).toMatch(/aria-selected="true"[^>]*>Vendor</);
    expect(html).toMatch(/aria-selected="false"[^>]*>Customer</);
    expect(html).toContain('aria-label="Close Vendor"');
    // Owner 2026-11-13: the shown tab is bold with its × always visible; the other tab's × waits for hover / focus.
    expect(html).toMatch(/aria-selected="true"[^>]*class="[^"]*font-semibold[^"]*"[^>]*>Vendor</);
    expect(html).toMatch(/aria-selected="false"[^>]*class="[^"]*font-normal[^"]*"[^>]*>Customer</);
    expect(html).toMatch(/aria-label="Close Vendor" title="Close Vendor" class="(?![^"]*opacity-0)[^"]*"/);
    expect(html).toMatch(/aria-label="Close Customer" title="Close Customer" class="[^"]*opacity-0 group-hover:opacity-100[^"]*"/);
    expect(html.match(/aria-label="Unsaved changes"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="2 open tabs"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).not.toContain('disabled=""');
    expect(html).toContain("Close all");
    // arrows appear only once the strip overflows (measured in the browser)
    expect(html).not.toContain("Scroll tabs left");
  });

  it("UT-TAB-06 the shown tab has no unsaved dot, even with unsaved changes (owner 2026-11-03)", () => {
    const html = renderToStaticMarkup(createElement(TabBar, { tabs: [tab("1", "/setup/vendor", "Vendor", true)], activeId: "1", onSelect: noop, onClose: noop, onCloseAll: noop }));
    expect(html).not.toContain('aria-label="Unsaved changes"');
  });

  it("UT-TAB-04 with no tab open (Home shown) the count box and Close all are disabled", () => {
    const html = renderToStaticMarkup(createElement(TabBar, { tabs: [], activeId: "", onSelect: noop, onClose: noop, onCloseAll: noop }));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="0 open tabs"/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*Close all/);
  });
});

/* ---------- UT-TAB-05: every App Shell route hands its content to the shared layout ---------- */

const appDir = join(__dirname, "..", "..", "src", "app", "(app)");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return name === "page.tsx" ? [path] : [];
  });
}

describe("App Shell routes (ADR-0037)", () => {
  const files = routeFiles(appDir);

  it("UT-TAB-05 the shared layout renders the App Shell once and every page goes through TabPage", () => {
    expect(readFileSync(join(appDir, "layout.tsx"), "utf8")).toContain("<AppShell>");
    expect(files.length).toBeGreaterThanOrEqual(24);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/AppShell/);
      // the Stone Master index only redirects to its first page
      if (source.includes("redirect(")) continue;
      expect(source, file).toMatch(/<TabPage breadcrumbs=\{/);
    }
  });

  it("UT-TAB-05 detail pages read their id from the route props, not the shown URL", () => {
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("useParams");
      if (file.includes("[")) expect(source, file).toMatch(/use\(params\)/);
    }
  });

  it("UT-TAB-05 outside the shell a TabPage renders its content as it is", () => {
    const html = renderToStaticMarkup(createElement(TabPage as FC<{ breadcrumbs: Breadcrumb[]; children?: ReactNode }>, { breadcrumbs: [{ label: "Home" }] }, createElement("p", null, "content")));
    expect(html).toBe("<p>content</p>");
  });
});

describe("UT-TAB-09 Approve sub-pages share one tab (owner 2026-11-09)", () => {
  let id = 0;
  const next = () => `t${++id}`;

  it("every /approve/{menu} keys to the Approve tab; other paths are unchanged", () => {
    expect(tabPath("/approve")).toBe("/approve");
    expect(tabPath("/approve/memo-receive?q=1")).toBe("/approve");
    expect(tabPath("/approve/memo-out-return/")).toBe("/approve");
    expect(tabPath("/approver")).toBe("/approver");
    expect(tabPath("/memo/memo-receive")).toBe("/memo/memo-receive");
    expect(fallbackTitle(tabPath("/approve/memo-out"))).toBe("Approve");
  });

  it("moving between Approve menus switches inside the one tab and remembers the menu", () => {
    let state = openUrl(emptyTabs, "/approve/memo-receive", "Approve", next()).state;
    const result = openUrl(state, "/approve/memo-out-return", "Approve", next());
    state = result.state;
    expect(result.outcome).toBe("switched");
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]).toMatchObject({ path: "/approve", url: "/approve/memo-out-return" });
  });

  it("stored Approve tabs from before collapse into one", () => {
    const raw = JSON.stringify({ tabs: [{ url: "/approve/memo-receive", title: "Memo Receive" }, { url: "/approve/memo-out", title: "Memo Out" }], active: 1 });
    const state = parseStoredTabs(raw, next);
    expect(state?.tabs.map((tab) => tab.url)).toEqual(["/approve/memo-receive"]);
  });

  it("TabPage names a grouped tab after its section", () => {
    const source = readFileSync("src/features/home/tabs/tab-host.tsx", "utf8");
    expect(source).toContain("const title = group?.title ?? breadcrumbs[breadcrumbs.length - 1]?.label");
    expect(source).toContain("<Fragment key={pathname}>{children}</Fragment>");
  });
});
