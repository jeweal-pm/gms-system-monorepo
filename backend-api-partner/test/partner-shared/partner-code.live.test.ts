import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * IT-PC-01…08 (ADR-0021) — OPT-IN live integration: partner HTTP (service-token guard, validation, service)
 * → PostgreSQL. Ported from the former `node:test` file `test/partner-code.integration.test.mjs` (2026-10-16).
 *
 * INV-20261016-001 guard: skipped unless `PARTNER_LIVE_TESTS=1`, so the default `pnpm test` never touches a
 * database or a running service; refused outright when `NODE_ENV=production`. The Prisma client is imported only
 * after the guard passes. Run inside the dev partner container only:
 *   PARTNER_LIVE_TESTS=1 pnpm exec vitest run test/partner-shared/partner-code.live.test.ts
 * Env: PARTNER_SERVICE_TOKEN (never printed), PARTNER_TEST_URL (default http://localhost:3201).
 * Rows use the `BT21` name prefix and are deleted in `afterAll`; next-code assertions are relative to the value
 * read first (avoid parallel C…/V… creates while running).
 */

const LIVE = process.env.PARTNER_LIVE_TESTS === "1";
if (LIVE && process.env.NODE_ENV === "production") {
  throw new Error("PARTNER_LIVE_TESTS is refused when NODE_ENV=production (INV-20261016-001)");
}

const BASE = process.env.PARTNER_TEST_URL ?? "http://localhost:3201";
const ACTOR = "bt21-integration";

type Json = { error?: { code: string; fieldErrors?: unknown }; [key: string]: unknown } | null;
type Table = "customer" | "vendor";
type LivePrisma = {
  customer: { count(args: unknown): Promise<number>; findUnique(args: unknown): Promise<unknown> };
  vendor: { count(args: unknown): Promise<number>; findUnique(args: unknown): Promise<unknown> };
  $queryRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  $disconnect(): Promise<void>;
};

let prisma: LivePrisma;
let token = "";

async function call(method: string, path: string, body?: unknown, options: { token?: string } = {}) {
  const used = options.token ?? token;
  const headers: Record<string, string> = { "x-actor-user-id": ACTOR };
  if (used) headers.authorization = `Bearer ${used}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5_000) });
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : null) as Json };
}

const address = { name: "BT21 HQ", address: "1 Road", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10110", isDefault: true };
const ENTITIES = [
  {
    entity: "customer", prefix: "C", path: "/internal/v1/customers", taken: "CUSTOMER_CODE_TAKEN", table: "customer" as Table,
    body: (code: unknown) => ({ name: `BT21 customer ${String(code)}`, code, currencyCode: "THB", active: true, firstName: "Bt", middleName: null, lastName: null, phone: null, email: "bt21@example.com", invoiceAddresses: [{ ...address, taxId: null }], shippingAddresses: [address] }),
  },
  {
    entity: "vendor", prefix: "V", path: "/internal/v1/vendors", taken: "VENDOR_CODE_TAKEN", table: "vendor" as Table,
    body: (code: unknown) => ({ name: `BT21 vendor ${String(code)}`, code, currencyCode: "THB", active: true, firstName: "Bt", middleName: null, lastName: null, phone: null, email: "bt21@example.com", invoiceAddresses: [{ ...address, taxId: null }] }),
  },
];

const pad = (n: number) => String(n).padStart(3, "0");
const numberOf = (prefix: string, code: unknown) => {
  expect(code).toMatch(new RegExp(`^${prefix}[0-9]{3,}$`));
  return Number(String(code).slice(1));
};

describe.skipIf(!LIVE)("ADR-0021 partner live integration (PARTNER_LIVE_TESTS=1)", () => {
  const created: { path: string; id: string }[] = [];

  beforeAll(async () => {
    token = process.env.PARTNER_SERVICE_TOKEN ?? "";
    if (token.length < 32) throw new Error("PARTNER_SERVICE_TOKEN must be set for live tests");
    ({ prisma } = (await import("../../src/database/prisma-client")) as unknown as { prisma: LivePrisma });
  });

  afterAll(async () => {
    for (const { path, id } of created) await call("DELETE", `${path}/${id}`);
    await prisma?.$disconnect();
  });

  describe.each(ENTITIES)("$entity", (spec) => {
    const { prefix, path, taken } = spec;
    let n0 = 0;
    let firstId = "";
    let firstUpdatedAt = "";

    it(`IT-PC-01 GET ${path}/next-code → 200 {code:"${prefix}nnn"} (not parsed as :id)`, async () => {
      const response = await call("GET", `${path}/next-code`);
      expect(response.status).toBe(200);
      expect(Object.keys(response.body ?? {})).toEqual(["code"]);
      n0 = numberOf(prefix, response.body?.code);
    });

    it("IT-PC-02 next-code without / with a wrong service token → 401", async () => {
      expect((await call("GET", `${path}/next-code`, undefined, { token: "" })).status).toBe(401);
      expect((await call("GET", `${path}/next-code`, undefined, { token: "x".repeat(48) })).status).toBe(401);
    });

    it("IT-PC-03 create without code / empty / blank / null → 400 VALIDATION_ERROR, nothing written", async () => {
      const { code: _omit, ...missing } = spec.body("x");
      const cases: [unknown, string][] = [[missing, "invalid_type"], [spec.body(""), "required"], [spec.body("   "), "required"], [spec.body(null), "invalid_type"]];
      for (const [body, code] of cases) {
        const response = await call("POST", path, body);
        expect(response.status).toBe(400);
        expect(response.body?.error?.code).toBe("VALIDATION_ERROR");
        expect(response.body?.error?.fieldErrors).toEqual([{ path: "code", code }]);
      }
      expect(await prisma[spec.table].count({ where: { name: { startsWith: "BT21" } } })).toBe(0);
    });

    it("IT-PC-04 create with the suggested code → 201; next-code advances by one; code_key = lower(code)", async () => {
      const code = `${prefix}${pad(n0)}`;
      const response = await call("POST", path, spec.body(` ${code} `));
      expect(response.status).toBe(201);
      firstId = String(response.body?.id);
      firstUpdatedAt = String(response.body?.updatedAt);
      created.push({ path, id: firstId });
      expect(await prisma[spec.table].findUnique({ where: { id: firstId }, select: { code: true, codeKey: true } })).toEqual({ code, codeKey: code.toLowerCase() });
      expect((await call("GET", `${path}/next-code`)).body?.code).toBe(`${prefix}${pad(n0 + 1)}`);
    });

    it("IT-PC-05 lowercase prefix counts; >18-digit and non-matching codes are ignored", async () => {
      const lower = await call("POST", path, spec.body(`${prefix.toLowerCase()}${pad(n0 + 5)}`));
      expect(lower.status).toBe(201);
      created.push({ path, id: String(lower.body?.id) });
      for (const code of [`${prefix}${"9".repeat(19)}`, `${prefix}-9999`, `${prefix}M9999`]) {
        const response = await call("POST", path, spec.body(code));
        expect(response.status, code).toBe(201);
        created.push({ path, id: String(response.body?.id) });
      }
      expect((await call("GET", `${path}/next-code`)).body?.code).toBe(`${prefix}${pad(n0 + 6)}`);
    });

    it(`IT-PC-06 duplicate code (case + spaces) → 409 ${taken}`, async () => {
      const response = await call("POST", path, spec.body(` ${prefix.toLowerCase()}${pad(n0)}  `));
      expect(response.status).toBe(409);
      expect(response.body?.error?.code).toBe(taken);
      expect(response.body?.error?.fieldErrors).toEqual([{ path: "code", code: "duplicate" }]);
    });

    it("IT-PC-07 update with empty code → 400 required; with a new code → 200 and code_key updated", async () => {
      const empty = await call("PUT", `${path}/${firstId}`, { expectedUpdatedAt: firstUpdatedAt, ...spec.body("  ") });
      expect(empty.status).toBe(400);
      expect(empty.body?.error?.fieldErrors).toEqual([{ path: "code", code: "required" }]);
      const renamed = await call("PUT", `${path}/${firstId}`, { expectedUpdatedAt: firstUpdatedAt, ...spec.body("BT21-Renamed") });
      expect(renamed.status).toBe(200);
      expect(await prisma[spec.table].findUnique({ where: { id: firstId }, select: { code: true, codeKey: true } })).toEqual({ code: "BT21-Renamed", codeKey: "bt21-renamed" });
    });
  });

  it("IT-PC-08 schema: code and code_key are NOT NULL", async () => {
    const rows = await prisma.$queryRaw`
      SELECT table_name AS "table", column_name AS "column", is_nullable AS "nullable" FROM information_schema.columns
      WHERE table_schema = 'partner' AND table_name IN ('customer', 'vendor') AND column_name IN ('code', 'code_key')
      ORDER BY 1, 2`;
    expect(rows).toEqual([
      { table: "customer", column: "code", nullable: "NO" }, { table: "customer", column: "code_key", nullable: "NO" },
      { table: "vendor", column: "code", nullable: "NO" }, { table: "vendor", column: "code_key", nullable: "NO" },
    ]);
  });
});
