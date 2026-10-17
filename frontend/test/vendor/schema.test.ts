import { describe, expect, it } from "vitest";
import { emptyVendorForm, VENDOR_ADDRESS_ARRAYS, vendorFormSchema, type VendorFormValues } from "@/features/vendor/schema";
import { issuesByPath, validAddress, validInfo } from "../partner/helpers";

/** UT-VEN-S01…S09: vendor form (features/vendor/schema.ts; Q-VEN-02/03, ADR-0021 §1). */

const validForm = (): VendorFormValues => ({ ...validInfo(), code: "V001", invoiceAddresses: [validAddress({ isDefault: false })] });

describe("vendorFormSchema", () => {
  it("UT-VEN-S01 accepts a complete vendor", () => {
    expect(issuesByPath(vendorFormSchema, validForm())).toEqual({});
  });

  it("UT-VEN-S02 a new draft is Active with one unticked Invoice item and no Shipping (Q-VEN-03)", () => {
    const draft = emptyVendorForm();
    expect(draft.active).toBe(true);
    expect(draft.code).toBe("");
    expect(draft.invoiceAddresses).toHaveLength(1);
    expect(draft.invoiceAddresses[0].isDefault).toBe(false);
    expect(draft).not.toHaveProperty("shippingAddresses");
  });

  it("UT-VEN-S03 an empty draft reports the required fields; no Phone, State, City or default error", () => {
    expect(issuesByPath(vendorFormSchema, emptyVendorForm())).toEqual({
      code: "Code Name is required",
      name: "Name is required",
      currencyCode: "Currency is required",
      firstName: "First name is required",
      email: "Email is required",
      "invoiceAddresses.0.name": "Name/Company Name is required",
      "invoiceAddresses.0.address": "Address is required",
      "invoiceAddresses.0.countryCode": "Country is required",
      "invoiceAddresses.0.postcode": "Postcode is required",
    });
  });

  it("UT-VEN-S04 Code Name: blank → required; 121 characters → max message; trimmed on parse", () => {
    expect(issuesByPath(vendorFormSchema, { ...validForm(), code: "" }).code).toBe("Code Name is required");
    expect(issuesByPath(vendorFormSchema, { ...validForm(), code: "v".repeat(121) }).code).toBe("Code Name must be at most 120 characters");
    expect(vendorFormSchema.parse({ ...validForm(), code: "\tV002 " }).code).toBe("V002");
  });

  it("UT-VEN-S05 zero or one default invoice address is valid (Q-VEN-03)", () => {
    expect(issuesByPath(vendorFormSchema, { ...validForm(), invoiceAddresses: [validAddress({ isDefault: false }), validAddress({ isDefault: false })] })).toEqual({});
    expect(issuesByPath(vendorFormSchema, { ...validForm(), invoiceAddresses: [validAddress({ isDefault: false }), validAddress({ isDefault: true })] })).toEqual({});
  });

  it("UT-VEN-S06 two defaults are rejected", () => {
    expect(issuesByPath(vendorFormSchema, { ...validForm(), invoiceAddresses: [validAddress(), validAddress()] }).invoiceAddresses).toBe("Only one default address is allowed");
  });

  it("UT-VEN-S07 1–10 invoice addresses", () => {
    expect(issuesByPath(vendorFormSchema, { ...validForm(), invoiceAddresses: [] }).invoiceAddresses).toBe("Add at least one invoice address");
    const eleven = Array.from({ length: 11 }, () => validAddress({ isDefault: false }));
    expect(issuesByPath(vendorFormSchema, { ...validForm(), invoiceAddresses: eleven }).invoiceAddresses).toBe("Up to 10 invoice addresses");
  });

  it("UT-VEN-S08 Phone is optional; an invalid number is still rejected (Q-VEN-02)", () => {
    expect(issuesByPath(vendorFormSchema, { ...validForm(), phone: { country: "TH", number: "" } })).toEqual({});
    expect(issuesByPath(vendorFormSchema, { ...validForm(), phone: { country: "TH", number: "123" } })["phone.number"]).toBe("Enter a valid phone number");
  });

  it("UT-VEN-S09 focus order covers the Invoice Address card only", () => {
    expect(VENDOR_ADDRESS_ARRAYS).toEqual(["invoiceAddresses"]);
  });
});
