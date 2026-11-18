import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../../src/platform/db";
import { AuthzDatabase } from "../../src/platform/auth/authz-db";

/**
 * IT-LS-B01 (inventory part) + BE-LS-001 on PostgreSQL with the PROVISIONED roles (prisma/roles/*.sql run by the
 * owner, then the inventory migration run as gms_inventory_migrator):
 * - gms_inventory_app: DML in schema inventory only; stock_movement INSERT / SELECT only; no partner / auth access;
 * - gms_inventory_authz_reader: reads the live authorization row and approvers from the two auth views only;
 * - the seeded approval settings (3 rows, ON).
 * Opt-in: INVENTORY_APP_TEST_DATABASE_URL and INVENTORY_AUTHZ_TEST_DATABASE_URL (role URLs on the disposable database)
 * plus INVENTORY_TEST_DATABASE_URL (owner, for fixtures).
 */
const local = (url: string | undefined) => Boolean(url && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(url));
const ownerUrl = process.env.INVENTORY_TEST_DATABASE_URL;
const appUrl = process.env.INVENTORY_APP_TEST_DATABASE_URL;
const readerUrl = process.env.INVENTORY_AUTHZ_TEST_DATABASE_URL;
const canRun = local(ownerUrl) && local(appUrl) && local(readerUrl);

describe.runIf(canRun)("IT-LS roles and live authorization on PostgreSQL", () => {
  let owner: Db;
  let app: Db;
  let reader: AuthzDatabase;
  const userId = `inv-authz-${randomUUID().slice(0, 8)}`;
  const sessionId = randomUUID();

  beforeAll(async () => {
    owner = createDb(ownerUrl!);
    app = createDb(appUrl!);
    reader = new AuthzDatabase(readerUrl!);
    await owner.$executeRawUnsafe(`INSERT INTO auth."User" (id, name, email, role, "createdAt", "updatedAt", username, active) VALUES ($1, 'Approver One', $2, 'user', now(), now(), $3, true)`, userId, `${userId}@example.test`, userId);
    await owner.$executeRawUnsafe(`INSERT INTO auth."Session" (id, "expiresAt", token, "createdAt", "updatedAt", "userId") VALUES ($1, now() + interval '1 hour', $2, now(), now(), $3)`, sessionId, randomUUID(), userId);
    for (const action of ["VIEW", "APPROVE"]) {
      await owner.$executeRawUnsafe(`INSERT INTO auth."UserPermission" (user_id, menu_key, action) VALUES ($1, 'load-to-stock', $2::auth."PermissionAction")`, userId, action);
    }
  });

  afterAll(async () => {
    await owner?.$executeRawUnsafe(`DELETE FROM auth."User" WHERE id = $1`, userId);
    await Promise.all([owner?.$disconnect(), app?.$disconnect(), reader?.disconnect()]);
  });

  it("app role: DML in inventory; stock_movement append-only; nothing in partner / auth; settings seeded ON", async () => {
    const seeded = await app.$queryRaw<{ type: string; require_approval: boolean }[]>`SELECT "type", "require_approval" FROM "inventory"."approval_setting" ORDER BY "type"`;
    expect(seeded).toEqual([{ type: "load-to-stock", require_approval: true }, { type: "merge-split", require_approval: true }, { type: "stock-transfer-location", require_approval: true }]);
    const grants = await owner.$queryRaw<{ table_name: string; privilege_type: string }[]>`
      SELECT table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee = 'gms_inventory_app' AND table_name = 'stock_movement' ORDER BY privilege_type`;
    expect(grants.map((row) => row.privilege_type)).toEqual(["INSERT", "SELECT"]);
    await expect(app.$executeRawUnsafe(`UPDATE "inventory"."stock_movement" SET "pcs_delta" = 0 WHERE false`)).rejects.toThrow(/permission denied/);
    await expect(app.$executeRawUnsafe(`DELETE FROM "inventory"."stock_movement" WHERE false`)).rejects.toThrow(/permission denied/);
    await expect(app.$queryRawUnsafe(`SELECT 1 FROM "partner"."purchase_line" LIMIT 1`)).rejects.toThrow(/permission denied/);
    await expect(app.$queryRawUnsafe(`SELECT 1 FROM auth."User" LIMIT 1`)).rejects.toThrow(/permission denied/);
    await expect(app.$executeRawUnsafe(`CREATE TABLE "inventory"."x" (id int)`)).rejects.toThrow(/permission denied/);
    const owners = await owner.$queryRaw<{ owner: string }[]>`SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname = 'inventory'`;
    expect(owners[0].owner).toBe("gms_inventory_migrator");
  });

  it("authz reader: the live row of a session and the approvers of load-to-stock (APPROVE + VIEW), nothing else", async () => {
    const row = await reader.read(userId, sessionId);
    expect(row).toMatchObject({ user_id: userId, session_id: sessionId, account_active: true, account_role: "user" });
    expect(row?.permissions).toEqual(expect.arrayContaining(["load-to-stock:APPROVE", "load-to-stock:VIEW"]));
    expect(await reader.read(userId, randomUUID())).toBeNull();
    expect(await reader.approvers("load-to-stock")).toContain(userId);
    expect(await reader.approvers("merge-split")).not.toContain(userId);
    expect(await reader.approvers("bad leaf!")).toEqual([]);
  });
});
