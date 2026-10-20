/**
 * Stone Code parts (stone-master ui-spec S4–S6, SA-SM-05, Q-SM-03). The browser builds the Auto code
 * for the live preview; the server rebuilds it on save (authoritative).
 */
export const PART_KEYS = ["name", "size", "shape", "color", "cutting", "clarity", "quality"] as const;
export type PartKey = (typeof PART_KEYS)[number];

export const DEFAULT_PART_ORDER: readonly PartKey[] = PART_KEYS;
/** Only the parts at positions #1 and #2 are required (owner 2026-10-20: the "xx" of "xx-xxxxxx"). */
export const REQUIRED_POSITIONS = 2;

/** Required = the part sits at #1 or #2; every other part is optional. */
export function isPartRequired(part: PartKey, order: readonly PartKey[]): boolean {
  const index = order.indexOf(part);
  return index >= 0 && index < REQUIRED_POSITIONS;
}

export const PART_LABEL: Readonly<Record<PartKey, string>> = {
  name: "Name",
  size: "Size",
  shape: "Shape",
  color: "Color",
  cutting: "Cutting",
  clarity: "Clarity",
  quality: "Quality",
};

/** Form field holding each part's selected id. */
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
 * Auto code format (owner 2026-10-19, "xx-xxxxxx"): the codes of the set parts in order; the first two
 * are joined together, then one "-", then the rest joined without separators
 * (RUB + 1.0 + RD + D + EX → "RUB1.0-RDDEX"). With two parts or fewer there is no "-". Empty parts
 * are skipped.
 */
export function buildAutoCode(order: readonly PartKey[], codes: Partial<Record<PartKey, string | null | undefined>>): string {
  const parts = order.map((key) => codes[key]).filter((code): code is string => typeof code === "string" && code.length > 0);
  if (parts.length <= 2) return parts.join("");
  return `${parts[0]}${parts[1]}-${parts.slice(2).join("")}`;
}

/** Moves one item from `from` to `to` (both clamped); the original array is not changed. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const target = Math.max(0, Math.min(items.length - 1, to));
  if (from < 0 || from >= items.length || target === from) return [...items];
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return next;
}
