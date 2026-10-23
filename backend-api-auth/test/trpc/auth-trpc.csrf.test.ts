import { describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

vi.mock("../../src/auth/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("../../src/permission/grants", () => ({ loadSessionAuthz: vi.fn() }));

import { auth } from "../../src/auth/auth";
import { createAuthTrpcContext } from "../../src/trpc/auth-trpc.router";
import { createAuthTrpcRouter } from "../../src/trpc/auth-trpc.router";
import { verifyAuthTrpcCsrf } from "../../src/trpc/auth-trpc.csrf";

describe("auth tRPC CSRF boundary", () => {
  it("allows safe reads and requires exact trusted origin, marker and same-site fetch metadata for writes", () => {
    expect(verifyAuthTrpcCsrf({ method: "GET", headers: {} }, "https://gms.example" )).toBe(true);
    const valid = { method: "POST", headers: { origin: "https://gms.example", "x-gms-csrf": "1", "sec-fetch-site": "same-origin" } };
    expect(verifyAuthTrpcCsrf(valid, "https://gms.example" )).toBe(true);
    expect(verifyAuthTrpcCsrf({ ...valid, headers: { ...valid.headers, origin: "https://attacker.example" } }, "https://gms.example" )).toBe(false);
    expect(verifyAuthTrpcCsrf({ ...valid, headers: { origin: valid.headers.origin, "sec-fetch-site": "same-origin" } }, "https://gms.example" )).toBe(false);
    expect(verifyAuthTrpcCsrf({ ...valid, headers: { ...valid.headers, "sec-fetch-site": "cross-site" } }, "https://gms.example" )).toBe(false);
  });

  it("rejects an invalid mutation before Better Auth, license or grant lookups", async () => {
    const license = { resolveStatus: vi.fn() } as never;
    const request = { method: "POST", headers: { cookie: "opaque" } } as never;
    await expect(createAuthTrpcContext(request, license)).rejects.toMatchObject({ code: "FORBIDDEN", message: "CSRF_INVALID" });
    expect(auth.api.getSession).not.toHaveBeenCalled();
    expect(license.resolveStatus).not.toHaveBeenCalled();
  });

  it("rejects a cookie mutation through the real HTTP adapter when Origin or the custom marker is missing", async () => {
    const userAdmin = { requireAccess: vi.fn(), create: vi.fn() } as never;
    const license = { resolveStatus: vi.fn(), activate: vi.fn() } as never;
    const router = createAuthTrpcRouter({ userAdmin, licenseService: license });
    const app = express();
    app.use("/api/auth/trpc", express.json(), createExpressMiddleware({
      router,
      createContext: ({ req }) => createAuthTrpcContext(req, license),
      maxBodySize: 1_048_576,
    }));
    const server = createServer(app);
    await listen(server);
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("test server did not bind");
      const url = `http://127.0.0.1:${address.port}/api/auth/trpc/license.activate`;
      for (const headers of [
        { "content-type": "application/json", "x-gms-csrf": "1" },
        { "content-type": "application/json", origin: "http://localhost:3000" },
      ]) {
        const response = await fetch(url, { method: "POST", headers, body: JSON.stringify({ json: { licenseKey: "key" } }) });
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ error: { message: "CSRF_INVALID", data: { code: "FORBIDDEN", domainCode: "CSRF_INVALID", httpStatus: 403 } } });
      }
      expect(auth.api.getSession).not.toHaveBeenCalled();
      expect(license.resolveStatus).not.toHaveBeenCalled();
      expect(license.activate).not.toHaveBeenCalled();
      expect(userAdmin.requireAccess).not.toHaveBeenCalled();
    } finally { await close(server); }
  });
});

function listen(server: Server) { return new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); }); }
function close(server: Server) { return new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
