// ADR-0021 gateway tests (customer SA rev 2 / vendor SA rev 2). Runner: Node's built-in `node:test`.
//   node --test test/partner-code.test.mjs       (cwd backend-api-gateway, after `nest build`/dev compile)
// UT-GW-PC-*: schema + error-formatting units. IT-GW-PC-*: tRPC caller → permission middleware →
// callPartner (real fetch, bounded read, error mapping, output validation) → in-process stub partner HTTP server.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { after, before, describe, it } from "node:test";

const require = createRequire(import.meta.url);
require("reflect-metadata");
const { TRPCError } = require("@trpc/server");
const { requiredCodeSchema, partnerScalarFields, nextCodeOutputSchema } = require("../dist/trpc/partner-schemas.js");
const { createCustomerInputSchema, updateCustomerInputSchema, customerNextCodeOutputSchema } = require("../dist/trpc/customer-schemas.js");
const { createVendorInputSchema, updateVendorInputSchema, vendorNextCodeOutputSchema } = require("../dist/trpc/vendor-schemas.js");
const { describeError } = require("../dist/trpc/domain-error.js");
const { appRouter } = require("../dist/trpc/router.js");

const address = { name: "HQ", address: "1 Road", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10110", isDefault: true };
const base = { name: "Acme", currencyCode: "THB", active: true, firstName: "A", middleName: null, lastName: null, phone: null, email: "a@example.com" };
const meta = { id: "00000000-0000-4000-8000-000000000001", expectedUpdatedAt: "2026-10-16T00:00:00.000Z" };
const customer = (code) => ({ ...base, code, invoiceAddresses: [{ ...address, taxId: null }], shippingAddresses: [address] });
const vendor = (code) => ({ ...base, code, invoiceAddresses: [{ ...address, taxId: null }] });

/** Same path as tRPC: a BAD_REQUEST whose cause carries the zod issues, formatted by `describeError`. */
function formatted(schema, input) {
  const parsed = schema.safeParse(input);
  if (parsed.success) return null;
  return describeError(new TRPCError({ code: "BAD_REQUEST", cause: parsed.error }));
}

describe("UT-GW-PC-01 requiredCodeSchema / partnerScalarFields.code", () => {
  it("trims, 1..120", () => {
    assert.equal(requiredCodeSchema.parse("  C001  "), "C001");
    assert.equal(requiredCodeSchema.parse("a".repeat(120)).length, 120);
    assert.equal(requiredCodeSchema.safeParse("a".repeat(121)).success, false);
    assert.equal(partnerScalarFields.code, requiredCodeSchema);
  });
});

describe("UT-GW-PC-02 customer/vendor create+update inputs require code; describeError maps the custom code", () => {
  const cases = [
    ["customer.create", createCustomerInputSchema, customer],
    ["customer.update", updateCustomerInputSchema, (code) => ({ ...meta, ...customer(code) })],
    ["vendor.create", createVendorInputSchema, vendor],
    ["vendor.update", updateVendorInputSchema, (code) => ({ ...meta, ...vendor(code) })],
  ];
  for (const [label, schema, build] of cases) {
    it(label, () => {
      assert.equal(schema.parse(build(" X-1 ")).code, "X-1");
      for (const empty of ["", "   "]) {
        assert.deepEqual(formatted(schema, build(empty)), { domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "code", code: "required" }] });
      }
      assert.deepEqual(formatted(schema, build(null)), { domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "code", code: "invalid_type" }] });
      const { code: _omit, ...missing } = build("x");
      assert.deepEqual(formatted(schema, missing).fieldErrors, [{ path: "code", code: "invalid_type" }]);
      assert.deepEqual(formatted(schema, build("a".repeat(121))).fieldErrors, [{ path: "code", code: "too_big" }]);
    });
  }
});

describe("UT-GW-PC-03 describeError custom-code handling", () => {
  it("uses params.code only for custom issues with a non-empty string; otherwise the zod code / 'custom'", () => {
    const issues = [
      { code: "custom", path: ["a"], params: { code: "multiple_defaults" } },
      { code: "custom", path: ["b"] },
      { code: "custom", path: ["c"], params: { code: 5 } },
      { code: "too_small", path: ["d"], params: { code: "ignored" } },
    ];
    const result = describeError(new TRPCError({ code: "BAD_REQUEST", cause: Object.assign(new Error("x"), { issues }) }));
    assert.deepEqual(result.fieldErrors, [
      { path: "a", code: "multiple_defaults" }, { path: "b", code: "custom" }, { path: "c", code: "custom" }, { path: "d", code: "too_small" },
    ]);
  });
  it("password-only policy failures still become PASSWORD_POLICY_VIOLATION", () => {
    const issues = [{ code: "too_small", path: ["password"] }];
    assert.equal(describeError(new TRPCError({ code: "BAD_REQUEST", cause: Object.assign(new Error("x"), { issues }) })).domainCode, "PASSWORD_POLICY_VIOLATION");
  });
});

