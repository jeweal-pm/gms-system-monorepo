/**
 * Stone master kinds (ADR-0024, SA stone-master rev 1). The path slug is the API name; the simple
 * kinds share one table shape (code, name, active) in PostgreSQL schema `stone`.
 */
export const SIMPLE_KINDS = ["group", "size", "color", "cutting", "clarity", "quality"] as const;
export const STONE_KINDS = [...SIMPLE_KINDS, "stone-name", "shape", "stone-code"] as const;

export type SimpleKind = (typeof SIMPLE_KINDS)[number];
export type StoneKind = (typeof STONE_KINDS)[number];

/** Kinds offered by `GET /options` (SA-SM-08); response keys are camelCase. */
export const OPTION_KINDS = ["group", "size", "shape", "color", "cutting", "clarity", "quality", "stone-name"] as const;
export type OptionKind = (typeof OPTION_KINDS)[number];
export const OPTION_KEY: Readonly<Record<OptionKind, string>> = {
  group: "group",
  size: "size",
  shape: "shape",
  color: "color",
  cutting: "cutting",
  clarity: "clarity",
  quality: "quality",
  "stone-name": "stoneName",
};

export function isStoneKind(value: string): value is StoneKind {
  return (STONE_KINDS as readonly string[]).includes(value);
}

export function isSimpleKind(value: StoneKind): value is SimpleKind {
  return (SIMPLE_KINDS as readonly string[]).includes(value);
}
