import { z } from "zod";
import {
  atMostOneDefault,
  expectedUpdatedAtSchema,
  invoiceAddressInput,
  MAX_ADDRESSES,
  partnerScalarFields,
} from "../common/partner-schemas";

/**
 * vendor SA revision 1 shapes (api-contract.md "Shared types"); identical rules to the gateway.
 * Invoice addresses only (1..10). Default address: zero or one (D-V03) — more than one is
 * `{path:"invoiceAddresses", code:"multiple_defaults"}`; zero is valid and stored as zero.
 * There is no `shippingAddresses` key: sending one is `(root)` `unrecognized_keys`.
 */

export { listQuerySchema, type ListQuery } from "../common/partner-schemas";

export const vendorFields = {
  ...partnerScalarFields,
  invoiceAddresses: z.array(invoiceAddressInput).min(1).max(MAX_ADDRESSES).superRefine(atMostOneDefault),
};

export const createVendorBodySchema = z.object(vendorFields).strict();

/** PUT body: full replacement plus the optimistic version; `id` comes from the path. */
export const updateVendorBodySchema = z.object({
  expectedUpdatedAt: expectedUpdatedAtSchema,
  ...vendorFields,
}).strict();

export type VendorInput = z.output<typeof createVendorBodySchema>;
export type UpdateVendorInput = z.output<typeof updateVendorBodySchema>;
