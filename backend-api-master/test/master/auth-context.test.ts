import { generateKeyPairSync } from "node:crypto";
import { SignJWT, type JWK } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MasterAuthContextAdapter, MasterJwksCache } from "../../src/master/auth-context";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicJwk = { ...(publicKey.export({ format: "jwk" }) as JWK), kid: "master-test", alg: "EdDSA", use: "sig" };
const trustedOrigin = "http://localhost:3000";
const issuer = "http://localhost:3101";

async function accessToken(overrides: { sub?: string; sid?: string; kid?: string; issuer?: string; audience?: string; expired?: boolean } = {}) {
  return new SignJWT({ sid: overrides.sid ?? "session-1" })
    .setProtectedHeader({ alg: "EdDSA", kid: overrides.kid ?? "master-test", typ: "JWT" })
    .setIssuer(overrides.issuer ?? issuer)
    .setAudience(overrides.audience ?? "gms-domain-api")
    .setSubject(overrides.sub ?? "user-1")
    .setIssuedAt(1_800_000_000)
    .setNotBefore(1_800_000_000)
    .setExpirationTime(overrides.expired ? 1_800_000_020 : 1_800_000_900)
    .sign(privateKey);
}

function authorizationRow(overrides: Record<string, unknown> = {}) {
  return {
    session_id: "session-1", user_id: "user-1", session_expires_at: new Date("2027-01-15T08:30:00Z"),
    account_active: true, account_role: "user", permissions: ["customer:VIEW", "customer:PRICE"], location_keys: ["main"],
    ...overrides,
  };
}

function adapter(options: Record<string, unknown> = {}) {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200, headers: { "content-type": "application/json" } }));
  const authorizationReader = vi.fn(async () => authorizationRow());
  const checkLicense = vi.fn(async () => "ELIGIBLE" as const);
  const nowMs = 1_800_000_050_000;
  const jwks = new MasterJwksCache(new URL("http://auth.local/api/auth/jwks"), fetcher as typeof fetch, () => nowMs);
  return {
    subject: new MasterAuthContextAdapter({
      issuer, trustedOrigin, jwks, now: () => new Date(nowMs),
      authorizationReader: "authorizationReader" in options ? options.authorizationReader as () => Promise<ReturnType<typeof authorizationRow>> : authorizationReader,
      checkLicense: "checkLicense" in options ? options.checkLicense as () => Promise<"ELIGIBLE" | "DENIED" | "UNAVAILABLE" | "UNAUTHENTICATED"> : checkLicense,
      ...options,
    }),
    fetcher, authorizationReader, checkLicense,
  };
}

const request = (token: string, method = "GET", headers: Record<string, string> = {}) => ({
  method,
  headers: { cookie: `other=x; gms_access=${token}`, ...headers },
});

afterEach(() => vi.restoreAllMocks());

