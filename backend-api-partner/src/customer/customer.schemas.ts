import { z } from "zod";
import { MAX_CURSOR_LENGTH } from "./cursor";

/** customer SA revision 1 shapes (api-contract.md "Shared types"); identical rules to the gateway. */

export const MAX_ADDRESSES_PER_TYPE = 10;
export const LIST_LIMIT_MAX = 50;

const optText = (max: number) =>
  z.string().trim().max(max).transform((value) => (value === "" ? null : value)).nullable();

export const phoneSchema = z.object({
  country: z.string().regex(/^[A-Z]{2}$/),
  e164: z.string().regex(/^\+[1-9]\d{6,14}$/),
}).strict();

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

/** At most one `isDefault: true` per array (D-08 / architecture.md §7). */
function atMostOneDefault(addresses: { isDefault: boolean }[], ctx: z.RefinementCtx) {
  if (addresses.filter((address) => address.isDefault).length > 1) {
    ctx.addIssue({ code: "custom", message: "multiple_defaults", params: { code: "multiple_defaults" } });
  }
}

export const customerFields = {
  name: z.string().trim().min(1).max(200),
  code: optText(120),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  active: z.boolean(),
  firstName: z.string().trim().min(1).max(100),
  middleName: optText(100),
  lastName: optText(100),
  phone: phoneSchema.nullable(),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  invoiceAddresses: z.array(invoiceAddressInput).min(1).max(MAX_ADDRESSES_PER_TYPE).superRefine(atMostOneDefault),
  shippingAddresses: z.array(shippingAddressInput).min(1).max(MAX_ADDRESSES_PER_TYPE).superRefine(atMostOneDefault),
};

export const createCustomerBodySchema = z.object(customerFields).strict();

/** PUT body: full replacement plus the optimistic version (D-05); `id` comes from the path. */
export const updateCustomerBodySchema = z.object({
  expectedUpdatedAt: z.iso.datetime({ offset: false, precision: 3 }),
  ...customerFields,
}).strict();

export const customerIdSchema = z.uuid();

/** Query parameters are strings; repeated parameters (arrays) fail validation. */
export const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  active: z.enum(["true", "false"]).optional(),
  cursor: z.string().max(MAX_CURSOR_LENGTH).optional(),
  limit: z.string().regex(/^\d{1,3}$/).transform(Number).pipe(z.number().int().min(1).max(LIST_LIMIT_MAX)).optional(),
}).strict();

export type CustomerInput = z.output<typeof createCustomerBodySchema>;
export type UpdateCustomerInput = z.output<typeof updateCustomerBodySchema>;
export type ListQuery = z.output<typeof listQuerySchema>;
