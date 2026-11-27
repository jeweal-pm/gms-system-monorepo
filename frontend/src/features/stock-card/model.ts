/**
 * Report › Stock Movement › Stock Card (stock-card UI rev 1 / SA rev 1, ADR-0056): pure page logic. URL filter state,
 * defaults and clamping, display formatters, the spec line, the document route map and the print summary. No React and no
 * network here, so every rule is unit-testable (FE-SC-002).
 */
import { formatDate, formatPcs, formatWeight, DEFAULT_PAGE_SIZE, PAGE_SIZES, SEARCH_MAX, totalPages, type PageSize } from "@/features/memo-outstanding-vendor/model";

export { DEFAULT_PAGE_SIZE, formatDate, formatPcs, formatWeight, PAGE_SIZES, SEARCH_MAX, totalPages };
export type { PageSize };

export const STOCK_CARD_MENU_KEY = "stock-card";
export const STOCK_CARD_HREF = "/report/stock-movement/stock-card";
/** The card key is opaque and safe in a path: "SC" + 32 hex (api-contract). */
export const stockCardHref = (cardKey: string) => `${STOCK_CARD_HREF}/${encodeURIComponent(cardKey)}`;
export const CARD_KEY_PATTERN = /^SC[0-9a-f]{32}$/;

export const NO_ACCESS = "You don't have access to Stock Card";
export const EXCEL_UNAVAILABLE = "Excel export isn't available yet";
export const LOCATION_MAX = 40;
/** The server answers `page` above 200 with VALIDATION_ERROR (api-contract). */
export const PAGE_MAX = 200;

// ---- URL state ----

