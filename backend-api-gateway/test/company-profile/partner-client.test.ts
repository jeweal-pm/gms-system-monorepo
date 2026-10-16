import { TRPCError } from "@trpc/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { describeError } from "../../src/trpc/domain-error";
import { callPartner, getPartnerBinary, PARTNER_TIMEOUT_MS } from "../../src/trpc/partner-client";

/** UT-CP-G20…G27: partner client additions for the company logo (raw body, binary GET, 415 mapping). */

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("PARTNER_SERVICE_URL", "http://partner.test");
  vi.stubEnv("PARTNER_SERVICE_TOKEN", "t".repeat(40));
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** tRPC code and domain code of a thrown gateway error. */
async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TRPCError) return { code: error.code, domainCode: describeError(error).domainCode };
    throw error;
  }
  throw new Error("expected the call to fail");
}

const putLogo = (data = Buffer.from([0x89, 0x50])) =>
  callPartner({
    method: "PUT", path: "/internal/v1/company-profile/logo?expectedVersion=2", route: "PUT /company-profile/logo", timeoutMs: PARTNER_TIMEOUT_MS.write,
    actorId: "user-1", responseSchema: z.object({ profile: z.object({ version: z.number() }) }), notFoundCode: "COMPANY_PROFILE_NOT_FOUND", raw: { data, contentType: "image/png" },
  });

describe("callPartner with a raw body", () => {
  it("UT-CP-G20 sends the bytes with their content type, the token and the actor", async () => {
    fetchMock.mockResolvedValue(json(200, { profile: { version: 3 } }));
    const data = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    await expect(putLogo(data)).resolves.toEqual({ profile: { version: 3 } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("http://partner.test/internal/v1/company-profile/logo?expectedVersion=2");
    expect(init.method).toBe("PUT");
    expect(init.headers).toMatchObject({ "content-type": "image/png", "x-actor-user-id": "user-1", authorization: `Bearer ${"t".repeat(40)}` });
    expect(Buffer.from(init.body as Uint8Array)).toEqual(data);
  });

  it.each([
    [415, { error: { code: "UNSUPPORTED_MEDIA_TYPE" } }, { code: "UNSUPPORTED_MEDIA_TYPE", domainCode: "UNSUPPORTED_MEDIA_TYPE" }],
    [413, { error: { code: "PAYLOAD_TOO_LARGE" } }, { code: "PAYLOAD_TOO_LARGE", domainCode: "PAYLOAD_TOO_LARGE" }],
    [409, { error: { code: "CONFLICT" } }, { code: "CONFLICT", domainCode: "CONFLICT" }],
    [404, { error: { code: "COMPANY_PROFILE_NOT_FOUND" } }, { code: "NOT_FOUND", domainCode: "COMPANY_PROFILE_NOT_FOUND" }],
    [401, { error: { code: "UNAUTHORIZED" } }, { code: "SERVICE_UNAVAILABLE", domainCode: "PARTNER_UNAVAILABLE" }],
    [500, { error: { code: "INTERNAL_SERVER_ERROR" } }, { code: "INTERNAL_SERVER_ERROR", domainCode: "INTERNAL_SERVER_ERROR" }],
  ])("UT-CP-G21 maps partner %i to the gateway error", async (status, body, expected) => {
    fetchMock.mockResolvedValue(json(status, body));
    expect(await failure(putLogo())).toEqual(expected);
  });

  it("UT-CP-G22 maps a network failure to PARTNER_UNAVAILABLE", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await failure(putLogo())).toEqual({ code: "SERVICE_UNAVAILABLE", domainCode: "PARTNER_UNAVAILABLE" });
  });
});

const getLogo = (maxBytes = 1024) =>
  getPartnerBinary({ path: "/internal/v1/company-profile/logo", route: "GET /company-profile/logo", actorId: "user-1", maxBytes, notFoundCode: "COMPANY_LOGO_NOT_FOUND" });

describe("getPartnerBinary", () => {
  it("UT-CP-G23 returns the bytes, content type and version", async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg", "x-logo-version": "abcdef0123456789" } }));
    const logo = await getLogo();
    expect(logo).toEqual({ data: Buffer.from([1, 2, 3]), contentType: "image/jpeg", version: "abcdef0123456789" });
  });

  it("UT-CP-G24 maps a partner 404 to COMPANY_LOGO_NOT_FOUND", async () => {
    fetchMock.mockResolvedValue(json(404, { error: { code: "COMPANY_LOGO_NOT_FOUND" } }));
    expect(await failure(getLogo())).toEqual({ code: "NOT_FOUND", domainCode: "COMPANY_LOGO_NOT_FOUND" });
  });

  it("UT-CP-G25 refuses a body larger than the limit", async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array(2048), { status: 200, headers: { "content-type": "image/png" } }));
    expect(await failure(getLogo(1024))).toEqual({ code: "SERVICE_UNAVAILABLE", domainCode: "PARTNER_UNAVAILABLE" });
  });

  it("UT-CP-G26 maps a timeout to PARTNER_UNAVAILABLE", async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error("timed out"), { name: "TimeoutError" }));
    expect(await failure(getLogo())).toEqual({ code: "SERVICE_UNAVAILABLE", domainCode: "PARTNER_UNAVAILABLE" });
  });
});
