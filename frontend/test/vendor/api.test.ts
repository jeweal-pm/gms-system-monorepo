import { describe, expect, it } from "vitest";
import { createVendorInputSchema } from "@gem-crm/backend-api-gateway/src/trpc/vendor-schemas";
import {
  isPermissionDenied,
  isVendorNotFound,
  loadErrorMessage,
  mapDeleteError,
  mapSaveError,
  mapServerFieldError,
  readVendorError,
  toDuplicateValues,
  toFormValues,
  toVendorFields,
} from "@/features/vendor/api";
import type { VendorDetail } from "@/features/vendor/contract";
import { vendorFormSchema, type VendorFormValues } from "@/features/vendor/schema";
import { gatewayError, validAddress, validInfo } from "../partner/helpers";

/**
 * UT-ADR21-04b/d, UT-VEN-A01…A22: vendor data boundary (features/vendor/api.ts, FE-VEN-010/011).
 * IT-VEN-C01…C03: form schema → mapper → the gateway's real strict `vendor.create` input schema.
 */

const detail: VendorDetail = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Gold Supplier",
  code: "V001",
  active: false,
  updatedAt: "2026-10-16T04:00:00.000Z",
  createdAt: "2026-10-15T04:00:00.000Z",
  currencyCode: "USD",
  firstName: "John",
  middleName: "Q",
  lastName: null,
  phone: { country: "US", e164: "+12015550123" },
  email: "sales@example.com",
  invoiceAddresses: [
    { id: "a-3", position: 3, name: "Third", taxId: null, address: "3 Road", countryCode: "US", state: "NY", city: "New York", postcode: "10001", isDefault: false },
    { id: "a-1", position: 1, name: "First", taxId: "TAX-1", address: "1 Road", countryCode: "US", state: "NY", city: "New York", postcode: "10001", isDefault: false },
    { id: "a-2", position: 2, name: "Second", taxId: null, address: "2 Road", countryCode: "US", state: "NY", city: "New York", postcode: "10001", isDefault: false },
  ],
};

const validForm = (): VendorFormValues => ({ ...validInfo(), code: "V001", invoiceAddresses: [validAddress({ isDefault: false })] });

describe("toFormValues", () => {
  it("UT-VEN-A01 maps a saved vendor (addresses by position, nulls → empty text, national phone)", () => {
    const values = toFormValues(detail);
    expect(values).toMatchObject({ code: "V001", active: false, middleName: "Q", lastName: "", phone: { country: "US", number: "2015550123" } });
    expect(values.invoiceAddresses.map((item) => item.id)).toEqual(["a-1", "a-2", "a-3"]);
    expect(values.invoiceAddresses[0].taxId).toBe("TAX-1");
    expect(values.invoiceAddresses[1].taxId).toBe("");
    expect(values).not.toHaveProperty("shippingAddresses");
  });

  it("UT-VEN-A02 a saved vendor with no default address passes the form schema", () => {
    expect(vendorFormSchema.safeParse(toFormValues(detail)).success).toBe(true);
  });

  it("UT-VEN-A03 a legacy null code becomes empty text", () => {
    expect(toFormValues({ ...detail, code: null }).code).toBe("");
  });
});

describe("toDuplicateValues (FE-VEN-009, ADR-0021 §2)", () => {
  it("UT-VEN-A04 copies everything except the Code Name and the address IDs", () => {
    const values = toDuplicateValues(detail);
    expect(values.code).toBe("");
    expect(values.invoiceAddresses.every((item) => item.id === null)).toBe(true);
    expect(values.invoiceAddresses.map((item) => item.name)).toEqual(["First", "Second", "Third"]);
    expect(values.email).toBe(detail.email);
  });
});

