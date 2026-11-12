import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { forgetTabsOnSignOut } from "@/features/home/tabs/tab-host";
import { emptyTabs, isTabPath, openUrl, parseStoredTabs, tabsStorageKey } from "@/features/home/tabs/tab-state";
import { resetSidebarPreference } from "@/features/home/use-sidebar-collapsed";

/** UT-TAB-11 (owner 2026-11-11): signing out empties the tab bar and puts the sidebar back to its default (open). */
function fakeStorage(initial: Record<string, string>) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    storage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("sign-out reset", () => {
  it("the login page never becomes a tab, even from an old stored list", () => {
    expect(isTabPath("/login")).toBe(false);
    expect(isTabPath("/login/reset")).toBe(false);
    expect(isTabPath("/loginx")).toBe(true);
    expect(isTabPath("/pre-sale/quotation")).toBe(true);
    const opened = openUrl(emptyTabs, "/login", "Login", "t1");
    expect(opened.state).toBe(emptyTabs);
    let id = 0;
    const stored = JSON.stringify({ tabs: [{ url: "/login", title: "Login" }, { url: "/approve/reserve", title: "Approve" }], active: 0 });
    expect(parseStoredTabs(stored, () => `t${++id}`)?.tabs.map((tab) => tab.url)).toEqual(["/approve/reserve"]);
  });

  it("sign-out removes this user's stored tabs and the sidebar preference", () => {
    const { data, storage } = fakeStorage({ [tabsStorageKey("u1")]: "{}", [tabsStorageKey("u2")]: "{}", "gms.sidebar.collapsed": "1" });
    vi.stubGlobal("window", { localStorage: storage });
    forgetTabsOnSignOut("u1");
    resetSidebarPreference();
    expect([...data.keys()]).toEqual([tabsStorageKey("u2")]);
  });

  it("the shell resets both on sign-out, and the provider stops saving or opening tabs meanwhile", () => {
    const shell = readFileSync("src/features/home/app-shell.tsx", "utf8");
    const signOut = shell.slice(shell.indexOf("async function handleSignOut"), shell.indexOf('router.replace("/login");', shell.indexOf("async function handleSignOut")));
    expect(signOut).toContain("forgetTabsOnSignOut(session.user.id)");
    expect(signOut).toContain("resetSidebarPreference()");
    const host = readFileSync("src/features/home/tabs/tab-host.tsx", "utf8");
    expect(host).toContain("if (signingOut || syncedPath.current === pathname) return;");
    expect(host).toMatch(/useEffect\(\(\) => \{\s*if \(signingOut\) return;\s*try \{\s*window\.localStorage\.setItem\(tabsStorageKey/);
  });
});
