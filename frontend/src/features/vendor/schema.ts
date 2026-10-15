import { z } from "zod";
import { addressListSchema, emptyAddress, emptyPartnerInfo, partnerInfoShape, type AddressArrayName } from "@/features/partner/schema";

/**
 * Vendor form (FE-VEN-007), built from the Partner Master building blocks (FE-VEN-001).
 * Rules are the customer rules without Shipping plus the owner's revision 2 answers:
 * Phone optional (Q-VEN-02); default invoice address optional, at most one (Q-VEN-03).
 * PROVISIONAL until SA-VEN-03 approves the `vendor.*` rules; then this mirrors them exactly.
 * Client validation is UX only.
 */

export { ADDRESS_MAX, type AddressFormValue } from "@/features/partner/schema";

export const vendorFormSchema = z.object({
  ...partnerInfoShape,
  invoiceAddresses: addressListSchema("invoice", "Name/Company Name", "atMostOne"),
});

export type VendorFormValues = z.infer<typeof vendorFormSchema>;

/** Visual order of the address cards (focus of the first error). */
export const VENDOR_ADDRESS_ARRAYS: readonly AddressArrayName[] = ["invoiceAddresses"];

/** New draft: Active on, one Invoice item, not default (Q-VEN-03: "default ไม่ต้องติ๊ก"; S2). */
export function emptyVendorForm(): VendorFormValues {
  return { ...emptyPartnerInfo(), invoiceAddresses: [emptyAddress(false)] };
}
