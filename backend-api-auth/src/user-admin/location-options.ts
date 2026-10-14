/**
 * Static location options (decisions.md C-08 A) until a Location master service exists.
 * No data scoping. Bounded to 50 options by the contract.
 */
export const LOCATION_OPTIONS: readonly { key: string; label: string }[] = [{ key: "primary", label: "Primary" }];

const locationKeys = new Set(LOCATION_OPTIONS.map((option) => option.key));

export function isKnownLocation(key: string) {
  return locationKeys.has(key);
}
