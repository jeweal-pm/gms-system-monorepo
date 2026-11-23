/**
 * Report › Stock Movement › Stock Value (stock-value UI rev 1 / SA rev 1, ADR-0057): pure page logic. The URL state, paging,
 * display helpers and the document map are Stock Card's (same cards, same ledger); this file adds the sort keys, routes,
 * texts and the value-cell rules. The server computes every amount, so nothing here adds or multiplies money (FE-SV-002/003).
 */
import {
  CARD_KEY_PATTERN,
  cardName,
  clearFilters,
  detailLine,
  docHref,
  emptyState,
  EXCEL_UNAVAILABLE,
  filterSummary,
  formatDate,
  formatPcs,
  formatShortDate,
  formatWeight,
  hasFilters,
  pageToClamp,
  PAGE_SIZES,
  DEFAULT_PAGE_SIZE,
  parseState,
  pcsCell,
  rangeProblem,
  rowNumber,
  SEARCH_MAX,
  specLine,
  stateToSearch,
  stockIdText,
  toggleSort,
  toQuery,
  totalPages,
  vendorLine,
  weightCell,
  withFilters,
  type PageSize,
  type ReportState,
  type SortDir,
} from "@/features/stock-card/model";

export {
  CARD_KEY_PATTERN,
  cardName,
  clearFilters,
  DEFAULT_PAGE_SIZE,
  detailLine,
  docHref,
  emptyState,
  EXCEL_UNAVAILABLE,
  filterSummary,
  formatDate,
  formatPcs,
  formatShortDate,
  formatWeight,
  hasFilters,
  pageToClamp,
  PAGE_SIZES,
  pcsCell,
  rangeProblem,
  rowNumber,
  SEARCH_MAX,
  specLine,
  stateToSearch,
  stockIdText,
  toggleSort,
  toQuery,
  totalPages,
  vendorLine,
  weightCell,
  withFilters,
};
export type { PageSize, ReportState, SortDir };

export const STOCK_VALUE_MENU_KEY = "stock-value";
export const STOCK_VALUE_HREF = "/report/stock-movement/stock-value";
/** The card key is Stock Card's: one card has one identity in both reports. */
export const stockValueHref = (cardKey: string) => `${STOCK_VALUE_HREF}/${encodeURIComponent(cardKey)}`;

export const NO_ACCESS = "You don't have access to Stock Value";

// ---- URL state ----

/** The server accepts these list sorts; the table draws sort icons on the first four only (Q-SV-14). */
export const LIST_SORT_KEYS = ["stoneCode", "location", "lot", "profitLoss", "balancePcs", "balanceWeightCt", "price", "amount"] as const;
export type ListSortKey = (typeof LIST_SORT_KEYS)[number];
export const TXN_SORT_KEYS = ["date", "docNo", "stockId", "account", "profitLoss"] as const;
export type TxnSortKey = (typeof TXN_SORT_KEYS)[number];
export type ListState = ReportState<ListSortKey>;
export type TxnState = ReportState<TxnSortKey>;

export const DEFAULT_LIST_SORT: { key: ListSortKey; dir: SortDir } = { key: "stoneCode", dir: "asc" };
export const DEFAULT_TXN_SORT: { key: TxnSortKey; dir: SortDir } = { key: "date", dir: "asc" };

type Params = Pick<URLSearchParams, "get">;
export const parseListState = (params: Params): ListState => parseState(params, LIST_SORT_KEYS, true);
export const parseTxnState = (params: Params): TxnState => parseState(params, TXN_SORT_KEYS, false);
export const activeListSort = (state: ListState) => (state.sort ? { key: state.sort, dir: state.dir } : DEFAULT_LIST_SORT);
export const activeTxnSort = (state: TxnState) => (state.sort ? { key: state.sort, dir: state.dir } : DEFAULT_TXN_SORT);

// ---- value cells ----

export const NO_VALUE = "—";
export const NO_PRICE_CAPTION = "No price";

/** Money cell text: the server's decimal string formatted with the Decimal Setup places; no value is a dash. */
export const moneyText = (value: string | null, format: (value: string) => string) => (value === null ? NO_VALUE : format(value));

const SOURCE_CAPTIONS: Readonly<Record<string, string>> = { PRICE_LIST: "Price list", LAST_SALE: "Last sale", MIXED: "Mixed" };

/**
 * The line under the price: the server's label, else the words of the known source; "No price" when nothing is priced;
 * empty for a source added by a newer server (the number alone then shows).
 */
export function priceCaption(source: string, label: string | null): string {
  if (source === "NONE") return NO_PRICE_CAPTION;
  return label?.trim() || (Object.hasOwn(SOURCE_CAPTIONS, source) ? SOURCE_CAPTIONS[source] : "");
}

type Ref = { docNo: string; docDate: string } | null;

/** Hover text of the price caption (ui-spec "Price source caption"). */
export function priceTooltip(source: string, ref: Ref): string | undefined {
  if (source === "PRICE_LIST") return "Price list: sell price of the Stock ID";
  if (source === "NONE") return "No price list and no sale yet";
  const sale = ref?.docNo ? ` (${ref.docNo}${ref.docDate ? `, ${formatDate(ref.docDate)}` : ""})` : "";
  if (source === "LAST_SALE") return `Last sale: latest Sale price${sale}`;
  if (source === "MIXED") return `Mixed: part from the Price list, part from the last sale${sale}`;
  return undefined;
}

/** Unit column: the amount is by weight ("Cts") or by piece ("Pcs"); anything else is a dash. */
export function unitLabel(unit: string | null): string {
  if (unit === "CT") return "Cts";
  if (unit === "PCS") return "Pcs";
  if (unit === "MIXED") return "Mixed";
  return NO_VALUE;
}

/** Profit/Loss colour rule: only a negative amount is red; zero, positive and no value use the normal colour. */
export function profitTone(value: string | null): "negative" | "normal" {
  return value !== null && /^-\d+(\.\d+)?$/.test(value) && /[1-9]/.test(value) ? "negative" : "normal";
}

export const asOfNote = (asOf: string) => `Balance as at ${formatDate(asOf)} at current prices`;
export const unpricedNote = (count: number) => (count > 0 ? `${count} without price` : "");
export const noCostNote = (count: number) => (count > 0 ? `${count} without cost` : "");

// ---- errors ----

export const LIST_ERROR = "Couldn't load Stock Value.";
export const TXN_ERROR = "Couldn't load transactions.";
export const CARD_MISSING = "This stock card no longer exists.";
