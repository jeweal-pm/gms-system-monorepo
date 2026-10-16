import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PARTNER_TIMEOUT_MS } from "../../src/trpc/partner-client";
import {
  address, caller, customerDetail, customerInput, EXPECTED, failure, ID, invoiceAddress, json, withMeta,
} from "../partner-shared/fixtures";

/**
 * UT-CUS-G20…G38:`customer.*` tRPC procedures through the real permission middleware and the real
 * `callPartner` (fetch is stubbed at the network boundary): ADR-0016 `customer:<ACTION>` rules,
 * request shape, partner error → domain error mapping, timeouts and output validation.
 */

type Procedure = (input?: unknown) => Promise<unknown>;
const fetchMock = vi.fn();
const proc = (permissions: string[], name: string, options?: Parameters<typeof caller>[1]) =>
  (caller(permissions, options).customer as unknown as Record<string, Procedure>)[name];

const PROCEDURES = [
  { name: "list", action: "VIEW", input: {}, reply: { items: [], nextCursor: null, total: 0 } },
  { name: "get", action: "VIEW", input: { id: ID }, reply: customerDetail() },
  { name: "options", action: "VIEW", input: undefined, reply: { currencies: [], countries: [] } },
  { name: "nextCode", action: "ADD", input: undefined, reply: { code: "C001" } },
  { name: "create", action: "ADD", input: customerInput(), reply: { id: ID, updatedAt: EXPECTED } },
  { name: "update", action: "EDIT", input: withMeta(customerInput()), reply: { id: ID, updatedAt: EXPECTED } },
  { name: "delete", action: "DELETE", input: { id: ID }, reply: { ok: true } },
] as const;
const ACTIONS = ["VIEW", "ADD", "EDIT", "DELETE"];

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("PARTNER_SERVICE_URL", "http://partner.test");
  vi.stubEnv("PARTNER_SERVICE_TOKEN", "t".repeat(40));
});

