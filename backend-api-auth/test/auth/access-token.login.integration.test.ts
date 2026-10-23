import { generateKeyPairSync, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { JWK } from "jose";

const testUrl = process.env.AUTH_TEST_DATABASE_URL;
const canRun = Boolean(testUrl && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(testUrl));

describe.runIf(canRun)("IT-GPAUTH-01 isolated Better Auth username sign-in JWT cookie", () => {
  let resetEligibility = () => {};
  afterAll(() => {
    resetEligibility();
    vi.unstubAllEnvs();
  });

  it("preserves Better Auth login and only adds a verified access cookie for eligible users", async () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    vi.stubEnv("DATABASE_URL", testUrl!);
    vi.stubEnv("AUTH_SECRET", "gms-auth-access-integration-secret-32-bytes");
    vi.stubEnv("AUTH_ACCESS_JWT_ISSUER", "http://localhost:3101");
    vi.stubEnv("AUTH_ACCESS_JWT_KEYS", JSON.stringify([{ kid: "login-it", privateJwk: privateKey.export({ format: "jwk" }) }]));
    vi.stubEnv("FRONTEND_URL", "http://localhost:3000");
    vi.resetModules();

    const { prisma } = await import("../../src/database/prisma-client");
    const { auth } = await import("../../src/auth/auth");
    const { registerAccessTokenEligibilityCheck, resetAccessTokenEligibilityCheckForTests } = await import("../../src/auth/access-token");
    resetEligibility = resetAccessTokenEligibilityCheckForTests;
    const { default: argon2 } = await import("argon2");
    const { importJWK, jwtVerify } = await import("jose");
    const eligibleId = `access-it-${randomUUID()}`;
    const deniedId = `access-it-${randomUUID()}`;
    const eligibleUsername = `access-${randomUUID().slice(0, 8)}`;
    const deniedUsername = `access-${randomUUID().slice(0, 8)}`;
    const password = "Integration-password-123";
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const now = new Date();

    try {
      for (const [id, username] of [[eligibleId, eligibleUsername], [deniedId, deniedUsername]] as const) {
        await prisma.user.create({ data: {
          id, username, name: "JWT integration", email: `${id}@users.invalid`, createdAt: now, updatedAt: now,
          accounts: { create: { id: `account-${id}`, accountId: id, providerId: "credential", password: passwordHash, createdAt: now, updatedAt: now } },
        } });
      }
      registerAccessTokenEligibilityCheck(async (userId) => userId === eligibleId);

      async function signIn(username: string) {
        return auth.handler(new Request("http://localhost:3101/api/auth/sign-in/username", {
          method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000" },
          body: JSON.stringify({ username, password, rememberMe: false }),
        }));
      }

      const eligibleResponse = await signIn(eligibleUsername);
      expect(eligibleResponse.status).toBe(200);
      const eligibleCookies = eligibleResponse.headers.getSetCookie();
      expect(eligibleCookies.some((cookie) => cookie.startsWith("gms_access="))).toBe(true);
      expect(eligibleCookies.some((cookie) => cookie.startsWith("gms_refresh=") && cookie.includes("HttpOnly") && cookie.includes("SameSite=Lax") && cookie.includes("Path=/api/auth/refresh"))).toBe(true);
      const accessCookie = eligibleCookies.find((cookie) => cookie.startsWith("gms_access="))!;
      expect(accessCookie).toContain("HttpOnly");
      expect(accessCookie).toContain("SameSite=Lax");
      expect(accessCookie).toContain("Path=/");
      const token = accessCookie.slice("gms_access=".length).split(";")[0];
      const privateJwk = privateKey.export({ format: "jwk" }) as JWK;
      const { d: _privateScalar, ...publicJwk } = privateJwk;
      const verifier = await importJWK(publicJwk, "EdDSA");
      await expect(jwtVerify(token, verifier, { issuer: "http://localhost:3101", audience: "gms-domain-api" })).resolves.toMatchObject({
        payload: { sub: eligibleId, sid: expect.any(String) },
      });

      const deniedResponse = await signIn(deniedUsername);
      expect(deniedResponse.status).toBe(200);
      expect(deniedResponse.headers.getSetCookie().some((cookie) => cookie.startsWith("gms_access="))).toBe(false);
      expect(deniedResponse.headers.getSetCookie().some((cookie) => cookie.startsWith("gms_refresh="))).toBe(false);
      expect(deniedResponse.headers.getSetCookie().some((cookie) => /session_token|better-auth/i.test(cookie))).toBe(true);
    } finally {
      resetAccessTokenEligibilityCheckForTests();
      await prisma.user.deleteMany({ where: { id: { in: [eligibleId, deniedId] } } });
      await prisma.$disconnect();
    }
  });
});
