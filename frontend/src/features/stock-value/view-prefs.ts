/**
 * Stock Value Customize view (FE-SV-002/012, Q-SV-22): which optional parts of the list table are shown, kept per browser.
 * Stone Code, Pcs, Weight, Price, Amount and Profit/Loss are always shown. Storage failures never break the page: the
 * in-memory copy keeps the visit consistent (same rule as the Stock Card view store).
 */
export const VIEW_COLUMNS = [
  { key: "location", label: "Location" },
  { key: "lot", label: "Lot No." },
  { key: "details", label: "Stone detail line" },
  { key: "unit", label: "Unit" },
  { key: "priceSource", label: "Price source" },
] as const;
export type ViewColumn = (typeof VIEW_COLUMNS)[number]["key"];
export type ViewPrefs = { hidden: ViewColumn[] };

/** Always shown, greyed in the panel. */
export const LOCKED_COLUMNS = ["Stone Code", "Pcs", "Weight", "Price", "Amount", "Profit/Loss"] as const;

export const VIEW_STORAGE_KEY = "gms.stock-value.view.v1";
export const DEFAULT_VIEW: ViewPrefs = Object.freeze({ hidden: [] }) as ViewPrefs;

const VIEW_KEYS: ReadonlySet<string> = new Set(VIEW_COLUMNS.map((column) => column.key));
const orderColumns = (keys: readonly ViewColumn[]) => VIEW_COLUMNS.map((column) => column.key).filter((key) => keys.includes(key));

/** Stored JSON → prefs. Unknown keys are dropped and anything malformed gives the defaults. */
export function parseViewPrefs(raw: string | null): ViewPrefs {
  if (!raw) return DEFAULT_VIEW;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return DEFAULT_VIEW;
    const { hidden } = value as { hidden?: unknown };
    const keys = Array.isArray(hidden) ? hidden.filter((key): key is ViewColumn => typeof key === "string" && VIEW_KEYS.has(key)) : [];
    return { hidden: orderColumns([...new Set(keys)]) };
  } catch {
    return DEFAULT_VIEW;
  }
}

export const serializeViewPrefs = (prefs: ViewPrefs) => JSON.stringify({ hidden: prefs.hidden });

export const isShown = (prefs: ViewPrefs, key: ViewColumn) => !prefs.hidden.includes(key);

export function setColumnShown(prefs: ViewPrefs, key: ViewColumn, shown: boolean): ViewPrefs {
  return { hidden: shown ? prefs.hidden.filter((entry) => entry !== key) : orderColumns([...prefs.hidden, key]) };
}

export const hideAllColumns = (): ViewPrefs => ({ hidden: VIEW_COLUMNS.map((column) => column.key) });
export const showAllColumns = (): ViewPrefs => ({ hidden: [] });

/** Panel lists: shown and hidden switchable columns, each in column order. */
export function viewLists(prefs: ViewPrefs) {
  return {
    shown: VIEW_COLUMNS.filter((column) => !prefs.hidden.includes(column.key)),
    hidden: VIEW_COLUMNS.filter((column) => prefs.hidden.includes(column.key)),
  };
}

/** Per-browser storage with a memory fallback. `read` returns a stable object until the stored text changes. */
export function createViewStore(storage: () => Pick<Storage, "getItem" | "setItem"> | undefined, storageKey: string = VIEW_STORAGE_KEY) {
  let memory: string | null = null;
  let cachedRaw: string | null | undefined;
  let cached: ViewPrefs = DEFAULT_VIEW;
  const listeners = new Set<() => void>();
  const readRaw = () => {
    try {
      const stored = storage()?.getItem(storageKey);
      if (stored !== null && stored !== undefined) return stored;
    } catch {
      // Storage blocked (private mode, site data off): the in-memory copy keeps this visit consistent.
    }
    return memory;
  };
  return {
    read(): ViewPrefs {
      const raw = readRaw();
      if (raw !== cachedRaw) {
        cachedRaw = raw;
        cached = parseViewPrefs(raw);
      }
      return cached;
    },
    write(prefs: ViewPrefs) {
      memory = serializeViewPrefs(prefs);
      try {
        storage()?.setItem(storageKey, memory);
      } catch {
        // Not persisted; the memory copy is used until the page reloads.
      }
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Where "‹ Stock Value" returns to: the list's search string, remembered while the app runs (memory, plus sessionStorage when allowed). */
const LIST_RETURN_KEY = "gms.stock-value.list-return.v1";
let listReturnMemory = "";

export function rememberListSearch(search: string, storage?: Pick<Storage, "setItem">) {
  listReturnMemory = search;
  try {
    storage?.setItem(LIST_RETURN_KEY, search);
  } catch {
    // Memory copy only.
  }
}

export function recalledListSearch(storage?: Pick<Storage, "getItem">): string {
  if (listReturnMemory) return listReturnMemory;
  try {
    return storage?.getItem(LIST_RETURN_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Test seam: forget the remembered list search. */
export const resetListReturn = () => {
  listReturnMemory = "";
};
