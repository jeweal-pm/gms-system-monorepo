// ADR-0021 unit tests (customer SA rev 2 / vendor SA rev 2) — case IDs UT-PC-*.
// Runner: Node's built-in `node:test` (no new dependency). Runs against the compiled output:
//   node --test test/partner-code.unit.test.mjs        (cwd backend-api-partner, after `nest build`/dev compile)
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
require("reflect-metadata");
const { requiredCodeSchema, CODE_MAX, partnerScalarFields } = require("../dist/common/partner-schemas.js");
const { createCustomerBodySchema, updateCustomerBodySchema } = require("../dist/customer/customer.schemas.js");
const { createVendorBodySchema, updateVendorBodySchema } = require("../dist/vendor/vendor.schemas.js");
const { zodFieldErrors, parseOrThrow } = require("../dist/common/errors.js");
const { formatPartnerCode, CODE_PREFIX, MAX_COUNTED_DIGITS } = require("../dist/common/persistence.js");
const { CustomerController } = require("../dist/customer/customer.controller.js");
const { VendorController } = require("../dist/vendor/vendor.controller.js");

const address = { name: "HQ", address: "1 Road", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10110", isDefault: true };
const base = {
  name: "Acme", code: "C001", currencyCode: "THB", active: true, firstName: "A", middleName: null, lastName: null,
  phone: null, email: "a@example.com",
};
const customerBody = (code) => ({ ...base, code, invoiceAddresses: [{ ...address, taxId: null }], shippingAddresses: [address] });
const vendorBody = (code) => ({ ...base, code, invoiceAddresses: [{ ...address, taxId: null }] });
const withMeta = (body) => ({ expectedUpdatedAt: "2026-10-16T00:00:00.000Z", ...body });
const codeErrors = (schema, body) => {
  const parsed = schema.safeParse(body);
  return parsed.success ? [] : zodFieldErrors(parsed.error).filter((error) => error.path === "code");
};

describe("UT-PC-01 requiredCodeSchema", () => {
  it("trims and accepts 1..120 characters", () => {
    assert.equal(requiredCodeSchema.parse("  C001 "), "C001");
    assert.equal(requiredCodeSchema.parse("x"), "x");
    assert.equal(requiredCodeSchema.parse("a".repeat(CODE_MAX)), "a".repeat(120));
  });
  it("empty or whitespace-only → custom issue with params.code 'required'", () => {
    for (const value of ["", "   ", "\t\n"]) {
      const parsed = requiredCodeSchema.safeParse(value);
      assert.equal(parsed.success, false, JSON.stringify(value));
      assert.deepEqual(zodFieldErrors(parsed.error), [{ path: "(root)", code: "required" }]);
    }
  });
  it("over 120 characters → too_big; null/undefined/number → invalid_type", () => {
    assert.deepEqual(zodFieldErrors(requiredCodeSchema.safeParse("a".repeat(121)).error), [{ path: "(root)", code: "too_big" }]);
    for (const value of [null, undefined, 1]) {
      assert.deepEqual(zodFieldErrors(requiredCodeSchema.safeParse(value).error), [{ path: "(root)", code: "invalid_type" }]);
    }
  });
  it("is the `code` field of the shared partner scalar fields", () => {
    assert.equal(partnerScalarFields.code, requiredCodeSchema);
  });
});

describe("UT-PC-02 create/update bodies require code (customer + vendor)", () => {
  const cases = [
    ["customer create", createCustomerBodySchema, customerBody],
    ["customer update", updateCustomerBodySchema, (code) => withMeta(customerBody(code))],
    ["vendor create", createVendorBodySchema, vendorBody],
    ["vendor update", updateVendorBodySchema, (code) => withMeta(vendorBody(code))],
  ];
  for (const [label, schema, build] of cases) {
    it(`${label}: valid code is trimmed`, () => {
      assert.equal(schema.parse(build(" V-0001 ")).code, "V-0001");
    });
    it(`${label}: "" and "  " → {path:"code",code:"required"}`, () => {
      assert.deepEqual(codeErrors(schema, build("")), [{ path: "code", code: "required" }]);
      assert.deepEqual(codeErrors(schema, build("  ")), [{ path: "code", code: "required" }]);
    });
    it(`${label}: null / missing → invalid_type; 121 chars → too_big`, () => {
      assert.deepEqual(codeErrors(schema, build(null)), [{ path: "code", code: "invalid_type" }]);
      const { code: _omit, ...missing } = build("x");
      assert.deepEqual(codeErrors(schema, missing), [{ path: "code", code: "invalid_type" }]);
      assert.deepEqual(codeErrors(schema, build("a".repeat(121))), [{ path: "code", code: "too_big" }]);
    });
  }
  it("parseOrThrow → 400 VALIDATION_ERROR envelope with the required field error", () => {
    assert.throws(() => parseOrThrow(createCustomerBodySchema, customerBody("")), (error) => {
      assert.equal(error.getStatus(), 400);
      const body = error.getResponse();
      assert.equal(body.error.code, "VALIDATION_ERROR");
      assert.deepEqual(body.error.fieldErrors, [{ path: "code", code: "required" }]);
      return true;
    });
  });
});

describe("UT-PC-03 formatPartnerCode", () => {
  it("pads to at least 3 digits and never truncates", () => {
    assert.equal(formatPartnerCode("C", "1"), "C001");
    assert.equal(formatPartnerCode("V", "42"), "V042");
    assert.equal(formatPartnerCode("C", "999"), "C999");
    assert.equal(formatPartnerCode("C", "1000"), "C1000");
    assert.equal(formatPartnerCode("V", "1000000000000000000"), "V1000000000000000000");
  });
  it("rejects a non-positive or non-numeric value from the database", () => {
    for (const value of ["0", "", "-1", "01", "1a", "1.5"]) assert.throws(() => formatPartnerCode("C", value));
  });
  it("prefixes and digit bound match ADR-0021", () => {
    assert.deepEqual(CODE_PREFIX, { customer: "C", vendor: "V" });
    assert.equal(MAX_COUNTED_DIGITS, 18);
  });
});

describe("UT-PC-04 next-code route is declared before :id", () => {
  for (const [label, Controller] of [["customer", CustomerController], ["vendor", VendorController]]) {
    it(label, () => {
      const names = Object.getOwnPropertyNames(Controller.prototype);
      assert.equal(Reflect.getMetadata("path", Controller.prototype.nextCode), "next-code");
      assert.equal(Reflect.getMetadata("method", Controller.prototype.nextCode), 0); // RequestMethod.GET
      assert.ok(names.indexOf("nextCode") < names.indexOf("get"), "nextCode must precede get(':id')");
    });
  }
});
