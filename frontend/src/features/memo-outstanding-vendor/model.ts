/**
 * Memo Outstanding › From Vendor (memo-outstanding-vendor UI rev 1 / SA rev 1, ADR-0035): pure page logic.
 * URL filter state, due labels, number formatting, the Customize view model (kept per browser) and the item cache
 * shared by row expansion and Expanded mode. No React and no network here, so every rule is unit-testable.
 */
import type { QueryClient } from "@tanstack/react-query";
import type { InferQueryLikeData } from "@trpc/react-query/shared";
import type { masterTrpc } from "@/lib/master-trpc";

export type VendorSummary = InferQueryLikeData<typeof masterTrpc.memoOutstanding.vendorSummary>;
export type VendorListPage = InferQueryLikeData<typeof masterTrpc.memoOutstanding.vendorList>;
export type VendorListRow = VendorListPage["items"][number];
export type VendorItem = InferQueryLikeData<typeof masterTrpc.memoOutstanding.vendorItems>["items"][number];
export type VendorOption = InferQueryLikeData<typeof masterTrpc.memoOutstanding.vendorOptions>["vendors"][number];

export const MENU_KEY = "memo-outstanding-vendor";
export const PAGE_HREF = "/memo/memo-outstanding/vendor";
export const PAGE_TITLE = "From Vendor";
export const memoReceiveHref = (id: string) => `/memo/memo-receive/${encodeURIComponent(id)}`;

// ---- filters, sort and paging in the URL (ui-spec "Behavior": server-side, back to page 1 on change) ----

