import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PARTNER_TIMEOUT_MS } from "../../src/trpc/partner-client";
import {
  address, caller, EXPECTED, failure, ID, invoiceAddress, json, vendorDetail, vendorInput, withMeta,
} from "../partner-shared/fixtures";

/**
 * UT-VEN-G20…G34:`vendor.*` tRPC procedures through the real permission middleware and the real
 * `callPartner` (fetch stubbed at the network boundary): ADR-0016 `vendor:<ACTION>` rules, request
 * shape, partner error → domain error mapping, timeouts and output validation.
 */

type Procedure = (input?: unknown) => Promise<unknown>;
const fetchMock = vi.fn();
const proc = (permissions: string[], name: string, options?: Parameters<typeof caller>[1]) =>
  (caller(permissions, options).vendor as unknown as Record<string, Procedure>)[name];

const PROCEDURES = [
  { name: "list", action: "VIEW", input: {}, reply: { items: [], nextCursor: null, total: 0 } },
  { name: "get", action: "VIEW", input: { id: ID }, reply: vendorDetail() },
  { name: "options", action: "VIEW", input: undefined, reply: { currencies: [], countries: [] } },
  { name: "nextCode", action: "ADD", input: undefined, reply: { code: "V001" } },
  { name: "create", action: "ADD", input: vendorInput(), reply: { id: ID, updatedAt: EXPECTED } },
  { name: "update", action: "EDIT", input: withMeta(vendorInput()), reply: { id: ID, updatedAt: EXPECTED } },
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
  return { url, method: init.method, headers: init.headers as Record<string, string>, body: init.body === undefined ? undefined : JSON.parse(String(init.body)) };
};