describe("master trusted JWT + live auth context", () => {
  it("UT-GPMT-07 verifies a signed token, reads current grants and denies noneligible license", async () => {
    const { subject, fetcher, authorizationReader } = adapter();
    const token = await accessToken();
    const context = await subject.create(request(token));
    expect(context).toMatchObject({
      principal: { userId: "user-1", sessionId: "session-1", isSuperAdmin: false, grants: ["customer:VIEW", "customer:PRICE"] },
      authorization: "CURRENT", license: "ELIGIBLE", csrfVerified: true,
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(authorizationReader).toHaveBeenCalledWith("user-1", "session-1");
  });

  it("UT-GPMT-08 rejects invalid, expired, unknown-key and unavailable-key tokens closed", async () => {
    const { subject } = adapter();
    await expect(subject.create({ method: "GET", headers: {} })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(subject.create(request(await accessToken({ expired: true })))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(subject.create(request(await accessToken({ issuer: "http://attacker.local" })))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(subject.create(request(await accessToken({ kid: "unknown" })))).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    const outage = adapter({ jwks: new MasterJwksCache(new URL("http://auth.local/api/auth/jwks"), vi.fn().mockRejectedValue(new Error("offline")) as typeof fetch) });
    await expect(outage.subject.create(request(await accessToken()))).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE", message: "AUTHORIZATION_UNAVAILABLE" });
  });

  it("UT-GPMT-09 denies revoked sessions, inactive accounts, malformed grants and missing license checker", async () => {
    const revoked = adapter({ authorizationReader: vi.fn(async () => null) });
    await expect(revoked.subject.create(request(await accessToken()))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const inactive = adapter({ authorizationReader: vi.fn(async () => authorizationRow({ account_active: false })) });
    await expect(inactive.subject.create(request(await accessToken()))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const malformed = adapter({ authorizationReader: vi.fn(async () => authorizationRow({ permissions: ["__proto__:ADMIN"] })) });
    await expect(malformed.subject.create(request(await accessToken()))).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    const noLicense = adapter({ checkLicense: undefined });
    await expect(noLicense.subject.create(request(await accessToken()))).resolves.toMatchObject({ license: "UNAVAILABLE" });
  });

  it("UT-GPMT-12 maps stale auth-side context to 401 rather than a license denial", async () => {
    const subject = adapter({ checkLicense: vi.fn(async () => "UNAUTHENTICATED" as const) });
    await expect(subject.subject.create(request(await accessToken()))).rejects.toMatchObject({
      code: "UNAUTHORIZED", message: "AUTHORIZATION_CONTEXT_INVALID",
    });
  });

  it("UT-GPMT-10 rejects invalid cookie-mutation CSRF before JWKS, auth-view or license work", async () => {
    const token = await accessToken();
    const invalidHeaders: Array<Record<string, string | string[] | undefined>> = [
      {},
      { origin: "http://evil.local", "x-gms-csrf": "1" },
      { origin: trustedOrigin },
      { origin: trustedOrigin, "x-gms-csrf": "1", "sec-fetch-site": "cross-site" },
      { origin: trustedOrigin, "x-gms-csrf": "1", "sec-fetch-site": "same-origin, cross-site" },
      { origin: [trustedOrigin, trustedOrigin], "x-gms-csrf": "1" },
    ];
    for (const headers of invalidHeaders) {
      const { subject, fetcher, authorizationReader, checkLicense } = adapter();
      await expect(subject.create({ method: "POST", headers: { cookie: `gms_access=${token}`, ...headers } }))
        .rejects.toMatchObject({ code: "FORBIDDEN", message: "CSRF_INVALID" });
      expect(fetcher).not.toHaveBeenCalled();
      expect(authorizationReader).not.toHaveBeenCalled();
      expect(checkLicense).not.toHaveBeenCalled();
    }
  });

  it("UT-GPMT-10 accepts a valid mutation CSRF before continuing through JWT, auth-view and license checks", async () => {
    const { subject, fetcher, authorizationReader, checkLicense } = adapter();
    const token = await accessToken();
    await expect(subject.create(request(token, "POST", { origin: trustedOrigin, "x-gms-csrf": "1", "sec-fetch-site": "same-origin" })))
      .resolves.toMatchObject({ csrfVerified: true, license: "ELIGIBLE" });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(authorizationReader).toHaveBeenCalledOnce();
    expect(checkLicense).toHaveBeenCalledOnce();
  });

  it("UT-GPMT-10 permits a same-site mutation and does not require Fetch Metadata when absent", async () => {
    const token = await accessToken();
    for (const fetchSite of ["same-site", undefined]) {
      const { subject } = adapter();
      const headers = { origin: trustedOrigin, "x-gms-csrf": "1", ...(fetchSite ? { "sec-fetch-site": fetchSite } : {}) };
      await expect(subject.create(request(token, "POST", headers))).resolves.toMatchObject({ csrfVerified: true });
    }
  });

  it("UT-GPMT-11 never accepts duplicate or oversized access-cookie headers", async () => {
    const { subject } = adapter();
    const token = await accessToken();
    await expect(subject.create({ method: "GET", headers: { cookie: `gms_access=${token}; gms_access=${token}` } })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(subject.create({ method: "GET", headers: { cookie: `gms_access=${token}${"a".repeat(8_200)}` } })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
