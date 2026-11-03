import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * IT-DEC-B06 (decimal-setup SA rev 1 / ADR-0038, owner Q-DEC-14 2026-11-03): the one-time auth data migration
 * `20261103090000_decimal_setup_grants` gives every user with Document Setup VIEW/EDIT the same Decimal Setup action,
 * touches no other grant, and is idempotent. The migration SQL file itself is executed (twice) against fixture users,
 * then `loadSessionAuthz` proves the copied grants are inside the catalog and reach the session authorization block.
 *
 * Opt-in like the other auth DB integrations: runs only with `AUTH_TEST_DATABASE_URL` pointing at a disposable
 * `f1_system` database on 127.0.0.1 with an explicit port other than 5432, migrated with `prisma migrate deploy`.
 * Only the users created here are touched and removed.
 */

const testUrl = process.env.AUTH_TEST_DATABASE_URL;
const canRun = Boolean(testUrl && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(testUrl));
const MIGRATION = path.resolve(__dirname, "../../prisma/migrations/20261103090000_decimal_setup_grants/migration.sql");
const run = randomUUID().slice(0, 8);
const users = {
  viewOnly: `dec-grants-it-view-${run}`,
  viewEdit: `dec-grants-it-edit-${run}`,
  editOnly: `dec-grants-it-editonly-${run}`,
  none: `dec-grants-it-none-${run}`,
  already: `dec-grants-it-already-${run}`,
};
const initial: Record<keyof typeof users, string[]> = {
  viewOnly: ["document-setup:VIEW", "quotation:VIEW"],
  viewEdit: ["document-setup:VIEW", "document-setup:EDIT", "customer:ADD"],
  editOnly: ["document-setup:EDIT"],
  none: ["quotation:VIEW", "quotation:EDIT"],
  already: ["document-setup:VIEW", "document-setup:EDIT", "decimal-setup:VIEW"],
};

let prisma: typeof import("../../src/database/prisma-client").prisma;
let loadSessionAuthz: typeof import("../../src/permission/grants").loadSessionAuthz;

async function grantsOf(userId: string) {
  const rows = await prisma.userPermission.findMany({ where: { userId }, select: { menuKey: true, action: true } });
  return rows.map((row) => `${row.menuKey}:${row.action}`).sort();
}

async function applyMigration(sql: string) {
  // One statement after removing SQL comments; executed exactly as `prisma migrate deploy` would.
  const statement = sql.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n").trim();
  return prisma.$executeRawUnsafe(statement);
}

describe.runIf(canRun)("IT-DEC-B06 decimal-setup grant copy on PostgreSQL", () => {
  beforeAll(async () => {
    vi.stubEnv("DATABASE_URL", testUrl!);
    ({ prisma } = await import("../../src/database/prisma-client"));
    ({ loadSessionAuthz } = await import("../../src/permission/grants"));
    const now = new Date();
    for (const [name, id] of Object.entries(users) as [keyof typeof users, string][]) {
      await prisma.user.create({ data: { id, name: `Decimal grants ${name}`, username: `${id}@example.test`, email: `${id}@users.invalid`, createdAt: now, updatedAt: now } });
      await prisma.userPermission.createMany({ data: initial[name].map((key) => {
        const [menuKey, action] = key.split(":");
        return { userId: id, menuKey, action: action as "VIEW" };
      }) });
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { id: { in: Object.values(users) } } });
      await prisma.$disconnect();
    }
    vi.unstubAllEnvs();
  });

  it("copies Document Setup VIEW/EDIT to Decimal Setup, leaves every other grant alone, and is idempotent", async () => {
    const sql = await readFile(MIGRATION, "utf8");
    expect(sql).toContain("ON CONFLICT");
    await applyMigration(sql);
    const expected = {
      viewOnly: ["decimal-setup:VIEW", "document-setup:VIEW", "quotation:VIEW"],
      viewEdit: ["customer:ADD", "decimal-setup:EDIT", "decimal-setup:VIEW", "document-setup:EDIT", "document-setup:VIEW"],
      editOnly: ["decimal-setup:EDIT", "document-setup:EDIT"],
      none: ["quotation:EDIT", "quotation:VIEW"],
      already: ["decimal-setup:EDIT", "decimal-setup:VIEW", "document-setup:EDIT", "document-setup:VIEW"],
    };
    for (const [name, id] of Object.entries(users) as [keyof typeof users, string][]) expect(await grantsOf(id), name).toEqual(expected[name]);

    // A second run (e.g. a manual re-apply) adds nothing for these users.
    await applyMigration(sql);
    for (const [name, id] of Object.entries(users) as [keyof typeof users, string][]) expect(await grantsOf(id), name).toEqual(expected[name]);

    // The copied cells are catalog cells: they reach the session authorization block.
    const authz = await loadSessionAuthz(users.viewEdit, "user");
    expect(authz.permissions).toEqual(expect.arrayContaining(["decimal-setup:VIEW", "decimal-setup:EDIT"]));
  });
});
