import { describe, expect, it } from "vitest";
import { MAX_ADDRESSES } from "../../src/common/partner-schemas";
import { createVendorBodySchema, updateVendorBodySchema } from "../../src/vendor/vendor.schemas";
import { address, fieldErrors, invoiceAddress, vendorBody, withVersion } from "../partner-shared/fixtures";

/** UT-VEN-P01…P11: partner vendor body validation (vendor api-contract.md "Shared types", D-V03, ADR-0021 code rule). */

describe("createVendorBodySchema", () => {
  it("UT-VEN-P01 accepts a valid body, trims text, lowers the email and turns an empty tax ID into null", () => {
    const parsed = createVendorBodySchema.parse(vendorBody({
      name: "  Supplier ", code: " V001 ", email: " Sales@Supplier.CO ", lastName: "",
      invoiceAddresses: [invoiceAddress({ taxId: "   ", isDefault: true })],
    }));
    expect(parsed).toMatchObject({ name: "Supplier", code: "V001", email: "sales@supplier.co", lastName: null });
    expect(parsed.invoiceAddresses[0].taxId).toBeNull();
  });

  it("UT-VEN-P02 has no shippingAddresses key: sending one is a root unrecognized_keys", () => {
    expect(fieldErrors(createVendorBodySchema, vendorBody({ shippingAddresses: [address()] }))).toEqual([{ path: "(root)", code: "unrecognized_keys" }]);
  });

  it("UT-VEN-P03 rejects unknown keys inside an address", () => {
    expect(fieldErrors(createVendorBodySchema, vendorBody({ invoiceAddresses: [invoiceAddress({ id: "x" })] }))).toEqual([{ path: "invoiceAddresses.0", code: "unrecognized_keys" }]);
  });

  it.each(["name", "code", "currencyCode", "active", "firstName", "email", "invoiceAddresses"])("UT-VEN-P04 requires %s", (key) => {
    const { [key]: _omit, ...body } = vendorBody() as Record<string, unknown>;
    expect(fieldErrors(createVendorBodySchema, body)).toEqual([{ path: key, code: "invalid_type" }]);
  });

  it.each([
    ["name", { name: "" }, "too_small"],
    ["code", { code: "a".repeat(121) }, "too_big"],
    ["code", { code: "  " }, "required"],
    ["email", { email: "sales@" }, "invalid_format"],
    ["currencyCode", { currencyCode: "US" }, "invalid_format"],
    ["phone.country", { phone: { country: "Thailand", e164: "+66812345678" } }, "invalid_format"],
    ["lastName", { lastName: "a".repeat(101) }, "too_big"],
  ])("UT-VEN-P05 rejects an invalid %s (%j)", (path, change, code) => {
    expect(fieldErrors(createVendorBodySchema, vendorBody(change))).toEqual([{ path, code }]);
  });

  it.each([
    ["invoiceAddresses.0.countryCode", { countryCode: "th" }],
    ["invoiceAddresses.0.state", { state: "" }],
    ["invoiceAddresses.0.name", { name: "a".repeat(201) }],
    ["invoiceAddresses.0.taxId", { taxId: "1".repeat(33) }],
  ])("UT-VEN-P06 rejects an invalid address field %s", (path, change) => {
    expect(fieldErrors(createVendorBodySchema, vendorBody({ invoiceAddresses: [invoiceAddress(change)] })).map((error) => error.path)).toEqual([path]);
  });

  it("UT-VEN-P07 needs 1..10 invoice addresses", () => {
    expect(fieldErrors(createVendorBodySchema, vendorBody({ invoiceAddresses: [] }))).toEqual([{ path: "invoiceAddresses", code: "too_small" }]);
    expect(fieldErrors(createVendorBodySchema, vendorBody({ invoiceAddresses: Array.from({ length: MAX_ADDRESSES + 1 }, () => invoiceAddress()) }))).toEqual([{ path: "invoiceAddresses", code: "too_big" }]);
  });
});

describe("default address rule (zero or one, D-V03)", () => {
  it("UT-VEN-P08 accepts zero and one default", () => {
    expect(fieldErrors(createVendorBodySchema, vendorBody({ invoiceAddresses: [invoiceAddress(), invoiceAddress()] }))).toEqual([]);
    expect(fieldErrors(createVendorBodySchema, vendorBody({ invoiceAddresses: [invoiceAddress(), invoiceAddress({ isDefault: true })] }))).toEqual([]);
  });

  it("UT-VEN-P09 rejects two defaults with {invoiceAddresses, multiple_defaults}", () => {
    expect(fieldErrors(createVendorBodySchema, vendorBody({ invoiceAddresses: [invoiceAddress({ isDefault: true }), invoiceAddress({ isDefault: true })] }))).toEqual([
      { path: "invoiceAddresses", code: "multiple_defaults" },
    ]);
  });
});

describe("updateVendorBodySchema", () => {
  it("UT-VEN-P10 requires expectedUpdatedAt and keeps the create rules", () => {
    expect(updateVendorBodySchema.safeParse(withVersion(vendorBody())).success).toBe(true);
    expect(fieldErrors(updateVendorBodySchema, vendorBody())).toEqual([{ path: "expectedUpdatedAt", code: "invalid_type" }]);
    expect(fieldErrors(updateVendorBodySchema, withVersion(vendorBody({ invoiceAddresses: [invoiceAddress({ isDefault: true }), invoiceAddress({ isDefault: true })] })))).toEqual([
      { path: "invoiceAddresses", code: "multiple_defaults" },
    ]);
  });

  it("UT-VEN-P11 rejects id in the body and a version with an offset", () => {
    expect(fieldErrors(updateVendorBodySchema, { id: "0b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d0e", ...withVersion(vendorBody()) })).toEqual([{ path: "(root)", code: "unrecognized_keys" }]);
    expect(fieldErrors(updateVendorBodySchema, withVersion(vendorBody(), "2026-10-16T07:00:00.000+07:00"))).toEqual([{ path: "expectedUpdatedAt", code: "invalid_format" }]);
  });
});