export const SORT_KEYS = ["docNo", "dueDate", "vendorName", "memoPcs", "returnPcs", "soldPcs", "reservePcs", "outstandingPcs", "openValue"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = "asc" | "desc";
export const PAGE_SIZES = [10, 25, 50] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 25;
/** Server default (api-contract): Due Date ascending, then Doc Number. */
export const DEFAULT_SORT: { key: SortKey; dir: SortDir } = { key: "dueDate", dir: "asc" };
export const SEARCH_MAX = 100;
export const VENDOR_FILTER_MAX = 50;
/** `memoOutstanding.vendorItems` accepts at most 25 documents per call. */
export const ITEM_DOCS_MAX = 25;
export const ITEMS_STALE_MS = 30_000;

export type ListState = {
  q: string;
  vendorIds: string[];
  from: string;
  to: string;
  sort: SortKey | null;
  dir: SortDir;
  page: number;
  pageSize: PageSize;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const emptyListState = (): ListState => ({ q: "", vendorIds: [], from: "", to: "", sort: null, dir: "asc", page: 1, pageSize: DEFAULT_PAGE_SIZE });

/** Reads the list state from URL search params; anything malformed falls back to its default, never to an error. */
export function parseListState(params: Pick<URLSearchParams, "get" | "getAll">): ListState {
  const state = emptyListState();
  state.q = (params.get("q") ?? "").slice(0, SEARCH_MAX);
  state.vendorIds = [...new Set(params.getAll("vendor").filter((id) => UUID.test(id)))].slice(0, VENDOR_FILTER_MAX);
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  state.from = ISO_DATE.test(from) ? from : "";
  state.to = ISO_DATE.test(to) ? to : "";
  const sort = params.get("sort");
  state.sort = (SORT_KEYS as readonly string[]).includes(sort ?? "") ? (sort as SortKey) : null;
  state.dir = params.get("dir") === "desc" ? "desc" : "asc";
  const page = Number(params.get("page"));
  state.page = Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1;
  const size = Number(params.get("size"));
  state.pageSize = (PAGE_SIZES as readonly number[]).includes(size) ? (size as PageSize) : DEFAULT_PAGE_SIZE;
  return state;
}

/** List state → URL search string (defaults omitted, so a plain visit keeps a clean URL). */
export function listStateToSearch(state: ListState): string {
  const params = new URLSearchParams();
  if (state.q.trim()) params.set("q", state.q.trim());
  for (const id of state.vendorIds) params.append("vendor", id);
  if (state.from) params.set("from", state.from);
  if (state.to) params.set("to", state.to);
  if (state.sort) {
    params.set("sort", state.sort);
    if (state.dir === "desc") params.set("dir", "desc");
  }
  if (state.page > 1) params.set("page", String(state.page));
  if (state.pageSize !== DEFAULT_PAGE_SIZE) params.set("size", String(state.pageSize));
  return params.toString();
}

/** Filter or paging change: every filter change goes back to page 1 (ui-spec). */
export function withFilters(state: ListState, patch: Partial<Pick<ListState, "q" | "vendorIds" | "from" | "to">>): ListState {
  return { ...state, ...patch, page: 1 };
}

export const hasFilters = (state: ListState) => state.q.trim() !== "" || state.vendorIds.length > 0 || state.from !== "" || state.to !== "";

export const clearFilters = (state: ListState): ListState => ({ ...state, q: "", vendorIds: [], from: "", to: "", page: 1 });

/** The active sort (the server default when none is chosen). */
export const activeSort = (state: ListState) => (state.sort ? { key: state.sort, dir: state.dir } : DEFAULT_SORT);

/** Header click: the same column flips direction, another column starts ascending. Back to page 1. */
export function toggleSort(state: ListState, key: SortKey): ListState {
  const current = activeSort(state);
  const dir: SortDir = current.key === key && current.dir === "asc" ? "desc" : "asc";
  return { ...state, sort: key, dir, page: 1 };
}

/**
 * Filters as the contract input (empty values omitted). A date range whose end is before its start is not sent
 * (the date fields show the problem instead of a server VALIDATION_ERROR).
 */
export function toFilterInput(state: ListState): { q?: string; vendorIds?: string[]; from?: string; to?: string } {
  const input: { q?: string; vendorIds?: string[]; from?: string; to?: string } = {};
  const q = state.q.trim();
  if (q) input.q = q;
  if (state.vendorIds.length) input.vendorIds = state.vendorIds;
  const reversed = state.from && state.to && state.to < state.from;
  if (state.from && !reversed) input.from = state.from;
  if (state.to && !reversed) input.to = state.to;
  return input;
}

export function toListInput(state: ListState) {
  return {
    ...toFilterInput(state),
    page: state.page,
    pageSize: state.pageSize,
    ...(state.sort ? { sort: state.sort, dir: state.dir } : {}),
  };
}

/** Problem with the doc-date range, shown under the fields (contract: from ≤ to, at most 366 days). */
export function dateRangeProblem(from: string, to: string): string | null {
  if (!from || !to) return null;
  if (to < from) return "The end date is before the start date.";
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  return days > 366 ? "Choose a range of at most 366 days." : null;
}

// ---- display ----

export type DueTone = "overdue" | "soon" | "later";

/** Due label from the server's Bangkok-day count (negative = overdue). */
export function dueLabel(dueInDays: number): { text: string; tone: DueTone } {
  if (dueInDays < 0) return { text: `${-dueInDays}d overdue`, tone: "overdue" };
  if (dueInDays <= 7) return { text: `Due in ${dueInDays}d`, tone: "soon" };
  return { text: `in ${dueInDays}d`, tone: "later" };
}

/** "2026-09-28" → "28/09/2026". */
export function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
}

const groupDigits = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/**
 * Decimal string → grouped text with at least `minDp` decimals, trimming only zero digits beyond it:
 * ("13633.5", 2) → "13,633.50"; ("1850.1250", 2) → "1,850.125". Works on the string, so large amounts stay exact.
 */
export function formatDecimal(value: string, minDp = 2): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return value;
  const [, sign, int, frac = ""] = match;
  const trimmed = frac.replace(/0+$/, "");
  const decimals = trimmed.length > minDp ? trimmed : frac.padEnd(minDp, "0").slice(0, minDp);
  return `${sign}${groupDigits(int.replace(/^0+(?=\d)/, ""))}${decimals ? `.${decimals}` : ""}`;
}

