import { z } from "zod";
import { expectedUpdatedAtSchema } from "../common/partner-schemas";

/** SA-CUR-04: 3 letters A–Z, trimmed and stored UPPERCASE (Q-CUR-02). */
export const currencyCodeSchema = z.string().trim().transform((value) => value.toUpperCase()).pipe(z.string().regex(/^[A-Z]{3}$/));

/**
 * A rate is "1 {code} = rate {base}": a decimal string, at most 14 integer digits and 4 decimals, > 0
 * (numeric(18,4)). `null` = not set; the service requires both rates unless the currency is the base.
 */
export const rateSchema = z
  .string()
  .trim()
  .regex(/^\d{1,14}(\.\d{1,4})?$/)
  .refine((value) => Number(value) > 0, { message: "too_small", params: { code: "too_small" } })
  .nullable();

const fields = {
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(250),
  active: z.boolean(),
  sellingRate: rateSchema,
  buyingRate: rateSchema,
};

export const createCurrencyBodySchema = z.object({ code: currencyCodeSchema, ...fields }).strict();
/** Q-CUR-04: the code can't change after create, so update doesn't accept it. */
export const updateCurrencyBodySchema = z.object({ ...fields, expectedUpdatedAt: expectedUpdatedAtSchema }).strict();

export type CreateCurrencyInput = z.output<typeof createCurrencyBodySchema>;
export type UpdateCurrencyInput = z.output<typeof updateCurrencyBodySchema>;
