import {
  DEFAULT_PRICE_PLACES,
  DEFAULT_WEIGHT_PLACES,
  formatMoney as formatMoneyShared,
  formatUnitPrice as formatUnitPriceText,
  formatWeight as formatWeightText,
} from "@/lib/number-format";
import { toFixed, type Dec } from "./decimal";

/**
 * Display of document money and carat weights (decimal-setup FE-DEC-102/104): delegates to the website-wide
 * formatter in `@/lib/number-format`. Callers pass the Decimal Setup places from `useNumberFormat()`; the
 * default (2) is the Q-DEC-16 fallback. Exact: the bigint value is passed on as its full 8-place text.
 */
const exact = (value: Dec): string => toFixed(value, 8);

export const formatMoney = (value: Dec, pricePlaces: number = DEFAULT_PRICE_PLACES): string => formatMoneyShared(exact(value), pricePlaces);
export const formatWeight = (value: Dec, weightPlaces: number = DEFAULT_WEIGHT_PLACES): string => formatWeightText(exact(value), weightPlaces);
/** A stored money string (e.g. "12000.5") shown with the price places. */
export const formatMoneyText = (value: string, pricePlaces: number = DEFAULT_PRICE_PLACES): string => formatMoneyShared(value, pricePlaces);
/** A stored unit price with more decimals (net unit price, 4 dp): rounded to the typed scale, then shown with the price places. */
export const formatUnitPrice = (value: string, pricePlaces: number = DEFAULT_PRICE_PLACES): string => formatUnitPriceText(value, pricePlaces);

/** yyyy-mm-dd → dd/mm/yyyy */
/** Exchange Rate label: how many company-currency units one unit of the document currency is (INV-20261102-005). */
export function exchangeRateLabel(baseCode: string | null | undefined, currency: string | null | undefined): string {
  return baseCode && currency && currency !== baseCode ? `Exchange Rate (${baseCode} per 1 ${currency})` : "Exchange Rate";
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

export function todayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
