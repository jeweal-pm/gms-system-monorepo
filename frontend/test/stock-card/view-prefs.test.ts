import { beforeEach, describe, expect, it, vi } from "vitest";
import { listReturnHref } from "@/features/stock-card/components/back-link";
import {
  createViewStore,
  DEFAULT_VIEW,
  hideAllColumns,
  isShown,
  parseViewPrefs,
  recalledListSearch,
  rememberListSearch,
  resetListReturn,
  serializeViewPrefs,
  setColumnShown,
  showAllColumns,
  viewLists,
  VIEW_STORAGE_KEY,
} from "@/features/stock-card/view-prefs";

/** UT-SC-07 (FE-SC-002 / FE-SC-012): the per-browser view store tolerates storage failure; the list-return memory. */
const memoryStorage = () => {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), data };
};
const blocked = () => ({
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
});

describe("UT-SC-07 view preferences", () => {
  it("stored JSON → prefs; unknown keys dropped, malformed text gives the defaults", () => {
    expect(parseViewPrefs(null)).toBe(DEFAULT_VIEW);
    expect(parseViewPrefs("not json")).toBe(DEFAULT_VIEW);
    expect(parseViewPrefs("42")).toBe(DEFAULT_VIEW);
    expect(parseViewPrefs(JSON.stringify({ hidden: ["lot", "nope", "location", "lot"] }))).toEqual({ hidden: ["location", "lot"] });
    expect(parseViewPrefs(JSON.stringify({ hidden: "lot" }))).toEqual({ hidden: [] });
  });

  it("Stone Code and BALANCE are not switchable; the four optional parts are, in column order", () => {
    const lists = viewLists(DEFAULT_VIEW);
    expect(lists.shown.map((column) => column.label)).toEqual(["Location", "Lot", "Stone detail line", "Lot vendor line"]);
    expect(lists.hidden).toEqual([]);
    const hidden = setColumnShown(setColumnShown(DEFAULT_VIEW, "lot", false), "location", false);
    expect(hidden.hidden).toEqual(["location", "lot"]);
    expect(isShown(hidden, "lot")).toBe(false);
    expect(isShown(hidden, "details")).toBe(true);
    expect(setColumnShown(hidden, "lot", true).hidden).toEqual(["location"]);
    expect(hideAllColumns().hidden).toHaveLength(4);
    expect(showAllColumns().hidden).toEqual([]);
    expect(serializeViewPrefs(hidden)).toBe('{"hidden":["location","lot"]}');
  });

  it("writes to storage, notifies listeners and reads back (stable object until the text changes)", () => {
    const storage = memoryStorage();
    const store = createViewStore(() => storage);
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.read()).toBe(DEFAULT_VIEW);
    store.write({ hidden: ["lot"] });
    expect(storage.data.get(VIEW_STORAGE_KEY)).toBe('{"hidden":["lot"]}');
    expect(listener).toHaveBeenCalledTimes(1);
    const first = store.read();
    expect(first).toEqual({ hidden: ["lot"] });
    expect(store.read()).toBe(first);
    // A reload (a new store over the same storage) keeps the choice: per browser.
    expect(createViewStore(() => storage).read()).toEqual({ hidden: ["lot"] });
  });

  it("storage that throws never breaks the page: the memory copy serves the visit", () => {
    const store = createViewStore(() => blocked());
    expect(store.read()).toBe(DEFAULT_VIEW);
    expect(() => store.write({ hidden: ["details"] })).not.toThrow();
    expect(store.read()).toEqual({ hidden: ["details"] });
    expect(createViewStore(() => undefined).read()).toBe(DEFAULT_VIEW);
  });
});

describe("list return memory (Q-SC-13)", () => {
  beforeEach(() => resetListReturn());

  it("remembers the list's filters in memory and in session storage when allowed", () => {
    const storage = memoryStorage();
    expect(recalledListSearch(storage)).toBe("");
    rememberListSearch("q=ruby&page=2", storage);
    expect(recalledListSearch()).toBe("q=ruby&page=2");
    resetListReturn();
    expect(recalledListSearch(storage)).toBe("q=ruby&page=2");
  });

  it("blocked session storage still works from memory", () => {
    expect(() => rememberListSearch("size=50", blocked())).not.toThrow();
    expect(recalledListSearch(blocked())).toBe("size=50");
    resetListReturn();
    expect(recalledListSearch(blocked())).toBe("");
  });

  it("the back link returns to the list with only known, bounded filters", () => {
    expect(listReturnHref("")).toBe("/report/stock-movement/stock-card");
    expect(listReturnHref("q=ruby&location=Vault&sort=lot&dir=desc&page=2&size=50")).toBe("/report/stock-movement/stock-card?q=ruby&location=Vault&sort=lot&dir=desc&page=2&size=50");
    expect(listReturnHref("evil=1&sort=drop&page=-3&size=7&from=x")).toBe("/report/stock-movement/stock-card");
  });
});
