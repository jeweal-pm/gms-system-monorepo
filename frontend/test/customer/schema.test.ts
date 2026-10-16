import { describe, expect, it } from "vitest";
import { CUSTOMER_ADDRESS_ARRAYS, customerFormSchema, emptyCustomerForm, type CustomerFormValues } from "@/features/customer/schema";
import { issuesByPath, validAddress, validInfo } from "../partner/helpers";

/** UT-CUS-S01…S09: customer form (features/customer/schema.ts; ADR-0018 §3, ADR-0021 §1, P-01). */

const validForm = (): CustomerFormValues => ({
  ...validInfo(),
  invoiceAddresses: [validAddress({ taxId: "0105555000000" })],
  shippingAddresses: [validAddress({ name: "Receiver" })],
});

describe("customerFormSchema", () => {
  it("UT-CUS-S01 accepts a complete customer", () => {
    expect(issuesByPath(customerFormSchema, validForm())).toEqual({});
  });

  it("UT-CUS-S02 a new draft is Active with one default Invoice and one default Shipping item", () => {
    const draft = emptyCustomerForm();
    expect(draft.active).toBe(true);
    expect(draft.code).toBe("");
    expect(draft.invoiceAddresses).toHaveLength(1);
    expect(draft.shippingAddresses).toHaveLength(1);
    expect(draft.invoiceAddresses[0].isDefault).toBe(true);
    expect(draft.shippingAddresses[0].isDefault).toBe(true);
  });

  it("UT-CUS-S03 an empty draft reports every required field, with Code Name required (ADR-0021)", () => {
    expect(issuesByPath(customerFormSchema, emptyCustomerForm())).toEqual({
      code: "Code Name is required",
      name: "Name is required",
      currencyCode: "Currency is required",
      firstName: "First name is required",
      email: "Email is required",
      "invoiceAddresses.0.name": "Name is required",
      "invoiceAddresses.0.address": "Address is required",
      "invoiceAddresses.0.countryCode": "Country is required",
      "invoiceAddresses.0.postcode": "Postcode is required",
      "shippingAddresses.0.name": "Name is required",
      "shippingAddresses.0.address": "Address is required",
      "shippingAddresses.0.countryCode": "Country is required",
      "shippingAddresses.0.postcode": "Postcode is required",
    });
  });

  it("UT-CUS-S04 Code Name: blank → required; 121 characters → max message; trimmed on parse", () => {
    expect(issuesByPath(customerFormSchema, { ...validForm(), code: "  " }).code).toBe("Code Name is required");
    expect(issuesByPath(customerFormSchema, { ...validForm(), code: "x".repeat(121) }).code).toBe("Code Name must be at most 120 characters");
    expect(customerFormSchema.parse({ ...validForm(), code: " C010 " }).code).toBe("C010");
  });

  it("UT-CUS-S05 exactly one default Invoice address (P-01)", () => {
    const form = validForm();
    expect(issuesByPath(customerFormSchema, { ...form, invoiceAddresses: [validAddress({ isDefault: false })] }).invoiceAddresses).toBe(
      "Exactly one default address is required",
    );
    expect(issuesByPath(customerFormSchema, { ...form, invoiceAddresses: [validAddress(), validAddress()] }).invoiceAddresses).toBe(
      "Exactly one default address is required",
    );
  });

  it("UT-CUS-S06 exactly one default Shipping address, checked separately from Invoice", () => {
    const form = validForm();
    const errors = issuesByPath(customerFormSchema, { ...form, shippingAddresses: [validAddress({ isDefault: false }), validAddress({ isDefault: false })] });
    expect(errors).toEqual({ shippingAddresses: "Exactly one default address is required" });
  });

  it("UT-CUS-S07 1–10 addresses per type", () => {
    const form = validForm();
    expect(issuesByPath(customerFormSchema, { ...form, shippingAddresses: [] }).shippingAddresses).toBe("Add at least one shipping address");
    const eleven = [validAddress(), ...Array.from({ length: 10 }, () => validAddress({ isDefault: false }))];
    expect(issuesByPath(customerFormSchema, { ...form, invoiceAddresses: eleven }).invoiceAddresses).toBe("Up to 10 invoice addresses");
  });

  it("UT-CUS-S08 the address name error label is \"Name\" for both types", () => {
    const errors = issuesByPath(customerFormSchema, { ...validForm(), invoiceAddresses: [validAddress({ name: "" })], shippingAddresses: [validAddress({ name: "" })] });
    expect(errors["invoiceAddresses.0.name"]).toBe("Name is required");
    expect(errors["shippingAddresses.0.name"]).toBe("Name is required");
  });

  it("UT-CUS-S09 focus order covers Invoice before Shipping", () => {
    expect(CUSTOMER_ADDRESS_ARRAYS).toEqual(["invoiceAddresses", "shippingAddresses"]);
  });
});
