import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * IT-GW-PC-LIVE-01…04 (ADR-0021) — OPT-IN live end-to-end: HTTP `/trpc` on the gateway (session, license,
 * permission) → partner → PostgreSQL. Ported from the former `node:test` file `test/partner-code.live.test.mjs`
 * (2026-10-16).
 *
 * INV-20261016-001 guard: skipped unless `PARTNER_LIVE_TESTS=1`, so the default `pnpm test` never signs in or
 * writes data; refused outright when `NODE_ENV=production`. The development seed Super Admin is used only
 * behind that opt-in (override with LIVE_TEST_USERNAME / LIVE_TEST_PASSWORD). Run inside the dev gateway container:
 *   PARTNER_LIVE_TESTS=1 pnpm exec vitest run test/partner-shared/partner-code.live.test.ts
 * Env: GATEWAY_TEST_URL (default http://localhost:4000), AUTH_SERVICE_URL (container env), FRONTEND_URL.
 * Rows use the `BT21GW` name prefix and are deleted in `afterAll`.
 */

const LIVE = process.env.PARTNER_LIVE_TESTS === "1";
if (LIVE && process.env.NODE_ENV === "production") {
  throw new Error("PARTNER_LIVE_TESTS is refused when NODE_ENV=production (INV-20261016-001)");
}

const GATEWAY = process.env.GATEWAY_TEST_URL ?? "http://localhost:4000";
const AUTH = process.env.AUTH_SERVICE_URL ?? "http://localhost:3101";
let cookie = "";

type TrpcReply = { status: number; data?: Record<string, unknown>; error?: { domainCode?: string; fieldErrors?: unknown } };

async function trpc(kind: "query" | "mutation", path: string, input?: unknown): Promise<TrpcReply> {
  const url = kind === "query"
    ? `${GATEWAY}/trpc/${path}${input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`}`
    : `${GATEWAY}/trpc/${path}`;
  const response = await fetch(url, {
    method: kind === "query" ? "GET" : "POST",
    headers: { cookie, ...(kind === "query" ? {} : { "content-type": "application/json" }) },
    body: kind === "query" ? undefined : JSON.stringify(input),
    signal: AbortSignal.timeout(8_000),
  });
  const payload = (await response.json()) as { result?: { data?: Record<string, unknown> }; error?: { data?: TrpcReply["error"] } };
  return { status: response.status, data: payload.result?.data, error: payload.error?.data };
}

const address = { name: "BT21GW HQ", address: "1 Road", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10110", isDefault: true };
const bodies = {
  customer: (code: unknown) => ({ name: `BT21GW ${String(code)}`, code, currencyCode: "THB", active: true, firstName: "Bt", middleName: null, lastName: null, phone: null, email: "bt21gw@example.com", invoiceAddresses: [{ ...address, taxId: null }], shippingAddresses: [address] }),
  vendor: (code: unknown) => ({ name: `BT21GW ${String(code)}`, code, currencyCode: "THB", active: true, firstName: "Bt", middleName: null, lastName: null, phone: null, email: "bt21gw@example.com", invoiceAddresses: [{ ...address, taxId: null }] }),
};

describe.skipIf(!LIVE)("ADR-0021 gateway live end-to-end (PARTNER_LIVE_TESTS=1)", () => {
  const created: [string, string][] = [];

  beforeAll(async () => {
    const response = await fetch(`${AUTH}/api/auth/sign-in/username`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: process.env.FRONTEND_URL ?? "http://localhost:3000" },
      body: JSON.stringify({ username: process.env.LIVE_TEST_USERNAME ?? "superadmin@demo.com", password: process.env.LIVE_TEST_PASSWORD ?? "password123" }),
      signal: AbortSignal.timeout(8_000),
    });
    expect(response.status, "sign-in failed (set LIVE_TEST_USERNAME / LIVE_TEST_PASSWORD)").toBe(200);
    cookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  });

  afterAll(async () => {
    for (const [entity, id] of created) await trpc("mutation", `${entity}.delete`, { id });
  });

  describe.each([["customer", "C", "CUSTOMER_CODE_TAKEN"], ["vendor", "V", "VENDOR_CODE_TAKEN"]] as const)("%s via gateway", (entity, prefix, taken) => {
    let suggested = "";

    it(`IT-GW-PC-LIVE-01 ${entity}.nextCode → {code:"${prefix}nnn"}`, async () => {
      const response = await trpc("query", `${entity}.nextCode`);
      expect(response.status).toBe(200);
      expect(response.data?.code).toMatch(new RegExp(`^${prefix}[0-9]{3,}$`));
      suggested = String(response.data?.code);
    });

    it(`IT-GW-PC-LIVE-02 ${entity}.create without code / empty → 400 VALIDATION_ERROR`, async () => {
      const { code: _omit, ...missing } = bodies[entity]("x");
      const noCode = await trpc("mutation", `${entity}.create`, missing);
      expect(noCode.status).toBe(400);
      expect(noCode.error?.domainCode).toBe("VALIDATION_ERROR");
      expect(noCode.error?.fieldErrors).toEqual([{ path: "code", code: "invalid_type" }]);
      const empty = await trpc("mutation", `${entity}.create`, bodies[entity]("  "));
      expect(empty.status).toBe(400);
      expect(empty.error?.fieldErrors).toEqual([{ path: "code", code: "required" }]);
    });

    it(`IT-GW-PC-LIVE-03 ${entity}.create with the suggestion → 200; next suggestion advances; duplicate → 409 ${taken}`, async () => {
      const ok = await trpc("mutation", `${entity}.create`, bodies[entity](suggested));
      expect(ok.status).toBe(200);
      created.push([entity, String(ok.data?.id)]);
      const next = await trpc("query", `${entity}.nextCode`);
      expect(Number(String(next.data?.code).slice(1))).toBe(Number(suggested.slice(1)) + 1);
      const duplicate = await trpc("mutation", `${entity}.create`, bodies[entity](suggested.toLowerCase()));
      expect(duplicate.status).toBe(409);
      expect(duplicate.error?.domainCode).toBe(taken);
      expect(duplicate.error?.fieldErrors).toEqual([{ path: "code", code: "duplicate" }]);
    });
  });

  it("IT-GW-PC-LIVE-04 customer.nextCode / vendor.nextCode without a session → 401 UNAUTHORIZED", async () => {
    for (const path of ["customer.nextCode", "vendor.nextCode"]) {
      const response = await fetch(`${GATEWAY}/trpc/${path}`, { signal: AbortSignal.timeout(8_000) });
      expect(response.status).toBe(401);
    }
  });
});
