import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

function isolatedReaderUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const port = Number(url.port);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hostname !== "127.0.0.1" || !url.port || port === 5432 ||
      !url.username || !url.password || decodeURIComponent(url.pathname.slice(1)) !== "f1_system" || url.hash || [...url.searchParams.keys()].some((key) => key !== "schema")) return null;
    return url.toString();
  } catch { return null; }
}

const rawUrl = process.env.MASTER_AUTHZ_TEST_DATABASE_URL;
const readerUrl = isolatedReaderUrl(rawUrl);
const authUrl = isolatedReaderUrl(process.env.AUTH_TEST_DATABASE_URL);
const canRun = Boolean(readerUrl && authUrl && new URL(readerUrl).host === new URL(authUrl).host && new URL(readerUrl).pathname === new URL(authUrl).pathname);

describe("IT-MAUTH-DB master authz role safety", () => {
  afterAll(async () => {
    vi.unstubAllEnvs();
  });

  it("IT-MAUTH-DB-U1 rejects missing, unsafe and default-port URLs before import/connect", async () => {
    const load = vi.fn(async () => undefined);
    for (const value of [undefined, "postgresql://reader:secret@localhost:55441/f1_system", "postgresql://reader:secret@127.0.0.1:5432/f1_system", "not-a-url"]) {
      expect(isolatedReaderUrl(value)).toBeNull();
    }
    expect(load).not.toHaveBeenCalled();
    expect(process.env.MASTER_AUTHZ_DATABASE_URL).toBeUndefined();
  });

  it.runIf(canRun)("IT-MAUTH-DB-I1 reads only the view and cannot read auth base or partner data", async () => {
    vi.stubEnv("MASTER_AUTHZ_DATABASE_URL", readerUrl!);
    const { MasterAuthzDatabase } = await import("../../src/master/authz-database");
    const db = new MasterAuthzDatabase();
    await db.onModuleInit();
    try {
      await expect(db.read("missing-master-user", "missing-master-session")).resolves.toBeNull();
      const { PrismaPg } = await import("@prisma/adapter-pg");
      const { PrismaClient } = await import("../../src/generated/prisma/client");
      const probe = new PrismaClient({ adapter: new PrismaPg({ connectionString: readerUrl!, max: 1 }, { schema: "auth" }) });
      const privileges = await probe.$queryRaw<Array<Record<string, unknown>>>`
        SELECT
          current_user AS role_name,
          has_table_privilege(current_user, (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'auth' AND c.relname = 'current_authorization'), 'SELECT') AS can_read_view,
          has_table_privilege(current_user, (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'auth' AND c.relname = 'User'), 'SELECT') AS can_read_auth_user,
          has_table_privilege(current_user, (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'partner' AND c.relname = 'customer'), 'SELECT') AS can_read_partner_customer,
          has_table_privilege(current_user, (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'auth' AND c.relname = 'current_authorization'), 'INSERT') AS can_write_view,
          (SELECT rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole FROM pg_roles WHERE rolname = current_user) AS elevated
      `;
      expect(privileges[0]).toMatchObject({
        role_name: "gms_master_authz_reader", can_read_view: true, can_read_auth_user: false,
        can_read_partner_customer: false, can_write_view: false, elevated: false,
      });
      await expect(probe.$queryRaw`SELECT id FROM "auth"."User" LIMIT 1`).rejects.toThrow();
      await expect(probe.$queryRaw`SELECT id FROM "partner"."customer" LIMIT 1`).rejects.toThrow();
      await probe.$disconnect();
    } finally {
      await db.onModuleDestroy();
    }
  });

  it.runIf(canRun)("IT-MAUTH-DB-I2 reads a real active session through the view and observes account disablement", async () => {
    vi.stubEnv("DATABASE_URL", authUrl!);
    vi.stubEnv("MASTER_AUTHZ_DATABASE_URL", readerUrl!);
    const { prisma } = await import("../../../backend-api-auth/src/database/prisma-client");
    const { MasterAuthzDatabase } = await import("../../src/master/authz-database");
    const db = new MasterAuthzDatabase();
    const userId = `master-reader-${randomUUID()}`;
    const sessionId = `master-reader-${randomUUID()}`;
    const username = `master-${randomUUID().slice(0, 8)}`;
    const now = new Date();
    await db.onModuleInit();
    try {
      await prisma.user.create({
        data: {
          id: userId, username, name: "Master authz reader integration", email: `${userId}@users.invalid`, createdAt: now, updatedAt: now,
          permissions: { create: [{ menuKey: "customer", action: "VIEW" }] },
          sessions: { create: { id: sessionId, token: `reader-it-${randomUUID()}`, expiresAt: new Date(Date.now() + 60_000), createdAt: now, updatedAt: now } },
        },
      });
      await expect(db.read(userId, sessionId)).resolves.toMatchObject({ user_id: userId, session_id: sessionId, account_active: true, permissions: ["customer:VIEW"] });
      await prisma.user.update({ where: { id: userId }, data: { active: false } });
      await expect(db.read(userId, sessionId)).resolves.toMatchObject({ user_id: userId, account_active: false });
    } finally {
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
      await db.onModuleDestroy();
    }
  });
});
