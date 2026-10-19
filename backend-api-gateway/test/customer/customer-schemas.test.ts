import { describe, expect, it } from "vitest";
import {
  assertSingleDefaults,
  createCustomerInputSchema,
  customerDetailOutputSchema,
  customerIdInputSchema,
  customerListInputSchema,
  customerListOutputSchema,
  customerOptionsOutputSchema,
  updateCustomerInputSchema,
} from "../../src/trpc/customer-schemas";
import { listInputSchema } from "../../src/trpc/partner-schemas";
import { address, customerDetail, customerInput, failure, formatted, ID, invoiceAddress, withMeta } from "../partner-shared/fixtures";

/** UT-CUS-G01…G12: gateway `customer.*` input/output shapes (customer api-contract.md; same rules as partner). */

const errors = (input: unknown) => formatted(createCustomerInputSchema, input)?.fieldErrors ?? [];

describe("createCustomerInputSchema", () => {
  it("UT-CUS-G01 accepts a valid input, trims text, lowers the email, empties optional text to null", () => {
    const parsed = createCustomerInputSchema.parse(customerInput({ name: " Acme ", code: " C001 ", email: "ANN@Example.com", middleName: " ", shippingAddresses: [address({ city: " Bangkok " })] }));
    expect(parsed).toMatchObject({ name: "Acme", code: "C001", email: "ann@example.com", middleName: null });
    expect(parsed.shippingAddresses[0].city).toBe("Bangkok");
  });

  it("UT-CUS-G13 allows an empty address City (owner 2026-10-19) but still requires State/Province", () => {
    expect(errors(customerInput({ shippingAddresses: [address({ city: " " })] }))).toEqual([]);
    expect(errors(customerInput({ shippingAddresses: [address({ state: "" })] })).map((error) => error.path)).toEqual(["shippingAddresses.0.state"]);
  });

  it("UT-CUS-G02 is strict: unknown keys, id on create and taxId on a shipping address are rejected", () => {
    expect(errors(customerInput({ id: ID }))).toEqual([{ path: "(root)", code: "unrecognized_keys" }]);
    expect(errors(customerInput({ shippingAddresses: [address({ taxId: "1" })] }))).toEqual([{ path: "shippingAddresses.0", code: "unrecognized_keys" }]);
  });

  it.each(["name", "code", "currencyCode", "active", "firstName", "email", "invoiceAddresses", "shippingAddresses"])("UT-CUS-G03 requires %s", (key) => {
    const { [key]: _omit, ...input } = customerInput() as Record<string, unknown>;
    expect(errors(input)).toEqual([{ path: key, code: "invalid_type" }]);
  });

  it.each([
    ["email", { email: "nope" }],
    ["currencyCode", { currencyCode: "Baht" }],
    ["phone.e164", { phone: { country: "TH", e164: "66812345678" } }],
    ["phone.country", { phone: { country: "THA", e164: "+66812345678" } }],
    ["firstName", { firstName: "" }],
    ["code", { code: " " }],
  ])("UT-CUS-G04 rejects an invalid %s", (path, change) => {
    expect(errors(customerInput(change)).map((error) => error.path)).toEqual([path]);
  });

  it("UT-CUS-G05 needs 1..10 addresses per type and valid address fields", () => {
    expect(errors(customerInput({ shippingAddresses: [] }))).toEqual([{ path: "shippingAddresses", code: "too_small" }]);
    expect(errors(customerInput({ invoiceAddresses: Array.from({ length: 11 }, () => invoiceAddress()) }))).toEqual([{ path: "invoiceAddresses", code: "too_big" }]);
    expect(errors(customerInput({ invoiceAddresses: [invoiceAddress({ countryCode: "Thailand", postcode: "" })] })).map((error) => error.path)).toEqual(["invoiceAddresses.0.countryCode", "invoiceAddresses.0.postcode"]);
  });
});

describe("assertSingleDefaults", () => {
  it("UT-CUS-G06 allows zero or one default per type", () => {
    expect(() => assertSingleDefaults({ invoiceAddresses: [{ isDefault: false }], shippingAddresses: [{ isDefault: true }, { isDefault: false }] })).not.toThrow();
  });

  it("UT-CUS-G07 reports each array with more than one default, in key order", async () => {
    expect(await failure(Promise.resolve().then(() => assertSingleDefaults({ invoiceAddresses: [{ isDefault: true }, { isDefault: true }], shippingAddresses: [{ isDefault: true }, { isDefault: true }] })))).toEqual({
      code: "BAD_REQUEST", domainCode: "VALIDATION_ERROR",
      fieldErrors: [{ path: "invoiceAddresses", code: "multiple_defaults" }, { path: "shippingAddresses", code: "multiple_defaults" }],
    });
    expect(await failure(Promise.resolve().then(() => assertSingleDefaults({ invoiceAddresses: [{ isDefault: true }], shippingAddresses: [{ isDefault: true }, { isDefault: true }] })))).toMatchObject({
      fieldErrors: [{ path: "shippingAddresses", code: "multiple_defaults" }],
    });
  });
});

describe("updateCustomerInputSchema / ids / list", () => {
  it("UT-CUS-G08 requires a UUID id and expectedUpdatedAt with milliseconds in UTC", () => {
    expect(updateCustomerInputSchema.safeParse(withMeta(customerInput())).success).toBe(true);
    expect(formatted(updateCustomerInputSchema, { ...withMeta(customerInput()), id: "1" })?.fieldErrors).toEqual([{ path: "id", code: "invalid_format" }]);
    expect(formatted(updateCustomerInputSchema, { ...withMeta(customerInput()), expectedUpdatedAt: "2026-10-16T00:00:00Z" })?.fieldErrors).toEqual([{ path: "expectedUpdatedAt", code: "invalid_format" }]);
    expect(formatted(customerIdInputSchema, { id: ID, extra: 1 })?.fieldErrors).toEqual([{ path: "(root)", code: "unrecognized_keys" }]);
  });

  it("UT-CUS-G09 uses the shared list input (cursor + direction)", () => {
    expect(customerListInputSchema).toBe(listInputSchema);
  });
});

describe("outputs", () => {
  it("UT-CUS-G10 detail output strips unknown fields and keeps both address types", () => {
    const parsed = customerDetailOutputSchema.parse({ ...customerDetail(), createdBy: "u", nameKey: "acme" });
    expect(parsed).toEqual(customerDetail());
  });

  it("UT-CUS-G11 detail output bounds addresses and positions", () => {
    const many = Array.from({ length: 11 }, (_unused, index) => ({ ...customerDetail().shippingAddresses[0], position: (index % 10) + 1 }));
    expect(customerDetailOutputSchema.safeParse({ ...customerDetail(), shippingAddresses: many }).success).toBe(false);
    expect(customerDetailOutputSchema.safeParse({ ...customerDetail(), shippingAddresses: [{ ...customerDetail().shippingAddresses[0], position: 11 }] }).success).toBe(false);
  });

  it("UT-CUS-G12 list and options outputs are bounded", () => {
    const item = { id: ID, name: "a", code: null, active: true, updatedAt: "2026-10-16T00:00:00.000Z" };
    expect(customerListOutputSchema.safeParse({ items: [item], nextCursor: null, total: 1 }).success).toBe(true);
    expect(customerListOutputSchema.safeParse({ items: [item], nextCursor: null, total: -1 }).success).toBe(false);
    expect(customerOptionsOutputSchema.safeParse({ currencies: Array.from({ length: 401 }, () => ({ code: "THB", name: "Baht" })), countries: [] }).success).toBe(false);
  });
});