/** Weight: stored 3 dp, shown 2 dp (rounded half up on the string's numeric value). */
export function formatWeight(weightCt: string): string {
  const n = Number(weightCt);
  if (!Number.isFinite(n)) return weightCt;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const formatPcs = (pcs: number) => pcs.toLocaleString("en-US", { maximumFractionDigits: 0 });

/** Money with exactly two decimals: "12000" → "12,000.00". */
export function formatMoney(value: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return value;
  const n = Number(value);
  if (Math.abs(n) < 1e15) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return formatDecimal(value, 2);
}

export const unitCaption = (priceUnit: "CTS" | "PCS") => (priceUnit === "CTS" ? "per cts" : "per pcs");

/** Item line 2: Shape · Size, then Color · Clarity · Cutting · Quality (when shown), then Cer Type + Cer No. (when shown). */
export function itemSpecParts(item: Pick<VendorItem, "shape" | "size" | "color" | "clarity" | "cutting" | "quality" | "cerType" | "cerNo">, view: { colorClarity: boolean; cerType: boolean }) {
  const join = (parts: string[]) => parts.map((part) => part.trim()).filter(Boolean).join(" · ");
  return {
    shapeSize: join([item.shape, item.size]),
    grading: view.colorClarity ? join([item.color, item.clarity, item.cutting, item.quality]) : "",
    cert: view.cerType ? [item.cerType, item.cerNo].map((part) => part.trim()).filter(Boolean).join(" ") : "",
  };
}

// ---- Customize view (ui-spec D 05/06, Q-MOV-04/06) ----

/** Always shown, greyed in the panel. */
export const LOCKED_COLUMNS = ["Doc Number", "Vendor Name", "Doc Date", "Due Date", "Overdue"] as const;

/** Switchable columns in column-header order (Q-MOV-04: "Sold" in place of the design's "PO/Purchase", Reserve added). */
export const VIEW_COLUMNS = [
  { key: "stockLot", label: "Stock ID · Lot" },
  { key: "location", label: "Location" },
  { key: "stone", label: "Stone" },
  { key: "colorClarity", label: "Color · Clarity" },
  { key: "cerType", label: "CER Type" },
  { key: "remark", label: "Remark" },
  { key: "memo", label: "Memo" },
  { key: "return", label: "Return" },
  { key: "sold", label: "Sold" },
  { key: "reserve", label: "Reserve" },
  { key: "outstanding", label: "Outstanding" },
  { key: "price", label: "Price" },
] as const;
export type ViewColumn = (typeof VIEW_COLUMNS)[number]["key"];
export const BUCKET_COLUMNS = ["memo", "return", "sold", "reserve", "outstanding"] as const satisfies readonly ViewColumn[];
export type Bucket = (typeof BUCKET_COLUMNS)[number];
export const BUCKET_LABEL: Record<Bucket, string> = { memo: "Memo", return: "Return", sold: "Sold", reserve: "Reserve", outstanding: "Outstanding" };
export const BUCKET_SORT: Record<Bucket, SortKey> = { memo: "memoPcs", return: "returnPcs", sold: "soldPcs", reserve: "reservePcs", outstanding: "outstandingPcs" };

export type SubtaskMode = "collapsed" | "expanded";
export type ViewPrefs = { hidden: ViewColumn[]; subtasks: SubtaskMode };

export const VIEW_STORAGE_KEY = "gms.memo-outstanding-vendor.view.v1";
export const DEFAULT_VIEW: ViewPrefs = Object.freeze({ hidden: [], subtasks: "collapsed" }) as ViewPrefs;

const VIEW_KEYS: ReadonlySet<string> = new Set(VIEW_COLUMNS.map((column) => column.key));

/** Stored JSON → prefs. Unknown keys are dropped and anything malformed gives the defaults. */
export function parseViewPrefs(raw: string | null): ViewPrefs {
  if (!raw) return DEFAULT_VIEW;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return DEFAULT_VIEW;
    const { hidden, subtasks } = value as { hidden?: unknown; subtasks?: unknown };
    const keys = Array.isArray(hidden) ? hidden.filter((key): key is ViewColumn => typeof key === "string" && VIEW_KEYS.has(key)) : [];
    return { hidden: orderColumns([...new Set(keys)]), subtasks: subtasks === "expanded" ? "expanded" : "collapsed" };
  } catch {
    return DEFAULT_VIEW;
  }
}

