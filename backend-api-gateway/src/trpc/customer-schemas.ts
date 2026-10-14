import { z } from "zod";
import { domainError, type FieldError } from "./domain-error";
import { phoneSchema } from "./user-admin-schemas";

/** customer SA revision 1 contract shapes (document/apps/backend/partner/customer/api-contract.md). */

const MAX_ADDRESSES_PER_TYPE = 10;

const optText = (max: number) =>
  z.string().trim().max(max).transform((value) => (value === "" ? null : value)).nullable();

const addressBase = {
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().min(1).max(500),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  state: z.string().trim().min(1).max(100),
  city: z.string().trim().min(1).max(100),
  postcode: z.string().trim().min(1).max(20),
  isDefault: z.boolean(),
};

const invoiceAddressInput = z.object({ ...addressBase, taxId: optText(32) }).strict();
const shippingAddressInput = z.object(addressBase).strict();

const customerFields = {
  name: z.string().trim().min(1).max(200),
  code: optText(120),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  active: z.boolean(),
  firstName: z.string().trim().min(1).max(100),
  middleName: optText(100),
  lastName: optText(100),
  phone: phoneSchema.nullable(),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  invoiceAddresses: z.array(invoiceAddressInput).min(1).max(MAX_ADDRESSES_PER_TYPE),
  shippingAddresses: z.array(shippingAddressInput).min(1).max(MAX_ADDRESSES_PER_TYPE),
};

// ---- inputs ----

export const customerIdInputSchema = z.object({ id: z.uuid() }).strict();

export const customerListInputSchema = z.object({
  q: z.string().trim().max(100).optional(),
  active: z.boolean().optional(),
  // tRPC useInfiniteQuery sends `cursor` (null on the first page) and `direction`.
  cursor: z.string().max(200).nullish(),
  direction: z.enum(["forward", "backward"]).optional(),
  limit: z.number().int().min(1).max(50).default(50),
}).strict();

export const createCustomerInputSchema = z.object(customerFields).strict();

export const updateCustomerInputSchema = z.object({
  id: z.uuid(),
  expectedUpdatedAt: z.iso.datetime({ offset: false, precision: 3 }),
  ...customerFields,
}).strict();

/**
 * Cross-field rule (both layers): at most one `isDefault: true` per address array, reported as
 * `{path:"invoiceAddresses"|"shippingAddresses", code:"multiple_defaults"}`. Checked after the
 * shape is valid so the code is not reduced to zod's generic "custom".
 */
export function assertSingleDefaults(input: { invoiceAddresses: { isDefault: boolean }[]; shippingAddresses: { isDefault: boolean }[] }) {
  const errors: FieldError[] = [];
  for (const key of ["invoiceAddresses", "shippingAddresses"] as const) {
    if (input[key].filter((address) => address.isDefault).length > 1) errors.push({ path: key, code: "multiple_defaults" });
  }
  if (errors.length > 0) throw domainError("BAD_REQUEST", "VALIDATION_ERROR", errors);
}

// ---- outputs (validated; unknown upstream fields are stripped, arrays bounded) ----

const timestamp = z.string().max(40);

export const customerListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string().nullable(),
  active: z.boolean(),
  updatedAt: timestamp,
});

export const customerListOutputSchema = z.object({
  items: z.array(customerListItemSchema).max(50),
  nextCursor: z.string().max(200).nullable(),
  total: z.number().int().nonnegative(),
});

const addressOutput = {
  id: z.string(),
  position: z.number().int().min(1).max(MAX_ADDRESSES_PER_TYPE),
  name: z.string(),
  address: z.string(),
  countryCode: z.string(),
  state: z.string(),
  city: z.string(),
  postcode: z.string(),
  isDefault: z.boolean(),
};

export const customerDetailOutputSchema = customerListItemSchema.extend({
  currencyCode: z.string(),
  firstName: z.string(),
  middleName: z.string().nullable(),
  lastName: z.string().nullable(),
  phone: z.object({ country: z.string(), e164: z.string() }).nullable(),
  email: z.string(),
  invoiceAddresses: z.array(z.object({ ...addressOutput, taxId: z.string().nullable() })).max(MAX_ADDRESSES_PER_TYPE),
  shippingAddresses: z.array(z.object(addressOutput)).max(MAX_ADDRESSES_PER_TYPE),
  createdAt: timestamp,
});

export const customerMutationOutputSchema = z.object({ id: z.string(), updatedAt: timestamp });

export const customerDeleteOutputSchema = z.object({ ok: z.literal(true) });

const optionItemSchema = z.object({ code: z.string().max(8), name: z.string().max(200) });

export const customerOptionsOutputSchema = z.object({
  currencies: z.array(optionItemSchema).max(400),
  countries: z.array(optionItemSchema).max(300),
});
