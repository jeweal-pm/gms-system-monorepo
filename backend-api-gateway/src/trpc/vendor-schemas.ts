import { z } from "zod";
import {
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
  optionsOutputSchema,
  partnerScalarFields,
  timestamp,
  updateMetaFields,
} from "./partner-schemas";

/**
 * vendor SA revision 1 contract shapes (document/apps/backend/partner/vendor/api-contract.md).
 * Invoice addresses only (1..10); there is no `shippingAddresses` key (strict → `(root)`
 * `unrecognized_keys`). Default address: zero or one (D-V03).
 */

const vendorFields = {
  ...partnerScalarFields,
  invoiceAddresses: z.array(invoiceAddressInput).min(1).max(MAX_ADDRESSES),
};

// ---- inputs ----

export const vendorIdInputSchema = idInputSchema;

export const vendorListInputSchema = listInputSchema;

export const createVendorInputSchema = z.object(vendorFields).strict();

export const updateVendorInputSchema = z.object({
  ...updateMetaFields,
  ...vendorFields,
}).strict();

/** More than one default → `{path:"invoiceAddresses", code:"multiple_defaults"}`; zero is valid. */
export function assertVendorDefaults(input: { invoiceAddresses: { isDefault: boolean }[] }) {
  assertAtMostOneDefault({ invoiceAddresses: input.invoiceAddresses });
}

// ---- outputs (validated; unknown upstream fields are stripped, arrays bounded) ----

export const vendorListItemSchema = listItemSchema;

export const vendorListOutputSchema = listOutputSchema;

export const vendorDetailOutputSchema = vendorListItemSchema.extend({
  ...detailScalarOutput,
  invoiceAddresses: z.array(invoiceAddressOutputSchema).max(MAX_ADDRESSES),
  createdAt: timestamp,
});

export const vendorMutationOutputSchema = mutationOutputSchema;

export const vendorDeleteOutputSchema = deleteOutputSchema;

export const vendorOptionsOutputSchema = optionsOutputSchema;

export type VendorDetailOutput = z.output<typeof vendorDetailOutputSchema>;
export type VendorListOutput = z.output<typeof vendorListOutputSchema>;
