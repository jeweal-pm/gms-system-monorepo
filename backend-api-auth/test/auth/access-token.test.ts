import { generateKeyPairSync } from "node:crypto";
import { decodeProtectedHeader, jwtVerify, type JWK } from "jose";
import { describe, expect, it, vi } from "vitest";
import {
  ACCESS_TOKEN_AUDIENCE,
  ACCESS_TOKEN_COOKIE_NAME,
  ACCESS_TOKEN_LIFETIME_SECONDS,
  AccessTokenIssuer,
  accessTokenIssuerFromEnvironment,
  issueAccessCookieAfterEligibleLogin,
  registerAccessTokenEligibilityCheck,
  resetAccessTokenEligibilityCheckForTests,
} from "../../src/auth/access-token";

function testKey(kid: string) {
  const { privateKey } = generateKeyPairSync("ed25519");
  return { kid, privateJwk: privateKey.export({ format: "jwk" }) as JWK };
}

describe("GP-AT-02 access JWT unit", () => {
  it("UT-GPAUTH-01 issues a bounded HttpOnly cookie only after the existing license check accepts", async () => {
    const issuer = new AccessTokenIssuer("https://auth.example.test", [testKey("login")]);
    const setCookie = vi.fn();
      const refreshStore = { create: vi.fn(async () => "r".repeat(43)) };
    registerAccessTokenEligibilityCheck(async (userId, username) => userId === "user-1" && username === "user@example.com");
    try {
      await expect(issueAccessCookieAfterEligibleLogin({ setCookie }, { id: "user-1", username: "user@example.com" }, { id: "session-1" }, issuer, true, refreshStore as never)).resolves.toBe(true);
      expect(refreshStore.create).toHaveBeenCalledWith("user-1", "session-1");
      expect(setCookie).toHaveBeenCalledTimes(2);
      expect(setCookie.mock.calls[0][0]).toBe(ACCESS_TOKEN_COOKIE_NAME);
      expect(setCookie.mock.calls[0][2]).toMatchObject({
        httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: ACCESS_TOKEN_LIFETIME_SECONDS,
      });
      expect(setCookie.mock.calls[1][0]).toBe("gms_refresh");
      expect(setCookie.mock.calls[1][1]).toBe("r".repeat(43));
      expect(setCookie.mock.calls[1][2]).toMatchObject({
        httpOnly: true, secure: true, sameSite: "lax", path: "/api/auth/refresh", maxAge: 7 * 24 * 60 * 60,
      });
      const token = String(setCookie.mock.calls[0][1]);
      expect(decodeProtectedHeader(token)).toMatchObject({ alg: "EdDSA", kid: "login" });
    } finally {
      resetAccessTokenEligibilityCheckForTests();
    }
  });

  it("UT-GPAUTH-01 leaves legacy sessions unchanged when license, signer, or trusted eligibility is unavailable", async () => {
    const setCookie = vi.fn();
    const issuer = new AccessTokenIssuer("https://auth.example.test", [testKey("login")]);
    await expect(issueAccessCookieAfterEligibleLogin({ setCookie }, { id: "user-1", username: "user@example.com" }, { id: "session-1" }, issuer, false)).resolves.toBe(false);
    registerAccessTokenEligibilityCheck(async () => false);
    await expect(issueAccessCookieAfterEligibleLogin({ setCookie }, { id: "user-1", username: "user@example.com" }, { id: "session-1" }, issuer, false)).resolves.toBe(false);
    await expect(issueAccessCookieAfterEligibleLogin({ setCookie }, { id: "user-1", username: "user@example.com" }, { id: "session-1" }, null, false)).resolves.toBe(false);
    expect(setCookie).not.toHaveBeenCalled();
    resetAccessTokenEligibilityCheckForTests();
  });

  it("does not create or issue refresh credentials when login eligibility fails", async () => {
    const setCookie = vi.fn();
    const create = vi.fn();
    registerAccessTokenEligibilityCheck(async () => false);
    try {
      await expect(issueAccessCookieAfterEligibleLogin(
        { setCookie }, { id: "user-1", username: "user@example.com" }, { id: "session-1" },
        new AccessTokenIssuer("https://auth.example.test", [testKey("login")]), false,
        { create } as never,
      )).resolves.toBe(false);
      expect(create).not.toHaveBeenCalled();
      expect(setCookie).not.toHaveBeenCalled();
    } finally {
      resetAccessTokenEligibilityCheckForTests();
    }
  });

  it("signs a distinct bounded EdDSA user token that its public JWKS verifies", async () => {
    const issuer = new AccessTokenIssuer("https://auth.example.test", [testKey("current")]);
    const token = await issuer.issue("user-1", "session-1", 1_700_000_000);
    const jwk = issuer.publicJwks().keys[0];
    expect(decodeProtectedHeader(token)).toMatchObject({ alg: "EdDSA", kid: "current", typ: "JWT" });
    expect(jwk).toMatchObject({ kty: "OKP", crv: "Ed25519", alg: "EdDSA", use: "sig" });
    expect(jwk).not.toHaveProperty("d");
    const { importJWK } = await import("jose");
    const verified = await jwtVerify(token, await importJWK(jwk, "EdDSA"), {
      issuer: "https://auth.example.test", audience: ACCESS_TOKEN_AUDIENCE, currentDate: new Date(1_700_000_001_000),
    });
    expect(verified.payload).toMatchObject({ sub: "user-1", sid: "session-1", iat: 1_700_000_000, nbf: 1_700_000_000, exp: 1_700_000_000 + ACCESS_TOKEN_LIFETIME_SECONDS });
    expect(verified.payload.jti).toEqual(expect.any(String));
    await expect(jwtVerify(token, await importJWK(jwk, "EdDSA"), { issuer: "https://other.example.test", audience: ACCESS_TOKEN_AUDIENCE, currentDate: new Date(1_700_000_001_000) })).rejects.toThrow();
    await expect(jwtVerify(token, await importJWK(jwk, "EdDSA"), { issuer: "https://auth.example.test", audience: ACCESS_TOKEN_AUDIENCE, currentDate: new Date(1_700_000_901_000) })).rejects.toThrow();
  });

  it("publishes at most two keys and switches the signing kid by ordering", async () => {
    const older = testKey("older");
    const newer = testKey("newer");
    const issuer = new AccessTokenIssuer("https://auth.example.test", [newer, older]);
    expect(issuer.publicJwks().keys.map((key) => key.kid)).toEqual(["newer", "older"]);
    expect(decodeProtectedHeader(await issuer.issue("u", "s"))).toMatchObject({ kid: "newer" });
    expect(() => new AccessTokenIssuer("https://auth.example.test", [newer, older, testKey("third")])).toThrow();
    expect(() => new AccessTokenIssuer("https://auth.example.test", [older, older])).toThrow();
  });

  it("rejects missing or malformed signing configuration without reusing the license key", () => {
    expect(accessTokenIssuerFromEnvironment({})).toBeNull();
    expect(() => accessTokenIssuerFromEnvironment({ AUTH_ACCESS_JWT_ISSUER: "https://auth.example.test" })).toThrow();
    expect(() => accessTokenIssuerFromEnvironment({ AUTH_ACCESS_JWT_ISSUER: "https://auth.example.test", AUTH_ACCESS_JWT_KEYS: "[]" })).toThrow();
    expect(() => new AccessTokenIssuer("https://auth.example.test", [{ kid: "bad", privateJwk: { kty: "oct", k: "abc" } }])).toThrow();
  });
});
