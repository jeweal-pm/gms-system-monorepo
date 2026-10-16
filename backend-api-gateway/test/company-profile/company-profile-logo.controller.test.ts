import { Readable } from "node:stream";
import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CompanyProfileLogoController } from "../../src/company-profile-logo.controller";
import { createContext } from "../../src/request-context";
import { domainError } from "../../src/trpc/domain-error";
import { callPartner, getPartnerBinary } from "../../src/trpc/partner-client";
import type { TrpcContext } from "../../src/trpc/router";

/**
 * UT-CP-G30…G42: REST logo controller (SA-CP-04): session, licence and `company-profile:*` checks,
 * content type, version, body limit, cache headers and error bodies. Session context and partner
 * calls are mocked at their module boundary.
 */

vi.mock("../../src/request-context", () => ({ createContext: vi.fn() }));
vi.mock("../../src/trpc/partner-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/trpc/partner-client")>()),
  callPartner: vi.fn(),
  getPartnerBinary: vi.fn(),
}));

const LIMIT = 10 * 1024 * 1024;

function context(permissions: string[], overrides: Partial<TrpcContext> = {}): TrpcContext {
  return {
    session: { user: { id: "user-1", username: "admin", email: "x@users.invalid", name: "Admin" } },
    license: { state: "VALID" },
    authz: { isSuperAdmin: false, permissions },
    cookie: "session=1",
    activateLicense: null,
    ...overrides,
  };
}

type FakeResponse = { statusCode: number; headers: Record<string, string>; body: unknown };

function fakeResponse() {
  const state: FakeResponse = { statusCode: 0, headers: {}, body: undefined };
  const response = {
    status(code: number) {
      state.statusCode = code;
      return response;
    },
    setHeader(name: string, value: string) {
      state.headers[name.toLowerCase()] = value;
      return response;
    },
    json(body: unknown) {
      state.body = body;
      return response;
    },
    end(body?: unknown) {
      state.body = body;
      return response;
    },
  };
  return { response: response as unknown as Response, state };
}

function request({ headers = {}, query = {}, chunks = [] as Buffer[] } = {}) {
  return Object.assign(Readable.from(chunks), { headers, query }) as unknown as Request;
}

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
const savedProfile = { profile: { version: 3 } };

let controller: CompanyProfileLogoController;

beforeEach(() => {
  vi.mocked(createContext).mockReset();
  vi.mocked(callPartner).mockReset();
  vi.mocked(getPartnerBinary).mockReset();
  controller = new CompanyProfileLogoController();
});

describe("GET /api/v1/company-profile/logo", () => {
  it("UT-CP-G30 answers 401 without a session", async () => {
    vi.mocked(createContext).mockResolvedValue(context([], { session: null }));
    const { response, state } = fakeResponse();
    await controller.get(request(), response);
    expect(state).toMatchObject({ statusCode: 401, body: { error: { code: "UNAUTHORIZED" } } });
    expect(getPartnerBinary).not.toHaveBeenCalled();
  });

  it("UT-CP-G31 answers 403 with the licence code when the licence expired", async () => {
    vi.mocked(createContext).mockResolvedValue(context(["company-profile:VIEW"], { license: { state: "EXPIRED" } }));
    const { response, state } = fakeResponse();
    await controller.get(request(), response);
    expect(state).toMatchObject({ statusCode: 403, body: { error: { code: "LICENSE_EXPIRED" } } });
  });

  it("UT-CP-G32 answers 403 PERMISSION_DENIED without company-profile:VIEW", async () => {
    vi.mocked(createContext).mockResolvedValue(context(["vendor:VIEW"]));
    const { response, state } = fakeResponse();
    await controller.get(request(), response);
    expect(state).toMatchObject({ statusCode: 403, body: { error: { code: "PERMISSION_DENIED" } } });
  });

  it("UT-CP-G33 serves the logo, immutable when ?v= matches the version", async () => {
    vi.mocked(createContext).mockResolvedValue(context(["company-profile:VIEW"]));
    vi.mocked(getPartnerBinary).mockResolvedValue({ data: png, contentType: "image/png", version: "0123456789abcdef" });
    const { response, state } = fakeResponse();
    await controller.get(request({ query: { v: "0123456789abcdef" } }), response);
    expect(state.statusCode).toBe(200);
    expect(state.body).toEqual(png);
    expect(state.headers).toMatchObject({
      "cache-control": "private, max-age=31536000, immutable",
      "content-type": "image/png",
      "x-content-type-options": "nosniff",
      "content-disposition": "inline",
      "content-security-policy": "default-src 'none'; sandbox",
    });
  });

  it("UT-CP-G34 revalidates when ?v= is missing or old", async () => {
    vi.mocked(createContext).mockResolvedValue(context([], { authz: { isSuperAdmin: true, permissions: [] } }));
    vi.mocked(getPartnerBinary).mockResolvedValue({ data: png, contentType: "image/png", version: "0123456789abcdef" });
    const { response, state } = fakeResponse();
    await controller.get(request({ query: { v: "old" } }), response);
    expect(state.headers["cache-control"]).toBe("private, no-cache");
  });

  it("UT-CP-G35 refuses to serve an unexpected content type from partner", async () => {
    vi.mocked(createContext).mockResolvedValue(context(["company-profile:VIEW"]));
    vi.mocked(getPartnerBinary).mockResolvedValue({ data: Buffer.from("<svg/>"), contentType: "image/svg+xml", version: "x" });
    const { response, state } = fakeResponse();
    await controller.get(request(), response);
    expect(state).toMatchObject({ statusCode: 503, body: { error: { code: "PARTNER_UNAVAILABLE" } } });
  });

  it("UT-CP-G36 passes the partner 404 on as COMPANY_LOGO_NOT_FOUND", async () => {
    vi.mocked(createContext).mockResolvedValue(context(["company-profile:VIEW"]));
    vi.mocked(getPartnerBinary).mockRejectedValue(domainError("NOT_FOUND", "COMPANY_LOGO_NOT_FOUND"));
    const { response, state } = fakeResponse();
    await controller.get(request(), response);
    expect(state).toMatchObject({ statusCode: 404, body: { error: { code: "COMPANY_LOGO_NOT_FOUND" } } });
  });
});