describe("toVendorFields", () => {
  it("UT-ADR21-04b sends the Code Name trimmed and never null", () => {
    expect(toVendorFields({ ...validForm(), code: " V010 " }).code).toBe("V010");
  });

  it("UT-VEN-A05 sends exactly the strict create keys: trimmed, nulls, lower-cased email, isDefault as ticked", () => {
    const fields = toVendorFields({
      ...validForm(),
      name: " Gold ",
      middleName: " ",
      email: " Sales@Example.COM ",
      invoiceAddresses: [validAddress({ id: "a-1", name: " First ", taxId: "", postcode: " 10001 ", isDefault: false })],
    });
    expect(fields).toEqual({
      name: "Gold",
      code: "V001",
      currencyCode: "THB",
      active: true,
      firstName: "Somchai",
      middleName: null,
      lastName: null,
      phone: null,
      email: "sales@example.com",
      invoiceAddresses: [{ name: "First", taxId: null, address: "1 Road", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10001", isDefault: false }],
    });
  });

  it("UT-VEN-A06 converts the phone to the contract E.164 shape", () => {
    expect(toVendorFields({ ...validForm(), phone: { country: "US", number: "(201) 555-0123" } }).phone).toEqual({ country: "US", e164: "+12015550123" });
  });

  it("IT-VEN-C01 a valid form maps to input the gateway's strict vendor.create schema accepts", () => {
    const form = vendorFormSchema.parse({ ...validForm(), phone: { country: "US", number: "201 555 0123" } });
    const result = createVendorInputSchema.safeParse(toVendorFields(form));
    expect(result.error?.issues ?? []).toEqual([]);
  });

  it("IT-VEN-C02 a saved vendor round-trips through the form into a valid create input", () => {
    expect(createVendorInputSchema.safeParse(toVendorFields(toFormValues(detail))).success).toBe(true);
  });

  it("IT-VEN-C03 the gateway rejects a shipping key, so the mapper never sends one", () => {
    const fields = toVendorFields(validForm());
    expect(fields).not.toHaveProperty("shippingAddresses");
    expect(createVendorInputSchema.safeParse({ ...fields, shippingAddresses: [] }).success).toBe(false);
  });
});

describe("mapServerFieldError", () => {
  it("UT-VEN-A07 maps code `required` / `duplicate` and item fields with \"Name/Company Name\"", () => {
    expect(mapServerFieldError("code", "required")).toEqual({ name: "code", message: "Code Name is required" });
    expect(mapServerFieldError("code", "duplicate")).toEqual({ name: "code", message: "This code name is already in use" });
    expect(mapServerFieldError("invoiceAddresses.0.name", "too_small")).toEqual({ name: "invoiceAddresses.0.name", message: "Name/Company Name is required" });
    expect(mapServerFieldError("invoiceAddresses.1.taxId", "too_big")).toEqual({ name: "invoiceAddresses.1.taxId", message: "Tax ID must be at most 32 characters" });
  });

  it("UT-VEN-A08 returns null for shipping paths and non-form paths", () => {
    expect(mapServerFieldError("shippingAddresses.0.name", "too_small")).toBeNull();
    expect(mapServerFieldError("(root)", "unrecognized_keys")).toBeNull();
  });
});

describe("mapSaveError", () => {
  it("UT-ADR21-04d VENDOR_CODE_TAKEN → Code Name field error and a fresh suggestion", () => {
    const error = gatewayError({ domainCode: "VENDOR_CODE_TAKEN", httpStatus: 409, code: "CONFLICT", fieldErrors: [{ path: "code", code: "duplicate" }] });
    expect(mapSaveError(error, "create")).toEqual({ fieldErrors: [{ name: "code", message: "This code name is already in use" }], formError: null, refetchNextCode: true });
  });

  it("UT-VEN-A09 VALIDATION_ERROR code `required` → Code Name field error", () => {
    const error = gatewayError({ domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "code", code: "required" }] });
    expect(mapSaveError(error, "edit")).toEqual({ fieldErrors: [{ name: "code", message: "Code Name is required" }], formError: null, refetchOptions: false });
  });

  it("UT-VEN-A10 VALIDATION_ERROR item path + `unknown` country → field errors and options refetch", () => {
    const error = gatewayError({
      domainCode: "VALIDATION_ERROR",
      fieldErrors: [
        { path: "invoiceAddresses.1.postcode", code: "too_big" },
        { path: "invoiceAddresses.0.countryCode", code: "unknown" },
      ],
    });
    expect(mapSaveError(error, "edit")).toEqual({
      fieldErrors: [
        { name: "invoiceAddresses.1.postcode", message: "Postcode must be at most 20 characters" },
        { name: "invoiceAddresses.0.countryCode", message: "Choose a country from the list" },
      ],
      formError: null,
      refetchOptions: true,
    });
  });

  it("UT-VEN-A11 VALIDATION_ERROR multiple_defaults → invoice-specific banner", () => {
    const error = gatewayError({ domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "invoiceAddresses", code: "multiple_defaults" }] });
    expect(mapSaveError(error, "create").formError).toBe("Only one default invoice address is allowed.");
  });

  it("UT-VEN-A12 VALIDATION_ERROR with a shipping or root path → generic banner", () => {
    const error = gatewayError({ domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "shippingAddresses.0.name", code: "too_small" }] });
    expect(mapSaveError(error, "create")).toMatchObject({ fieldErrors: [], formError: "Some details couldn't be saved. Check the form and try again." });
  });

  it("UT-VEN-A13 VENDOR_STALE → stale banner", () => {
    expect(mapSaveError(gatewayError({ domainCode: "VENDOR_STALE", httpStatus: 409 }), "edit")).toEqual({
      fieldErrors: [],
      formError: "Someone else changed this vendor after you opened it. Reload to see the latest version; your changes here will be lost.",
      stale: true,
    });
  });

  it("UT-VEN-A14 VENDOR_NOT_FOUND → deleted banner, Save hidden, list refetched", () => {
    expect(mapSaveError(gatewayError({ domainCode: "VENDOR_NOT_FOUND", httpStatus: 404 }), "edit")).toEqual({
      fieldErrors: [],
      formError: "This vendor was deleted by someone else.",
      notFound: true,
      refetchList: true,
    });
  });

  it("UT-VEN-A15 PERMISSION_DENIED, 401 and LICENSE_*", () => {
    expect(mapSaveError(gatewayError({ domainCode: "PERMISSION_DENIED", httpStatus: 403 }), "edit")).toEqual({ fieldErrors: [], formError: "You don't have permission to edit vendors.", recheckAccess: true });
    expect(mapSaveError(gatewayError({ httpStatus: 401, code: "UNAUTHORIZED", message: "Authentication required" }), "create").formError).toBe("Your session has ended. Sign in again.");
    expect(mapSaveError(gatewayError({ domainCode: "LICENSE_EXPIRED", httpStatus: 403 }), "edit").formError).toBe("Your license doesn't allow this right now. Nothing was saved.");
  });

  it("UT-VEN-A16 PARTNER_UNAVAILABLE / unknown codes: edit → unavailable; create → uncertain + list refresh", () => {
    const unavailable = gatewayError({ domainCode: "PARTNER_UNAVAILABLE", httpStatus: 503 });
    expect(mapSaveError(unavailable, "edit")).toEqual({ fieldErrors: [], formError: "Vendor service is unavailable. Nothing was saved. Try again." });
    expect(mapSaveError(unavailable, "create")).toEqual({
      fieldErrors: [],
      formError: "Vendor service didn't respond, so the vendor may or may not have been created. The vendor list was refreshed: check it before you try again.",
      refreshListBeforeRetry: true,
    });
    // An older partner image answering NOT_FOUND is not VENDOR_NOT_FOUND.
    expect(mapSaveError(gatewayError({ domainCode: "NOT_FOUND", httpStatus: 404 }), "edit").formError).toBe("Vendor service is unavailable. Nothing was saved. Try again.");
  });

  it("UT-VEN-A17 never shows the raw server message", () => {
    const error = gatewayError({ httpStatus: 500, code: "INTERNAL_SERVER_ERROR", message: "connection string secret" });
    expect(JSON.stringify(mapSaveError(error, "create"))).not.toContain("secret");
  });
});

