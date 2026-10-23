import { generateKeyPairSync } from "node:crypto";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccessTokenIssuer } from "../../src/auth/access-token";
import { createLogoutRefreshRevocation, createRefreshHandler } from "../../src/auth/refresh-http";

const servers: Array<ReturnType<express.Express["listen"]>> = [];
const secret = "x".repeat(43);
const origin = "http://localhost:3000";

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))));
});

function issuer() {
  const { privateKey } = generateKeyPairSync("ed25519");
  return new AccessTokenIssuer("http://localhost:3101", [{ kid: "refresh-test", privateJwk: privateKey.export({ format: "jwk" }) }]);
}

async function serve(handler: express.RequestHandler, method = "POST", path = "/refresh") {
  const app = express();
  app.post(path, handler);
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test server address");
  return (headers: Record<string, string> = {}, body?: string) => fetch(`http://127.0.0.1:${address.port}${path}`, { method, headers, body });
}

const csrf = { origin, "x-gms-csrf": "1", "sec-fetch-site": "same-origin" };

describe("GP-AUTH-02 refresh and logout real HTTP boundary", () => {
  it("IT-GPAUTH-02 rejects missing CSRF before token-store access", async () => {
    const store = { rotate: vi.fn(), revokeForSession: vi.fn() };
    const request = await serve(createRefreshHandler({ issuer: issuer(), store, eligible: vi.fn(), secure: false }));
    const response = await request({ cookie: `gms_refresh=${secret}` });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "CSRF_INVALID" } });
    expect(store.rotate).not.toHaveBeenCalled();
  });

  it("IT-GPAUTH-02 rotates once, checks live eligibility, and returns both bounded HttpOnly cookies", async () => {
    const store = { rotate: vi.fn(async () => ({ state: "rotated" as const, userId: "u1", username: "user1", sessionId: "s1", secret: "n".repeat(43) })), revokeForSession: vi.fn() };
    const eligible = vi.fn(async () => true);
    const request = await serve(createRefreshHandler({ issuer: issuer(), store, eligible, secure: true }));
    const response = await request({ ...csrf, cookie: `gms_refresh=${secret}` });
    expect(response.status).toBe(204);
    expect(store.rotate).toHaveBeenCalledWith(secret);
    expect(eligible).toHaveBeenCalledWith("u1", "user1");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    for (const cookie of cookies) {
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("SameSite=Lax");
    }
    expect(cookies.find((cookie) => cookie.startsWith("gms_access="))).toContain("Path=/;");
    expect(cookies.find((cookie) => cookie.startsWith("gms_refresh="))).toContain("Path=/api/auth/refresh;");
  });

  it("IT-GPAUTH-02 revokes the family and withholds tokens when live license is denied or unavailable", async () => {
    const rotated = { state: "rotated" as const, userId: "u1", username: "user1", sessionId: "s1", secret: "n".repeat(43) };
    const store = { rotate: vi.fn(async () => rotated), revokeForSession: vi.fn(async () => {}) };
    const denied = await serve(createRefreshHandler({ issuer: issuer(), store, eligible: vi.fn(async () => false), secure: false }));
    const deniedResponse = await denied({ ...csrf, cookie: `gms_refresh=${secret}` });
    expect(deniedResponse.status).toBe(403);
    expect(store.revokeForSession).toHaveBeenCalledWith("s1");
    expect(deniedResponse.headers.getSetCookie().some((cookie) => cookie.startsWith("gms_access=;"))).toBe(true);

    store.revokeForSession.mockClear();
    const unavailable = await serve(createRefreshHandler({ issuer: issuer(), store, eligible: vi.fn(async () => { throw new Error("license unavailable"); }), secure: false }));
    const unavailableResponse = await unavailable({ ...csrf, cookie: `gms_refresh=${secret}` });
    expect(unavailableResponse.status).toBe(503);
    expect(store.revokeForSession).toHaveBeenCalledWith("s1");
    expect(unavailableResponse.headers.getSetCookie().some((cookie) => cookie.startsWith("gms_refresh=;"))).toBe(true);
  });

  it("IT-GPAUTH-02 rejects replay/expired credentials and refuses a request body", async () => {
    const store = { rotate: vi.fn(async () => ({ state: "reused" as const })), revokeForSession: vi.fn() };
    const request = await serve(createRefreshHandler({ issuer: issuer(), store, eligible: vi.fn(), secure: false }));
    const replay = await request({ ...csrf, cookie: `gms_refresh=${secret}` });
    expect(replay.status).toBe(401);
    const withBody = await request({ ...csrf, cookie: `gms_refresh=${secret}`, "content-type": "application/json" }, "{}");
    expect(withBody.status).toBe(400);
    expect(store.rotate).toHaveBeenCalledTimes(1);
  });

  it("IT-GPAUTH-02 revokes refresh before logout and rejects logout without same-origin proof", async () => {
    const store = { revokeForSession: vi.fn(async () => {}) };
    const resolveSession = vi.fn(async () => ({ id: "s1" }));
    const request = await serve(createLogoutRefreshRevocation(store, false, resolveSession), "POST", "/logout");
    const rejected = await request();
    expect(rejected.status).toBe(403);
    expect(resolveSession).not.toHaveBeenCalled();
    const logout = await request(csrf);
    expect(logout.status).toBe(404); // middleware continues to a deliberately absent Better Auth handler
    expect(store.revokeForSession).toHaveBeenCalledWith("s1");
    expect(logout.headers.getSetCookie().filter((cookie) => /^(gms_access|gms_refresh)=;/.test(cookie))).toHaveLength(2);
    expect(logout.headers.getSetCookie().find((cookie) => cookie.startsWith("gms_access=;"))).toContain("Path=/;");
    expect(logout.headers.getSetCookie().find((cookie) => cookie.startsWith("gms_refresh=;"))).toContain("Path=/api/auth/refresh");
  });
});
