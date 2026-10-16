import { describe, expect, it } from "vitest";
import { listInputSchema } from "../../src/trpc/partner-schemas";
import {
  assertVendorDefaults,
  createVendorInputSchema,
  updateVendorInputSchema,
  vendorDetailOutputSchema,
  vendorIdInputSchema,
  vendorListInputSchema,
  vendorMutationOutputSchema,
} from "../../src/trpc/vendor-schemas";
import { address, failure, formatted, ID, invoiceAddress, vendorDetail, vendorInput, withMeta } from "../partner-shared/fixtures";

/** UT-VEN-G01…G10: gateway `vendor.*` input/output shapes (vendor api-contract.md, D-V03). */

const errors = (input: unknown) => formatted(createVendorInputSchema, input)?.fieldErrors ?? [];

describe("createVendorInputSchema", () => {
  it("UT-VEN-G01 accepts a valid input and normalizes text", () => {
    expect(createVendorInputSchema.parse(vendorInput({ code: " V001 ", email: "Sales@Gem.CO", invoiceAddresses: [invoiceAddress({ taxId: "" })] }))).toMatchObject({
      code: "V001", email: "sales@gem.co", invoiceAddresses: [{ taxId: null }],
    });
  });

  it("UT-VEN-G02 has no shippingAddresses: sending one is (root) unrecognized_keys", () => {
    expect(errors(vendorInput({ shippingAddresses: [address()] }))).toEqual([{ path: "(root)", code: "unrecognized_keys" }]);
  });

  it.each(["name", "code", "currencyCode", "active", "firstName", "email", "invoiceAddresses"])("UT-VEN-G03 requires %s", (key) => {
    const { [key]: _omit, ...input } = vendorInput() as Record<string, unknown>;
    expect(errors(input)).toEqual([{ path: key, code: "invalid_type" }]);
  });

  it.each([
    ["email", { email: "a@" }],
    ["currencyCode", { currencyCode: "usd" }],
    ["name", { name: "a".repeat(201) }],
    ["invoiceAddresses", { invoiceAddresses: [] }],
    ["invoiceAddresses.0.taxId", { invoiceAddresses: [invoiceAddress({ taxId: "1".repeat(33) })] }],
  ])("UT-VEN-G04 rejects an invalid %s", (path, change) => {
    expect(errors(vendorInput(change)).map((error) => error.path)).toEqual([path]);
  });
});

describe("assertVendorDefaults (zero or one)", () => {
  it("UT-VEN-G05 accepts zero and one default", () => {
    expect(() => assertVendorDefaults({ invoiceAddresses: [{ isDefault: false }, { isDefault: false }] })).not.toThrow();
    expect(() => assertVendorDefaults({ invoiceAddresses: [{ isDefault: false }, { isDefault: true }] })).not.toThrow();
  });

  it("UT-VEN-G06 rejects two defaults with {invoiceAddresses, multiple_defaults}", async () => {
    expect(await failure(Promise.resolve().then(() => assertVendorDefaults({ invoiceAddresses: [{ isDefault: true }, { isDefault: true }] })))).toEqual({
      code: "BAD_REQUEST", domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "invoiceAddresses", code: "multiple_defaults" }],
    });
  });
});

describe("update / id / list", () => {
  it("UT-VEN-G07 update requires id + expectedUpdatedAt", () => {
    expect(updateVendorInputSchema.safeParse(withMeta(vendorInput())).success).toBe(true);
    expect(formatted(updateVendorInputSchema, vendorInput())?.fieldErrors).toEqual([{ path: "id", code: "invalid_type" }, { path: "expectedUpdatedAt", code: "invalid_type" }]);
    expect(formatted(vendorIdInputSchema, { id: "V001" })?.fieldErrors).toEqual([{ path: "id", code: "invalid_format" }]);
  });

  it("UT-VEN-G08 uses the shared list input", () => {
    expect(vendorListInputSchema).toBe(listInputSchema);
  });
});

describe("outputs", () => {
  it("UT-VEN-G09 detail strips unknown fields (including a stray shippingAddresses)", () => {
    expect(vendorDetailOutputSchema.parse({ ...vendorDetail(), shippingAddresses: [], codeKey: "v001" })).toEqual(vendorDetail());
  });

  it("UT-VEN-G10 mutation output needs id and updatedAt; detail bounds invoice addresses", () => {
    expect(vendorMutationOutputSchema.safeParse({ id: ID, updatedAt: "2026-10-16T00:00:00.000Z" }).success).toBe(true);
    expect(vendorMutationOutputSchema.safeParse({ id: ID }).success).toBe(false);
    const eleven = Array.from({ length: 11 }, () => vendorDetail().invoiceAddresses[0]);
    expect(vendorDetailOutputSchema.safeParse({ ...vendorDetail(), invoiceAddresses: eleven }).success).toBe(false);
  });
});
