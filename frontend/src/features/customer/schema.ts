import { z } from "zod";
import { addressListSchema, emptyAddress, emptyPartnerInfo, partnerInfoShape, type AddressArrayName } from "@/features/partner/schema";

/**
 * Customer form (FE-CUS-008). Rules mirror ADR-0018 §3 and SA rev 1 api-contract.md
 * exactly; copy follows form-guidelines.md (P-06). Client validation is UX only.
 * Built from the Partner Master building blocks (vendor FE-VEN-001); the mapper in api.ts trims before sending.
 */

export { ADDRESS_MAX, type AddressFormValue } from "@/features/partner/schema";

export const customerFormSchema = z.object({
  ...partnerInfoShape,
  // Exactly one default per type (P-01).
  invoiceAddresses: addressListSchema("invoice", "Name", "exactlyOne"),
  shippingAddresses: addressListSchema("shipping", "Name", "exactlyOne"),
});

export type CustomerFormValues = z.infer<typeof customerFormSchema>;

/** Visual order of the address cards (focus of the first error). */
export const CUSTOMER_ADDRESS_ARRAYS: readonly AddressArrayName[] = ["invoiceAddresses", "shippingAddresses"];

/** New draft: Active on, one Invoice and one Shipping item, both default (ADR-0018 §3). */
export function emptyCustomerForm(): CustomerFormValues {
  return {
    ...emptyPartnerInfo(),
    invoiceAddresses: [emptyAddress(true)],
    shippingAddresses: [emptyAddress(true)],
  };
}
