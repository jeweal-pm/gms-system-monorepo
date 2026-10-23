import type { PartnerEntity } from "@/features/partner/entity";

/**
 * Stone Master pages (stone-master UI revision 1, SA-SM-10). One catalog leaf `stone-master` gates all
 * nine pages (Q-SM-04); `kind` is the gateway `stoneMaster.<kind>` router key.
 */
export const STONE_MENU_KEY = "stone-master";

export type StoneKind = "group" | "size" | "color" | "cutting" | "clarity" | "quality" | "stoneName" | "shape" | "stoneCode";
/** `size`: Name only (owner 2026-10-23); Auto stone codes use the size name. */
export type FieldSet = "simple" | "size" | "stoneName" | "shape" | "stoneCode";

export type StonePage = {
  slug: string;
  kind: StoneKind;
  fields: FieldSet;
  /** Wording for the shared Partner Master header/drawer/dialogs; `key` is the permission menu key. */
  entity: PartnerEntity;
  /** Context-nav and breadcrumb label. */
  navLabel: string;
  codePlaceholder: string;
  namePlaceholder: string;
  searchPlaceholder: string;
};

const entity = (singular: string, plural: string): PartnerEntity => ({ key: STONE_MENU_KEY, singular, plural });
const SEARCH = "Search code or name...";

export const STONE_PAGES: readonly StonePage[] = [
  { slug: "stone-group", kind: "group", fields: "simple", entity: entity("Stone Group", "Stone Groups"), navLabel: "Stone Group", codePlaceholder: "e.g. DIA", namePlaceholder: "e.g. Diamond", searchPlaceholder: SEARCH },
  { slug: "stone-name", kind: "stoneName", fields: "stoneName", entity: entity("Stone Name", "Stone Names"), navLabel: "Stone Name", codePlaceholder: "e.g. RUB", namePlaceholder: "e.g. Ruby", searchPlaceholder: "Search code, name or HSN..." },
  { slug: "size", kind: "size", fields: "size", entity: entity("Size", "Sizes"), navLabel: "Size", codePlaceholder: "", namePlaceholder: "e.g. 1.0 mm", searchPlaceholder: "Search name..." },
  { slug: "shape", kind: "shape", fields: "shape", entity: entity("Shape", "Shapes"), navLabel: "Shape", codePlaceholder: "e.g. RD", namePlaceholder: "e.g. Round", searchPlaceholder: SEARCH },
  { slug: "color", kind: "color", fields: "simple", entity: entity("Color", "Colors"), navLabel: "Color", codePlaceholder: "e.g. D", namePlaceholder: "e.g. D Color", searchPlaceholder: SEARCH },
  { slug: "cutting", kind: "cutting", fields: "simple", entity: entity("Cutting", "Cuttings"), navLabel: "Cutting", codePlaceholder: "e.g. EX", namePlaceholder: "e.g. Excellent", searchPlaceholder: SEARCH },
  { slug: "clarity", kind: "clarity", fields: "simple", entity: entity("Clarity", "Clarities"), navLabel: "Clarity", codePlaceholder: "e.g. VVS1", namePlaceholder: "e.g. VVS1", searchPlaceholder: SEARCH },
  { slug: "quality", kind: "quality", fields: "simple", entity: entity("Quality", "Qualities"), navLabel: "Quality", codePlaceholder: "e.g. AAA", namePlaceholder: "e.g. AAA", searchPlaceholder: SEARCH },
  { slug: "stone-code", kind: "stoneCode", fields: "stoneCode", entity: entity("Stone Code", "Stone Codes"), navLabel: "Stone Code", codePlaceholder: "XX - XXXX", namePlaceholder: "", searchPlaceholder: SEARCH },
];

export const DEFAULT_STONE_SLUG = "stone-group";

export function stonePageBySlug(slug: string): StonePage | undefined {
  return STONE_PAGES.find((page) => page.slug === slug);
}

export function stonePageHref(slug: string): string {
  return `/setup/stone-master/${slug}`;
}
