import { describe, expect, it } from "vitest";
import {
  createCustomerBodySchema,
  customerIdSchema,
  MAX_ADDRESSES_PER_TYPE,
  updateCustomerBodySchema,
} from "../../src/customer/customer.schemas";
import { address, customerBody, fieldErrors, invoiceAddress, withVersion } from "../partner-shared/fixtures";

/** UT-CUS-P01…P12: partner customer body validation (customer api-contract.md "Shared types", ADR-0021 code rule). */

const paths = (value: unknown) => fieldErrors(createCustomerBodySchema, value).map((error) => error.path);

describe("createCustomerBodySchema", () => {
  it("UT-CUS-P01 accepts a valid body, trims text, lowers the email and turns empty optional text into null", () => {
    const parsed = createCustomerBodySchema.parse(customerBody({
      name: "  Acme  ", code: " C001 ", email: " Ann@Example.COM ", middleName: "  ", lastName: " Lee ",
      phone: { country: "TH", e164: "+66812345678" },
      invoiceAddresses: [invoiceAddress({ name: " HQ ", taxId: " 0105 ", isDefault: true })],
    }));
    expect(parsed).toMatchObject({ name: "Acme", code: "C001", email: "ann@example.com", middleName: null, lastName: "Lee", phone: { country: "TH", e164: "+66812345678" } });
    expect(parsed.invoiceAddresses[0]).toMatchObject({ name: "HQ", taxId: "0105" });
  });

  it("UT-CUS-P13 allows an empty address City (owner 2026-10-19) but still requires State/Province", () => {
    expect(paths(customerBody({ invoiceAddresses: [invoiceAddress({ city: "", isDefault: true })] }))).toEqual([]);
    expect(paths(customerBody({ invoiceAddresses: [invoiceAddress({ state: "", isDefault: true })] }))).toEqual(["invoiceAddresses.0.state"]);
  });

  it("UT-CUS-P02 rejects unknown keys at the root and in addresses (strict)", () => {
    expect(fieldErrors(createCustomerBodySchema, customerBody({ id: "x" }))).toEqual([{ path: "(root)", code: "unrecognized_keys" }]);
    expect(fieldErrors(createCustomerBodySchema, customerBody({ createdBy: "u" }))).toEqual([{ path: "(root)", code: "unrecognized_keys" }]);
    expect(fieldErrors(createCustomerBodySchema, customerBody({ shippingAddresses: [address({ isDefault: true, taxId: "1" })] }))).toEqual([
      { path: "shippingAddresses.0", code: "unrecognized_keys" },
    ]);
  });

  it.each(["name", "code", "currencyCode", "active", "firstName", "email", "invoiceAddresses", "shippingAddresses"])("UT-CUS-P03 requires %s", (key) => {
    const { [key]: _omit, ...body } = customerBody() as Record<string, unknown>;
    expect(fieldErrors(createCustomerBodySchema, body)).toEqual([{ path: key, code: "invalid_type" }]);
  });

  it.each([
    ["name", { name: "   " }, "too_small"],
    ["name", { name: "a".repeat(201) }, "too_big"],
    ["code", { code: "a".repeat(121) }, "too_big"],
    ["firstName", { firstName: "a".repeat(101) }, "too_big"],
    ["middleName", { middleName: "a".repeat(101) }, "too_big"],
    ["email", { email: "not-an-email" }, "invalid_format"],
    ["email", { email: `${"a".repeat(250)}@x.co` }, "too_big"],
    ["currencyCode", { currencyCode: "thb" }, "invalid_format"],
    ["currencyCode", { currencyCode: "BAHT" }, "invalid_format"],
    ["phone.e164", { phone: { country: "TH", e164: "0812345678" } }, "invalid_format"],
  ])("UT-CUS-P04 rejects an invalid %s (%j)", (path, change, code) => {
    expect(fieldErrors(createCustomerBodySchema, customerBody(change))).toEqual([{ path, code }]);
  });

  it.each([
    ["invoiceAddresses.0.countryCode", { invoiceAddresses: [invoiceAddress({ countryCode: "THA" })] }],
    ["invoiceAddresses.0.postcode", { invoiceAddresses: [invoiceAddress({ postcode: "1".repeat(21) })] }],
    ["invoiceAddresses.0.address", { invoiceAddresses: [invoiceAddress({ address: " " })] }],
    ["invoiceAddresses.0.taxId", { invoiceAddresses: [invoiceAddress({ taxId: "1".repeat(33) })] }],
    ["shippingAddresses.0.city", { shippingAddresses: [address({ city: "a".repeat(101) })] }],
    ["shippingAddresses.0.isDefault", { shippingAddresses: [address({ isDefault: "yes" })] }],
  ])("UT-CUS-P05 rejects an invalid address field %s", (path, change) => {
    expect(paths(customerBody(change))).toEqual([path]);
  });

  it("UT-CUS-P06 needs 1..10 addresses per type", () => {
    expect(fieldErrors(createCustomerBodySchema, customerBody({ invoiceAddresses: [] }))).toEqual([{ path: "invoiceAddresses", code: "too_small" }]);
    const eleven = Array.from({ length: MAX_ADDRESSES_PER_TYPE + 1 }, () => address());
    expect(fieldErrors(createCustomerBodySchema, customerBody({ shippingAddresses: eleven }))).toEqual([{ path: "shippingAddresses", code: "too_big" }]);
    const ten = Array.from({ length: MAX_ADDRESSES_PER_TYPE }, () => address());
    expect(createCustomerBodySchema.safeParse(customerBody({ shippingAddresses: ten })).success).toBe(true);
  });
});

