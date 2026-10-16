import { z } from "zod";
import {
  addressBase,
  addressOutput,
  assertAtMostOneDefault,
  deleteOutputSchema,
  detailScalarOutput,
  idInputSchema,
  invoiceAddressInput,
  invoiceAddressOutputSchema,
  listInputSchema,
  listItemSchema,
  listOutputSchema,
  MAX_ADDRESSES,
  mutationOutputSchema,
  nextCodeOutputSchema,
  optionsOutputSchema,
  partnerScalarFields,
  timestamp,
  updateMetaFields,
} from "./partner-schemas";

/**
 * customer SA revision 1 contract shapes (document/apps/backend/partner/customer/api-contract.md).
 * Built on the shared `partner-schemas.ts` (vendor D-V09); every export keeps its name and shape.
 */

const MAX_ADDRESSES_PER_TYPE = MAX_ADDRESSES;

const shippingAddressInput = z.object(addressBase).strict();

const customerFields = {
  ...partnerScalarFields,
  invoiceAddresses: z.array(invoiceAddressInput).min(1).max(MAX_ADDRESSES_PER_TYPE),
  shippingAddresses: z.array(shippingAddressInput).min(1).max(MAX_ADDRESSES_PER_TYPE),
};

// ---- inputs ----

export const customerIdInputSchema = idInputSchema;

export const customerListInputSchema = listInputSchema;

export const createCustomerInputSchema = z.object(customerFields).strict();

export const updateCustomerInputSchema = z.object({
  ...updateMetaFields,
  ...customerFields,
}).strict();

/**
 * Cross-field rule (both layers): at most one `isDefault: true` per address array, reported as
 * `{path:"invoiceAddresses"|"shippingAddresses", code:"multiple_defaults"}`.
 */
export function assertSingleDefaults(input: { invoiceAddresses: { isDefault: boolean }[]; shippingAddresses: { isDefault: boolean }[] }) {
  assertAtMostOneDefault({ invoiceAddresses: input.invoiceAddresses, shippingAddresses: input.shippingAddresses });
}

// ---- outputs (validated; unknown upstream fields are stripped, arrays bounded) ----

export const customerListItemSchema = listItemSchema;

export const customerListOutputSchema = listOutputSchema;

export const customerDetailOutputSchema = customerListItemSchema.extend({
  ...detailScalarOutput,
  invoiceAddresses: z.array(invoiceAddressOutputSchema).max(MAX_ADDRESSES_PER_TYPE),
  shippingAddresses: z.array(z.object(addressOutput)).max(MAX_ADDRESSES_PER_TYPE),
  createdAt: timestamp,
});

export const customerMutationOutputSchema = mutationOutputSchema;

export const customerDeleteOutputSchema = deleteOutputSchema;

export const customerOptionsOutputSchema = optionsOutputSchema;

/** ADR-0021: `customer.nextCode` output `{code}`. */
export const customerNextCodeOutputSchema = nextCodeOutputSchema;
