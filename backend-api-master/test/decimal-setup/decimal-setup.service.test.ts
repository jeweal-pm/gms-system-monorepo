import { HttpException, Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Static import is fine: vi.mock calls are hoisted above it (no top-level await; the tsconfig is CommonJS).
import { DecimalSetupService, missingRowDefaults } from "../../src/decimal-setup/decimal-setup.service";
import { mapDecimalSetupError } from "../../src/decimal-setup/decimal-setup.errors";
import { DECIMAL_SETUP_DEFAULTS, PRICE_PLACES_MAX, saveDecimalSetupBodySchema, WEIGHT_PLACES_MAX } from "../../src/decimal-setup/decimal-setup.schemas";
import { WRITE_TX } from "../../src/common/persistence";

/** UT-DEC-B01…B06: decimal-setup SA rev 1 / ADR-0038 (owner 2026-11-03) against a mocked Prisma. */

type Row = { id: number; weightPlaces: number; pricePlaces: number; version: number; updatedBy: string | null; updatedAt: Date };

const db = vi.hoisted(() => ({
  row: null as Row | null,
  failWith: null as unknown,
  /** Thrown by `create` (simulates a parallel first create winning the race). */
  createFails: null as unknown,
  transactionOptions: [] as unknown[],
}));

vi.mock("../../src/database/prisma-client", () => {
  const guard = () => { if (db.failWith) throw db.failWith; };
  const tx = {
    decimalSetup: {
      findUnique: vi.fn(async () => { guard(); return db.row ? { ...db.row } : null; }),
      create: vi.fn(async ({ data }: { data: Row }) => {
        guard();
        if (db.createFails) throw db.createFails;
        if (db.row) throw Object.assign(new Error("unique"), { code: "P2002" });
        db.row = { ...data };
        return { ...data };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: number; version: number }; data: Omit<Row, "id" | "version"> & { version: { increment: number } } }) => {
        guard();
        if (!db.row || db.row.id !== where.id || db.row.version !== where.version) return { count: 0 };
        const { version, ...rest } = data;
        db.row = { ...db.row, ...rest, version: db.row.version + version.increment };
        return { count: 1 };
      }),
      findUniqueOrThrow: vi.fn(async () => { guard(); return { ...db.row! }; }),
    },
  };
  return {
    prisma: {
      ...tx,
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown, options: unknown) => {
        db.transactionOptions.push(options);
        const before = db.row ? { ...db.row } : null;
        try { return await callback(tx); } catch (error) { db.row = before; throw error; }
      }),
    },
  };
});

const SEEDED = new Date("2026-11-03T02:00:00.000Z");
const seed = (patch: Partial<Row> = {}) => { db.row = { id: 1, weightPlaces: 2, pricePlaces: 2, version: 1, updatedBy: null, updatedAt: SEEDED, ...patch }; };

async function failure(promise: Promise<unknown>) {
  try { await promise; } catch (error) {
    if (error instanceof HttpException) return { status: error.getStatus(), code: (error.getResponse() as { error: { code: string } }).error.code };
    throw error;
  }
  throw new Error("expected a failure");
}

let service: DecimalSetupService;
beforeEach(() => {
  db.row = null;
  db.failWith = null;
  db.createFails = null;
  db.transactionOptions = [];
  service = new DecimalSetupService();
});
afterEach(() => vi.restoreAllMocks());

describe("UT-DEC-B01 saveDecimalSetupBodySchema", () => {
  it("accepts every integer 0..4 for both (owner Q-DEC-08) with 2/2 defaults", () => {
    expect(WEIGHT_PLACES_MAX).toBe(4);
    expect(PRICE_PLACES_MAX).toBe(4);
    expect(DECIMAL_SETUP_DEFAULTS).toEqual({ weightPlaces: 2, pricePlaces: 2 });
    for (const weightPlaces of [0, 1, 2, 3, 4]) {
      for (const pricePlaces of [0, 1, 2, 3, 4]) {
        expect(saveDecimalSetupBodySchema.safeParse({ weightPlaces, pricePlaces, expectedVersion: 0 }).success).toBe(true);
      }
    }
  });

  it("refuses out-of-range, non-integer, negative version, missing and unknown keys", () => {
    const valid = { weightPlaces: 2, pricePlaces: 2, expectedVersion: 1 };
    const bad = [
      { ...valid, weightPlaces: 5 }, { ...valid, weightPlaces: -1 }, { ...valid, pricePlaces: 5 }, { ...valid, pricePlaces: -1 }, { ...valid, pricePlaces: 1.5 },
      { ...valid, weightPlaces: "2" }, { ...valid, expectedVersion: -1 }, { ...valid, expectedVersion: 1.2 },
      { weightPlaces: 2, pricePlaces: 2 }, { ...valid, page: "quotation" },
    ];
    for (const input of bad) expect(saveDecimalSetupBodySchema.safeParse(input).success, JSON.stringify(input)).toBe(false);
  });
});