describe("PUT /api/v1/company-profile/logo", () => {
  const editor = () => vi.mocked(createContext).mockResolvedValue(context(["company-profile:VIEW", "company-profile:EDIT"]));

  it("UT-CP-G37 needs company-profile:EDIT", async () => {
    vi.mocked(createContext).mockResolvedValue(context(["company-profile:VIEW"]));
    const { response, state } = fakeResponse();
    await controller.put(request({ headers: { "content-type": "image/png" }, query: { expectedVersion: "3" }, chunks: [png] }), response);
    expect(state).toMatchObject({ statusCode: 403, body: { error: { code: "PERMISSION_DENIED" } } });
    expect(callPartner).not.toHaveBeenCalled();
  });

  it.each([["application/json"], ["image/gif"], [""], ["text/plain"]])("UT-CP-G38 answers 415 for content type %j (also the CSRF guard)", async (type) => {
    editor();
    const { response, state } = fakeResponse();
    await controller.put(request({ headers: { "content-type": type }, query: { expectedVersion: "3" }, chunks: [png] }), response);
    expect(state).toMatchObject({ statusCode: 415, body: { error: { code: "UNSUPPORTED_MEDIA_TYPE" } } });
  });

  it.each([[{}], [{ expectedVersion: "0" }], [{ expectedVersion: "x" }], [{ expectedVersion: ["1", "2"] }]])("UT-CP-G39 answers 400 for query %j", async (query) => {
    editor();
    const { response, state } = fakeResponse();
    await controller.put(request({ headers: { "content-type": "image/png" }, query, chunks: [png] }), response);
    expect(state).toMatchObject({ statusCode: 400, body: { error: { code: "VALIDATION_ERROR" } } });
  });

  it("UT-CP-G40 answers 413 from content-length or from the streamed size", async () => {
    editor();
    const declared = fakeResponse();
    await controller.put(request({ headers: { "content-type": "image/png", "content-length": String(LIMIT + 1) }, query: { expectedVersion: "3" } }), declared.response);
    expect(declared.state).toMatchObject({ statusCode: 413, body: { error: { code: "PAYLOAD_TOO_LARGE" } } });

    const streamed = fakeResponse();
    await controller.put(request({ headers: { "content-type": "image/png" }, query: { expectedVersion: "3" }, chunks: [Buffer.alloc(LIMIT), Buffer.alloc(1)] }), streamed.response);
    expect(streamed.state).toMatchObject({ statusCode: 413, body: { error: { code: "PAYLOAD_TOO_LARGE" } } });
    expect(callPartner).not.toHaveBeenCalled();
  });

  it("UT-CP-G41 forwards the bytes to partner and returns the profile", async () => {
    editor();
    vi.mocked(callPartner).mockResolvedValue(savedProfile);
    const { response, state } = fakeResponse();
    await controller.put(request({ headers: { "content-type": "image/png; charset=binary" }, query: { expectedVersion: "3" }, chunks: [png.subarray(0, 4), png.subarray(4)] }), response);
    expect(state).toMatchObject({ statusCode: 200, body: savedProfile });
    expect(vi.mocked(callPartner).mock.calls[0][0]).toMatchObject({
      method: "PUT",
      path: "/internal/v1/company-profile/logo?expectedVersion=3",
      actorId: "user-1",
      raw: { data: png, contentType: "image/png" },
    });
  });

  it("UT-CP-G42 passes partner conflicts on as 409", async () => {
    editor();
    vi.mocked(callPartner).mockRejectedValue(domainError("CONFLICT", "CONFLICT"));
    const { response, state } = fakeResponse();
    await controller.put(request({ headers: { "content-type": "image/png" }, query: { expectedVersion: "3" }, chunks: [png] }), response);
    expect(state).toMatchObject({ statusCode: 409, body: { error: { code: "CONFLICT" } } });
  });
});
