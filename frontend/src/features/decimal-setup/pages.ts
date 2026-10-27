/**
 * Pages whose weight / price decimal places can be set (decimal-setup UI rev 1, Q-DEC-01/02): the same
 * 15 transactions as Document Setup, grouped like the main menu. Payable and Receivable have no weight.
 */
export type DecimalPage = { key: string; label: string; section: string; hasWeight: boolean };

export const DECIMAL_PAGES: readonly DecimalPage[] = [
  { key: "quotation", label: "Quotation", section: "PRE-SALE", hasWeight: true },
  { key: "reserve", label: "Reserve", section: "PRE-SALE", hasWeight: true },
  { key: "memo-receive", label: "Memo Receive", section: "MEMO", hasWeight: true },
  { key: "memo-return", label: "Memo Return", section: "MEMO", hasWeight: true },
  { key: "memo-out", label: "Memo Out", section: "MEMO", hasWeight: true },
  { key: "memo-out-return", label: "Memo Out Return", section: "MEMO", hasWeight: true },
  { key: "purchase-order", label: "Purchase Order", section: "PURCHASE", hasWeight: true },
  { key: "purchase", label: "Purchase", section: "PURCHASE", hasWeight: true },
  { key: "load-to-stock", label: "Load to Stock", section: "INVENTORY", hasWeight: true },
  { key: "merge-split", label: "Merge/Split", section: "INVENTORY", hasWeight: true },
  { key: "stock-transfer-location", label: "Stock Transfer Location", section: "INVENTORY", hasWeight: true },
  { key: "stock-adjustment", label: "Stock Adjustment", section: "INVENTORY", hasWeight: true },
  { key: "sale", label: "Sale", section: "SALE", hasWeight: true },
  { key: "payable", label: "Payable", section: "ACCOUNT", hasWeight: false },
  { key: "receivable", label: "Receivable", section: "ACCOUNT", hasWeight: false },
];

/** Allowed decimal places (Q-DEC-03). */
export const DECIMAL_CHOICES = [0, 1, 2, 3, 4] as const;
export const DEFAULT_PLACES = 2;

/** `weight` is null for pages without weight. */
export type PagePlaces = { weight: number | null; price: number };
export type DecimalSetup = { defaults: { weight: number; price: number }; pages: Record<string, PagePlaces> };

export function defaultDecimalSetup(): DecimalSetup {
  return {
    defaults: { weight: DEFAULT_PLACES, price: DEFAULT_PLACES },
    pages: Object.fromEntries(DECIMAL_PAGES.map((page) => [page.key, { weight: page.hasWeight ? DEFAULT_PLACES : null, price: DEFAULT_PLACES }])),
  };
}

/** Every page set to the defaults (weight only where the page has weight). */
export function applyToAll(setup: DecimalSetup): DecimalSetup {
  return {
    ...setup,
    pages: Object.fromEntries(DECIMAL_PAGES.map((page) => [page.key, { weight: page.hasWeight ? setup.defaults.weight : null, price: setup.defaults.price }])),
  };
}

/** True when any page differs from the defaults (Apply to all then asks to confirm). */
export function differsFromDefaults(setup: DecimalSetup): boolean {
  return DECIMAL_PAGES.some((page) => {
    const places = setup.pages[page.key];
    return places.price !== setup.defaults.price || (page.hasWeight && places.weight !== setup.defaults.weight);
  });
}

/** Example shown next to each choice (F-06/F-07): half-up rounding (Q-DEC-04), thousands separator for price. */
export function exampleText(kind: "weight" | "price", places: number): string {
  const sample = kind === "weight" ? 1.23456 : 12345.6789;
  const factor = 10 ** places;
  const rounded = Math.round((sample + Number.EPSILON) * factor) / factor;
  const text = rounded.toLocaleString("en-US", { minimumFractionDigits: places, maximumFractionDigits: places, useGrouping: kind === "price" });
  return kind === "weight" ? `${text} ct` : text;
}

/** Rows matching the search (page or section name, case-insensitive). */
export function filterPages(query: string): DecimalPage[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...DECIMAL_PAGES];
  return DECIMAL_PAGES.filter((page) => page.label.toLowerCase().includes(q) || page.section.toLowerCase().includes(q));
}
