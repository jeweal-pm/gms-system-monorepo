import { z } from "zod";

/** Location Master form (location-master UI rev 1, ADR-0053): one Name field and the Active switch. */
export type LocationFormValues = { name: string; active: boolean };

/** The documents store up to 40 characters (`location varchar(40)`). */
export const LOCATION_NAME_MAX = 40;
export const LOCATION_SEARCH_MAX = 100;

/** Focus order for the first invalid field. */
export const FIELD_ORDER = ["name"] as const satisfies readonly (keyof LocationFormValues)[];

export function emptyLocationForm(): LocationFormValues {
  return { name: "", active: true };
}

export const locationFormSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(LOCATION_NAME_MAX, `Up to ${LOCATION_NAME_MAX} characters`),
  active: z.boolean(),
});
