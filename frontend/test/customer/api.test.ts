import { describe, expect, it } from "vitest";
import { createCustomerBodySchema } from "@gem-crm/backend-api-master/src/customer/customer.schemas";
import {
  isPermissionDenied,
  loadErrorMessage,
  mapDeleteError,
  mapSaveError,
  mapServerFieldError,
  readCustomerError,
  toCustomerFields,
  toDuplicateValues,
  toFormValues,
} from "@/features/customer/api";
import type { CustomerDetail } from "@/features/customer/contract";
import { customerFormSchema, type CustomerFormValues } from "@/features/customer/schema";
import { gatewayError, validAddress, validInfo } from "../partner/helpers";

/**
 * UT-ADR21-04a/c/e/h, UT-CUS-A01…A24: customer data boundary (features/customer/api.ts).
 * IT-CUS-C01/C02: form schema → mapper → the gateway's real strict `customer.create` input schema.
 */

const detail: CustomerDetail = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "ACME Co., Ltd.",
  code: "C001",
  active: true,
  updatedAt: "2026-10-16T04:00:00.000Z",
  createdAt: "2026-10-15T04:00:00.000Z",
  currencyCode: "THB",
  firstName: "Somchai",
  middleName: null,
  lastName: "Jaidee",
  phone: { country: "TH", e164: "+66812345678" },
  email: "buyer@example.com",
  invoiceAddresses: [
    { id: "inv-2", position: 2, name: "Branch", taxId: null, address: "2 Road", countryCode: "TH", state: "Chiang Mai", city: "Mueang", postcode: "50000", isDefault: false },
    { id: "inv-1", position: 1, name: "Head office", taxId: "0105555000000", address: "1 Road", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10110", isDefault: true },
  ],
  shippingAddresses: [{ id: "shp-1", position: 1, name: "Warehouse", address: "3 Road", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10120", isDefault: true }],
};

const validForm = (): CustomerFormValues => ({
  ...validInfo(),
  invoiceAddresses: [validAddress({ taxId: "0105555000000" })],
  shippingAddresses: [validAddress({ name: "Receiver" })],
});

describe("toFormValues", () => {
  it("UT-CUS-A01 maps a saved customer to form values (addresses by position, nulls → empty text, national phone)", () => {
    const values = toFormValues(detail);
    expect(values).toMatchObject({ code: "C001", name: "ACME Co., Ltd.", middleName: "", lastName: "Jaidee", phone: { country: "TH", number: "812345678" } });
    expect(values.invoiceAddresses.map((item) => item.id)).toEqual(["inv-1", "inv-2"]);
    expect(values.invoiceAddresses[1].taxId).toBe("");
    expect(values.shippingAddresses[0]).toEqual({ id: "shp-1", name: "Warehouse", taxId: "", address: "3 Road", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10120", isDefault: true });
  });

  it("UT-CUS-A02 a legacy null code and null phone become empty values", () => {
    const values = toFormValues({ ...detail, code: null, phone: null });
    expect(values.code).toBe("");
    expect(values.phone).toEqual({ country: "US", number: "" });
  });

  it("UT-CUS-A03 a saved customer passes the form schema unchanged", () => {
    expect(customerFormSchema.safeParse(toFormValues(detail)).success).toBe(true);
  });
});

describe("toDuplicateValues (FE-CUS-011, ADR-0021 §2)", () => {
  it("UT-CUS-A04 copies everything except the Code Name and the address IDs", () => {
    const values = toDuplicateValues(detail);
    expect(values.code).toBe("");
    expect([...values.invoiceAddresses, ...values.shippingAddresses].every((item) => item.id === null)).toBe(true);
    expect(values.name).toBe(detail.name);
    expect(values.invoiceAddresses.map((item) => item.name)).toEqual(["Head office", "Branch"]);
  });
});

describe("toCustomerFields", () => {
  it("UT-ADR21-04a sends the Code Name trimmed and never null", () => {
    expect(toCustomerFields({ ...validForm(), code: "  C007  " }).code).toBe("C007");
  });

  it("UT-CUS-A05 trims text, lower-cases email, empty optional text → null, empty phone → null", () => {
    const fields = toCustomerFields({ ...validForm(), name: "  ACME  ", firstName: " Som ", middleName: "  ", lastName: "", email: "  Buyer@Example.COM " });
    expect(fields).toMatchObject({ name: "ACME", firstName: "Som", middleName: null, lastName: null, phone: null, email: "buyer@example.com" });
  });

  it("UT-CUS-A06 converts the phone to the contract E.164 shape", () => {
    expect(toCustomerFields({ ...validForm(), phone: { country: "TH", number: "081 234 5678" } }).phone).toEqual({ country: "TH", e164: "+66812345678" });
  });

  it("UT-CUS-A07 sends invoice Tax ID (empty → null) and no Tax ID key on shipping items; no address id", () => {
    const fields = toCustomerFields({ ...validForm(), invoiceAddresses: [validAddress({ id: "inv-1", taxId: "  " })], shippingAddresses: [validAddress({ id: "shp-1", taxId: "ignored" })] });
    expect(fields.invoiceAddresses[0]).toEqual({ name: "Test Co., Ltd.", taxId: null, address: "1 Road", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10110", isDefault: true });
    expect(fields.shippingAddresses[0]).not.toHaveProperty("taxId");
    expect(fields.shippingAddresses[0]).not.toHaveProperty("id");
  });

  it("UT-CUS-A08 keeps the array order (= position) and the default flags", () => {
    const fields = toCustomerFields({ ...validForm(), invoiceAddresses: [validAddress({ name: "A", isDefault: false }), validAddress({ name: "B", isDefault: true })] });
    expect(fields.invoiceAddresses.map((item) => [item.name, item.isDefault])).toEqual([["A", false], ["B", true]]);
  });

  it("IT-CUS-C01 a valid form maps to input api-master's strict customer.create schema accepts", () => {
    const form = customerFormSchema.parse({ ...validForm(), middleName: "", phone: { country: "TH", number: "081 234 5678" } });
    const result = createCustomerBodySchema.safeParse(toCustomerFields(form));
    expect(result.error?.issues ?? []).toEqual([]);
  });

  it("IT-CUS-C02 a saved customer round-trips through the form into a valid create input", () => {
    const result = createCustomerBodySchema.safeParse(toCustomerFields(toFormValues(detail)));
    expect(result.success).toBe(true);
    expect(result.data?.invoiceAddresses.map((item) => item.name)).toEqual(["Head office", "Branch"]);
  });
});

describe("mapServerFieldError", () => {
  it("UT-ADR21-04e maps the server `required` code on code to \"Code Name is required\"", () => {
    expect(mapServerFieldError("code", "required")).toEqual({ name: "code", message: "Code Name is required" });
  });

  it("UT-CUS-A09 maps duplicate/too_big code, info fields and phone", () => {
    expect(mapServerFieldError("code", "duplicate")).toEqual({ name: "code", message: "This code name is already in use" });
    expect(mapServerFieldError("code", "too_big")).toEqual({ name: "code", message: "Code Name must be at most 120 characters" });
    expect(mapServerFieldError("email", "invalid_format")).toEqual({ name: "email", message: "Enter a valid email address" });
    expect(mapServerFieldError("currencyCode", "unknown")).toEqual({ name: "currencyCode", message: "Choose a currency from the list" });
    expect(mapServerFieldError("phone.e164", "invalid_format")).toEqual({ name: "phone", message: "Enter a valid phone number" });
  });

  it("UT-CUS-A10 maps invoice and shipping item fields with the label \"Name\"", () => {
    expect(mapServerFieldError("invoiceAddresses.1.postcode", "too_big")).toEqual({ name: "invoiceAddresses.1.postcode", message: "Postcode must be at most 20 characters" });
    expect(mapServerFieldError("shippingAddresses.0.name", "too_small")).toEqual({ name: "shippingAddresses.0.name", message: "Name is required" });
    expect(mapServerFieldError("shippingAddresses.0.countryCode", "unknown")).toEqual({ name: "shippingAddresses.0.countryCode", message: "Choose a country from the list" });
  });

  it("UT-CUS-A11 returns null for shipping Tax ID, out-of-range indexes and non-form paths", () => {
    expect(mapServerFieldError("shippingAddresses.0.taxId", "too_big")).toBeNull();
    expect(mapServerFieldError("invoiceAddresses.10.city", "too_big")).toBeNull();
    expect(mapServerFieldError("invoiceAddresses", "multiple_defaults")).toBeNull();
    expect(mapServerFieldError("(root)", "unrecognized_keys")).toBeNull();
  });
});

describe("mapSaveError", () => {
  it("UT-ADR21-04c CUSTOMER_CODE_TAKEN → Code Name field error and a fresh suggestion", () => {
    const error = gatewayError({ domainCode: "CUSTOMER_CODE_TAKEN", httpStatus: 409, code: "CONFLICT", fieldErrors: [{ path: "code", code: "duplicate" }] });
    expect(mapSaveError(error, "create")).toEqual({ fieldErrors: [{ name: "code", message: "This code name is already in use" }], formError: null, refetchNextCode: true });
  });

  it("UT-ADR21-04h VALIDATION_ERROR code `required` → Code Name field error, no banner", () => {
    const error = gatewayError({ domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "code", code: "required" }] });
    expect(mapSaveError(error, "create")).toEqual({ fieldErrors: [{ name: "code", message: "Code Name is required" }], formError: null, refetchOptions: false });
  });

  it("UT-CUS-A12 VALIDATION_ERROR with an `unknown` option → field error and options refetch", () => {
    const error = gatewayError({ domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "currencyCode", code: "unknown" }] });
    expect(mapSaveError(error, "edit")).toMatchObject({ fieldErrors: [{ name: "currencyCode", message: "Choose a currency from the list" }], formError: null, refetchOptions: true });
  });

  it("UT-CUS-A13 VALIDATION_ERROR multiple_defaults → banner", () => {
    const error = gatewayError({ domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "shippingAddresses", code: "multiple_defaults" }] });
    expect(mapSaveError(error, "edit")).toMatchObject({ fieldErrors: [], formError: "Only one default address is allowed per type." });
  });

  it("UT-CUS-A14 VALIDATION_ERROR with an unmapped path or no field errors → generic banner", () => {
    const unmapped = gatewayError({ domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "name", code: "too_big" }, { path: "(root)", code: "unrecognized_keys" }] });
    expect(mapSaveError(unmapped, "edit")).toMatchObject({
      fieldErrors: [{ name: "name", message: "Name must be at most 200 characters" }],
      formError: "Some details couldn't be saved. Check the form and try again.",
    });
    expect(mapSaveError(gatewayError({ domainCode: "VALIDATION_ERROR", fieldErrors: [] }), "edit").formError).toBe("Some details couldn't be saved. Check the form and try again.");
  });

  it("UT-CUS-A15 CUSTOMER_STALE → stale banner with Reload", () => {
    expect(mapSaveError(gatewayError({ domainCode: "CUSTOMER_STALE", httpStatus: 409, code: "CONFLICT" }), "edit")).toEqual({
      fieldErrors: [],
      formError: "Someone else changed this customer after you opened it. Reload to see the latest version; your changes here will be lost.",
      stale: true,
    });
  });

  it("UT-CUS-A16 CUSTOMER_NOT_FOUND → deleted banner, Save hidden, list refetched", () => {
    expect(mapSaveError(gatewayError({ domainCode: "CUSTOMER_NOT_FOUND", httpStatus: 404, code: "NOT_FOUND" }), "edit")).toEqual({
      fieldErrors: [],
      formError: "This customer was deleted by someone else.",
      notFound: true,
      refetchList: true,
    });
  });

  it("UT-CUS-A17 PERMISSION_DENIED names the action and rechecks access", () => {
    const error = gatewayError({ domainCode: "PERMISSION_DENIED", httpStatus: 403, code: "FORBIDDEN" });
    expect(mapSaveError(error, "create")).toEqual({ fieldErrors: [], formError: "You don't have permission to create customers.", recheckAccess: true });
    expect(mapSaveError(error, "edit").formError).toBe("You don't have permission to edit customers.");
  });

  it("UT-CUS-A18 a 401 without a domain code → session ended", () => {
    const error = gatewayError({ httpStatus: 401, code: "UNAUTHORIZED", message: "Authentication required" });
    expect(mapSaveError(error, "edit")).toEqual({ fieldErrors: [], formError: "Your session has ended. Sign in again." });
  });

  it("UT-CUS-A19 LICENSE_* → license banner", () => {
    expect(mapSaveError(gatewayError({ domainCode: "LICENSE_EXPIRED", httpStatus: 403, code: "FORBIDDEN" }), "edit").formError).toBe(
      "Your license doesn't allow this right now. Nothing was saved.",
    );
  });

  it("UT-CUS-A20 PARTNER_UNAVAILABLE / network: edit → unavailable; create → uncertain + refresh list before retry", () => {
    const unavailable = gatewayError({ domainCode: "PARTNER_UNAVAILABLE", httpStatus: 503, code: "INTERNAL_SERVER_ERROR" });
    expect(mapSaveError(unavailable, "edit")).toEqual({ fieldErrors: [], formError: "Customer service is unavailable. Nothing was saved. Try again." });
    expect(mapSaveError(unavailable, "create")).toEqual({
      fieldErrors: [],
      formError: "Customer service didn't respond, so the customer may or may not have been created. The customer list was refreshed: check it before you try again.",
      refreshListBeforeRetry: true,
    });
    expect(mapSaveError(new TypeError("Failed to fetch"), "edit").formError).toBe("Customer service is unavailable. Nothing was saved. Try again.");
  });

  it("UT-CUS-A21 never shows the raw server message", () => {
    const error = gatewayError({ domainCode: "SOMETHING_NEW", httpStatus: 500, code: "INTERNAL_SERVER_ERROR", message: "SQL stack trace secret" });
    expect(JSON.stringify(mapSaveError(error, "edit"))).not.toContain("secret");
  });
});