afterEach(() => {
  fetchMock.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const sent = (index = 0) => {
  const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit];
  return { url, method: init.method, headers: init.headers as Record<string, string>, body: init.body === undefined ? undefined : JSON.parse(String(init.body)), redirect: init.redirect };
};

describe("permissions (ADR-0016, customer:<ACTION>)", () => {
  it.each(PROCEDURES)("UT-CUS-G20 $name is allowed with customer:$action and with Super Admin", async ({ name, action, input, reply }) => {
    fetchMock.mockImplementation(async () => json(200, reply));
    await expect(proc([`customer:${action}`], name)(input)).resolves.toBeDefined();
    await expect(proc([], name, { superAdmin: true })(input)).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(PROCEDURES)("UT-CUS-G21 $name is denied with every other customer action, vendor:$action or nothing — partner not called", async ({ name, action, input }) => {
    for (const permissions of [ACTIONS.filter((other) => other !== action).map((other) => `customer:${other}`), [`vendor:${action}`], [`customer:${action}x`], []]) {
      expect(await failure(proc(permissions, name)(input))).toEqual({ code: "FORBIDDEN", domainCode: "PERMISSION_DENIED", fieldErrors: null });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("UT-CUS-G22 requires a session and a usable license before the permission check", async () => {
    expect((await failure(proc(["customer:VIEW"], "list", { session: false })({}))).code).toBe("UNAUTHORIZED");
    expect(await failure(proc(["customer:VIEW"], "list", { license: "EXPIRED" })({}))).toMatchObject({ code: "FORBIDDEN", domainCode: "LICENSE_EXPIRED" });
    expect(await failure(proc([], "list", { superAdmin: true, license: "UNVERIFIABLE" })({}))).toMatchObject({ code: "INTERNAL_SERVER_ERROR", domainCode: "LICENSE_UNVERIFIABLE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("partner requests", () => {
  beforeEach(() => fetchMock.mockImplementation(async () => json(200, { items: [], nextCursor: null, total: 0 })));

  it("UT-CUS-G23 list forwards q/active/cursor/limit (not direction) with service token and actor", async () => {
    await proc(["customer:VIEW"], "list")({ q: " acme ", active: false, cursor: "abc_-", direction: "forward", limit: 20 });
    const request = sent();
    expect(request.url).toBe("http://partner.test/internal/v1/customers?limit=20&q=acme&active=false&cursor=abc_-");
    expect(request).toMatchObject({ method: "GET", body: undefined, redirect: "error", headers: { authorization: `Bearer ${"t".repeat(40)}`, "x-actor-user-id": "user-1" } });
  });

  it("UT-CUS-G24 list uses the default limit 50 and ignores a null cursor from useInfiniteQuery", async () => {
    await proc(["customer:VIEW"], "list")({ cursor: null });
    expect(sent().url).toBe("http://partner.test/internal/v1/customers?limit=50");
  });

  it("UT-CUS-G25 get/options/nextCode/delete call their partner routes", async () => {
    fetchMock.mockImplementationOnce(async () => json(200, customerDetail()))
      .mockImplementationOnce(async () => json(200, { currencies: [], countries: [] }))
      .mockImplementationOnce(async () => json(200, { code: "C007" }))
      .mockImplementationOnce(async () => json(200, { ok: true }));
    await proc([], "get", { superAdmin: true })({ id: ID });
    await proc([], "options", { superAdmin: true })();
    await expect(proc([], "nextCode", { superAdmin: true })()).resolves.toEqual({ code: "C007" });
    await expect(proc([], "delete", { superAdmin: true })({ id: ID })).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls.map((_call, index) => `${sent(index).method} ${sent(index).url}`)).toEqual([
      `GET http://partner.test/internal/v1/customers/${ID}`,
      "GET http://partner.test/internal/v1/customers/options",
      "GET http://partner.test/internal/v1/customers/next-code",
      `DELETE http://partner.test/internal/v1/customers/${ID}`,
    ]);
  });

  it("UT-CUS-G26 create POSTs the validated, normalized input as JSON", async () => {
    fetchMock.mockImplementation(async () => json(200, { id: ID, updatedAt: EXPECTED }));
    await expect(proc(["customer:ADD"], "create")(customerInput({ code: " C001 ", email: " Ann@Example.COM " }))).resolves.toEqual({ id: ID, updatedAt: EXPECTED });
    const request = sent();
    expect(request).toMatchObject({ method: "POST", url: "http://partner.test/internal/v1/customers", headers: { "content-type": "application/json" } });
    expect(request.body).toMatchObject({ code: "C001", email: "ann@example.com" });
  });

  it("UT-CUS-G27 update PUTs to /customers/:id with expectedUpdatedAt and without id in the body", async () => {
    fetchMock.mockImplementation(async () => json(200, { id: ID, updatedAt: EXPECTED }));
    await proc(["customer:EDIT"], "update")(withMeta(customerInput()));
    const request = sent();
    expect(request).toMatchObject({ method: "PUT", url: `http://partner.test/internal/v1/customers/${ID}` });
    expect(request.body).toMatchObject({ expectedUpdatedAt: EXPECTED });
    expect(request.body).not.toHaveProperty("id");
  });

  it("UT-CUS-G28 rejects invalid input before partner (id, limit, cursor, direction, code)", async () => {
    const admin = { superAdmin: true };
    expect(await failure(proc([], "get", admin)({ id: "1" }))).toMatchObject({ code: "BAD_REQUEST", domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "id", code: "invalid_format" }] });
    expect(await failure(proc([], "list", admin)({ limit: 51 }))).toMatchObject({ fieldErrors: [{ path: "limit", code: "too_big" }] });
    expect(await failure(proc([], "list", admin)({ cursor: "a".repeat(201) }))).toMatchObject({ fieldErrors: [{ path: "cursor", code: "too_big" }] });
    expect(await failure(proc([], "list", admin)({ direction: "sideways" }))).toMatchObject({ fieldErrors: [{ path: "direction", code: "invalid_value" }] });
    expect(await failure(proc([], "create", admin)(customerInput({ code: "" })))).toMatchObject({ fieldErrors: [{ path: "code", code: "required" }] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("default address rule at the gateway", () => {
  it("UT-CUS-G29 create/update with two defaults in a type → multiple_defaults per array, partner not called", async () => {
    const two = { invoiceAddresses: [invoiceAddress({ isDefault: true }), invoiceAddress({ isDefault: true })], shippingAddresses: [address({ isDefault: true }), address({ isDefault: true })] };
    const expected = { code: "BAD_REQUEST", domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "invoiceAddresses", code: "multiple_defaults" }, { path: "shippingAddresses", code: "multiple_defaults" }] };
    expect(await failure(proc(["customer:ADD"], "create")(customerInput(two)))).toEqual(expected);
    expect(await failure(proc(["customer:EDIT"], "update")(withMeta(customerInput(two))))).toEqual(expected);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("UT-CUS-G30 zero defaults pass through unchanged (partner sets the first one)", async () => {
    fetchMock.mockImplementation(async () => json(200, { id: ID, updatedAt: EXPECTED }));
    await proc(["customer:ADD"], "create")(customerInput({ invoiceAddresses: [invoiceAddress(), invoiceAddress()], shippingAddresses: [address()] }));
    expect(sent().body.invoiceAddresses.map((item: { isDefault: boolean }) => item.isDefault)).toEqual([false, false]);
  });
});

describe("partner error → domain error", () => {
  const update = () => proc(["customer:EDIT"], "update")(withMeta(customerInput()));

  it.each([
    ["404 without a code", 404, {}, { code: "NOT_FOUND", domainCode: "CUSTOMER_NOT_FOUND", fieldErrors: null }],
    ["404 CUSTOMER_NOT_FOUND", 404, { error: { code: "CUSTOMER_NOT_FOUND", message: "x", fieldErrors: [{ path: "id", code: "x" }] } }, { code: "NOT_FOUND", domainCode: "CUSTOMER_NOT_FOUND", fieldErrors: null }],
    ["409 CUSTOMER_STALE", 409, { error: { code: "CUSTOMER_STALE", message: "x" } }, { code: "CONFLICT", domainCode: "CUSTOMER_STALE", fieldErrors: null }],
    ["409 CUSTOMER_CODE_TAKEN", 409, { error: { code: "CUSTOMER_CODE_TAKEN", fieldErrors: [{ path: "code", code: "duplicate" }] } }, { code: "CONFLICT", domainCode: "CUSTOMER_CODE_TAKEN", fieldErrors: [{ path: "code", code: "duplicate" }] }],
    ["400 with field errors", 400, { error: { code: "VALIDATION_ERROR", fieldErrors: [{ path: "currencyCode", code: "unknown" }, { bad: 1 }] } }, { code: "BAD_REQUEST", domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "currencyCode", code: "unknown" }] }],
    ["400 with an unusable code", 400, { error: { code: "drop table" } }, { code: "BAD_REQUEST", domainCode: "VALIDATION_ERROR", fieldErrors: null }],
    ["401 token rejected", 401, { error: { code: "UNAUTHORIZED" } }, { code: "SERVICE_UNAVAILABLE", domainCode: "PARTNER_UNAVAILABLE", fieldErrors: null }],
    ["403", 403, {}, { code: "SERVICE_UNAVAILABLE", domainCode: "PARTNER_UNAVAILABLE", fieldErrors: null }],
    ["503", 503, { error: { code: "PARTNER_UNAVAILABLE" } }, { code: "SERVICE_UNAVAILABLE", domainCode: "PARTNER_UNAVAILABLE", fieldErrors: null }],
    ["500", 500, { error: { code: "INTERNAL_SERVER_ERROR", message: "stack" } }, { code: "INTERNAL_SERVER_ERROR", domainCode: "INTERNAL_SERVER_ERROR", fieldErrors: null }],
    ["413", 413, {}, { code: "PAYLOAD_TOO_LARGE", domainCode: "PAYLOAD_TOO_LARGE", fieldErrors: null }],
  ])("UT-CUS-G31 maps %s", async (_label, status, body, expected) => {
    fetchMock.mockImplementation(async () => json(status, body));
    expect(await failure(update())).toEqual(expected);
  });

  it("UT-CUS-G32 never forwards the upstream message", async () => {
    fetchMock.mockImplementation(async () => json(409, { error: { code: "CUSTOMER_STALE", message: "secret detail" } }));
    const error = await update().catch((caught: Error) => caught);
    expect(String((error as Error).message)).toBe("CUSTOMER_STALE");
  });

  it("UT-CUS-G33 maps a network failure to PARTNER_UNAVAILABLE", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await failure(proc(["customer:VIEW"], "list")({}))).toEqual({ code: "SERVICE_UNAVAILABLE", domainCode: "PARTNER_UNAVAILABLE", fieldErrors: null });
  });
});

describe("timeouts", () => {
  /** Simulates the timer firing: the signal is already aborted with a TimeoutError, and fetch honors it. */
  function expireTimeouts() {
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => AbortSignal.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError")));
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      if (init.signal?.aborted) throw init.signal.reason;
      return json(200, {});
    });
    return timeout;
  }

  it.each([
    ["list", { input: {}, permission: "customer:VIEW", ms: PARTNER_TIMEOUT_MS.read }],
    ["get", { input: { id: ID }, permission: "customer:VIEW", ms: PARTNER_TIMEOUT_MS.read }],
    ["nextCode", { input: undefined, permission: "customer:ADD", ms: PARTNER_TIMEOUT_MS.read }],
    ["create", { input: customerInput(), permission: "customer:ADD", ms: PARTNER_TIMEOUT_MS.write }],
    ["update", { input: withMeta(customerInput()), permission: "customer:EDIT", ms: PARTNER_TIMEOUT_MS.write }],
    ["delete", { input: { id: ID }, permission: "customer:DELETE", ms: PARTNER_TIMEOUT_MS.write }],
  ])("UT-CUS-G34 %s times out after its budget → SERVICE_UNAVAILABLE PARTNER_UNAVAILABLE", async (name, { input, permission, ms }) => {
    const timeout = expireTimeouts();
    expect(await failure(proc([permission], name)(input))).toEqual({ code: "SERVICE_UNAVAILABLE", domainCode: "PARTNER_UNAVAILABLE", fieldErrors: null });
    expect(timeout).toHaveBeenCalledWith(ms);
  });

  it("UT-CUS-G35 read budget is 3 s and write budget 5 s", () => {
    expect(PARTNER_TIMEOUT_MS).toEqual({ read: 3_000, write: 5_000 });
  });
});

describe("output validation", () => {
  it("UT-CUS-G36 strips unknown upstream fields", async () => {
    fetchMock.mockImplementation(async () => json(200, { ...customerDetail(), createdBy: "user-9", internal: true }));
    const detail = await proc(["customer:VIEW"], "get")({ id: ID });
    expect(detail).toEqual(customerDetail());
  });

  it.each([
    ["list over 50 items", "list", {}, { items: Array.from({ length: 51 }, () => ({ id: ID, name: "a", code: "C001", active: true, updatedAt: EXPECTED })), nextCursor: null, total: 51 }],
    ["detail without shipping addresses", "get", { id: ID }, { ...customerDetail(), shippingAddresses: undefined }],
    ["nextCode with a wrong prefix", "nextCode", undefined, { code: "X001" }],
    ["delete without ok", "delete", { id: ID }, { ok: false }],
  ])("UT-CUS-G37 a malformed partner reply (%s) becomes PARTNER_UNAVAILABLE", async (_label, name, input, reply) => {
    fetchMock.mockImplementation(async () => json(200, reply));
    expect((await failure(proc([], name, { superAdmin: true })(input))).domainCode).toBe("PARTNER_UNAVAILABLE");
  });

  it("UT-CUS-G38 a reply over 1 MiB is refused as PARTNER_UNAVAILABLE", async () => {
    fetchMock.mockImplementation(async () => new Response("x".repeat(1_048_577), { status: 200 }));
    expect((await failure(proc(["customer:VIEW"], "list")({}))).domainCode).toBe("PARTNER_UNAVAILABLE");
  });
});