export const serializeViewPrefs = (prefs: ViewPrefs) => JSON.stringify({ hidden: prefs.hidden, subtasks: prefs.subtasks });

const orderColumns = (keys: readonly ViewColumn[]) => VIEW_COLUMNS.map((column) => column.key).filter((key) => keys.includes(key));

export function setColumnShown(prefs: ViewPrefs, key: ViewColumn, shown: boolean): ViewPrefs {
  const hidden = shown ? prefs.hidden.filter((entry) => entry !== key) : orderColumns([...prefs.hidden, key]);
  return { ...prefs, hidden };
}

export const hideAllColumns = (prefs: ViewPrefs): ViewPrefs => ({ ...prefs, hidden: VIEW_COLUMNS.map((column) => column.key) });
export const showAllColumns = (prefs: ViewPrefs): ViewPrefs => ({ ...prefs, hidden: [] });

/** Panel lists: shown and hidden switchable columns, each in column-header order. */
export function viewLists(prefs: ViewPrefs) {
  return {
    shown: VIEW_COLUMNS.filter((column) => !prefs.hidden.includes(column.key)),
    hidden: VIEW_COLUMNS.filter((column) => prefs.hidden.includes(column.key)),
  };
}

export const isShown = (prefs: ViewPrefs, key: ViewColumn) => !prefs.hidden.includes(key);

