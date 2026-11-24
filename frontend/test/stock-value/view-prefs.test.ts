import { beforeEach, describe, expect, it, vi } from "vitest";
import { listReturnHref } from "@/features/stock-value/components/back-link";
import {
  createViewStore,
  DEFAULT_VIEW,
  hideAllColumns,
  isShown,
  LOCKED_COLUMNS,
  parseViewPrefs,
  recalledListSearch,
  rememberListSearch,
  resetListReturn,
  serializeViewPrefs,
  setColumnShown,
  showAllColumns,
  viewLists,
  VIEW_COLUMNS,
  VIEW_STORAGE_KEY,
} from "@/features/stock-value/view-prefs";

/** UT-SV-09 (FE-SV-002 / FE-SV-012): the per-browser view store tolerates storage failure; the list-return memory. */
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

describe("UT-SV-09 view preferences", () => {
  it("the switchable columns are Location, Lot No., detail line, Unit and Price source; the rest is locked", () => {
    expect(VIEW_COLUMNS.map((column) => column.key)).toEqual(["location", "lot", "details", "unit", "priceSource"]);
    expect(LOCKED_COLUMNS).toEqual(["Stone Code", "Pcs", "Weight", "Price", "Amount", "Profit/Loss"]);
    expect(VIEW_STORAGE_KEY).toBe("gms.stock-value.view.v1");
  });

  it("stored JSON → prefs; unknown keys dropped, malformed text gives the defaults", () => {
    expect(parseViewPrefs(null)).toBe(DEFAULT_VIEW);
    expect(parseViewPrefs("not json")).toBe(DEFAULT_VIEW);
    expect(parseViewPrefs("42")).toBe(DEFAULT_VIEW);
    expect(parseViewPrefs(JSON.stringify({ hidden: ["unit", "nope", "location", "unit"] }))).toEqual({ hidden: ["location", "unit"] });
    expect(parseViewPrefs(JSON.stringify({ hidden: "lot" }))).toEqual({ hidden: [] });
  });

  it("switching a column off and on keeps the column order; hide all / show all", () => {
    const hidden = setColumnShown(setColumnShown(DEFAULT_VIEW, "priceSource", false), "location", false);
    expect(hidden.hidden).toEqual(["location", "priceSource"]);
    expect(isShown(hidden, "location")).toBe(false);
    expect(viewLists(hidden).shown.map((column) => column.key)).toEqual(["lot", "details", "unit"]);
    expect(setColumnShown(hidden, "location", true).hidden).toEqual(["priceSource"]);
    expect(hideAllColumns().hidden).toHaveLength(5);
    expect(showAllColumns().hidden).toEqual([]);
    expect(parseViewPrefs(serializeViewPrefs(hidden))).toEqual(hidden);
  });

  it("the store persists, notifies, and falls back to memory when storage is blocked", () => {
    const storage = memoryStorage();
    const store = createViewStore(() => storage);
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.read()).toBe(DEFAULT_VIEW);
    store.write({ hidden: ["unit"] });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(storage.data.get(VIEW_STORAGE_KEY)).toBe('{"hidden":["unit"]}');
    expect(store.read()).toBe(store.read());
    const offline = createViewStore(() => blocked());
    offline.write({ hidden: ["lot"] });
    expect(offline.read()).toEqual({ hidden: ["lot"] });
    expect(createViewStore(() => undefined).read()).toBe(DEFAULT_VIEW);
  });
});

describe("UT-SV-09 list return", () => {
  beforeEach(() => resetListReturn());

  it("remembers the list filters in memory and in session storage; storage failure keeps memory", () => {
    const storage = memoryStorage();
    rememberListSearch("q=ruby&sort=profitLoss", storage);
    expect(storage.data.get("gms.stock-value.list-return.v1")).toBe("q=ruby&sort=profitLoss");
    expect(recalledListSearch()).toBe("q=ruby&sort=profitLoss");
    resetListReturn();
    expect(recalledListSearch(storage)).toBe("q=ruby&sort=profitLoss");
    resetListReturn();
    expect(recalledListSearch(blocked())).toBe("");
    rememberListSearch("page=2", blocked());
    expect(recalledListSearch()).toBe("page=2");
  });

  it("Back returns to the list with only known, bounded filters", () => {
    expect(listReturnHref("")).toBe("/report/stock-movement/stock-value");
    expect(listReturnHref("q=AL&location=Vault&sort=profitLoss&dir=desc&page=2&evil=1&size=1000")).toBe("/report/stock-movement/stock-value?q=AL&location=Vault&sort=profitLoss&dir=desc&page=2");
  });
});
