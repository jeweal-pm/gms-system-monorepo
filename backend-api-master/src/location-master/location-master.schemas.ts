import { z } from "zod";
import { expectedUpdatedAtSchema } from "../common/partner-schemas";

/** SA-LM-01: trimmed, 1–40 characters (the documents' `location` columns are varchar(40)). */
export const LOCATION_NAME_MAX = 40;
export const locationNameSchema = z.string().trim().min(1).max(LOCATION_NAME_MAX);

export const createLocationBodySchema = z.object({ name: locationNameSchema, active: z.boolean().default(true) }).strict();
export const updateLocationBodySchema = z.object({ name: locationNameSchema, active: z.boolean(), expectedUpdatedAt: expectedUpdatedAtSchema }).strict();
export const deleteLocationBodySchema = z.object({ expectedUpdatedAt: expectedUpdatedAtSchema }).strict();

export type CreateLocationInput = z.output<typeof createLocationBodySchema>;
export type UpdateLocationInput = z.output<typeof updateLocationBodySchema>;
