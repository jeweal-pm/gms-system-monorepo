import { generateKeyPairSync } from "node:crypto";
import { importJWK, jwtVerify, type JWK } from "jose";
import { afterAll, describe, expect, it, vi } from "vitest";
import { ACCESS_TOKEN_AUDIENCE } from "../../src/auth/access-token";

describe("GP-AT-02 Better Auth JWKS HTTP boundary", () => {
  afterAll(() => vi.unstubAllEnvs());

  it("serves only configured public keys through the real Better Auth mount", async () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    vi.stubEnv("AUTH_ACCESS_JWT_ISSUER", "https://auth.example.test");
    vi.stubEnv("AUTH_ACCESS_JWT_KEYS", JSON.stringify([{ kid: "integration", privateJwk: privateKey.export({ format: "jwk" }) }]));
    vi.resetModules();
    const { auth } = await import("../../src/auth/auth");
    const response = await auth.handler(new Request("http://localhost:3101/api/auth/jwks"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=600");
    expect(response.headers.get("set-cookie")).toBeNull();
    const body = await response.json() as { keys: JWK[] };
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0]).toMatchObject({ kid: "integration", kty: "OKP", alg: "EdDSA" });
    expect(JSON.stringify(body)).not.toContain('"d"');

    const { accessTokenIssuerFromEnvironment } = await import("../../src/auth/access-token");
    const token = await accessTokenIssuerFromEnvironment(process.env)!.issue("user-1", "session-1");
    await expect(jwtVerify(token, await importJWK(body.keys[0], "EdDSA"), {
      issuer: "https://auth.example.test", audience: ACCESS_TOKEN_AUDIENCE,
    })).resolves.toMatchObject({ payload: { sub: "user-1", sid: "session-1" } });
  });

  it("returns a bounded unavailable response when JWT keys are not configured", async () => {
    vi.stubEnv("AUTH_ACCESS_JWT_ISSUER", "");
    vi.stubEnv("AUTH_ACCESS_JWT_KEYS", "");
    vi.resetModules();
    const { auth } = await import("../../src/auth/auth");
    const response = await auth.handler(new Request("http://localhost:3101/api/auth/jwks"));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.json()).toMatchObject({ error: { code: "JWKS_UNAVAILABLE" } });
  });
});
