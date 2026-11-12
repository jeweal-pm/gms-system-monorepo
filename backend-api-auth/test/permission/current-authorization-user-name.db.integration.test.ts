import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * IT-AP-B12 (approve-center SA rev 1 / ADR-0046 D5, backend started 2026-11-10): migration
 * `20261107090000_current_authorization_user_name` appends `user_name` (the session owner's User.name) as the LAST
 * column of `auth.current_authorization`, keeps the earlier columns in order, keeps `security_barrier`, keeps the
 * view's existing SELECT grant to `gms_master_authz_reader` when that role is provisioned, and the reader still
 * cannot read any auth table. The migration file is re-applied (it is idempotent: CREATE OR REPLACE) to prove the
 * grant survives the replacement.
 *
 * Opt-in like the other auth DB integrations: runs only with `AUTH_TEST_DATABASE_URL` pointing at a disposable
 * `f1_system` database on 127.0.0.1 with an explicit port other than 5432, migrated with `prisma migrate deploy`.
 * Only the user created here is touched and removed.
 */

const testUrl = process.env.AUTH_TEST_DATABASE_URL;
const canRun = Boolean(testUrl && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(testUrl));
const MIGRATION = path.resolve(__dirname, "../../prisma/migrations/20261107090000_current_authorization_user_name/migration.sql");
const EXPECTED_COLUMNS = ["session_id", "user_id", "session_expires_at", "account_active", "account_role", "last_license_state", "permissions", "location_keys", "user_name"];

let prisma: typeof import("../../src/database/prisma-client").prisma;
const userId = `view-name-it-${randomUUID()}`;
const sessionId = `view-name-it-${randomUUID()}`;

describe.runIf(canRun)("IT-AP-B12 current_authorization.user_name on PostgreSQL", () => {
  beforeAll(async () => {
    vi.stubEnv("DATABASE_URL", testUrl!);
    ({ prisma } = await import("../../src/database/prisma-client"));
    const now = new Date();
    await prisma.user.create({
      data: {
        id: userId, name: "Mint Approver", username: `${userId}@example.test`, email: `${userId}@users.invalid`, createdAt: now, updatedAt: now,
        permissions: { create: [{ menuKey: "reserve", action: "APPROVE" }] },
        sessions: { create: { id: sessionId, token: `view-name-${randomUUID()}`, expiresAt: new Date(Date.now() + 60_000), createdAt: now, updatedAt: now } },
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    }
    vi.unstubAllEnvs();
  });

  it("appends user_name last, keeps security_barrier and the reader grant across a re-apply", async () => {
    const sql = await readFile(MIGRATION, "utf8");
    expect(sql).toMatch(/CREATE OR REPLACE VIEW "auth"\."current_authorization" WITH \(security_barrier = true\)/);
    const statement = sql.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n").trim();
    await prisma.$executeRawUnsafe(statement);

    const columns = await prisma.$queryRaw<{ attname: string }[]>`
      SELECT attname FROM pg_attribute WHERE attrelid = 'auth.current_authorization'::regclass AND attnum > 0 AND NOT attisdropped ORDER BY attnum`;
    expect(columns.map((column) => column.attname)).toEqual(EXPECTED_COLUMNS);
    const [options] = await prisma.$queryRaw<{ reloptions: string[] | null }[]>`SELECT reloptions FROM pg_class WHERE oid = 'auth.current_authorization'::regclass`;
    expect(options.reloptions).toContain("security_barrier=true");

    const [row] = await prisma.$queryRaw<{ user_id: string; user_name: string; permissions: string[] }[]>`
      SELECT user_id, user_name, permissions FROM "auth"."current_authorization" WHERE session_id = ${sessionId}`;
    expect(row).toEqual({ user_id: userId, user_name: "Mint Approver", permissions: ["reserve:APPROVE"] });

    const [role] = await prisma.$queryRaw<{ exists: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gms_master_authz_reader') AS "exists"`;
    if (role.exists) {
      const [privileges] = await prisma.$queryRaw<{ view: boolean; users: boolean; sessions: boolean }[]>`
        SELECT has_table_privilege('gms_master_authz_reader', 'auth.current_authorization', 'SELECT') AS "view",
               has_table_privilege('gms_master_authz_reader', 'auth."User"', 'SELECT') AS "users",
               has_table_privilege('gms_master_authz_reader', 'auth."Session"', 'SELECT') AS "sessions"`;
      expect(privileges).toEqual({ view: true, users: false, sessions: false });
    }
  });

  it("passes a renamed user's stored name through on the next read", async () => {
    await prisma.user.update({ where: { id: userId }, data: { name: "  Mint  " } });
    const [row] = await prisma.$queryRaw<{ user_name: string }[]>`SELECT user_name FROM "auth"."current_authorization" WHERE session_id = ${sessionId}`;
    // The view passes the stored value through; trimming and the 200-character bound are the master reader's job.
    expect(row.user_name).toBe("  Mint  ");
  });
});
