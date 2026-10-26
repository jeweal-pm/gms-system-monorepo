/**
 * Exchange rate text helpers (currency UI rev 1 C-06): "1 {code} = rate {base}", numeric(18,4) on the
 * server, so at most 14 integer digits and 4 decimals, greater than 0. Strings only, so large values
 * never lose precision in a JavaScript number.
 */
export const RATE_PATTERN = /^\d{1,14}(\.\d{1,4})?$/;

/** Keeps digits and the first dot, at most 14 integer digits and 4 decimals (thousands commas dropped). */
export function sanitizeRate(value: string): string {
  const cleaned = value.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return cleaned.slice(0, 14);
  const whole = cleaned.slice(0, dot).slice(0, 14);
  const decimals = cleaned.slice(dot + 1).replace(/\./g, "").slice(0, 4);
  return `${whole}.${decimals}`;
}

/** "33.25" → "33.2500", "007" → "7.0000"; anything not a valid rate is returned unchanged. */
export function formatRate(value: string): string {
  const trimmed = value.trim();
  if (!RATE_PATTERN.test(trimmed)) return value;
  const [whole, decimals = ""] = trimmed.split(".");
  return `${whole.replace(/^0+(?=\d)/, "")}.${decimals.padEnd(4, "0")}`;
}

/** Validation message for a non-base currency's rate, or null when it is fine. */
export function rateProblem(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return "Rate is required";
  if (!RATE_PATTERN.test(trimmed)) return "Use digits with up to 4 decimals";
  if (!/[1-9]/.test(trimmed)) return "Enter a rate greater than 0";
  return null;
}
