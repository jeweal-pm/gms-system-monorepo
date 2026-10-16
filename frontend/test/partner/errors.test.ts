import { describe, expect, it } from "vitest";
import { mapPartnerFieldError, type FieldErrorScope } from "@/features/partner/errors";

/** UT-ADR21-04f/g, UT-PTN-E01…E08: shared server field-error mapping (features/partner/errors.ts). */

const vendorScope: FieldErrorScope = { arrayNames: ["invoiceAddresses"], taxIdArrays: ["invoiceAddresses"], addressNameLabel: "Name/Company Name" };
const customerLikeScope: FieldErrorScope = { arrayNames: ["invoiceAddresses", "shippingAddresses"], taxIdArrays: ["invoiceAddresses"], addressNameLabel: "Name" };

const map = (path: string, code: string, scope: FieldErrorScope = vendorScope) => mapPartnerFieldError(path, code, scope);

describe("mapPartnerFieldError: Code Name (ADR-0021 §1)", () => {
  it("UT-ADR21-04f maps the server `required` code to \"Code Name is required\"", () => {
    expect(map("code", "required")).toEqual({ name: "code", message: "Code Name is required" });
    expect(map("code", "invalid_type")).toEqual({ name: "code", message: "Code Name is required" });
  });

  it("UT-ADR21-04g maps `duplicate` and `too_big` on code", () => {
    expect(map("code", "duplicate")).toEqual({ name: "code", message: "This code name is already in use" });
    expect(map("code", "too_big")).toEqual({ name: "code", message: "Code Name must be at most 120 characters" });
  });
});

describe("mapPartnerFieldError: information fields", () => {
  it.each([
    ["name", "too_small", "Name is required"],
    ["name", "too_big", "Name must be at most 200 characters"],
    ["firstName", "too_small", "First name is required"],
    ["middleName", "too_big", "Middle name must be at most 100 characters"],
    ["lastName", "too_big", "Last name must be at most 100 characters"],
    ["currencyCode", "unknown", "Choose a currency from the list"],
    ["currencyCode", "invalid_format", "Currency is required"],
    ["email", "too_small", "Email is required"],
    ["email", "invalid_format", "Enter a valid email address"],
    ["email", "too_big", "Email must be at most 254 characters"],
    ["name", "something_new", "Check Name"],
  ])("UT-PTN-E01 maps %s / %s to %j", (path, code, message) => {
    expect(map(path, code)).toEqual({ name: path, message });
  });

  it("UT-PTN-E02 maps any phone path to the phone field", () => {
    expect(map("phone", "invalid_type")).toEqual({ name: "phone", message: "Enter a valid phone number" });
    expect(map("phone.e164", "invalid_format")).toEqual({ name: "phone", message: "Enter a valid phone number" });
  });

  it("UT-PTN-E03 returns null for paths that are not form fields", () => {
    expect(map("(root)", "unrecognized_keys")).toBeNull();
    expect(map("active", "invalid_type")).toBeNull();
    expect(map("expectedUpdatedAt", "invalid_format")).toBeNull();
    expect(map("invoiceAddresses", "multiple_defaults")).toBeNull();
    expect(map("name.extra", "too_big")).toBeNull();
  });
});

describe("mapPartnerFieldError: address items", () => {
  it("UT-PTN-E04 maps an item field with the entity's name label and 0-based index", () => {
    expect(map("invoiceAddresses.1.postcode", "too_big")).toEqual({ name: "invoiceAddresses.1.postcode", message: "Postcode must be at most 20 characters" });
    expect(map("invoiceAddresses.0.name", "too_small")).toEqual({ name: "invoiceAddresses.0.name", message: "Name/Company Name is required" });
    expect(map("shippingAddresses.0.name", "too_small", customerLikeScope)).toEqual({ name: "shippingAddresses.0.name", message: "Name is required" });
  });

  it("UT-PTN-E05 maps country codes like currency", () => {
    expect(map("invoiceAddresses.0.countryCode", "unknown")).toEqual({ name: "invoiceAddresses.0.countryCode", message: "Choose a country from the list" });
    expect(map("invoiceAddresses.0.countryCode", "invalid_format")).toEqual({ name: "invoiceAddresses.0.countryCode", message: "Country is required" });
  });

  it("UT-PTN-E06 rejects indexes outside 0…9 and unknown item fields", () => {
    expect(map("invoiceAddresses.10.city", "too_big")).toBeNull();
    expect(map("invoiceAddresses.-1.city", "too_big")).toBeNull();
    expect(map("invoiceAddresses.x.city", "too_big")).toBeNull();
    expect(map("invoiceAddresses.1.5.city", "too_big")).toBeNull();
    expect(map("invoiceAddresses.0.isDefault", "invalid_type")).toBeNull();
    expect(map("invoiceAddresses.9.city", "too_big")).toEqual({ name: "invoiceAddresses.9.city", message: "City must be at most 100 characters" });
  });

  it("UT-PTN-E07 maps Tax ID only for arrays that have it", () => {
    expect(map("invoiceAddresses.0.taxId", "too_big")).toEqual({ name: "invoiceAddresses.0.taxId", message: "Tax ID must be at most 32 characters" });
    expect(map("shippingAddresses.0.taxId", "too_big", customerLikeScope)).toBeNull();
  });

  it("UT-PTN-E08 ignores an address array the entity does not have", () => {
    expect(map("shippingAddresses.0.name", "too_small", vendorScope)).toBeNull();
  });
});