/** Per-browser storage with a memory fallback: blocked storage never breaks the page (ui-spec). */
export function createViewStore(storage: () => Pick<Storage, "getItem" | "setItem"> | undefined) {
  let memory: string | null = null;
  let cachedRaw: string | null | undefined;
  let cached: ViewPrefs = DEFAULT_VIEW;
  const listeners = new Set<() => void>();
  const readRaw = () => {
    try {
      const stored = storage()?.getItem(VIEW_STORAGE_KEY);
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
        storage()?.setItem(VIEW_STORAGE_KEY, memory);
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

// ---- selection (ui-spec "Selection bar") ----

/** Rows to show: with "Show selected rows only" on, only documents with a selected item, and only those items. */
export function visibleRows<T extends { memoReceiveId: string }>(rows: readonly T[], itemsByDoc: ReadonlyMap<string, readonly VendorItem[]>, selected: ReadonlySet<string>, selectedOnly: boolean) {
  if (!selectedOnly) return rows.map((row) => ({ row, items: itemsByDoc.get(row.memoReceiveId) }));
  return rows.flatMap((row) => {
    const items = itemsByDoc.get(row.memoReceiveId)?.filter((item) => selected.has(item.id)) ?? [];
    return items.length ? [{ row, items }] : [];
  });
}

/** What Print prints: the selected items under their documents, or else the current page with its loaded items. */
export function printRows<T extends { memoReceiveId: string }>(rows: readonly T[], itemsByDoc: ReadonlyMap<string, readonly VendorItem[]>, selected: ReadonlySet<string>) {
  if (selected.size === 0) return rows.map((row) => ({ row, items: itemsByDoc.get(row.memoReceiveId) ?? [] }));
  return visibleRows(rows, itemsByDoc, selected, true).map((entry) => ({ row: entry.row, items: entry.items ?? [] }));
}

// ---- item cache (expand once, Expanded = batched; cached 30 s) ----

export const ITEMS_CACHE_ROOT = ["memo-outstanding-vendor", "items"] as const;
export const itemsCacheKey = (memoReceiveId: string) => [...ITEMS_CACHE_ROOT, memoReceiveId] as const;

export type FetchItems = (memoReceiveIds: string[]) => Promise<{ items: VendorItem[] }>;

/**
 * Items of the given documents, keyed by document. Documents cached within the last 30 s are not fetched again; the
 * rest are fetched together in calls of at most 25 documents (one call for a page of 10 or 25). A document the server
 * skipped (settled meanwhile) is cached as empty.
 */
export async function loadDocItems(client: QueryClient, ids: readonly string[], fetchItems: FetchItems, now = Date.now()): Promise<Map<string, VendorItem[]>> {
  const unique = [...new Set(ids)];
  const fresh = (id: string) => {
    const state = client.getQueryState<VendorItem[]>(itemsCacheKey(id));
    return state?.data !== undefined && !state.isInvalidated && now - state.dataUpdatedAt < ITEMS_STALE_MS;
  };
  const missing = unique.filter((id) => !fresh(id));
  for (let start = 0; start < missing.length; start += ITEM_DOCS_MAX) {
    const chunk = missing.slice(start, start + ITEM_DOCS_MAX);
    const { items } = await fetchItems(chunk);
    const grouped = groupItems(items);
    for (const id of chunk) client.setQueryData(itemsCacheKey(id), grouped.get(id) ?? [], { updatedAt: now });
  }
  return new Map(unique.map((id) => [id, client.getQueryData<VendorItem[]>(itemsCacheKey(id)) ?? []]));
}

export function groupItems(items: readonly VendorItem[]): Map<string, VendorItem[]> {
  const grouped = new Map<string, VendorItem[]>();
  for (const item of items) {
    const list = grouped.get(item.memoReceiveId);
    if (list) list.push(item);
    else grouped.set(item.memoReceiveId, [item]);
  }
  for (const list of grouped.values()) list.sort((a, b) => a.position - b.position);
  return grouped;
}

/**
 * Whether a document row is open. `toggled` holds the rows the user flipped from the mode's default: opened rows in
 * Collapsed mode, closed rows in Expanded mode.
 */
export const isDocOpen = (id: string, mode: SubtaskMode, toggled: ReadonlySet<string>) => (mode === "expanded") !== toggled.has(id);

/** Documents whose items should be on screen: every row in Expanded mode (one batched call), else the opened rows. */
export function openDocIds(rows: readonly { memoReceiveId: string }[], mode: SubtaskMode, toggled: ReadonlySet<string>): string[] {
  return rows.map((row) => row.memoReceiveId).filter((id) => isDocOpen(id, mode, toggled));
}

// ---- pager ----

export const totalPages = (total: number, pageSize: number) => Math.max(1, Math.ceil(total / pageSize));

/** "Showing a–b out of n items" (n = documents). */
export function showingText(page: number, pageSize: number, total: number): string {
  if (total === 0) return "Showing 0 out of 0 items";
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return `Showing ${first}–${last} out of ${total} items`;
}

/** Page buttons: first, last and the pages around the current one, with "…" for gaps (1 2 3 … 8). */
export function pageNumbers(current: number, pages: number): (number | "…")[] {
  const wanted = new Set([1, pages, current - 1, current, current + 1].filter((page) => page >= 1 && page <= pages));
  if (current <= 3) [2, 3].forEach((page) => page <= pages && wanted.add(page));
  if (current >= pages - 2) [pages - 1, pages - 2].forEach((page) => page >= 1 && wanted.add(page));
  const sorted = [...wanted].sort((a, b) => a - b);
  return sorted.flatMap((page, index) => (index > 0 && page - sorted[index - 1] > 1 ? (["…", page] as const) : ([page] as const)));
}