export const LIST_SORT_KEYS = ["stoneCode", "location", "lot", "balancePcs", "balanceWeightCt"] as const;
export type ListSortKey = (typeof LIST_SORT_KEYS)[number];
export const TXN_SORT_KEYS = ["date", "docNo", "stockId", "account"] as const;
export type TxnSortKey = (typeof TXN_SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

/** Filters, sort and paging of one page; `location` stays "" on the detail page. */
export type ReportState<K extends string> = { q: string; location: string; from: string; to: string; sort: K | null; dir: SortDir; page: number; pageSize: PageSize };
export type ListState = ReportState<ListSortKey>;
export type TxnState = ReportState<TxnSortKey>;

/** Server defaults (api-contract): Stone Code ascending on the list, Date ascending on the detail. */
export const DEFAULT_LIST_SORT: { key: ListSortKey; dir: SortDir } = { key: "stoneCode", dir: "asc" };
export const DEFAULT_TXN_SORT: { key: TxnSortKey; dir: SortDir } = { key: "date", dir: "asc" };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const emptyState = <K extends string>(): ReportState<K> => ({ q: "", location: "", from: "", to: "", sort: null, dir: "asc", page: 1, pageSize: DEFAULT_PAGE_SIZE });

type Params = Pick<URLSearchParams, "get">;

/** Reads the state from URL search params; anything malformed falls back to its default, never to an error. */
export function parseState<K extends string>(params: Params, sortKeys: readonly K[], withLocation: boolean): ReportState<K> {
  const state = emptyState<K>();
  state.q = (params.get("q") ?? "").slice(0, SEARCH_MAX);
  if (withLocation) state.location = (params.get("location") ?? "").slice(0, LOCATION_MAX);
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  state.from = ISO_DATE.test(from) ? from : "";
  state.to = ISO_DATE.test(to) ? to : "";
  const sort = params.get("sort") ?? "";
  state.sort = (sortKeys as readonly string[]).includes(sort) ? (sort as K) : null;
  state.dir = params.get("dir") === "desc" ? "desc" : "asc";
  const page = Number(params.get("page"));
  state.page = Number.isInteger(page) && page >= 1 && page <= PAGE_MAX ? page : 1;
  const size = Number(params.get("size"));
  state.pageSize = (PAGE_SIZES as readonly number[]).includes(size) ? (size as PageSize) : DEFAULT_PAGE_SIZE;
  return state;
}

export const parseListState = (params: Params): ListState => parseState(params, LIST_SORT_KEYS, true);
export const parseTxnState = (params: Params): TxnState => parseState(params, TXN_SORT_KEYS, false);

/** State → URL search string (defaults omitted, so a plain visit keeps a clean URL). */
export function stateToSearch<K extends string>(state: ReportState<K>): string {
  const params = new URLSearchParams();
  if (state.q.trim()) params.set("q", state.q.trim());
  if (state.location) params.set("location", state.location);
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

/** A filter change goes back to page 1. */
export const withFilters = <K extends string>(state: ReportState<K>, patch: Partial<Pick<ReportState<K>, "q" | "location" | "from" | "to">>): ReportState<K> => ({ ...state, ...patch, page: 1 });

export const hasFilters = (state: ReportState<string>) => state.q.trim() !== "" || state.location !== "" || state.from !== "" || state.to !== "";

export const clearFilters = <K extends string>(state: ReportState<K>): ReportState<K> => ({ ...state, q: "", location: "", from: "", to: "", page: 1 });

export const activeListSort = (state: ListState) => (state.sort ? { key: state.sort, dir: state.dir } : DEFAULT_LIST_SORT);
export const activeTxnSort = (state: TxnState) => (state.sort ? { key: state.sort, dir: state.dir } : DEFAULT_TXN_SORT);

/** Header click: the same column flips direction, another column starts ascending; back to page 1. */
export function toggleSort<K extends string>(state: ReportState<K>, current: { key: K; dir: SortDir }, key: K): ReportState<K> {
  const dir: SortDir = current.key === key && current.dir === "asc" ? "desc" : "asc";
  return { ...state, sort: key, dir, page: 1 };
}

/** Problem with the date range, shown under the fields; only Due before Start is a problem (contract: `from <= to`). */
export function rangeProblem(from: string, to: string): string | null {
  return from && to && to < from ? "The end date is before the start date." : null;
}

/** The page after a filter left fewer pages than the URL asks for: back to page 1; `null` when nothing changes. */
export function pageToClamp(page: number, total: number, pageSize: number): number | null {
  return page > 1 && total >= 0 && page > totalPages(total, pageSize) ? 1 : null;
}

/** Query of the API (empty values left out). A reversed range is not sent: the fields show the problem instead. */
export function toQuery<K extends string>(state: ReportState<K>): Record<string, string | number> {
  const query: Record<string, string | number> = {};
  const q = state.q.trim();
  if (q) query.q = q.slice(0, SEARCH_MAX);
  if (state.location) query.location = state.location;
  const reversed = rangeProblem(state.from, state.to) !== null;
  if (state.from && !reversed) query.from = state.from;
  if (state.to && !reversed) query.to = state.to;
  if (state.sort) {
    query.sort = state.sort;
    query.dir = state.dir;
  }
  query.page = state.page;
  query.pageSize = state.pageSize;
  return query;
}

// ---- display ----

/** "2026-09-04" → "04/09/26" (the detail table, Q-SC-23); anything else is returned as is. */
export function formatShortDate(iso: string): string {
  const match = /^\d{2}(\d{2})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
}

/** A pcs cell of the other direction is blank. */
export const pcsCell = (value: number | null) => (value === null ? "" : formatPcs(value));
export const weightCell = (value: string | null, places: number) => (value === null ? "" : formatWeight(value, places));

/** STOCK ID cell: the first visible Stock ID with "+n" for the rest; "—" when the document shows none (Q-SC-01). */
export function stockIdText(stockId: string | null, extra: number): string {
  if (!stockId) return "—";
  return extra > 0 ? `${stockId} +${extra}` : stockId;
}

type Attrs = { stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string };

/** Stone detail line: `stone · shape size · color · clarity · cutting · quality`, empty parts dropped. */
export function specLine(attrs: Attrs): string {
  const shapeSize = [attrs.shape, attrs.size].map((part) => part.trim()).filter(Boolean).join(" ");
  return [attrs.stone, shapeSize, attrs.color, attrs.clarity, attrs.cutting, attrs.quality]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" · ");
}

/** The card's name: its stone code, else the attributes (an empty stone code falls back to them), else "—". */
export const cardName = (attrs: Attrs & { stoneCode: string }) => attrs.stoneCode.trim() || specLine(attrs) || "—";

/** The detail line under a name; empty when it would only repeat the name (an empty stone code falls back to it). */
export function detailLine(attrs: Attrs & { stoneCode: string }): string {
  const line = specLine(attrs);
  return line === cardName(attrs) ? "" : line;
}

/** Lot cell line 2 (Q-SC-15): the vendor of the newest stock, "+n" when the card has more vendors. */
export function vendorLine(vendorName: string, vendorCount: number): string {
  const name = vendorName.trim();
  if (!name) return "";
  return vendorCount > 1 ? `${name} +${vendorCount - 1}` : name;
}

/** Row number across pages. */
export const rowNumber = (page: number, pageSize: number, index: number) => (page - 1) * pageSize + index + 1;

// ---- document links (ui-spec "Document types and route map"; the server's `docType` is an open set) ----

const DOC_ROUTES: Readonly<Record<string, string>> = {
  "load-to-stock": "/inventory/load-to-stock",
  "stock-adjustment": "/inventory/stock-adjustment",
  // merge-split (ADR-0060): SPLIT_* / MERGE_* rows open the Merge/Split document.
  "merge-split": "/inventory/merge-split",
  "memo-receive": "/memo/memo-receive",
  "memo-out-return": "/memo/memo-out-return",
  "memo-out": "/memo/memo-out",
  "memo-return": "/memo/memo-return",
  sale: "/sale/sale",
  // stock-transfer-location (ADR-0060 D5): TRANSFER_OUT / TRANSFER_IN rows open the transfer.
  "stock-transfer-location": "/inventory/stock-transfer-location",
};

/** The document page of a row, or `undefined` for a type this UI has no route for (the number then renders as text). */
export function docHref(docType: string, docId: string): string | undefined {
  const base = Object.hasOwn(DOC_ROUTES, docType) ? DOC_ROUTES[docType] : undefined;
  return base && docId ? `${base}/${encodeURIComponent(docId)}` : undefined;
}

// ---- print ----

/** Filter summary lines for the print header. */
export function filterSummary(state: ReportState<string>): string[] {
  const lines: string[] = [];
  if (state.q.trim()) lines.push(`Search: ${state.q.trim()}`);
  if (state.location) lines.push(`Location: ${state.location}`);
  if (state.from || state.to) lines.push(`Date: ${state.from ? formatDate(state.from) : "…"} – ${state.to ? formatDate(state.to) : "…"}`);
  return lines;
}
