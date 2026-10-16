// ADR-0021 integration tests — case IDs IT-PC-*. Real boundary: partner HTTP (service-token guard,
// validation, service, PostgreSQL). Run inside the partner container of the dev Compose stack:
//   node --test test/partner-code.integration.test.mjs     (cwd backend-api-partner)
// Env: PARTNER_SERVICE_TOKEN (never printed), PARTNER_TEST_URL (default http://localhost:3201).
// Test rows use the BT21 name prefix and are deleted in `after`. Assertions on next-code are relative to the
// value read at the start, so pre-existing rows do not matter (avoid parallel creates of C…/V… codes while running).
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, describe, it } from "node:test";

const require = createRequire(import.meta.url);
const { prisma } = require("../dist/database/prisma-client.js");

const BASE = process.env.PARTNER_TEST_URL ?? "http://localhost:3201";
const TOKEN = process.env.PARTNER_SERVICE_TOKEN ?? "";
const ACTOR = "bt21-integration";
assert.ok(TOKEN.length >= 32, "PARTNER_SERVICE_TOKEN must be set for integration tests");

async function call(method, path, body, { token = TOKEN } = {}) {
  const headers = { "x-actor-user-id": ACTOR };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5_000) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const address = { name: "BT21 HQ", address: "1 Road", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10110", isDefault: true };
const ENTITIES = [
  {
    entity: "customer", prefix: "C", path: "/internal/v1/customers", taken: "CUSTOMER_CODE_TAKEN", table: "customer",
    body: (code) => ({ name: `BT21 customer ${code}`, code, currencyCode: "THB", active: true, firstName: "Bt", middleName: null, lastName: null, phone: null, email: "bt21@example.com", invoiceAddresses: [{ ...address, taxId: null }], shippingAddresses: [address] }),
  },
  {
    entity: "vendor", prefix: "V", path: "/internal/v1/vendors", taken: "VENDOR_CODE_TAKEN", table: "vendor",
    body: (code) => ({ name: `BT21 vendor ${code}`, code, currencyCode: "THB", active: true, firstName: "Bt", middleName: null, lastName: null, phone: null, email: "bt21@example.com", invoiceAddresses: [{ ...address, taxId: null }] }),
  },
];

const created = [];
after(async () => {
  for (const { path, id } of created) await call("DELETE", `${path}/${id}`);
  await prisma.$disconnect();
});

const pad = (n) => String(n).padStart(3, "0");
const numberOf = (prefix, code) => {
  assert.match(code, new RegExp(`^${prefix}[0-9]{3,}$`));
  return Number(code.slice(1));
};

for (const spec of ENTITIES) {
  const { entity, prefix, path, taken } = spec;
  describe(`${entity}`, () => {
    let n0;
    let firstId;
    let firstUpdatedAt;

    it(`IT-PC-01 GET ${path}/next-code → 200 {code:"${prefix}nnn"} (not parsed as :id)`, async () => {
      const response = await call("GET", `${path}/next-code`);
      assert.equal(response.status, 200);
      assert.deepEqual(Object.keys(response.body), ["code"]);
      n0 = numberOf(prefix, response.body.code);
    });

    it("IT-PC-02 next-code without / with a wrong service token → 401", async () => {
      assert.equal((await call("GET", `${path}/next-code`, undefined, { token: "" })).status, 401);
      assert.equal((await call("GET", `${path}/next-code`, undefined, { token: "x".repeat(48) })).status, 401);
    });

    it("IT-PC-03 create without code / empty / blank / null → 400 VALIDATION_ERROR, nothing written", async () => {
      const { code: _omit, ...missing } = spec.body("x");
      const cases = [[missing, "invalid_type"], [spec.body(""), "required"], [spec.body("   "), "required"], [spec.body(null), "invalid_type"]];
      for (const [body, code] of cases) {
        const response = await call("POST", path, body);
        assert.equal(response.status, 400);
        assert.equal(response.body.error.code, "VALIDATION_ERROR");
        assert.deepEqual(response.body.error.fieldErrors, [{ path: "code", code }]);
      }
      const rows = await prisma[spec.table].count({ where: { name: { startsWith: "BT21" } } });
      assert.equal(rows, 0);
    });

    it("IT-PC-04 create with the suggested code → 201; next-code advances by one; code_key = lower(code)", async () => {
      const code = `${prefix}${pad(n0)}`;
      const response = await call("POST", path, spec.body(` ${code} `));
      assert.equal(response.status, 201);
      created.push({ path, id: response.body.id });
      firstId = response.body.id;
      firstUpdatedAt = response.body.updatedAt;
      const row = await prisma[spec.table].findUnique({ where: { id: firstId }, select: { code: true, codeKey: true } });
      assert.deepEqual(row, { code, codeKey: code.toLowerCase() });
      assert.equal((await call("GET", `${path}/next-code`)).body.code, `${prefix}${pad(n0 + 1)}`);
    });

    it("IT-PC-05 lowercase prefix counts; >18-digit and non-matching codes are ignored", async () => {
      const lower = await call("POST", path, spec.body(`${prefix.toLowerCase()}${pad(n0 + 5)}`));
      assert.equal(lower.status, 201);
      created.push({ path, id: lower.body.id });
      for (const code of [`${prefix}${"9".repeat(19)}`, `${prefix}-9999`, `${prefix}M9999`]) {
        const response = await call("POST", path, spec.body(code));
        assert.equal(response.status, 201, code);
        created.push({ path, id: response.body.id });
      }
      assert.equal((await call("GET", `${path}/next-code`)).body.code, `${prefix}${pad(n0 + 6)}`);
    });

    it(`IT-PC-06 duplicate code (case + spaces) → 409 ${taken}`, async () => {
      const response = await call("POST", path, spec.body(` ${prefix.toLowerCase()}${pad(n0)}  `));
      assert.equal(response.status, 409);
      assert.equal(response.body.error.code, taken);
      assert.deepEqual(response.body.error.fieldErrors, [{ path: "code", code: "duplicate" }]);
    });

    it("IT-PC-07 update with empty code → 400 required; with a new code → 200 and code_key updated", async () => {
      const empty = await call("PUT", `${path}/${firstId}`, { expectedUpdatedAt: firstUpdatedAt, ...spec.body("  ") });
      assert.equal(empty.status, 400);
      assert.deepEqual(empty.body.error.fieldErrors, [{ path: "code", code: "required" }]);
      const renamed = await call("PUT", `${path}/${firstId}`, { expectedUpdatedAt: firstUpdatedAt, ...spec.body("BT21-Renamed") });
      assert.equal(renamed.status, 200);
      const row = await prisma[spec.table].findUnique({ where: { id: firstId }, select: { code: true, codeKey: true } });
      assert.deepEqual(row, { code: "BT21-Renamed", codeKey: "bt21-renamed" });
    });
  });
}

describe("IT-PC-08 schema: code and code_key are NOT NULL", () => {
  it("information_schema", async () => {
    const rows = await prisma.$queryRaw`
      SELECT table_name AS "table", column_name AS "column", is_nullable AS "nullable" FROM information_schema.columns
      WHERE table_schema = 'partner' AND table_name IN ('customer', 'vendor') AND column_name IN ('code', 'code_key')
      ORDER BY 1, 2`;
    assert.deepEqual(rows, [
      { table: "customer", column: "code", nullable: "NO" }, { table: "customer", column: "code_key", nullable: "NO" },
      { table: "vendor", column: "code", nullable: "NO" }, { table: "vendor", column: "code_key", nullable: "NO" },
    ]);
  });
});