describe("UT-DEC-B02 get", () => {
  it("returns the stored row in the contract shape", async () => {
    seed({ weightPlaces: 3, pricePlaces: 0, version: 4, updatedBy: "user-9" });
    await expect(service.get()).resolves.toEqual({ setup: { weightPlaces: 3, pricePlaces: 0, version: 4, updatedAt: SEEDED.toISOString(), updatedBy: "user-9" } });
  });

  it("returns 2/2 defaults at version 0 with a warn log when the seed row is missing", async () => {
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    await expect(service.get()).resolves.toEqual({ setup: { weightPlaces: 2, pricePlaces: 2, version: 0, updatedAt: "1970-01-01T00:00:00.000Z", updatedBy: null } });
    expect(missingRowDefaults()).toEqual({ weightPlaces: 2, pricePlaces: 2, version: 0, updatedAt: "1970-01-01T00:00:00.000Z", updatedBy: null });
    expect(warn).toHaveBeenCalledWith({ event: "decimal_setup.row_missing" });
  });
});

describe("UT-DEC-B03 save updates at the loaded version", () => {
  it("bumps the version, records the actor and logs previous and new places only", async () => {
    seed();
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const { setup } = await service.save("user-1", { weightPlaces: 3, pricePlaces: 0, expectedVersion: 1 });
    expect(setup).toMatchObject({ weightPlaces: 3, pricePlaces: 0, version: 2, updatedBy: "user-1" });
    expect(new Date(setup.updatedAt).getTime()).toBeGreaterThan(SEEDED.getTime());
    expect(db.transactionOptions).toEqual([WRITE_TX]);
    expect(log).toHaveBeenCalledWith({ event: "decimal_setup.updated", actorId: "user-1", version: 2, weightPlaces: 3, pricePlaces: 0, previousWeightPlaces: 2, previousPricePlaces: 2 });
    // Saving the same values again still bumps the version (the UI disables Save when unchanged).
    await expect(service.save("user-2", { weightPlaces: 3, pricePlaces: 0, expectedVersion: 2 })).resolves.toMatchObject({ setup: { version: 3, updatedBy: "user-2" } });
  });
});

describe("UT-DEC-B04 save with a stale version", () => {
  it("returns DECIMAL_SETUP_CHANGED 409 and leaves the row unchanged", async () => {
    seed({ version: 2, weightPlaces: 3 });
    await expect(failure(service.save("user-1", { weightPlaces: 1, pricePlaces: 1, expectedVersion: 1 }))).resolves.toEqual({ status: 409, code: "DECIMAL_SETUP_CHANGED" });
    expect(db.row).toMatchObject({ version: 2, weightPlaces: 3, pricePlaces: 2 });
  });

  it("returns DECIMAL_SETUP_CHANGED when the row is missing and a non-zero version is sent", async () => {
    await expect(failure(service.save("user-1", { weightPlaces: 1, pricePlaces: 1, expectedVersion: 1 }))).resolves.toEqual({ status: 409, code: "DECIMAL_SETUP_CHANGED" });
    expect(db.row).toBeNull();
  });
});

describe("UT-DEC-B05 first save at version 0", () => {
  it("creates the row at version 1 with previous places logged as null", async () => {
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    await expect(service.save("user-1", { weightPlaces: 1, pricePlaces: 2, expectedVersion: 0 })).resolves.toMatchObject({ setup: { weightPlaces: 1, pricePlaces: 2, version: 1, updatedBy: "user-1" } });
    expect(db.row).toMatchObject({ id: 1, version: 1 });
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ event: "decimal_setup.updated", previousWeightPlaces: null, previousPricePlaces: null }));
  });

  it("maps a parallel create (P2002) to DECIMAL_SETUP_CHANGED", async () => {
    seed();
    await expect(failure(service.save("user-1", { weightPlaces: 1, pricePlaces: 2, expectedVersion: 0 }))).resolves.toEqual({ status: 409, code: "DECIMAL_SETUP_CHANGED" });
    db.row = null;
    db.createFails = Object.assign(new Error("unique"), { code: "P2002" });
    await expect(failure(service.save("user-1", { weightPlaces: 1, pricePlaces: 2, expectedVersion: 0 }))).resolves.toEqual({ status: 409, code: "DECIMAL_SETUP_CHANGED" });
  });
});

describe("UT-DEC-B06 database failures", () => {
  it("maps connection, pool and timeout errors to PARTNER_UNAVAILABLE 503 on get and save, logging only the code", async () => {
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    seed();
    db.failWith = Object.assign(new Error("db down"), { code: "P1001" });
    await expect(failure(service.get())).resolves.toEqual({ status: 503, code: "PARTNER_UNAVAILABLE" });
    db.failWith = Object.assign(new Error("tx timeout"), { code: "P2028" });
    await expect(failure(service.save("user-1", { weightPlaces: 3, pricePlaces: 2, expectedVersion: 1 }))).resolves.toEqual({ status: 503, code: "PARTNER_UNAVAILABLE" });
    expect(warn).toHaveBeenCalledWith({ event: "decimal_setup.db_unavailable", operation: "get", prismaCode: "P1001" });
    expect(warn).toHaveBeenCalledWith({ event: "decimal_setup.db_unavailable", operation: "save", prismaCode: "P2028" });
  });

  it("passes other errors through for the router to map", () => {
    const other = new Error("unexpected");
    expect(mapDecimalSetupError(other, "get")).toBe(other);
  });
});
