import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { TRPCError } from "@trpc/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { createCustomerInputSchema, customerNextCodeOutputSchema, updateCustomerInputSchema } from "../../src/trpc/customer-schemas";
import { describeError } from "../../src/trpc/domain-error";
import { nextCodeOutputSchema, partnerScalarFields, requiredCodeSchema } from "../../src/trpc/partner-schemas";
import { createVendorInputSchema, updateVendorInputSchema, vendorNextCodeOutputSchema } from "../../src/trpc/vendor-schemas";
import { caller, customerInput, failure, formatted, vendorInput, withMeta } from "./fixtures";

/**
 * ADR-0021 gateway cases ported from the former `node:test` file `test/partner-code.test.mjs` (2026-10-16, same IDs).
 * UT-GW-PC-01…04: schema + error formatting units. IT-GW-PC-01…04: tRPC caller → permission middleware →
 * real `callPartner` (real fetch, bounded read, error mapping, output validation) → in-process stub partner HTTP
 * server on 127.0.0.1 (no database, no session service).
 */

describe("UT-GW-PC-01 requiredCodeSchema / partnerScalarFields.code", () => {
  it("trims, 1..120", () => {
    expect(requiredCodeSchema.parse("  C001  ")).toBe("C001");
    expect(requiredCodeSchema.parse("a".repeat(120))).toHaveLength(120);
    expect(requiredCodeSchema.safeParse("a".repeat(121)).success).toBe(false);
    expect(partnerScalarFields.code).toBe(requiredCodeSchema);
  });
});

describe("UT-GW-PC-02 customer/vendor create+update inputs require code; describeError maps the custom code", () => {
  const cases: [string, z.ZodType, (code: unknown) => object][] = [
    ["customer.create", createCustomerInputSchema, (code) => customerInput({ code })],
    ["customer.update", updateCustomerInputSchema, (code) => withMeta(customerInput({ code }))],
    ["vendor.create", createVendorInputSchema, (code) => vendorInput({ code })],
    ["vendor.update", updateVendorInputSchema, (code) => withMeta(vendorInput({ code }))],
  ];

  it.each(cases)("%s", (_label, schema, build) => {
    expect((schema.parse(build(" X-1 ")) as { code: string }).code).toBe("X-1");
    for (const empty of ["", "   "]) {
      expect(formatted(schema, build(empty))).toEqual({ domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "code", code: "required" }] });
    }
    expect(formatted(schema, build(null))).toEqual({ domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "code", code: "invalid_type" }] });
    const { code: _omit, ...missing } = build("x") as Record<string, unknown>;
    expect(formatted(schema, missing)?.fieldErrors).toEqual([{ path: "code", code: "invalid_type" }]);
    expect(formatted(schema, build("a".repeat(121)))?.fieldErrors).toEqual([{ path: "code", code: "too_big" }]);
  });
});

describe("UT-GW-PC-03 describeError custom-code handling", () => {
  const withIssues = (issues: unknown[]) => new TRPCError({ code: "BAD_REQUEST", cause: Object.assign(new Error("x"), { issues }) });

  it("uses params.code only for custom issues with a non-empty string; otherwise the zod code / 'custom'", () => {
    const result = describeError(withIssues([
      { code: "custom", path: ["a"], params: { code: "multiple_defaults" } },
      { code: "custom", path: ["b"] },
      { code: "custom", path: ["c"], params: { code: 5 } },
      { code: "too_small", path: ["d"], params: { code: "ignored" } },
    ]));
    expect(result.fieldErrors).toEqual([
      { path: "a", code: "multiple_defaults" }, { path: "b", code: "custom" }, { path: "c", code: "custom" }, { path: "d", code: "too_small" },
    ]);
  });

  it("password-only policy failures still become PASSWORD_POLICY_VIOLATION", () => {
    expect(describeError(withIssues([{ code: "too_small", path: ["password"] }])).domainCode).toBe("PASSWORD_POLICY_VIOLATION");
  });
});

describe("UT-GW-PC-04 nextCode output schema", () => {
  it("accepts C001/V1000; rejects other shapes", () => {
    expect(customerNextCodeOutputSchema).toBe(nextCodeOutputSchema);
    expect(vendorNextCodeOutputSchema).toBe(nextCodeOutputSchema);
    for (const code of ["C001", "V999", "C1000", `V${"1".repeat(19)}`]) expect(nextCodeOutputSchema.safeParse({ code }).success, code).toBe(true);
    for (const code of ["C01", "c001", "X001", "C-001", "", `C${"1".repeat(20)}`]) expect(nextCodeOutputSchema.safeParse({ code }).success, code).toBe(false);
  });
});

