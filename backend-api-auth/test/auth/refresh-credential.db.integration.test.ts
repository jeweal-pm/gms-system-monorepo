import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testUrl = process.env.AUTH_TEST_DATABASE_URL;
const canRun = Boolean(testUrl && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(testUrl));
const userId = `refresh-it-${randomUUID()}`;
const sessionId = `refresh-session-${randomUUID()}`;
let prisma: typeof import("../../src/database/prisma-client").prisma;
let store: InstanceType<typeof import("../../src/auth/refresh-credential").RefreshCredentialStore>;

describe.runIf(canRun)("GP-AT-03/04 isolated PostgreSQL refresh and live view", () => {
  beforeAll(async () => {
    vi.stubEnv("DATABASE_URL", testUrl!);
    ({ prisma } = await import("../../src/database/prisma-client"));
    const { RefreshCredentialStore } = await import("../../src/auth/refresh-credential");
    store = new RefreshCredentialStore();
    const now = new Date();
    await prisma.user.create({ data: {
      id: userId, name: "Refresh integration fixture", username: `refresh-${randomUUID().slice(0, 8)}`,
      email: `${userId}@users.invalid`, createdAt: now, updatedAt: now,
      sessions: { create: {
        id: sessionId, token: `test-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 2 * 86_400_000), createdAt: now, updatedAt: now,
      } },
    } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    }
    vi.unstubAllEnvs();
  });

  it("stores hashes only, rotates once across concurrent calls, and revokes the family on replay", async () => {
    const raw = await store.create(userId, sessionId);
    const persisted = await prisma.refreshCredential.findFirstOrThrow({ where: { family: { userId } } });
    expect(persisted.tokenHash).not.toBe(raw);
    expect(persisted.tokenHash).toHaveLength(64);
    const competing = await Promise.all([store.rotate(raw), store.rotate(raw)]);
    expect(competing.map((result) => result.state).sort()).toEqual(["reused", "rotated"]);
    const first = competing.find((result) => result.state === "rotated");
    if (!first || first.state !== "rotated") throw new Error("rotation failed");
    expect(first).toMatchObject({ userId, sessionId });
    expect(first.secret).not.toBe(raw);
    expect(await store.rotate(first.secret)).toEqual({ state: "invalid" });
    expect((await prisma.refreshFamily.findFirstOrThrow({ where: { userId } })).revokedAt).not.toBeNull();
  });

  it("accepts only one active family and revokes on session invalidation", async () => {
    const old = await store.create(userId, sessionId);
    const latest = await store.create(userId, sessionId);
    expect(await store.rotate(old)).toEqual({ state: "invalid" });
    await store.revokeForSession(sessionId);
    expect(await store.rotate(latest)).toEqual({ state: "invalid" });
    expect(await prisma.refreshFamily.count({ where: { userId, revokedAt: null } })).toBe(0);
  });

  it("revokes all user refresh families on password-change invalidation", async () => {
    await prisma.user.update({ where: { id: userId }, data: { active: true } });
    await prisma.session.update({ where: { id: sessionId }, data: { expiresAt: new Date(Date.now() + 86_400_000) } });
    const current = await store.create(userId, sessionId);
    await store.revokeForUser(userId);
    expect(await store.rotate(current)).toEqual({ state: "invalid" });
    expect(await prisma.refreshFamily.count({ where: { userId, revokedAt: null } })).toBe(0);
  });

  it("the auth-owned view exposes current session, account, PRICE grant and location but no secrets", async () => {
    await prisma.userPermission.create({ data: { userId, menuKey: "vendor", action: "PRICE" } });
    await prisma.userLocation.create({ data: { userId, locationKey: "bkk" } });
    const [initial] = await prisma.$queryRaw<Array<{
      session_id: string; account_active: boolean; permissions: string[]; location_keys: string[];
    }>>`SELECT * FROM "auth"."current_authorization" WHERE session_id = ${sessionId}`;
    expect(initial).toMatchObject({ session_id: sessionId, account_active: true,
      permissions: ["vendor:PRICE"], location_keys: ["bkk"] });
    expect(initial).not.toHaveProperty("token");
    expect(initial).not.toHaveProperty("signed_token");
    await prisma.userPermission.delete({ where: { userId_menuKey_action: { userId, menuKey: "vendor", action: "PRICE" } } });
    const [after] = await prisma.$queryRaw<Array<{ permissions: string[] }>>`
      SELECT permissions FROM "auth"."current_authorization" WHERE session_id = ${sessionId}`;
    expect(after.permissions).toEqual([]);
    await prisma.user.update({ where: { id: userId }, data: { active: false } });
    const [deactivated] = await prisma.$queryRaw<Array<{ account_active: boolean }>>`
      SELECT account_active FROM "auth"."current_authorization" WHERE session_id = ${sessionId}`;
    expect(deactivated.account_active).toBe(false);
  });

  it("blocks a revoked account and expired session from receiving new credentials", async () => {
    await expect(store.create(userId, sessionId)).rejects.toThrow("Session is not active");
    await prisma.user.update({ where: { id: userId }, data: { active: true } });
    const beforeDeactivation = await store.create(userId, sessionId);
    await prisma.user.update({ where: { id: userId }, data: { active: false } });
    expect(await store.rotate(beforeDeactivation)).toEqual({ state: "invalid" });
    await prisma.user.update({ where: { id: userId }, data: { active: true } });
    await prisma.session.update({ where: { id: sessionId }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    await expect(store.create(userId, sessionId)).rejects.toThrow("Session is not active");
    await store.revokeForUser(userId);
  });
});
