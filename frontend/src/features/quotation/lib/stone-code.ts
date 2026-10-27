import { buildAutoCode, DEFAULT_PART_ORDER, PART_KEYS, type PartKey } from "@/features/stone-master/stone-code";

/** Line attributes that come from the stone master, and the master part each one is. */
export const ATTRIBUTE_KEYS = ["stone", "shape", "size", "color", "clarity", "cutting", "quality"] as const;
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];
export const PART_OF: Readonly<Record<AttributeKey, PartKey>> = { stone: "name", shape: "shape", size: "size", color: "color", clarity: "clarity", cutting: "cutting", quality: "quality" };

export type PartChoice = { name: string; code: string };

/**
 * Owner 2026-10-27: when a part changes on a quotation line, rebuild the Stone Code from the parts'
 * codes (stone master "xx-xxxxxx" format) in the chosen master code's part order, or the default order.
 * Parts without a matching choice (e.g. an old, now-inactive value) are skipped and `complete` is false,
 * so the caller must not link the result to a master code. Only the quotation changes, never the master.
 */
export function rebuildStoneCode(
  names: Readonly<Record<AttributeKey, string>>,
  lists: Readonly<Partial<Record<AttributeKey, readonly PartChoice[]>>>,
  partOrder: readonly string[],
): { code: string; complete: boolean } {
  const codes: Partial<Record<PartKey, string>> = {};
  let complete = true;
  for (const attribute of ATTRIBUTE_KEYS) {
    if (!names[attribute]) continue;
    const code = lists[attribute]?.find((item) => item.name === names[attribute])?.code;
    if (code) codes[PART_OF[attribute]] = code;
    else complete = false;
  }
  const order = partOrder.length === PART_KEYS.length ? (partOrder as PartKey[]) : [...DEFAULT_PART_ORDER];
  return { code: buildAutoCode(order, codes), complete };
}
