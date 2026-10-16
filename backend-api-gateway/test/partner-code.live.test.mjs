// ADR-0021 live end-to-end (IT-GW-PC-LIVE-*): browser-equivalent HTTP → gateway `/trpc` (session, license,
// permission) → partner → PostgreSQL, on the dev Compose stack. Run inside the gateway container:
//   node --test test/partner-code.live.test.mjs     (cwd backend-api-gateway)
// Env: GATEWAY_TEST_URL (default http://localhost:4000), AUTH_SERVICE_URL (container env),
// LIVE_TEST_USERNAME / LIVE_TEST_PASSWORD (default: the development seed Super Admin, dev only).
// Rows use the BT21GW name prefix and are deleted in `after`.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

const GATEWAY = process.env.GATEWAY_TEST_URL ?? "http://localhost:4000";
const AUTH = process.env.AUTH_SERVICE_URL ?? "http://localhost:3101";
const USERNAME = process.env.LIVE_TEST_USERNAME ?? "superadmin@demo.com";
const PASSWORD = process.env.LIVE_TEST_PASSWORD ?? "password123";
let cookie = "";

async function trpc(kind, path, input) {
  const url = kind === "query"
    ? `${GATEWAY}/trpc/${path}${input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`}`
    : `${GATEWAY}/trpc/${path}`;
  const response = await fetch(url, {
    method: kind === "query" ? "GET" : "POST",
    headers: { cookie, ...(kind === "query" ? {} : { "content-type": "application/json" }) },
    body: kind === "query" ? undefined : JSON.stringify(input),
    signal: AbortSignal.timeout(8_000),
  });
  const payload = await response.json();
  return { status: response.status, data: payload.result?.data, error: payload.error?.data };
}

const address = { name: "BT21GW HQ", address: "1 Road", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10110", isDefault: true };
const bodies = {
  customer: (code) => ({ name: `BT21GW ${code}`, code, currencyCode: "THB", active: true, firstName: "Bt", middleName: null, lastName: null, phone: null, email: "bt21gw@example.com", invoiceAddresses: [{ ...address, taxId: null }], shippingAddresses: [address] }),
  vendor: (code) => ({ name: `BT21GW ${code}`, code, currencyCode: "THB", active: true, firstName: "Bt", middleName: null, lastName: null, phone: null, email: "bt21gw@example.com", invoiceAddresses: [{ ...address, taxId: null }] }),
};
const created = [];

before(async () => {
  const response = await fetch(`${AUTH}/api/auth/sign-in/username`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: process.env.FRONTEND_URL ?? "http://localhost:3000" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
    signal: AbortSignal.timeout(8_000),
  });
  assert.equal(response.status, 200, "sign-in failed (set LIVE_TEST_USERNAME / LIVE_TEST_PASSWORD)");
  cookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
});

after(async () => {
  for (const [entity, id] of created) await trpc("mutation", `${entity}.delete`, { id });
});

for (const [entity, prefix, taken] of [["customer", "C", "CUSTOMER_CODE_TAKEN"], ["vendor", "V", "VENDOR_CODE_TAKEN"]]) {
  describe(`${entity} via gateway`, () => {
    let suggested;
    it(`IT-GW-PC-LIVE-01 ${entity}.nextCode → {code:"${prefix}nnn"}`, async () => {
      const response = await trpc("query", `${entity}.nextCode`);
      assert.equal(response.status, 200);
      assert.match(response.data.code, new RegExp(`^${prefix}[0-9]{3,}$`));
      suggested = response.data.code;
    });
    it(`IT-GW-PC-LIVE-02 ${entity}.create without code / empty → 400 VALIDATION_ERROR`, async () => {
      const { code: _omit, ...missing } = bodies[entity]("x");
      const noCode = await trpc("mutation", `${entity}.create`, missing);
      assert.equal(noCode.status, 400);
      assert.equal(noCode.error.domainCode, "VALIDATION_ERROR");
      assert.deepEqual(noCode.error.fieldErrors, [{ path: "code", code: "invalid_type" }]);
      const empty = await trpc("mutation", `${entity}.create`, bodies[entity]("  "));
      assert.equal(empty.status, 400);
      assert.deepEqual(empty.error.fieldErrors, [{ path: "code", code: "required" }]);
    });
    it(`IT-GW-PC-LIVE-03 ${entity}.create with the suggestion → 200; next suggestion advances; duplicate → 409 ${taken}`, async () => {
      const ok = await trpc("mutation", `${entity}.create`, bodies[entity](suggested));
      assert.equal(ok.status, 200);
      created.push([entity, ok.data.id]);
      const next = await trpc("query", `${entity}.nextCode`);
      assert.equal(Number(next.data.code.slice(1)), Number(suggested.slice(1)) + 1);
      const duplicate = await trpc("mutation", `${entity}.create`, bodies[entity](suggested.toLowerCase()));
      assert.equal(duplicate.status, 409);
      assert.equal(duplicate.error.domainCode, taken);
      assert.deepEqual(duplicate.error.fieldErrors, [{ path: "code", code: "duplicate" }]);
    });
  });
}

describe("IT-GW-PC-LIVE-04 unauthenticated", () => {
  it("customer.nextCode / vendor.nextCode without a session → 401 UNAUTHORIZED", async () => {
    for (const path of ["customer.nextCode", "vendor.nextCode"]) {
      const response = await fetch(`${GATEWAY}/trpc/${path}`, { signal: AbortSignal.timeout(8_000) });
      assert.equal(response.status, 401);
    }
  });
});
