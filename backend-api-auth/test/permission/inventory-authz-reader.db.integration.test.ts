import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "pg";

/**
 * IT-LS-AUTH-03 (BE-LS-001, ADR-0052 D2/D12): the role created by `prisma/roles/provision-inventory-authz-reader.sql`
 * can read only `auth.current_authorization` and `auth.permission_holders` — nothing else in auth, no other schema, no
 * writes, no membership, not a superuser.
 *
 * Opt-in like the other auth DB integrations: needs `AUTH_TEST_DATABASE_URL` (disposable `f1_system` on 127.0.0.1, port
 * other than 5432, migrated) and `INVENTORY_AUTHZ_TEST_DATABASE_URL` (the same database as gms_inventory_authz_reader,
 * after the provisioning script ran as the owner).
 */
const ownerUrl = process.env.AUTH_TEST_DATABASE_URL;
const readerUrl = process.env.INVENTORY_AUTHZ_TEST_DATABASE_URL;
const local = (url: string | undefined) => Boolean(url && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(url));
const canRun = local(ownerUrl) && local(readerUrl);

describe.runIf(canRun)("IT-LS-AUTH-03 gms_inventory_authz_reader privileges", () => {
  let owner: Client;
  let reader: Client;

  beforeAll(async () => {
    vi.stubEnv("DATABASE_URL", ownerUrl!);
    owner = new Client({ connectionString: ownerUrl });
    reader = new Client({ connectionString: readerUrl });
    await owner.connect();
    await reader.connect();
  });

  afterAll(async () => {
    await owner?.end();
    await reader?.end();
    vi.unstubAllEnvs();
  });

  it("has exactly SELECT on the two auth views and no write privilege", async () => {
    const { rows } = await owner.query<{ table_name: string; privilege_type: string }>(
      `SELECT table_schema || '.' || table_name AS table_name, privilege_type FROM information_schema.role_table_grants
       WHERE grantee = 'gms_inventory_authz_reader' ORDER BY 1, 2`);
    expect(rows).toEqual([
      { table_name: "auth.current_authorization", privilege_type: "SELECT" },
      { table_name: "auth.permission_holders", privilege_type: "SELECT" },
    ]);
    const role = await owner.query(`SELECT rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolinherit FROM pg_roles WHERE rolname = 'gms_inventory_authz_reader'`);
    expect(role.rows[0]).toEqual({ rolsuper: false, rolcreaterole: false, rolcreatedb: false, rolbypassrls: false, rolinherit: false });
    const members = await owner.query(`SELECT count(*)::int AS n FROM pg_auth_members m JOIN pg_roles u ON u.oid = m.member WHERE u.rolname = 'gms_inventory_authz_reader'`);
    expect(members.rows[0].n).toBe(0);
    const schemas = await owner.query(`SELECT n.nspname, has_schema_privilege('gms_inventory_authz_reader', n.oid, 'USAGE') AS usage
      FROM pg_namespace n WHERE n.nspname IN ('auth', 'partner', 'stone', 'public') ORDER BY 1`);
    expect(Object.fromEntries(schemas.rows.map((row) => [row.nspname, row.usage]))).toMatchObject({ auth: true, partner: false, stone: false });
  });

  it("reads the views but is refused on auth tables and writes", async () => {
    await expect(reader.query(`SELECT session_id FROM auth.current_authorization LIMIT 1`)).resolves.toBeDefined();
    await expect(reader.query(`SELECT user_id FROM auth.permission_holders LIMIT 1`)).resolves.toBeDefined();
    await expect(reader.query(`SELECT id FROM auth."User" LIMIT 1`)).rejects.toThrow(/permission denied/);
    await expect(reader.query(`SELECT id FROM auth."Session" LIMIT 1`)).rejects.toThrow(/permission denied/);
    await expect(reader.query(`SELECT 1 FROM partner.purchase LIMIT 1`)).rejects.toThrow(/permission denied/);
    await expect(reader.query(`DELETE FROM auth.permission_holders`)).rejects.toThrow(/permission denied|cannot delete/);
  });
});
