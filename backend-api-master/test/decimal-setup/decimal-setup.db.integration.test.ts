import { HttpException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * IT-DEC-B02 (decimal-setup SA rev 1 / ADR-0038, owner 2026-11-03) against real PostgreSQL:
 * - migration 20261103090000_decimal_setup: the table, its four CHECKs and the 2/2 seed row;
 * - DecimalSetupService get/save through Prisma: optimistic version, stale save → DECIMAL_SETUP_CHANGED,
 *   parallel saves at one version → exactly one wins, missing row → defaults v0 → first save creates it.
 *
 * Opt-in like the other DB integrations (INV-20261021-007): runs only with `PARTNER_TEST_DATABASE_URL` pointing at
 * a disposable `f1_system` database on 127.0.0.1 with an explicit port other than 5432, migrated with
 * `prisma migrate deploy`. The single row is restored to what it was before the file ran.
 */

const testUrl = process.env.PARTNER_TEST_DATABASE_URL;
const canRun = Boolean(testUrl && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(testUrl));

type Prisma = typeof import("../../src/database/prisma-client").prisma;
type Service = InstanceType<typeof import("../../src/decimal-setup/decimal-setup.service").DecimalSetupService>;
type Row = { id: number; weight_places: number; price_places: number; version: number; updated_by: string | null; updated_at: Date };

let prisma: Prisma;
let service: Service;
let original: Row | undefined;

async function failure(promise: Promise<unknown>) {
  try { await promise; } catch (error) {
    if (error instanceof HttpException) return { status: error.getStatus(), code: (error.getResponse() as { error: { code: string } }).error.code };
    throw error;
  }
  throw new Error("expected a failure");
}

/** SQLSTATE of a raw statement that must be refused (23514 = check_violation). */
async function sqlState(statement: string) {
  try { await prisma.$executeRawUnsafe(statement); } catch (error) {
    const text = JSON.stringify(error, Object.getOwnPropertyNames(error));
    return /23514|check constraint/i.test(text) ? "23514" : text;
  }
  return "accepted";
}

describe.runIf(canRun)("IT-DEC-B02 decimal setup on PostgreSQL", () => {
  beforeAll(async () => {
    vi.stubEnv("PARTNER_DATABASE_URL", testUrl!);
    ({ prisma } = await import("../../src/database/prisma-client"));
    const { DecimalSetupService } = await import("../../src/decimal-setup/decimal-setup.service");
    service = new DecimalSetupService();
    [original] = await prisma.$queryRawUnsafe<Row[]>(`SELECT * FROM "partner"."decimal_setup"`);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`DELETE FROM "partner"."decimal_setup"`);
    if (original) {
      await prisma.$executeRaw`INSERT INTO "partner"."decimal_setup" ("id", "weight_places", "price_places", "version", "updated_by", "updated_at")
        VALUES (${original.id}, ${original.weight_places}, ${original.price_places}, ${original.version}, ${original.updated_by}, ${original.updated_at})`;
    }
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  it("the migration created the seed row 2/2 and the four CHECKs", async () => {
    expect(original).toMatchObject({ id: 1, weight_places: expect.any(Number), price_places: expect.any(Number) });
    const constraints = await prisma.$queryRawUnsafe<{ conname: string }[]>(
      `SELECT conname FROM pg_constraint WHERE conrelid = '"partner"."decimal_setup"'::regclass AND contype = 'c' ORDER BY conname`);
    expect(constraints.map((row) => row.conname)).toEqual([
      "decimal_setup_price_places_range", "decimal_setup_single_row", "decimal_setup_version_positive", "decimal_setup_weight_places_range",
    ]);
    // Reset to the seed state, then the database itself refuses out-of-range values.
    await prisma.$executeRawUnsafe(`UPDATE "partner"."decimal_setup" SET "weight_places" = 2, "price_places" = 2, "version" = 1, "updated_by" = NULL`);
    await expect(service.get()).resolves.toMatchObject({ setup: { weightPlaces: 2, pricePlaces: 2, version: 1, updatedBy: null } });
    expect(await sqlState(`UPDATE "partner"."decimal_setup" SET "weight_places" = 4`)).toBe("23514");
    expect(await sqlState(`UPDATE "partner"."decimal_setup" SET "price_places" = 3`)).toBe("23514");
    expect(await sqlState(`UPDATE "partner"."decimal_setup" SET "version" = 0`)).toBe("23514");
    expect(await sqlState(`INSERT INTO "partner"."decimal_setup" ("id") VALUES (2)`)).toBe("23514");
  });

  it("saves at the loaded version, refuses a stale one, and lets only one of two parallel saves win", async () => {
    const first = await service.save("dec-it-a", { weightPlaces: 3, pricePlaces: 0, expectedVersion: 1 });
    expect(first.setup).toMatchObject({ weightPlaces: 3, pricePlaces: 0, version: 2, updatedBy: "dec-it-a" });
    await expect(service.get()).resolves.toEqual(first);
    await expect(failure(service.save("dec-it-b", { weightPlaces: 1, pricePlaces: 1, expectedVersion: 1 }))).resolves.toEqual({ status: 409, code: "DECIMAL_SETUP_CHANGED" });

    const results = await Promise.allSettled([
      service.save("dec-it-a", { weightPlaces: 1, pricePlaces: 1, expectedVersion: 2 }),
      service.save("dec-it-b", { weightPlaces: 0, pricePlaces: 2, expectedVersion: 2 }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason instanceof HttpException && rejected.reason.getStatus()).toBe(409);
    await expect(service.get()).resolves.toMatchObject({ setup: { version: 3 } });
  });

  it("a missing row reads as defaults v0 and the first save creates it; a second create is CHANGED", async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM "partner"."decimal_setup"`);
    await expect(service.get()).resolves.toEqual({ setup: { weightPlaces: 2, pricePlaces: 2, version: 0, updatedAt: "1970-01-01T00:00:00.000Z", updatedBy: null } });
    await expect(service.save("dec-it-a", { weightPlaces: 2, pricePlaces: 1, expectedVersion: 0 })).resolves.toMatchObject({ setup: { weightPlaces: 2, pricePlaces: 1, version: 1 } });
    await expect(failure(service.save("dec-it-b", { weightPlaces: 2, pricePlaces: 2, expectedVersion: 0 }))).resolves.toEqual({ status: 409, code: "DECIMAL_SETUP_CHANGED" });
  });
});
