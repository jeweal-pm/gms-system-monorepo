import { Readable } from "node:stream";
import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createContext } from "../../src/request-context";
import { callAuth, getAuthBinary } from "../../src/trpc/auth-client";
import { domainError } from "../../src/trpc/domain-error";
import { appRouter, type TrpcContext } from "../../src/trpc/router";
import { UserPhotoController } from "../../src/user-photo.controller";

/**
 * UT-PH-G01…G09: user photo REST + `userAdmin.removePhoto` (user-photo.md PH-04…07, PH-09): session,
 * licence and `user-and-permission:*` checks, id, type, 5 MB limit, cache headers, error bodies.
 * Session context and auth calls are mocked at their module boundary.
 */

vi.mock("../../src/request-context", () => ({ createContext: vi.fn() }));
vi.mock("../../src/trpc/auth-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/trpc/auth-client")>()),
  callAuth: vi.fn(),
  getAuthBinary: vi.fn(),
}));

const LIMIT = 5 * 1024 * 1024;
const ID = "00000000-0000-4000-8000-000000000002";
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1]);

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

function fakeResponse() {
  const state: { statusCode: number; headers: Record<string, string>; body: unknown } = { statusCode: 0, headers: {}, body: undefined };
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

let controller: UserPhotoController;

beforeEach(() => {
  vi.mocked(createContext).mockReset();
  vi.mocked(callAuth).mockReset();
  vi.mocked(getAuthBinary).mockReset();
  controller = new UserPhotoController();
});

describe("GET /api/v1/user-admin/users/:id/photo", () => {
  it("UT-PH-G01 401 without a session, 403 PERMISSION_DENIED without VIEW; auth never called", async () => {
    vi.mocked(createContext).mockResolvedValue(context([], { session: null }));
    const first = fakeResponse();
    await controller.get(request(), ID, first.response);
    expect(first.state).toMatchObject({ statusCode: 401, body: { error: { code: "UNAUTHORIZED" } } });

    vi.mocked(createContext).mockResolvedValue(context(["vendor:VIEW"]));
    const second = fakeResponse();
    await controller.get(request(), ID, second.response);
    expect(second.state).toMatchObject({ statusCode: 403, body: { error: { code: "PERMISSION_DENIED" } } });
    expect(getAuthBinary).not.toHaveBeenCalled();
  });

  it("UT-PH-G02 serves the image; immutable cache only for the matching ?v=", async () => {
    vi.mocked(createContext).mockResolvedValue(context(["user-and-permission:VIEW"]));
    vi.mocked(getAuthBinary).mockResolvedValue({ data: jpeg, contentType: "image/jpeg", version: "abcdef0123456789" });
    const versioned = fakeResponse();
    await controller.get(request({ query: { v: "abcdef0123456789" } }), ID, versioned.response);
    expect(versioned.state.statusCode).toBe(200);
    expect(versioned.state.body).toEqual(jpeg);
    expect(versioned.state.headers).toMatchObject({ "cache-control": "private, max-age=31536000, immutable", "content-type": "image/jpeg", "x-content-type-options": "nosniff" });
    expect(vi.mocked(getAuthBinary).mock.calls[0][0]).toEqual({ cookie: "session=1", path: `/internal/v1/user-admin/users/${ID}/photo`, maxBytes: LIMIT });

    const stale = fakeResponse();
    await controller.get(request({ query: { v: "0000000000000000" } }), ID, stale.response);
    expect(stale.state.headers["cache-control"]).toBe("private, no-cache");
  });

  it("UT-PH-G03 an unsafe id is a validation error; a non-image upstream type is unavailable", async () => {
    vi.mocked(createContext).mockResolvedValue(context(["user-and-permission:VIEW"]));
    const bad = fakeResponse();
    await controller.get(request(), "../other", bad.response);
    expect(bad.state).toMatchObject({ statusCode: 400, body: { error: { code: "VALIDATION_ERROR" } } });

    vi.mocked(getAuthBinary).mockResolvedValue({ data: Buffer.from("<svg/>"), contentType: "image/svg+xml", version: "" });
    const svg = fakeResponse();
    await controller.get(request(), ID, svg.response);
    expect(svg.state).toMatchObject({ statusCode: 503, body: { error: { code: "USER_SERVICE_UNAVAILABLE" } } });
  });

  it("UT-PH-G04 PHOTO_NOT_FOUND from auth passes through as 404", async () => {
    vi.mocked(createContext).mockResolvedValue(context(["user-and-permission:VIEW"]));
    vi.mocked(getAuthBinary).mockRejectedValue(domainError("NOT_FOUND", "PHOTO_NOT_FOUND"));
    const { response, state } = fakeResponse();
    await controller.get(request(), ID, response);
    expect(state).toMatchObject({ statusCode: 404, body: { error: { code: "PHOTO_NOT_FOUND" } } });
  });
});

describe("PUT /api/v1/user-admin/users/:id/photo", () => {
  it("UT-PH-G05 needs EDIT", async () => {
    vi.mocked(createContext).mockResolvedValue(context(["user-and-permission:VIEW"]));
    const { response, state } = fakeResponse();
    await controller.put(request({ headers: { "content-type": "image/jpeg" }, chunks: [jpeg] }), ID, response);
    expect(state).toMatchObject({ statusCode: 403, body: { error: { code: "PERMISSION_DENIED" } } });
    expect(callAuth).not.toHaveBeenCalled();
  });

  it("UT-PH-G06 only JPEG/PNG and a non-empty body", async () => {
    vi.mocked(createContext).mockResolvedValue(context(["user-and-permission:EDIT"]));
    const gif = fakeResponse();
    await controller.put(request({ headers: { "content-type": "image/gif" }, chunks: [jpeg] }), ID, gif.response);
    expect(gif.state).toMatchObject({ statusCode: 415, body: { error: { code: "PHOTO_TYPE_NOT_ALLOWED" } } });
    const empty = fakeResponse();
    await controller.put(request({ headers: { "content-type": "image/jpeg" } }), ID, empty.response);
    expect(empty.state).toMatchObject({ statusCode: 415, body: { error: { code: "PHOTO_TYPE_NOT_ALLOWED" } } });
  });

  it("UT-PH-G07 rejects more than 5 MB by header and while streaming", async () => {
    vi.mocked(createContext).mockResolvedValue(context(["user-and-permission:EDIT"]));
    const declared = fakeResponse();
    await controller.put(request({ headers: { "content-type": "image/jpeg", "content-length": String(LIMIT + 1) } }), ID, declared.response);
    expect(declared.state).toMatchObject({ statusCode: 413, body: { error: { code: "PHOTO_TOO_LARGE" } } });
    const streamed = fakeResponse();
    await controller.put(request({ headers: { "content-type": "image/jpeg" }, chunks: [Buffer.alloc(LIMIT), Buffer.alloc(1)] }), ID, streamed.response);
    expect(streamed.state).toMatchObject({ statusCode: 413, body: { error: { code: "PHOTO_TOO_LARGE" } } });
    expect(callAuth).not.toHaveBeenCalled();
  });

  it("UT-PH-G08 forwards the bytes with the cookie and returns the new version; auth errors pass through", async () => {
    vi.mocked(createContext).mockResolvedValue(context(["user-and-permission:EDIT"]));
    vi.mocked(callAuth).mockResolvedValue({ photoVersion: "abcdef0123456789" });
    const ok = fakeResponse();
    await controller.put(request({ headers: { "content-type": "image/jpeg; charset=binary" }, chunks: [jpeg] }), ID, ok.response);
    expect(ok.state).toMatchObject({ statusCode: 200, body: { photoVersion: "abcdef0123456789" } });
    expect(vi.mocked(callAuth).mock.calls[0][0]).toMatchObject({
      cookie: "session=1", method: "PUT", path: `/internal/v1/user-admin/users/${ID}/photo`, raw: { data: jpeg, contentType: "image/jpeg" },
    });

    vi.mocked(callAuth).mockRejectedValue(domainError("FORBIDDEN", "USER_NOT_MANAGEABLE"));
    const denied = fakeResponse();
    await controller.put(request({ headers: { "content-type": "image/jpeg" }, chunks: [jpeg] }), ID, denied.response);
    expect(denied.state).toMatchObject({ statusCode: 403, body: { error: { code: "USER_NOT_MANAGEABLE" } } });
  });
});

describe("userAdmin.removePhoto", () => {
  it("UT-PH-G09 needs EDIT and calls the auth DELETE route", async () => {
    const ctx = (permissions: string[]) => appRouter.createCaller(context(permissions));
    await expect(ctx(["user-and-permission:VIEW"]).userAdmin.removePhoto({ id: ID })).rejects.toThrow("PERMISSION_DENIED");
    vi.mocked(callAuth).mockResolvedValue({ ok: true });
    await expect(ctx(["user-and-permission:EDIT"]).userAdmin.removePhoto({ id: ID })).resolves.toEqual({ ok: true });
    expect(vi.mocked(callAuth).mock.calls[0][0]).toMatchObject({ method: "DELETE", path: `/internal/v1/user-admin/users/${ID}/photo` });
  });
});
