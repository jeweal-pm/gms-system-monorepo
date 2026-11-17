import type { Option } from "@/features/quotation/lib/options";

/** The blank choice first: Location stays optional on Purchase Order / Purchase rows. */
export const NO_LOCATION_OPTION: Option = { value: "", label: "—" };

/**
 * location-master FE-LM-003 (ADR-0053, SA-LM-04): the active Location Master names from a document's `options`
 * (`locations`) as Location dropdown choices. Until the options load, the dropdown still shows the blank choice and
 * the row's stored value (the row panel adds it, `withCurrent`).
 */
export function locationOptions(names: readonly string[] | undefined): Option[] {
  return [NO_LOCATION_OPTION, ...(names ?? []).map((name) => ({ value: name, label: name }))];
}
