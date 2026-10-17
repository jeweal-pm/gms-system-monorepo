import "reflect-metadata";
import { HttpException, RequestMethod } from "@nestjs/common";
import { PATH_METADATA, METHOD_METADATA } from "@nestjs/common/constants";
import { describe, expect, it, vi } from "vitest";
import { parseOrThrow } from "../../src/common/errors";
import { CODE_MAX, partnerScalarFields, requiredCodeSchema } from "../../src/common/partner-schemas";
import { CODE_PREFIX, formatPartnerCode, MAX_COUNTED_DIGITS } from "../../src/common/persistence";
import { CustomerController } from "../../src/customer/customer.controller";
import { createCustomerBodySchema, updateCustomerBodySchema } from "../../src/customer/customer.schemas";
import { VendorController } from "../../src/vendor/vendor.controller";
import { createVendorBodySchema, updateVendorBodySchema } from "../../src/vendor/vendor.schemas";
import { customerBody, fieldErrors, vendorBody, withVersion } from "./fixtures";

/**
 * UT-PC-01…04 (ADR-0021): ported from the former `node:test` file `test/partner-code.unit.test.mjs`
 * (2026-10-16, same case IDs and assertions; now runs from `src/` under Vitest, no `dist/` build needed).
 */

vi.mock("../../src/database/prisma-client", async () => (await import("./prisma-fake")).prismaModule);

const codeErrors = (schema: Parameters<typeof fieldErrors>[0], body: unknown) => fieldErrors(schema, body).filter((error) => error.path === "code");

describe("UT-PC-01 requiredCodeSchema", () => {
  it("trims and accepts 1..120 characters", () => {
    expect(requiredCodeSchema.parse("  C001 ")).toBe("C001");
    expect(requiredCodeSchema.parse("x")).toBe("x");
    expect(requiredCodeSchema.parse("a".repeat(CODE_MAX))).toBe("a".repeat(120));
  });

  it.each(["", "   ", "\t\n"])("empty or whitespace-only %j → custom issue with params.code 'required'", (value) => {
    expect(fieldErrors(requiredCodeSchema, value)).toEqual([{ path: "(root)", code: "required" }]);
  });

  it("over 120 characters → too_big; null/undefined/number → invalid_type", () => {
    expect(fieldErrors(requiredCodeSchema, "a".repeat(121))).toEqual([{ path: "(root)", code: "too_big" }]);
    for (const value of [null, undefined, 1]) expect(fieldErrors(requiredCodeSchema, value)).toEqual([{ path: "(root)", code: "invalid_type" }]);
  });

  it("is the `code` field of the shared partner scalar fields", () => {
    expect(partnerScalarFields.code).toBe(requiredCodeSchema);
  });
});

describe("UT-PC-02 create/update bodies require code (customer + vendor)", () => {
  const cases = [
    ["customer create", createCustomerBodySchema, (code: unknown) => customerBody({ code })],
    ["customer update", updateCustomerBodySchema, (code: unknown) => withVersion(customerBody({ code }))],
    ["vendor create", createVendorBodySchema, (code: unknown) => vendorBody({ code })],
    ["vendor update", updateVendorBodySchema, (code: unknown) => withVersion(vendorBody({ code }))],
  ] as const;

  describe.each(cases)("%s", (_label, schema, build) => {
    it("valid code is trimmed", () => {
      expect(schema.parse(build(" V-0001 ")).code).toBe("V-0001");
    });

    it('"" and "  " → {path:"code",code:"required"}', () => {
      expect(codeErrors(schema, build(""))).toEqual([{ path: "code", code: "required" }]);
      expect(codeErrors(schema, build("  "))).toEqual([{ path: "code", code: "required" }]);
    });

    it("null / missing → invalid_type; 121 chars → too_big", () => {
      expect(codeErrors(schema, build(null))).toEqual([{ path: "code", code: "invalid_type" }]);
      const { code: _omit, ...missing } = build("x");
      expect(codeErrors(schema, missing)).toEqual([{ path: "code", code: "invalid_type" }]);
      expect(codeErrors(schema, build("a".repeat(121)))).toEqual([{ path: "code", code: "too_big" }]);
    });
  });

  it("parseOrThrow → 400 VALIDATION_ERROR envelope with the required field error", () => {
    let thrown: unknown;
    try {
      parseOrThrow(createCustomerBodySchema, customerBody({ code: "" }));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(HttpException);
    const error = thrown as HttpException;
    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({ error: { code: "VALIDATION_ERROR", fieldErrors: [{ path: "code", code: "required" }] } });
  });
});

describe("UT-PC-03 formatPartnerCode", () => {
  it("pads to at least 3 digits and never truncates", () => {
    expect(formatPartnerCode("C", "1")).toBe("C001");
    expect(formatPartnerCode("V", "42")).toBe("V042");
    expect(formatPartnerCode("C", "999")).toBe("C999");
    expect(formatPartnerCode("C", "1000")).toBe("C1000");
    expect(formatPartnerCode("V", "1000000000000000000")).toBe("V1000000000000000000");
  });

  it.each(["0", "", "-1", "01", "1a", "1.5"])("rejects the database value %j", (value) => {
    expect(() => formatPartnerCode("C", value)).toThrow();
  });

  it("prefixes and digit bound match ADR-0021", () => {
    expect(CODE_PREFIX).toEqual({ customer: "C", vendor: "V" });
    expect(MAX_COUNTED_DIGITS).toBe(18);
  });
});

describe("UT-PC-04 next-code route is declared before :id", () => {
  it.each([
    ["customer", CustomerController],
    ["vendor", VendorController],
  ] as const)("%s", (_label, Controller) => {
    const names = Object.getOwnPropertyNames(Controller.prototype);
    expect(Reflect.getMetadata(PATH_METADATA, Controller.prototype.nextCode)).toBe("next-code");
    expect(Reflect.getMetadata(METHOD_METADATA, Controller.prototype.nextCode)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(PATH_METADATA, Controller.prototype.get)).toBe(":id");
    expect(names.indexOf("nextCode")).toBeLessThan(names.indexOf("get"));
    expect(names.indexOf("options")).toBeLessThan(names.indexOf("get"));
  });
});