describe("mapDeleteError", () => {
  it("UT-VEN-A18 maps not found to \"gone\" and other failures to dialog copy", () => {
    expect(mapDeleteError(gatewayError({ domainCode: "VENDOR_NOT_FOUND", httpStatus: 404 }))).toEqual({ kind: "gone", message: "This vendor was already deleted." });
    expect(mapDeleteError(gatewayError({ domainCode: "PERMISSION_DENIED", httpStatus: 403 }))).toEqual({ kind: "dialog", message: "You don't have permission to delete vendors.", recheckAccess: true });
    expect(mapDeleteError(gatewayError({ httpStatus: 401, code: "UNAUTHORIZED" }))).toEqual({ kind: "dialog", message: "Your session has ended. Sign in again." });
    expect(mapDeleteError(gatewayError({ domainCode: "LICENSE_EXPIRED", httpStatus: 403 }))).toEqual({ kind: "dialog", message: "Your license doesn't allow this right now. Nothing was deleted." });
    expect(mapDeleteError(gatewayError({ domainCode: "PARTNER_UNAVAILABLE", httpStatus: 503 }))).toEqual({ kind: "dialog", message: "Vendor service is unavailable. Nothing was deleted. Try again." });
  });
});

describe("load errors and predicates", () => {
  it("UT-VEN-A19 loadErrorMessage uses short inline copy per code", () => {
    expect(loadErrorMessage(gatewayError({ domainCode: "VENDOR_NOT_FOUND", httpStatus: 404 }), "vendor")).toBe("This vendor no longer exists. It may have been deleted.");
    expect(loadErrorMessage(gatewayError({ domainCode: "PERMISSION_DENIED", httpStatus: 403 }), "vendors")).toBe("You don't have permission to view vendors.");
    expect(loadErrorMessage(gatewayError({ domainCode: "LICENSE_EXPIRED", httpStatus: 403 }), "vendors")).toBe("Your license doesn't allow loading vendors right now.");
    expect(loadErrorMessage(gatewayError({ httpStatus: 401, code: "UNAUTHORIZED" }), "vendors")).toBe("Your session has ended. Sign in again.");
    expect(loadErrorMessage(new TypeError("Failed to fetch"), "vendors")).toBe("Couldn't load vendors.");
  });

  it("UT-VEN-A20 isVendorNotFound / isPermissionDenied", () => {
    expect(isVendorNotFound(gatewayError({ domainCode: "VENDOR_NOT_FOUND", httpStatus: 404 }))).toBe(true);
    expect(isVendorNotFound(gatewayError({ domainCode: "NOT_FOUND", httpStatus: 404 }))).toBe(false);
    expect(isPermissionDenied(gatewayError({ domainCode: "PERMISSION_DENIED", httpStatus: 403 }))).toBe(true);
    expect(isPermissionDenied(new Error("PERMISSION_DENIED"))).toBe(false);
  });

  it("UT-VEN-A21 readVendorError reads domain code, field errors and status", () => {
    const error = gatewayError({ domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "email", code: "invalid_format" }] });
    expect(readVendorError(error)).toEqual({ domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "email", code: "invalid_format" }], httpStatus: 400 });
  });

  it("UT-VEN-A22 an edit Save PERMISSION_DENIED differs from create only by the verb", () => {
    expect(mapSaveError(gatewayError({ domainCode: "PERMISSION_DENIED", httpStatus: 403 }), "create").formError).toBe("You don't have permission to create vendors.");
  });
});
