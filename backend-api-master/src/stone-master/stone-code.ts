/**
 * Stone Code parts (SA-SM-05, Q-SM-03): seven parts, user-ordered. In AUTO mode the server builds the
 * code (format below) and is the source of truth; the saved code is a snapshot (Q-SM-05).
 */
export const PART_KEYS = ["name", "size", "shape", "color", "cutting", "clarity", "quality"] as const;
export type PartKey = (typeof PART_KEYS)[number];

/** Default order: reproduces the design examples (name, size, shape, color, cutting, clarity, quality). */
export const DEFAULT_PART_ORDER: readonly PartKey[] = PART_KEYS;

export const STONE_CODE_MAX = 60;
export const STONE_CODE_PATTERN = /^[A-Z0-9./-]{1,60}$/;

/** Request field holding each part's id. */
export const PART_FIELD = {
  name: "stoneNameId",
  size: "sizeId",
  shape: "shapeId",
  color: "colorId",
  cutting: "cuttingId",
  clarity: "clarityId",
  quality: "qualityId",
} as const satisfies Record<PartKey, string>;

/**
 * Only the parts at positions #1 and #2 are required (owner 2026-10-20: they form the "xx" of the
 * "xx-xxxxxx" code); every other part, name/shape/color included, is optional.
 */
export const REQUIRED_POSITIONS = 2;

/**
 * Owner 2026-10-23: a size has no code, so its Name stands in for the size part of an Auto code,
 * uppercased with the spaces removed ("2.0 mm" → "2.0MM").
 */
export function sizePartCode(name: string): string {
  return name.toUpperCase().replace(/\s+/g, "");
}

export function isPermutation(order: readonly string[]): boolean {
  return order.length === PART_KEYS.length && PART_KEYS.every((key) => order.includes(key));
}

/**
 * Auto code format (owner 2026-10-19, "xx-xxxxxx"): the codes of the set parts in order; the first two
 * are joined together, then one "-", then the rest joined without separators
 * (RUB + 1.0 + RD + D + EX → "RUB1.0-RDDEX"). With two parts or fewer there is no "-". Empty parts
 * are skipped.
 */
export function buildAutoCode(order: readonly PartKey[], codes: Partial<Record<PartKey, string | null>>): string {
  const parts = order.map((key) => codes[key]).filter((code): code is string => typeof code === "string" && code.length > 0);
  if (parts.length <= 2) return parts.join("");
  return `${parts[0]}${parts[1]}-${parts.slice(2).join("")}`;
}
