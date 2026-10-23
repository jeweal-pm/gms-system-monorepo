import { generateKeyPairSync, randomUUID } from "node:crypto";
import { createServer, type Server, type ServerResponse } from "node:http";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testUrl = process.env.LICENSE_TEST_DATABASE_URL;
const canRun = Boolean(testUrl && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(testUrl));
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const userId = `license-v2-it-${randomUUID()}`;
const subject = `license-v2-it-${randomUUID().slice(0, 8)}@example.test`;
const instance = "license-v2-it";
const issuer = "license-v2-it-issuer";

type Upstream = { status: number; token?: string; code?: string };
let upstream: Upstream = { status: 503, code: "UPSTREAM_UNAVAILABLE" };
let deferred = false;
const pending: ServerResponse[] = [];
let server: Server;
let prisma: typeof import("../../src/database/prisma-client").prisma;
let license: InstanceType<typeof import("../../src/license/license.service").LicenseService>;

async function signed(status: "active" | "revoked", signedSubject = subject) {
  const now = Math.floor(Date.now() / 1_000);
  return new SignJWT({ instance, type: "paid", status, contract_version: 2,
    license_expires_at: new Date((now + 90 * 86_400) * 1_000).toISOString(),
  }).setProtectedHeader({ alg: "EdDSA", kid: "it" }).setIssuer(issuer)
    .setAudience("f1-system-customer-backend").setSubject(signedSubject)
    .setIssuedAt(now).setExpirationTime(now + 3 * 86_400).sign(privateKey);
}

function respond(response: ServerResponse, answer: Upstream) {
  response.writeHead(answer.status, { "content-type": "application/json" });
  response.end(JSON.stringify(answer.status === 200
    ? { token: answer.token }
    : { error: { code: answer.code, message: "controlled test response" } }));
}

