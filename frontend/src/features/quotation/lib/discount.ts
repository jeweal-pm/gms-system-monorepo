import { dec, div, max, min, mul, round, toFixed, ZERO, type Dec } from "./decimal";

/**
 * A discount entered either as a percent or as an amount (owner 2026-10-27): the field the user typed
 * last is the source (`type` + `value`); the other one is computed from it against the base (the line
 * gross or the subtotal). Same rounding as the server (half-up to 2 dp, capped to 0…base).
 */
export type DiscountType = "PERCENT" | "AMOUNT";

export function discountAmount(base: Dec, type: DiscountType, value: string): Dec {
  if (value.trim() === "") return ZERO;
  const amount = type === "PERCENT" ? round(div(mul(base, dec(value)), dec(100))) : round(dec(value));
  return min(max(amount, ZERO), base);
}

/** The amount shown when the percent is the source ("" while nothing is entered). */
export function amountText(base: Dec, type: DiscountType, value: string): string {
  if (type === "AMOUNT") return value;
  return value.trim() === "" ? "" : toFixed(discountAmount(base, type, value), 2);
}

/** The percent shown when the amount is the source ("" while nothing is entered or the base is 0). */
export function percentText(base: Dec, type: DiscountType, value: string): string {
  if (type === "PERCENT") return value;
  if (value.trim() === "" || base <= ZERO) return "";
  return toFixed(div(mul(discountAmount(base, type, value), dec(100)), base), 2);
}
