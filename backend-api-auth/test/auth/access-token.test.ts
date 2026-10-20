import { generateKeyPairSync } from "node:crypto";
import { decodeProtectedHeader, jwtVerify, type JWK } from "jose";
import { describe, expect, it } from "vitest";
import { ACCESS_TOKEN_AUDIENCE, ACCESS_TOKEN_LIFETIME_SECONDS, AccessTokenIssuer, accessTokenIssuerFromEnvironment } from "../../src/auth/access-token";

function testKey(kid: string) {
  const { privateKey } = generateKeyPairSync("ed25519");
  return { kid, privateJwk: privateKey.export({ format: "jwk" }) as JWK };
}

describe("GP-AT-02 access JWT unit", () => {
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
