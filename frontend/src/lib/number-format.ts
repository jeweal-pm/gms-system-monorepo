/**
 * Website-wide money / carat-weight display (decimal-setup TODO rev 2, FE-DEC-102, ADR-0040).
 *
 * Exact: works on the decimal string with BigInt, so large amounts never pass through floating point.
 * Rounding is half-up on the magnitude (1.235 → 1.24, -1.235 → -1.24), like the quotation decimal helper.
 * The places come from Decimal Setup (0–4); typing and storage stay at weight 3 / price 2 (owner Q-DEC-08),
 * so a shown 4th place is 0. Pieces, percentages and exchange/currency rates do not use this module.
 */

/** Q-DEC-09 / Q-DEC-16: used before the setting loads and whenever it cannot be loaded. */
export const DEFAULT_WEIGHT_PLACES = 2;
export const DEFAULT_PRICE_PLACES = 2;
/** Highest places Decimal Setup offers (owner Q-DEC-08, 2026-11-03). */
export const MAX_DISPLAY_PLACES = 4;
/** Storage scales: weight numeric(12,3), money numeric(18,2). Typing never goes beyond them (FE-DEC-105). */
export const WEIGHT_STORAGE_PLACES = 3;
export const PRICE_STORAGE_PLACES = 2;

export type DecimalPlaces = { weightPlaces: number; pricePlaces: number };
export const DEFAULT_DECIMAL_PLACES: DecimalPlaces = { weightPlaces: DEFAULT_WEIGHT_PLACES, pricePlaces: DEFAULT_PRICE_PLACES };

const NUMBER_TEXT = /^(-)?(\d*)(?:\.(\d*))?$/;
const ZERO = BigInt(0);
const ONE = BigInt(1);

/** Whole number of places 0..MAX_DISPLAY_PLACES; anything else falls back to `fallback`. */
export function normalizePlaces(places: unknown, fallback: number): number {
  return typeof places === "number" && Number.isInteger(places) && places >= 0 && places <= MAX_DISPLAY_PLACES ? places : fallback;
}

/** Input cap for a carat weight field: the chosen places, never above the stored 3. */
export const weightInputDecimals = (weightPlaces: number): number => Math.min(normalizePlaces(weightPlaces, DEFAULT_WEIGHT_PLACES), WEIGHT_STORAGE_PLACES);
/** Input cap for a money field: the chosen places, never above the stored 2. */
export const priceInputDecimals = (pricePlaces: number): number => Math.min(normalizePlaces(pricePlaces, DEFAULT_PRICE_PLACES), PRICE_STORAGE_PLACES);

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Decimal text → text with exactly `places` decimals, half-up, no grouping. Commas and surrounding spaces in the
 * input are ignored; `null` when the text is not a plain decimal number. A rounded zero has no minus sign.
 */
export function roundDecimalText(value: string, places: number): string | null {
  const match = NUMBER_TEXT.exec(value.replace(/,/g, "").trim());
  if (!match || (!match[2] && !match[3])) return null;
  const [, sign = "", whole = "", fraction = ""] = match;
  const digits = Math.max(0, Math.floor(places));
  const kept = fraction.slice(0, digits).padEnd(digits, "0");
  let scaled = BigInt(`${whole || "0"}${kept}`);
  if ((fraction.charCodeAt(digits) || 0) >= 53 /* "5" */) scaled += ONE;
  const text = scaled.toString().padStart(digits + 1, "0");
  const intPart = text.slice(0, text.length - digits);
  const fracPart = text.slice(text.length - digits);
  const negative = sign === "-" && scaled !== ZERO;
  return `${negative ? "-" : ""}${intPart}${digits > 0 ? `.${fracPart}` : ""}`;
}

/** `formatNumber("12345.678", 2)` → "12,345.68"; grouping on the whole part only; other text is returned as is. */
export function formatNumber(value: string | number, places: number): string {
  const text = typeof value === "number" ? (Number.isFinite(value) ? String(value) : "") : value;
  const rounded = roundDecimalText(text, places);
  if (rounded === null) return String(value);
  const [whole, fraction] = rounded.split(".");
  const negative = whole.startsWith("-");
  const grouped = groupThousands(negative ? whole.slice(1) : whole);
  return `${negative ? "-" : ""}${grouped}${fraction === undefined ? "" : `.${fraction}`}`;
}

/** A carat weight shown with the Decimal Setup weight places. */
export const formatWeight = (value: string | number, weightPlaces: number): string => formatNumber(value, normalizePlaces(weightPlaces, DEFAULT_WEIGHT_PLACES));
/** A money value (price, amount, total) shown with the Decimal Setup price places. */
export const formatMoney = (value: string | number, pricePlaces: number): string => formatNumber(value, normalizePlaces(pricePlaces, DEFAULT_PRICE_PLACES));

/**
 * A unit price that is stored with more decimals than it is typed with (net unit price, 4 dp): rounded first to the
 * typed money scale (2, or fewer when the setting is lower) so it reads as the price keyed in (INV-20261102-004),
 * then shown with the price places (a 3rd/4th place is 0).
 */
export function formatUnitPrice(value: string | number, pricePlaces: number): string {
  const places = normalizePlaces(pricePlaces, DEFAULT_PRICE_PLACES);
  const text = typeof value === "number" ? String(value) : value;
  const typed = roundDecimalText(text, Math.min(places, PRICE_STORAGE_PLACES));
  return typed === null ? String(value) : formatNumber(typed, places);
}