// ---- integration: caller → middleware → callPartner → stub partner ----

type Seen = { method?: string; url?: string; auth?: string; actor?: string | string[] };
const requests: Seen[] = [];
let stubResponse: { status: number; body: unknown } = { status: 200, body: { code: "C001" } };
const server = createServer((request: IncomingMessage, response: ServerResponse) => {
  requests.push({ method: request.method, url: request.url, auth: request.headers.authorization, actor: request.headers["x-actor-user-id"] });
  response.writeHead(stubResponse.status, { "content-type": "application/json" });
  response.end(JSON.stringify(stubResponse.body));
});

describe("IT-GW-PC customer.nextCode / vendor.nextCode through the router", () => {
  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  });
  beforeEach(() => {
    vi.stubEnv("PARTNER_SERVICE_URL", `http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    vi.stubEnv("PARTNER_SERVICE_TOKEN", "t".repeat(48));
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  type Entity = "customer" | "vendor";
  const nextCode = (entity: Entity, permissions: string[], superAdmin = false) => caller(permissions, { superAdmin })[entity].nextCode();
  const ENTITIES: [Entity, string, string, string][] = [["customer", "C", "customers", "CUSTOMER_NOT_FOUND"], ["vendor", "V", "vendors", "VENDOR_NOT_FOUND"]];

  describe.each(ENTITIES)("%s", (entity, prefix, plural, notFound) => {
    it(`IT-GW-PC-01 ${entity}.nextCode with ${entity}:ADD → GET /internal/v1/${plural}/next-code, returns {code}`, async () => {
      requests.length = 0;
      stubResponse = { status: 200, body: { code: `${prefix}042`, extra: "stripped" } };
      expect(await nextCode(entity, [`${entity}:ADD`])).toEqual({ code: `${prefix}042` });
      expect(requests).toEqual([{ method: "GET", url: `/internal/v1/${plural}/next-code`, auth: `Bearer ${"t".repeat(48)}`, actor: "user-1" }]);
    });

    it(`IT-GW-PC-02 ${entity}.nextCode: Super Admin allowed; VIEW/EDIT only or other menu → PERMISSION_DENIED without calling partner`, async () => {
      stubResponse = { status: 200, body: { code: `${prefix}001` } };
      expect(await nextCode(entity, [], true)).toEqual({ code: `${prefix}001` });
      requests.length = 0;
      const other = entity === "customer" ? "vendor" : "customer";
      for (const permissions of [[`${entity}:VIEW`, `${entity}:EDIT`, `${entity}:DELETE`], [`${other}:ADD`], []]) {
        expect(await failure(nextCode(entity, permissions))).toEqual({ code: "FORBIDDEN", domainCode: "PERMISSION_DENIED", fieldErrors: null });
      }
      expect(requests).toHaveLength(0);
    });

    it(`IT-GW-PC-03 ${entity}.nextCode: malformed partner output / partner 503 → PARTNER_UNAVAILABLE; 404 → ${notFound}`, async () => {
      stubResponse = { status: 200, body: { code: "C01" } };
      expect((await failure(nextCode(entity, [], true))).domainCode).toBe("PARTNER_UNAVAILABLE");
      stubResponse = { status: 503, body: { error: { code: "PARTNER_UNAVAILABLE" } } };
      expect((await failure(nextCode(entity, [], true))).domainCode).toBe("PARTNER_UNAVAILABLE");
      stubResponse = { status: 404, body: {} };
      expect((await failure(nextCode(entity, [], true))).domainCode).toBe(notFound);
    });

    it(`IT-GW-PC-04 ${entity}.create with empty code → VALIDATION_ERROR {code:required} before partner; 409 from partner → ${entity.toUpperCase()}_CODE_TAKEN`, async () => {
      const build = entity === "customer" ? customerInput : vendorInput;
      const create = (input: unknown) => (caller([], { superAdmin: true })[entity].create as (value: unknown) => Promise<unknown>)(input);
      requests.length = 0;
      expect(await failure(create(build({ code: " " })))).toEqual({ code: "BAD_REQUEST", domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "code", code: "required" }] });
      expect(requests).toHaveLength(0);
      const taken = `${entity.toUpperCase()}_CODE_TAKEN`;
      stubResponse = { status: 409, body: { error: { code: taken, message: "x", fieldErrors: [{ path: "code", code: "duplicate" }] } } };
      expect(await failure(create(build({ code: `${prefix}001` })))).toEqual({ code: "CONFLICT", domainCode: taken, fieldErrors: [{ path: "code", code: "duplicate" }] });
      expect(requests).toHaveLength(1);
    });
  });
});
