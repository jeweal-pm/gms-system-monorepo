import { formatNumber } from "@/lib/number-format";

/**
 * Decimal Setup values (decimal-setup UI rev 2, owner 2026-11-03): one weight and one price setting for the
 * whole website — the per-page table is gone. Owner 2026-11-03 (Q-DEC-08 changed, "max decimal 4"): both
 * allow 0–4 for display; typing and storage stay at weight 3 / price 2, so a 4th place shows as 0.
 */
export const WEIGHT_CHOICES = [0, 1, 2, 3, 4] as const;
export const PRICE_CHOICES = [0, 1, 2, 3, 4] as const;
/** Q-DEC-09: 2 / 2, today's display. */
export const DEFAULT_PLACES = 2;

export type DecimalKind = "weight" | "price";
/** What the page edits: the two places and the version they were loaded with (sent as `expectedVersion`). */
export type DecimalDraft = { weightPlaces: number; pricePlaces: number; expectedVersion: number };

export function choicesFor(kind: DecimalKind): readonly number[] {
  return kind === "weight" ? WEIGHT_CHOICES : PRICE_CHOICES;
}

export function isPlaces(kind: DecimalKind, value: unknown): value is number {
  return typeof value === "number" && choicesFor(kind).includes(value);
}

/** Example shown next to each choice (F2-03/F2-04): half-up rounding (Q-DEC-04), the website's own formatter. */
export function exampleText(kind: DecimalKind, places: number): string {
  return kind === "weight" ? `${formatNumber("1.23456", places)} ct` : formatNumber("12345.6789", places);
}
