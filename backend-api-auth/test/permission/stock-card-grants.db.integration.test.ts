import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * IT-SC-C1 (stock-card SA rev 1 / ADR-0056 D9, owner "backend ทำ api เลย" 2026-11-23): the one-time auth data migration
 * `20261123100000_stock_card_grants` copies Stock Movement (Primary Stock) VIEW / PRINT / EXCEL to Stock Card and Stock Movement
 * (Consignment Stock) to Stock Value, touches nothing else, is idempotent, keeps the old rows, and the copied cells are catalog
 * cells that reach the session authorization block (`loadSessionAuthz`) while the old rows are ignored on read. The migration SQL
 * file itself is executed (twice) against fixture users.
 *
 * Opt-in like the other auth DB integrations: runs only with `AUTH_TEST_DATABASE_URL` on a disposable `f1_system` database on
 * 127.0.0.1 with a port other than 5432, migrated with `prisma migrate deploy`. Only the users created here are touched.
 */
const testUrl = process.env.AUTH_TEST_DATABASE_URL;
const canRun = Boolean(testUrl && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(testUrl));
const MIGRATION = path.resolve(__dirname, "../../prisma/migrations/20261123100000_stock_card_grants/migration.sql");
const run = randomUUID().slice(0, 8);
const users = {
  primaryAll: `sc-grants-it-primary-${run}`,
  primaryNoEdit: `sc-grants-it-partial-${run}`,
  consignment: `sc-grants-it-consign-${run}`,
  both: `sc-grants-it-both-${run}`,
  none: `sc-grants-it-none-${run}`,
  already: `sc-grants-it-already-${run}`,
};
const ALL = ["VIEW", "ADD", "EDIT", "DELETE", "CANCEL", "APPROVE", "PRICE", "PRINT", "EXCEL"];
const initial: Record<keyof typeof users, string[]> = {
  primaryAll: ALL.map((action) => `stock-movement-primary:${action}`),
  primaryNoEdit: ["stock-movement-primary:VIEW", "stock-movement-primary:ADD", "quotation:VIEW"],
  consignment: ["stock-movement-consignment:VIEW", "stock-movement-consignment:PRINT", "stock-movement-consignment:EDIT"],
  both: ["stock-movement-primary:VIEW", "stock-movement-consignment:VIEW"],
  none: ["quotation:VIEW", "closing-stock-primary:VIEW"],
  already: ["stock-movement-primary:VIEW", "stock-card:VIEW", "stock-card:PRINT", "stock-value:EDIT"],
};

let prisma: typeof import("../../src/database/prisma-client").prisma;
let loadSessionAuthz: typeof import("../../src/permission/grants").loadSessionAuthz;

async function grantsOf(userId: string) {
  const rows = await prisma.userPermission.findMany({ where: { userId }, select: { menuKey: true, action: true } });
  return rows.map((row) => `${row.menuKey}:${row.action}`).sort();
}

/** The migration file holds two statements; they run one by one exactly as `prisma migrate deploy` would send them. */
async function applyMigration(sql: string) {
  const statements = sql.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n").split(";").map((statement) => statement.trim()).filter(Boolean);
  expect(statements).toHaveLength(2);
  for (const statement of statements) await prisma.$executeRawUnsafe(statement);
}

describe.runIf(canRun)("IT-SC-C1 stock-card grant copy on PostgreSQL", () => {
  beforeAll(async () => {
    vi.stubEnv("DATABASE_URL", testUrl!);
    ({ prisma } = await import("../../src/database/prisma-client"));
    ({ loadSessionAuthz } = await import("../../src/permission/grants"));
    const now = new Date();
    for (const [name, id] of Object.entries(users) as [keyof typeof users, string][]) {
      await prisma.user.create({ data: { id, name: `Stock card grants ${name}`, username: `${id}@example.test`, email: `${id}@users.invalid`, createdAt: now, updatedAt: now } });
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

  it("copies primary VIEW / PRINT / EXCEL to stock-card and consignment to stock-value, keeps the old rows, adds nothing else, and is idempotent", async () => {
    const sql = await readFile(MIGRATION, "utf8");
    expect(sql).toContain("ON CONFLICT");
    await applyMigration(sql);
    const expected = {
      primaryAll: [...ALL.map((action) => `stock-movement-primary:${action}`), "stock-card:EXCEL", "stock-card:PRINT", "stock-card:VIEW"].sort(),
      primaryNoEdit: ["quotation:VIEW", "stock-card:VIEW", "stock-movement-primary:ADD", "stock-movement-primary:VIEW"],
      consignment: ["stock-movement-consignment:EDIT", "stock-movement-consignment:PRINT", "stock-movement-consignment:VIEW", "stock-value:EDIT", "stock-value:PRINT", "stock-value:VIEW"],
      both: ["stock-card:VIEW", "stock-movement-consignment:VIEW", "stock-movement-primary:VIEW", "stock-value:VIEW"],
      none: ["closing-stock-primary:VIEW", "quotation:VIEW"],
      already: ["stock-card:PRINT", "stock-card:VIEW", "stock-movement-primary:VIEW", "stock-value:EDIT"],
    };
    for (const [name, id] of Object.entries(users) as [keyof typeof users, string][]) expect(await grantsOf(id), name).toEqual(expected[name]);

    // A second run (a manual re-apply) changes nothing.
    await applyMigration(sql);
    for (const [name, id] of Object.entries(users) as [keyof typeof users, string][]) expect(await grantsOf(id), name).toEqual(expected[name]);
  });

  it("the copied cells reach the session authorization; the old rows are ignored on read; a stored cell outside the catalog is filtered", async () => {
    const authz = await loadSessionAuthz(users.primaryAll, "user");
    expect(authz.permissions).toEqual(expect.arrayContaining(["stock-card:VIEW", "stock-card:PRINT", "stock-card:EXCEL"]));
    expect(authz.permissions.some((key: string) => key.startsWith("stock-movement-"))).toBe(false);
    const consignment = await loadSessionAuthz(users.consignment, "user");
    expect(consignment.permissions).toEqual(expect.arrayContaining(["stock-value:VIEW", "stock-value:PRINT", "stock-value:EDIT"]));
    expect(consignment.permissions.some((key: string) => key.startsWith("stock-card:"))).toBe(false);
    const none = await loadSessionAuthz(users.none, "user");
    expect(none.permissions.some((key: string) => key.startsWith("stock-card:") || key.startsWith("stock-value:"))).toBe(false);
    // a user with the old primary grant only for non-copied actions (ADD) gets VIEW copied from the VIEW row and nothing for ADD
    expect((await loadSessionAuthz(users.primaryNoEdit, "user")).permissions).toEqual(expect.arrayContaining(["stock-card:VIEW"]));
    expect((await loadSessionAuthz(users.primaryNoEdit, "user")).permissions).not.toContain("stock-card:ADD");
  });
});