describe("default address rule (exactly one per type after the partner fills the first)", () => {
  it("UT-CUS-P07 accepts zero or one default per type (zero is completed by the service)", () => {
    expect(fieldErrors(createCustomerBodySchema, customerBody({ invoiceAddresses: [invoiceAddress(), invoiceAddress()], shippingAddresses: [address()] }))).toEqual([]);
    expect(fieldErrors(createCustomerBodySchema, customerBody({ invoiceAddresses: [invoiceAddress(), invoiceAddress({ isDefault: true })] }))).toEqual([]);
  });

  it("UT-CUS-P08 rejects more than one default with multiple_defaults on each offending array", () => {
    const two = { invoiceAddresses: [invoiceAddress({ isDefault: true }), invoiceAddress({ isDefault: true })], shippingAddresses: [address({ isDefault: true }), address({ isDefault: true })] };
    expect(fieldErrors(createCustomerBodySchema, customerBody(two))).toEqual([
      { path: "invoiceAddresses", code: "multiple_defaults" },
      { path: "shippingAddresses", code: "multiple_defaults" },
    ]);
  });
});

describe("updateCustomerBodySchema", () => {
  it("UT-CUS-P09 requires expectedUpdatedAt (UTC, milliseconds) next to the full body", () => {
    expect(updateCustomerBodySchema.parse(withVersion(customerBody())).expectedUpdatedAt).toBe("2026-10-16T00:00:00.000Z");
    expect(fieldErrors(updateCustomerBodySchema, customerBody())).toEqual([{ path: "expectedUpdatedAt", code: "invalid_type" }]);
    expect(fieldErrors(updateCustomerBodySchema, withVersion(customerBody(), "2026-10-16T00:00:00Z"))).toEqual([{ path: "expectedUpdatedAt", code: "invalid_format" }]);
  });

  it("UT-CUS-P10 does not accept the id in the body (it comes from the path)", () => {
    expect(fieldErrors(updateCustomerBodySchema, { id: "0b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d0e", ...withVersion(customerBody()) })).toEqual([{ path: "(root)", code: "unrecognized_keys" }]);
  });

  it("UT-CUS-P11 applies the same multiple_defaults rule", () => {
    expect(fieldErrors(updateCustomerBodySchema, withVersion(customerBody({ invoiceAddresses: [invoiceAddress({ isDefault: true }), invoiceAddress({ isDefault: true })] })))).toEqual([
      { path: "invoiceAddresses", code: "multiple_defaults" },
    ]);
  });
});

describe("customerIdSchema", () => {
  it("UT-CUS-P12 accepts a UUID only", () => {
    expect(customerIdSchema.safeParse("0b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d0e").success).toBe(true);
    expect(customerIdSchema.safeParse("next-code").success).toBe(false);
  });
});
