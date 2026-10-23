import { z } from "zod";
import {
  addressBase,
  atMostOneDefault,
  entityIdSchema,
  expectedUpdatedAtSchema,
  invoiceAddressInput,
  MAX_ADDRESSES,
  partnerScalarFields,
} from "../common/partner-schemas";

/**
 * customer SA revision 1 shapes (api-contract.md "Shared types"); identical rules to the gateway.
 * Building blocks live in `common/partner-schemas.ts` (vendor D-V09); exports here are unchanged.
 */

export { LIST_LIMIT_MAX, listQuerySchema, phoneSchema, type ListQuery } from "../common/partner-schemas";

export const MAX_ADDRESSES_PER_TYPE = MAX_ADDRESSES;

const shippingAddressInput = z.object(addressBase).strict();

export const customerFields = {
  ...partnerScalarFields,
  invoiceAddresses: z.array(invoiceAddressInput).min(1).max(MAX_ADDRESSES_PER_TYPE).superRefine(atMostOneDefault),
  shippingAddresses: z.array(shippingAddressInput).min(1).max(MAX_ADDRESSES_PER_TYPE).superRefine(atMostOneDefault),
};

export const createCustomerBodySchema = z.object(customerFields).strict();

/** PUT body: full replacement plus the optimistic version (D-05); `id` comes from the path. */
export const updateCustomerBodySchema = z.object({
  expectedUpdatedAt: expectedUpdatedAtSchema,
  ...customerFields,
}).strict();

export const customerIdSchema = entityIdSchema;

export type CustomerInput = z.output<typeof createCustomerBodySchema>;
export type UpdateCustomerInput = z.output<typeof updateCustomerBodySchema>;