describe("UT-GW-PC-04 nextCode output schema", () => {
  it("accepts C001/V1000; rejects other shapes", () => {
    assert.equal(customerNextCodeOutputSchema, nextCodeOutputSchema);
    assert.equal(vendorNextCodeOutputSchema, nextCodeOutputSchema);
    for (const code of ["C001", "V999", "C1000", `V${"1".repeat(19)}`]) assert.equal(nextCodeOutputSchema.safeParse({ code }).success, true, code);
    for (const code of ["C01", "c001", "X001", "C-001", "", `C${"1".repeat(20)}`]) assert.equal(nextCodeOutputSchema.safeParse({ code }).success, false, code);
  });
});

// ---- integration: caller → middleware → callPartner → stub partner ----

const requests = [];
let stubResponse = { status: 200, body: { code: "C001" } };
const server = createServer((request, response) => {
  requests.push({ method: request.method, url: request.url, auth: request.headers.authorization, actor: request.headers["x-actor-user-id"] });
  response.writeHead(stubResponse.status, { "content-type": "application/json" });
  response.end(JSON.stringify(stubResponse.body));
});

function caller({ isSuperAdmin = false, permissions = [] } = {}) {
  return appRouter.createCaller({
    session: { user: { id: "user-1", username: "u", email: "u@example.com", name: "U" } },
    license: { state: "VALID" },
    authz: { isSuperAdmin, permissions },
    cookie: "c=1",
    activateLicense: null,
  });
}

async function rejection(promise) {
  try {
    await promise;
  } catch (error) {
    return { code: error.code, ...describeError(error) };
  }
  assert.fail("expected a rejection");
}

describe("IT-GW-PC customer.nextCode / vendor.nextCode through the router", () => {
  before(async () => {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    process.env.PARTNER_SERVICE_URL = `http://127.0.0.1:${server.address().port}`;
    process.env.PARTNER_SERVICE_TOKEN = "t".repeat(48);
  });
  after(() => new Promise((resolve) => server.close(resolve)));

  for (const [entity, prefix, plural, notFound] of [["customer", "C", "customers", "CUSTOMER_NOT_FOUND"], ["vendor", "V", "vendors", "VENDOR_NOT_FOUND"]]) {
    it(`IT-GW-PC-01 ${entity}.nextCode with ${entity}:ADD → GET /internal/v1/${plural}/next-code, returns {code}`, async () => {
      requests.length = 0;
      stubResponse = { status: 200, body: { code: `${prefix}042`, extra: "stripped" } };
      assert.deepEqual(await caller({ permissions: [`${entity}:ADD`] })[entity].nextCode(), { code: `${prefix}042` });
      assert.deepEqual(requests, [{ method: "GET", url: `/internal/v1/${plural}/next-code`, auth: `Bearer ${"t".repeat(48)}`, actor: "user-1" }]);
    });

    it(`IT-GW-PC-02 ${entity}.nextCode: Super Admin allowed; VIEW/EDIT only or other menu → PERMISSION_DENIED without calling partner`, async () => {
      stubResponse = { status: 200, body: { code: `${prefix}001` } };
      assert.deepEqual(await caller({ isSuperAdmin: true })[entity].nextCode(), { code: `${prefix}001` });
      requests.length = 0;
      const other = entity === "customer" ? "vendor" : "customer";
      for (const permissions of [[`${entity}:VIEW`, `${entity}:EDIT`, `${entity}:DELETE`], [`${other}:ADD`], []]) {
        assert.deepEqual(await rejection(caller({ permissions })[entity].nextCode()), { code: "FORBIDDEN", domainCode: "PERMISSION_DENIED", fieldErrors: null });
      }
      assert.equal(requests.length, 0);
    });

    it(`IT-GW-PC-03 ${entity}.nextCode: malformed partner output / partner 503 → PARTNER_UNAVAILABLE; 404 → ${notFound}`, async () => {
      stubResponse = { status: 200, body: { code: "C01" } };
      assert.equal((await rejection(caller({ isSuperAdmin: true })[entity].nextCode())).domainCode, "PARTNER_UNAVAILABLE");
      stubResponse = { status: 503, body: { error: { code: "PARTNER_UNAVAILABLE" } } };
      assert.equal((await rejection(caller({ isSuperAdmin: true })[entity].nextCode())).domainCode, "PARTNER_UNAVAILABLE");
      stubResponse = { status: 404, body: {} };
      assert.equal((await rejection(caller({ isSuperAdmin: true })[entity].nextCode())).domainCode, notFound);
    });

    it(`IT-GW-PC-04 ${entity}.create with empty code → VALIDATION_ERROR {code:required} before partner; 409 from partner → ${entity.toUpperCase()}_CODE_TAKEN`, async () => {
      const build = entity === "customer" ? customer : vendor;
      requests.length = 0;
      assert.deepEqual(await rejection(caller({ isSuperAdmin: true })[entity].create(build(" "))), { code: "BAD_REQUEST", domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "code", code: "required" }] });
      assert.equal(requests.length, 0);
      const taken = `${entity.toUpperCase()}_CODE_TAKEN`;
      stubResponse = { status: 409, body: { error: { code: taken, message: "x", fieldErrors: [{ path: "code", code: "duplicate" }] } } };
      assert.deepEqual(await rejection(caller({ isSuperAdmin: true })[entity].create(build(`${prefix}001`))), { code: "CONFLICT", domainCode: taken, fieldErrors: [{ path: "code", code: "duplicate" }] });
      assert.equal(requests.length, 1);
    });
  }
});
