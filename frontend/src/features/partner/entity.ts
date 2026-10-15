/**
 * Partner Master entity wording (vendor FE-VEN-001). Shared components get every
 * entity-specific word, id and permission key from here, so `features/partner/**`
 * never imports a customer or vendor module.
 */
export type PartnerEntity = {
  /** Permission menu key (`${key}:VIEW`) and DOM id prefix, e.g. "customer". */
  key: string;
  /** Title case singular, e.g. "Customer". */
  singular: string;
  /** Title case plural, e.g. "Customers". */
  plural: string;
};

/** "customer" / "customers" for running text. */
export function lowerSingular(entity: PartnerEntity): string {
  return entity.singular.toLowerCase();
}

export function lowerPlural(entity: PartnerEntity): string {
  return entity.plural.toLowerCase();
}
