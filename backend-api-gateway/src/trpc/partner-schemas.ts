import { z } from "zod";
import { domainError, type FieldError } from "./domain-error";
import { phoneSchema } from "./user-admin-schemas";

/**
 * Partner Master building blocks shared by `customer.*` (customer SA rev 1) and `vendor.*`
 * (vendor SA rev 1, D-V09). Bodies are the customer ones moved without change.
 */

export const MAX_ADDRESSES = 10;
export const LIST_LIMIT_MAX = 50;

// ---- input building blocks ----

export const optText = (max: number) =>
  z.string().trim().max(max).transform((value) => (value === "" ? null : value)).nullable();

export const addressBase = {
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().min(1).max(500),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  state: z.string().trim().min(1).max(100),
  city: z.string().trim().min(1).max(100),
  postcode: z.string().trim().min(1).max(20),
  isDefault: z.boolean(),
};

export const invoiceAddressInput = z.object({ ...addressBase, taxId: optText(32) }).strict();

/** Scalar fields common to every partner entity (name … email), in contract order. */
export const partnerScalarFields = {
  name: z.string().trim().min(1).max(200),
  code: optText(120),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  active: z.boolean(),
  firstName: z.string().trim().min(1).max(100),
  middleName: optText(100),
  lastName: optText(100),
  phone: phoneSchema.nullable(),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
};

/** `id` + optimistic version of a full-replacement update (customer D-05). */
export const updateMetaFields = {
  id: z.uuid(),
  expectedUpdatedAt: z.iso.datetime({ offset: false, precision: 3 }),
};

export const idInputSchema = z.object({ id: z.uuid() }).strict();

export const listInputSchema = z.object({
  q: z.string().trim().max(100).optional(),
  active: z.boolean().optional(),
  // tRPC useInfiniteQuery sends `cursor` (null on the first page) and `direction`.
  cursor: z.string().max(200).nullish(),
  direction: z.enum(["forward", "backward"]).optional(),
  limit: z.number().int().min(1).max(LIST_LIMIT_MAX).default(LIST_LIMIT_MAX),
}).strict();

/** Partner list query string from a validated list input (`direction` is not forwarded). */
export function listQueryString(input: z.output<typeof listInputSchema>): string {
  const query = new URLSearchParams({ limit: String(input.limit) });
  if (input.q) query.set("q", input.q);
  if (input.active !== undefined) query.set("active", String(input.active));
  if (input.cursor) query.set("cursor", input.cursor);
  return query.toString();
}

/**
 * Cross-field rule (both layers): at most one `isDefault: true` per address array, reported as
 * `{path:<array key>, code:"multiple_defaults"}` for every offending array, in key order. Zero
 * defaults are allowed here (customer's partner auto-defaults; vendor stores zero). Checked after
 * the shape is valid so the code is not reduced to zod's generic "custom".
 */
export function assertAtMostOneDefault(lists: Record<string, ReadonlyArray<{ isDefault: boolean }>>) {
  const errors: FieldError[] = [];
  for (const [path, list] of Object.entries(lists)) {
    if (list.filter((address) => address.isDefault).length > 1) errors.push({ path, code: "multiple_defaults" });
  }
  if (errors.length > 0) throw domainError("BAD_REQUEST", "VALIDATION_ERROR", errors);
}

// ---- outputs (validated; unknown upstream fields are stripped, arrays bounded) ----

export const timestamp = z.string().max(40);

export const listItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string().nullable(),
  active: z.boolean(),
  updatedAt: timestamp,
});

export const listOutputSchema = z.object({
  items: z.array(listItemSchema).max(LIST_LIMIT_MAX),
  nextCursor: z.string().max(200).nullable(),
  total: z.number().int().nonnegative(),
});

export const addressOutput = {
  id: z.string(),
  position: z.number().int().min(1).max(MAX_ADDRESSES),
  name: z.string(),
  address: z.string(),
  countryCode: z.string(),
  state: z.string(),
  city: z.string(),
  postcode: z.string(),
  isDefault: z.boolean(),
};

export const invoiceAddressOutputSchema = z.object({ ...addressOutput, taxId: z.string().nullable() });

/** Detail scalars after the list-item fields (`currencyCode … email`). */
export const detailScalarOutput = {
  currencyCode: z.string(),
  firstName: z.string(),
  middleName: z.string().nullable(),
  lastName: z.string().nullable(),
  phone: z.object({ country: z.string(), e164: z.string() }).nullable(),
  email: z.string(),
};

export const mutationOutputSchema = z.object({ id: z.string(), updatedAt: timestamp });

export const deleteOutputSchema = z.object({ ok: z.literal(true) });

const optionItemSchema = z.object({ code: z.string().max(8), name: z.string().max(200) });

export const optionsOutputSchema = z.object({
  currencies: z.array(optionItemSchema).max(400),
  countries: z.array(optionItemSchema).max(300),
});