describe("permissions (ADR-0016, vendor:<ACTION>)", () => {
  it.each(PROCEDURES)("UT-VEN-G20 $name is allowed with vendor:$action and with Super Admin", async ({ name, action, input, reply }) => {
    fetchMock.mockImplementation(async () => json(200, reply));
    await expect(proc([`vendor:${action}`], name)(input)).resolves.toBeDefined();
    await expect(proc([], name, { superAdmin: true })(input)).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(PROCEDURES)("UT-VEN-G21 $name is denied with every other vendor action, customer:$action or nothing — partner not called", async ({ name, action, input }) => {
    for (const permissions of [ACTIONS.filter((other) => other !== action).map((other) => `vendor:${other}`), [`customer:${action}`], []]) {
      expect(await failure(proc(permissions, name)(input))).toEqual({ code: "FORBIDDEN", domainCode: "PERMISSION_DENIED", fieldErrors: null });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("UT-VEN-G22 requires a session and a usable license", async () => {
    expect((await failure(proc(["vendor:VIEW"], "get", { session: false })({ id: ID }))).code).toBe("UNAUTHORIZED");
    expect(await failure(proc(["vendor:VIEW"], "get", { license: "REVOKED" })({ id: ID }))).toMatchObject({ code: "FORBIDDEN", domainCode: "LICENSE_REVOKED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("partner requests", () => {
  it("UT-VEN-G23 list forwards the query to /internal/v1/vendors (direction dropped)", async () => {
    fetchMock.mockImplementation(async () => json(200, { items: [], nextCursor: "next", total: 0 }));
    await expect(proc(["vendor:VIEW"], "list")({ q: "gem", active: true, cursor: "c1", direction: "backward" })).resolves.toEqual({ items: [], nextCursor: "next", total: 0 });
    expect(sent().url).toBe("http://partner.test/internal/v1/vendors?limit=50&q=gem&active=true&cursor=c1");
  });

  it("UT-VEN-G24 create POSTs and update PUTs without id; delete has no body", async () => {
    fetchMock.mockImplementation(async () => json(200, { id: ID, updatedAt: EXPECTED }));
    await proc(["vendor:ADD"], "create")(vendorInput({ code: " V009 " }));
    await proc(["vendor:EDIT"], "update")(withMeta(vendorInput()));
    fetchMock.mockImplementation(async () => json(200, { ok: true }));
    await proc(["vendor:DELETE"], "delete")({ id: ID });
    expect(sent(0)).toMatchObject({ method: "POST", url: "http://partner.test/internal/v1/vendors", body: { code: "V009" } });
    expect(sent(1)).toMatchObject({ method: "PUT", url: `http://partner.test/internal/v1/vendors/${ID}`, body: { expectedUpdatedAt: EXPECTED } });
    expect(sent(1).body).not.toHaveProperty("id");
    expect(sent(2)).toMatchObject({ method: "DELETE", url: `http://partner.test/internal/v1/vendors/${ID}`, body: undefined });
  });

  it("UT-VEN-G25 nextCode and options use their own routes", async () => {
    fetchMock.mockImplementationOnce(async () => json(200, { code: "V1000" })).mockImplementationOnce(async () => json(200, { currencies: [{ code: "THB", name: "Thai Baht" }], countries: [] }));
    await expect(proc(["vendor:ADD"], "nextCode")()).resolves.toEqual({ code: "V1000" });
    await proc(["vendor:VIEW"], "options")();
    expect([sent(0).url, sent(1).url]).toEqual(["http://partner.test/internal/v1/vendors/next-code", "http://partner.test/internal/v1/vendors/options"]);
  });

  it("UT-VEN-G26 rejects shippingAddresses and an invalid id before partner", async () => {
    expect(await failure(proc(["vendor:ADD"], "create")(vendorInput({ shippingAddresses: [address()] })))).toMatchObject({ code: "BAD_REQUEST", fieldErrors: [{ path: "(root)", code: "unrecognized_keys" }] });
    expect(await failure(proc(["vendor:DELETE"], "delete")({ id: "abc" }))).toMatchObject({ code: "BAD_REQUEST", fieldErrors: [{ path: "id", code: "invalid_format" }] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("default address rule (zero or one, D-V03)", () => {
  it("UT-VEN-G27 two defaults → {invoiceAddresses, multiple_defaults} on create and update, partner not called", async () => {
    const two = { invoiceAddresses: [invoiceAddress({ isDefault: true }), invoiceAddress({ isDefault: true })] };
    const expected = { code: "BAD_REQUEST", domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "invoiceAddresses", code: "multiple_defaults" }] };
    expect(await failure(proc(["vendor:ADD"], "create")(vendorInput(two)))).toEqual(expected);
    expect(await failure(proc(["vendor:EDIT"], "update")(withMeta(vendorInput(two))))).toEqual(expected);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("UT-VEN-G28 zero defaults are forwarded as sent", async () => {
    fetchMock.mockImplementation(async () => json(200, { id: ID, updatedAt: EXPECTED }));
    await proc(["vendor:ADD"], "create")(vendorInput({ invoiceAddresses: [invoiceAddress(), invoiceAddress()] }));
    expect(sent().body.invoiceAddresses.map((item: { isDefault: boolean }) => item.isDefault)).toEqual([false, false]);
  });
});

describe("partner error → domain error", () => {
  it.each([
    ["404 without a code", 404, "not json", { code: "NOT_FOUND", domainCode: "VENDOR_NOT_FOUND", fieldErrors: null }],
    ["409 VENDOR_STALE", 409, { error: { code: "VENDOR_STALE" } }, { code: "CONFLICT", domainCode: "VENDOR_STALE", fieldErrors: null }],
    ["409 VENDOR_CODE_TAKEN", 409, { error: { code: "VENDOR_CODE_TAKEN", fieldErrors: [{ path: "code", code: "duplicate" }] } }, { code: "CONFLICT", domainCode: "VENDOR_CODE_TAKEN", fieldErrors: [{ path: "code", code: "duplicate" }] }],
    ["409 without a code", 409, {}, { code: "CONFLICT", domainCode: "CONFLICT", fieldErrors: null }],
    ["400 multiple_defaults from partner", 400, { error: { code: "VALIDATION_ERROR", fieldErrors: [{ path: "invoiceAddresses", code: "multiple_defaults" }] } }, { code: "BAD_REQUEST", domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "invoiceAddresses", code: "multiple_defaults" }] }],
    ["401", 401, {}, { code: "SERVICE_UNAVAILABLE", domainCode: "PARTNER_UNAVAILABLE", fieldErrors: null }],
    ["503", 503, {}, { code: "SERVICE_UNAVAILABLE", domainCode: "PARTNER_UNAVAILABLE", fieldErrors: null }],
    ["502", 502, {}, { code: "INTERNAL_SERVER_ERROR", domainCode: "INTERNAL_SERVER_ERROR", fieldErrors: null }],
  ])("UT-VEN-G29 maps %s", async (_label, status, body, expected) => {
    fetchMock.mockImplementation(async () => (typeof body === "string" ? new Response(body, { status }) : json(status, body)));
    expect(await failure(proc(["vendor:EDIT"], "update")(withMeta(vendorInput())))).toEqual(expected);
  });

  it("UT-VEN-G30 maps a network failure to PARTNER_UNAVAILABLE", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect((await failure(proc(["vendor:DELETE"], "delete")({ id: ID }))).domainCode).toBe("PARTNER_UNAVAILABLE");
  });
});

describe("timeouts", () => {
  it.each([
    ["list", {}, "vendor:VIEW", PARTNER_TIMEOUT_MS.read],
    ["options", undefined, "vendor:VIEW", PARTNER_TIMEOUT_MS.read],
    ["nextCode", undefined, "vendor:ADD", PARTNER_TIMEOUT_MS.read],
    ["create", vendorInput(), "vendor:ADD", PARTNER_TIMEOUT_MS.write],
    ["update", withMeta(vendorInput()), "vendor:EDIT", PARTNER_TIMEOUT_MS.write],
    ["delete", { id: ID }, "vendor:DELETE", PARTNER_TIMEOUT_MS.write],
  ])("UT-VEN-G31 %s times out → SERVICE_UNAVAILABLE PARTNER_UNAVAILABLE", async (name, input, permission, ms) => {
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => AbortSignal.abort(new DOMException("timeout", "TimeoutError")));
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      if (init.signal?.aborted) throw init.signal.reason;
      return json(200, {});
    });
    expect(await failure(proc([permission], name)(input))).toEqual({ code: "SERVICE_UNAVAILABLE", domainCode: "PARTNER_UNAVAILABLE", fieldErrors: null });
    expect(timeout).toHaveBeenCalledWith(ms);
  });
});

describe("output validation", () => {
  it("UT-VEN-G32 strips unknown fields and keeps the vendor detail shape", async () => {
    fetchMock.mockImplementation(async () => json(200, { ...vendorDetail(), shippingAddresses: [], internalNote: "x" }));
    expect(await proc(["vendor:VIEW"], "get")({ id: ID })).toEqual(vendorDetail());
  });

  it.each([
    ["more than 10 invoice addresses", "get", { id: ID }, { ...vendorDetail(), invoiceAddresses: Array.from({ length: 11 }, () => vendorDetail().invoiceAddresses[0]) }],
    ["an unknown prefix from nextCode", "nextCode", undefined, { code: "X001" }],
    ["a mutation without updatedAt", "create", vendorInput(), { id: ID }],
  ])("UT-VEN-G33 a malformed reply (%s) becomes PARTNER_UNAVAILABLE", async (_label, name, input, reply) => {
    fetchMock.mockImplementation(async () => json(200, reply));
    expect((await failure(proc([], name, { superAdmin: true })(input))).domainCode).toBe("PARTNER_UNAVAILABLE");
  });

  it("UT-VEN-G34 nextCode output is the shared `^[CV][0-9]{3,19}$` contract (not prefix-per-entity)", async () => {
    // api-contract.md (vendor + customer) defines one pattern for both entities; the per-entity prefix is
    // produced by partner (UT-VEN-P39 / UT-CUS-P47). Recorded as a coverage note, not a defect.
    fetchMock.mockImplementation(async () => json(200, { code: "C001" }));
    await expect(proc(["vendor:ADD"], "nextCode")()).resolves.toEqual({ code: "C001" });
  });
});