describe("mapDeleteError", () => {
  it("UT-CUS-A22 maps not found, permission, session, license and unavailable", () => {
    expect(mapDeleteError(gatewayError({ domainCode: "CUSTOMER_NOT_FOUND", httpStatus: 404 }))).toEqual({ kind: "gone", message: "This customer was already deleted." });
    expect(mapDeleteError(gatewayError({ domainCode: "PERMISSION_DENIED", httpStatus: 403 }))).toEqual({ kind: "dialog", message: "You don't have permission to delete customers.", recheckAccess: true });
    expect(mapDeleteError(gatewayError({ httpStatus: 401, code: "UNAUTHORIZED" }))).toEqual({ kind: "dialog", message: "Your session has ended. Sign in again." });
    expect(mapDeleteError(gatewayError({ domainCode: "LICENSE_SUSPENDED", httpStatus: 403 }))).toEqual({ kind: "dialog", message: "Your license doesn't allow this right now. Nothing was deleted." });
    expect(mapDeleteError(new Error("boom"))).toEqual({ kind: "dialog", message: "Customer service is unavailable. Nothing was deleted. Try again." });
  });
});

describe("load errors", () => {
  it("UT-CUS-A23 loadErrorMessage uses short inline copy per code", () => {
    expect(loadErrorMessage(gatewayError({ domainCode: "CUSTOMER_NOT_FOUND", httpStatus: 404 }), "customer")).toBe("This customer no longer exists. It may have been deleted.");
    expect(loadErrorMessage(gatewayError({ domainCode: "PERMISSION_DENIED", httpStatus: 403 }), "customers")).toBe("You don't have permission to view customers.");
    expect(loadErrorMessage(gatewayError({ domainCode: "LICENSE_EXPIRED", httpStatus: 403 }), "customers")).toBe("Your license doesn't allow loading customers right now.");
    expect(loadErrorMessage(gatewayError({ httpStatus: 401, code: "UNAUTHORIZED" }), "customers")).toBe("Your session has ended. Sign in again.");
    expect(loadErrorMessage(new Error("boom"), "options")).toBe("Couldn't load options.");
  });

  it("UT-CUS-A24 readCustomerError / isPermissionDenied read the gateway envelope (domain code from the message as fallback)", () => {
    const error = gatewayError({ domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "name", code: "too_big" }] });
    expect(readCustomerError(error)).toEqual({ domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "name", code: "too_big" }], httpStatus: 400 });
    expect(readCustomerError(gatewayError({ message: "CUSTOMER_STALE" })).domainCode).toBe("CUSTOMER_STALE");
    expect(readCustomerError("not an error")).toEqual({ domainCode: null, fieldErrors: [], httpStatus: null });
    expect(isPermissionDenied(gatewayError({ domainCode: "PERMISSION_DENIED", httpStatus: 403 }))).toBe(true);
    expect(isPermissionDenied(gatewayError({ domainCode: "CUSTOMER_STALE" }))).toBe(false);
  });
});