async function waitForPending(count: number) {
  const deadline = Date.now() + 2_000;
  while (pending.length < count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  if (pending.length < count) throw new Error("timed out waiting for controlled HTTP requests");
}

describe.runIf(canRun)("GP-LIC-05 isolated PostgreSQL and local HTTP integration", () => {
  beforeAll(async () => {
    vi.stubEnv("DATABASE_URL", testUrl!);
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("LICENSE_MODE", "remote");
    vi.stubEnv("LICENSE_INSTANCE_ID", instance);
    vi.stubEnv("LICENSE_INSTANCE_API_KEY", "test-only-key");
    vi.stubEnv("LICENSE_JWT_ISSUER", issuer);
    vi.stubEnv("LICENSE_PUBLIC_KEYS_JSON", JSON.stringify({ it: publicKey.export({ format: "der", type: "spki" }).toString("base64") }));
    vi.stubEnv("LICENSE_OFFLINE_GRACE_DAYS", "2");
    server = createServer((request, response) => {
      if (request.headers["x-license-contract-version"] !== "2") {
        respond(response, { status: 406, code: "UNSUPPORTED_CONTRACT" });
        return;
      }
      if (deferred) pending.push(response);
      else respond(response, upstream);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server address missing");
    vi.stubEnv("LICENSE_API_URL", `http://127.0.0.1:${address.port}`);
    ({ prisma } = await import("../../src/database/prisma-client"));
    const { LicenseService } = await import("../../src/license/license.service");
    license = new LicenseService();
    const now = new Date();
    await prisma.user.create({ data: {
      id: userId, name: "License integration fixture", username: subject,
      email: `${userId}@users.invalid`, createdAt: now, updatedAt: now,
    } });
  });

  afterAll(async () => {
    for (const response of pending.splice(0)) respond(response, { status: 503, code: "UNAVAILABLE" });
    if (prisma) {
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    }
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    vi.unstubAllEnvs();
  });

  it("stores verified active proof with database time, then denies reachable revoke and outage", async () => {
    upstream = { status: 200, token: await signed("active") };
    expect((await license.resolveCurrentStatus(userId)).state).toBe("VALID");
    const saved = await prisma.licenseCurrentDecision.findUniqueOrThrow({ where: { userId } });
    expect(saved.state).toBe("ACTIVE");
    expect(saved.signedToken).toBe(upstream.token);
    expect(Math.abs(Date.now() - saved.successfulAt!.getTime())).toBeLessThan(5_000);
    expect(await prisma.licenseCache.findUnique({ where: { userId } })).toBeNull();

    upstream = { status: 200, token: await signed("revoked") };
    expect((await license.resolveCurrentStatus(userId)).state).toBe("REVOKED");
    expect((await prisma.licenseCurrentDecision.findUniqueOrThrow({ where: { userId } })).state).toBe("DENIED");
    upstream = { status: 503, code: "UNAVAILABLE" };
    await expect(license.resolveCurrentStatus(userId)).rejects.toMatchObject({ code: "LICENSE_UNVERIFIABLE" });
  });

  it("uses fixed database time and refuses grace after two days", async () => {
    upstream = { status: 200, token: await signed("active") };
    expect((await license.resolveCurrentStatus(userId)).state).toBe("VALID");
    upstream = { status: 503, code: "UNAVAILABLE" };
    expect((await license.resolveCurrentStatus(userId)).state).toBe("GRACE");
    await prisma.$executeRaw`UPDATE "auth"."LicenseCurrentDecision" SET "successful_at" = NOW() - INTERVAL '2 days' WHERE "user_id" = ${userId}`;
    await expect(license.resolveCurrentStatus(userId)).rejects.toMatchObject({ code: "LICENSE_UNVERIFIABLE" });
  });

  it("persists 404 denial and permits only a later verified reactivation", async () => {
    upstream = { status: 404, code: "LICENSE_NOT_FOUND" };
    expect((await license.resolveCurrentStatus(userId)).state).toBe("REQUIRED");
    const denied = await prisma.licenseCurrentDecision.findUniqueOrThrow({ where: { userId } });
    expect(denied.state).toBe("DENIED");
    expect(denied.signedToken).toBeNull();
    upstream = { status: 503, code: "UNAVAILABLE" };
    await expect(license.resolveCurrentStatus(userId)).rejects.toMatchObject({ code: "LICENSE_UNVERIFIABLE" });
    upstream = { status: 200, token: await signed("active") };
    expect((await license.resolveCurrentStatus(userId)).state).toBe("VALID");
  });

  it("rejects a mismatched signed subject and persists 429 denial", async () => {
    upstream = { status: 200, token: await signed("active", "other@example.test") };
    await expect(license.resolveCurrentStatus(userId)).rejects.toMatchObject({ code: "LICENSE_UNVERIFIABLE" });
    expect((await prisma.licenseCurrentDecision.findUniqueOrThrow({ where: { userId } })).state).toBe("DENIED");
    upstream = { status: 429, code: "RATE_LIMIT" };
    await expect(license.resolveCurrentStatus(userId)).rejects.toMatchObject({ httpStatus: 503 });
    upstream = { status: 503, code: "UNAVAILABLE" };
    await expect(license.resolveCurrentStatus(userId)).rejects.toMatchObject({ code: "LICENSE_UNVERIFIABLE" });
  });

  it("prevents older active response from overwriting later 404 across service instances", async () => {
    const { LicenseService } = await import("../../src/license/license.service");
    const secondInstance = new LicenseService();
    deferred = true;
    try {
      const oldActive = license.resolveCurrentStatus(userId);
      await waitForPending(1);
      const newerDenied = secondInstance.resolveCurrentStatus(userId);
      await waitForPending(2);
      respond(pending.pop()!, { status: 404, code: "LICENSE_NOT_FOUND" });
      expect((await newerDenied).state).toBe("REQUIRED");
      respond(pending.pop()!, { status: 200, token: await signed("active") });
      await expect(oldActive).rejects.toMatchObject({ code: "LICENSE_UNVERIFIABLE" });
    } finally {
      deferred = false;
    }
    const final = await prisma.licenseCurrentDecision.findUniqueOrThrow({ where: { userId } });
    expect(final.state).toBe("DENIED");
    expect(final.signedToken).toBeNull();
    upstream = { status: 503, code: "UNAVAILABLE" };
    await expect(license.resolveCurrentStatus(userId)).rejects.toMatchObject({ code: "LICENSE_UNVERIFIABLE" });
  });

  it("prevents older active response from overwriting later signed revoke", async () => {
    const { LicenseService } = await import("../../src/license/license.service");
    const secondInstance = new LicenseService();
    deferred = true;
    try {
      const oldActive = license.resolveCurrentStatus(userId);
      await waitForPending(1);
      const newerRevoked = secondInstance.resolveCurrentStatus(userId);
      await waitForPending(2);
      respond(pending.pop()!, { status: 200, token: await signed("revoked") });
      expect((await newerRevoked).state).toBe("REVOKED");
      respond(pending.pop()!, { status: 200, token: await signed("active") });
      await expect(oldActive).rejects.toMatchObject({ code: "LICENSE_UNVERIFIABLE" });
    } finally {
      deferred = false;
    }
    expect((await prisma.licenseCurrentDecision.findUniqueOrThrow({ where: { userId } })).state).toBe("DENIED");
  });
});
