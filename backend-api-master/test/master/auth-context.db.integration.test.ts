import { generateKeyPairSync, randomUUID } from "node:crypto";
import { SignJWT, type JWK } from "jose";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

type DatabaseTarget = { protocol: string; hostname: string; port: number; database: string };

/** Accept only an explicitly addressed disposable loopback DB; never rely on runtime fallbacks. */
function parseIsolatedTestUrl(value: string | undefined, variable: string): { url: string; target: DatabaseTarget } {
  if (!value) throw new Error(`${variable} must be set to an isolated PostgreSQL test URL`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${variable} must be a valid PostgreSQL URL`);
  }
  const port = Number(parsed.port);
  const database = decodeURIComponent(parsed.pathname.slice(1));
  const allowedSearch = [...parsed.searchParams.keys()].every((key) => key === "schema");
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    parsed.hostname !== "127.0.0.1" ||
    !parsed.port || !Number.isInteger(port) || port < 1 || port > 65535 || port === 5432 ||
    !parsed.username || !parsed.password || database !== "f1_system" ||
    parsed.hash || !allowedSearch
  ) {
    throw new Error(`${variable} must target f1_system on 127.0.0.1 at an explicit non-5432 port`);
  }
  return { url: parsed.toString(), target: { protocol: parsed.protocol, hostname: parsed.hostname, port, database } };
}

/** Validate both service URLs before any Prisma import, then pin the exact validated values. */
async function loadWithIsolatedTestUrls<T>(
  env: NodeJS.ProcessEnv,
  loadClients: () => Promise<T>,
): Promise<T> {
  const auth = parseIsolatedTestUrl(env.AUTH_TEST_DATABASE_URL, "AUTH_TEST_DATABASE_URL");
  const partner = parseIsolatedTestUrl(env.PARTNER_TEST_DATABASE_URL, "PARTNER_TEST_DATABASE_URL");
  if (JSON.stringify(auth.target) !== JSON.stringify(partner.target)) {
    throw new Error("AUTH_TEST_DATABASE_URL and PARTNER_TEST_DATABASE_URL must target the same isolated database");
  }

  vi.stubEnv("DATABASE_URL", auth.url);
  vi.stubEnv("PARTNER_DATABASE_URL", partner.url);
  vi.resetModules();
  return loadClients();
}

const authUrl = process.env.AUTH_TEST_DATABASE_URL;
const partnerUrl = process.env.PARTNER_TEST_DATABASE_URL;
const canRun = (() => {
  try {
    const auth = parseIsolatedTestUrl(authUrl, "AUTH_TEST_DATABASE_URL");
    const partner = parseIsolatedTestUrl(partnerUrl, "PARTNER_TEST_DATABASE_URL");
    return JSON.stringify(auth.target) === JSON.stringify(partner.target);
  } catch {
    return false;
  }
})();
const userId = `master-auth-it-${randomUUID()}`;
const sessionId = `master-session-it-${randomUUID()}`;
const username = `master-${randomUUID().slice(0, 8)}`;
let authPrisma: typeof import("../../../backend-api-auth/src/database/prisma-client").prisma;
let partnerPrisma: typeof import("../../src/database/prisma-client").prisma;
let adapter: InstanceType<typeof import("../../src/master/auth-context").MasterAuthContextAdapter>;
let token = "";

describe("IT-GPMT-03 isolated PostgreSQL fixture guard", () => {
  it("IT-GPMT-03-U1 rejects a missing URL before importing any Prisma client", async () => {
    const loadClients = vi.fn(async () => undefined);
    await expect(loadWithIsolatedTestUrls({}, loadClients)).rejects.toThrow("AUTH_TEST_DATABASE_URL must be set");
    expect(loadClients).not.toHaveBeenCalled();
  });

  it("IT-GPMT-03-U2 rejects port 5432, non-loopback and malformed targets before database access", async () => {
    const loadClients = vi.fn(async () => undefined);
    const validAuth = "postgresql://auth_test:auth_secret@127.0.0.1:55439/f1_system";
    for (const unsafe of [
      "postgresql://partner_test:partner_secret@127.0.0.1:5432/f1_system",
      "postgresql://partner_test:partner_secret@localhost:55439/f1_system",
      "not-a-url",
    ]) {
      await expect(loadWithIsolatedTestUrls({
        AUTH_TEST_DATABASE_URL: validAuth,
        PARTNER_TEST_DATABASE_URL: unsafe,
      }, loadClients)).rejects.toThrow();
    }
    expect(loadClients).not.toHaveBeenCalled();
  });

  it("IT-GPMT-03-U3 rejects mismatched auth and partner database targets before import", async () => {
    const loadClients = vi.fn(async () => undefined);
    await expect(loadWithIsolatedTestUrls({
      AUTH_TEST_DATABASE_URL: "postgresql://auth_test:auth_secret@127.0.0.1:55439/f1_system",
      PARTNER_TEST_DATABASE_URL: "postgresql://partner_test:partner_secret@127.0.0.1:55440/f1_system",
    }, loadClients)).rejects.toThrow("must target the same isolated database");
    expect(loadClients).not.toHaveBeenCalled();
  });

  it("IT-GPMT-03-U4 pins partner Prisma to the validated URL before client import", async () => {
    const partnerTestUrl = "postgresql://partner_test:partner_secret@127.0.0.1:55439/f1_system";
    vi.stubEnv("PARTNER_DATABASE_URL", "postgresql://untrusted:wrong@localhost:5432/other");
    const loadClients = vi.fn(async () => ({
      authUrl: process.env.DATABASE_URL,
      partnerUrl: process.env.PARTNER_DATABASE_URL,
    }));
    const loaded = await loadWithIsolatedTestUrls({
      AUTH_TEST_DATABASE_URL: "postgresql://auth_test:auth_secret@127.0.0.1:55439/f1_system",
      PARTNER_TEST_DATABASE_URL: partnerTestUrl,
    }, loadClients);
    expect(loaded).toEqual({ authUrl: expect.any(String), partnerUrl: partnerTestUrl });
    expect(loadClients).toHaveBeenCalledOnce();
  });

  afterEach(() => vi.unstubAllEnvs());
});

describe.runIf(canRun)("IT-GPMT-03 isolated PostgreSQL current authorization view boundary", () => {
  beforeAll(async () => {
    const databases = await loadWithIsolatedTestUrls(process.env, async () => {
      const authDatabase = await import("../../../backend-api-auth/src/database/prisma-client");
      const partnerDatabase = await import("../../src/database/prisma-client");
      return { authPrisma: authDatabase.prisma, partnerPrisma: partnerDatabase.prisma };
    });
    authPrisma = databases.authPrisma;
    partnerPrisma = databases.partnerPrisma;

    const now = new Date();
    await authPrisma.user.create({
      data: {
        id: userId, username, name: "Master auth boundary fixture", email: `${userId}@users.invalid`, createdAt: now, updatedAt: now,
        permissions: { create: [{ menuKey: "customer", action: "VIEW" }, { menuKey: "customer", action: "PRICE" }] },
        sessions: { create: { id: sessionId, token: `it-${randomUUID()}`, expiresAt: new Date(Date.now() + 60_000), createdAt: now, updatedAt: now } },
      },
    });

    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const publicJwk = { ...(publicKey.export({ format: "jwk" }) as JWK), kid: "master-db-it", alg: "EdDSA", use: "sig" };
    const issuer = "http://auth.test";
    const nowSeconds = Math.floor(Date.now() / 1000);
    token = await new SignJWT({ sid: sessionId }).setProtectedHeader({ alg: "EdDSA", kid: "master-db-it" })
      .setIssuer(issuer).setAudience("gms-domain-api").setSubject(userId).setIssuedAt(nowSeconds)
      .setNotBefore(nowSeconds).setExpirationTime(nowSeconds + 900).sign(privateKey);
    const { MasterAuthContextAdapter, MasterJwksCache } = await import("../../src/master/auth-context");
    const jwks = new MasterJwksCache(new URL("http://auth.test/api/auth/jwks"), async () => new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 }));
    adapter = new MasterAuthContextAdapter({
      issuer, trustedOrigin: "http://localhost:3000", jwks,
      checkLicense: async () => "ELIGIBLE",
      authorizationReader: async (subject, sid) => {
        const rows = await partnerPrisma.$queryRaw<Array<{
          session_id: string; user_id: string; session_expires_at: Date; account_active: boolean; account_role: string; permissions: string[]; location_keys: string[];
        }>>`SELECT session_id,user_id,session_expires_at,account_active,account_role,permissions,location_keys FROM "auth"."current_authorization" WHERE user_id = ${subject} AND session_id = ${sid} LIMIT 1`;
        return rows[0] ?? null;
      },
    });
  });

  afterAll(async () => {
    if (authPrisma) {
      await authPrisma.user.deleteMany({ where: { id: userId } });
      await authPrisma.$disconnect();
    }
    if (partnerPrisma) await partnerPrisma.$disconnect();
    vi.unstubAllEnvs();
  });

  it("reads current grants through the auth-owned view and observes a grant revocation on the next request", async () => {
    const request = { method: "GET", headers: { cookie: `gms_access=${token}` } };
    await expect(adapter.create(request)).resolves.toMatchObject({ principal: { userId, sessionId, grants: ["customer:PRICE", "customer:VIEW"] } });
    await authPrisma.userPermission.delete({ where: { userId_menuKey_action: { userId, menuKey: "customer", action: "PRICE" } } });
    await expect(adapter.create(request)).resolves.toMatchObject({ principal: { userId, sessionId, grants: ["customer:VIEW"] } });
    await authPrisma.user.update({ where: { id: userId }, data: { active: false } });
    await expect(adapter.create(request)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
