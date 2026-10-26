import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CurrencyService } from "../../src/currency/currency.service";
import { createCurrencyBodySchema, updateCurrencyBodySchema } from "../../src/currency/currency.schemas";

/** UT-CUR-B01…B10: currency SA rev 1 (owner 2026-10-26) against a mocked Prisma. */

type Row = {
  id: string; code: string; name: string; description: string; active: boolean;
  sellingRate: string | null; buyingRate: string | null; createdAt: Date; updatedAt: Date; createdBy: string; updatedBy: string;
};

const db = vi.hoisted(() => ({
  rows: [] as Row[],
  base: null as string | null,
  vendorCodes: [] as string[],
  customerCodes: [] as string[],
  failWith: null as unknown,
}));

vi.mock("../../src/database/prisma-client", () => {
  /** Prisma returns numeric columns as Decimal; the service reads them with toFixed(4). */
  const decimal = (value: string | null) => (value === null ? null : { toFixed: (digits: number) => Number(value).toFixed(digits) });
  const view = (row: Row) => ({ ...row, sellingRate: decimal(row.sellingRate), buyingRate: decimal(row.buyingRate) });
  const guard = () => {
    if (db.failWith) throw db.failWith;
  };
  const matches = (row: Row, where: { AND?: Record<string, unknown>[] } | undefined) => (where?.AND ?? []).every((clause) => {
    if ("OR" in clause) {
      const q = String(((clause.OR as { code: { contains: string } }[])[0]).code.contains).toLowerCase();
      return row.code.toLowerCase().includes(q) || row.name.toLowerCase().includes(q);
    }
    return row.code > (clause.code as { gt: string }).gt;
  });
  const tx = {
    currency: {
      findMany: vi.fn(async ({ where, take }: { where?: { AND?: Record<string, unknown>[] }; take: number }) => {
        guard();
        return db.rows.filter((row) => matches(row, where)).sort((a, b) => a.code.localeCompare(b.code)).slice(0, take).map(view);
      }),
      count: vi.fn(async () => db.rows.length),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        guard();
        const row = db.rows.find((entry) => entry.id === where.id);
        return row ? view(row) : null;
      }),
      create: vi.fn(async ({ data }: { data: Omit<Row, "id"> }) => {
        if (db.rows.some((row) => row.code === data.code)) {
          throw Object.assign(new Error("unique"), { code: "P2002", meta: { target: ["currency_code_key"] } });
        }
        const row = { ...data, id: `00000000-0000-4000-8000-${String(db.rows.length + 1).padStart(12, "0")}` } as Row;
        db.rows.push(row);
        return { id: row.id, updatedAt: row.updatedAt };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; updatedAt: Date }; data: Partial<Row> }) => {
        const row = db.rows.find((entry) => entry.id === where.id);
        if (!row || row.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
      deleteMany: vi.fn(async ({ where }: { where: { id: string } }) => {
        const before = db.rows.length;
        db.rows = db.rows.filter((row) => row.id !== where.id);
        return { count: before - db.rows.length };
      }),
    },
    companyProfile: {
      findUnique: vi.fn(async () => (db.base ? { currencyCode: db.base } : null)),
      count: vi.fn(async ({ where }: { where: { currencyCode: string } }) => (db.base === where.currencyCode ? 1 : 0)),
    },
    vendor: { count: vi.fn(async ({ where }: { where: { currencyCode: string } }) => db.vendorCodes.filter((code) => code === where.currencyCode).length) },
    customer: { count: vi.fn(async ({ where }: { where: { currencyCode: string } }) => db.customerCodes.filter((code) => code === where.currencyCode).length) },
  };
  return { prisma: { ...tx, $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)) } };
});

const service = new CurrencyService();
const ACTOR = "user-1";
const create = (overrides: Record<string, unknown> = {}) =>
  createCurrencyBodySchema.parse({ code: "usd", name: "US Dollar", description: "Sales to the US", active: true, sellingRate: "33.25", buyingRate: "32.9", ...overrides });
const update = (expectedUpdatedAt: string, overrides: Record<string, unknown> = {}) =>
  updateCurrencyBodySchema.parse({ name: "US Dollar", description: "Updated", active: true, sellingRate: "34", buyingRate: "33", expectedUpdatedAt, ...overrides });

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpException) {
      const body = error.getResponse() as { error: { code: string; fieldErrors?: { path: string; code: string }[] } };
      return { status: error.getStatus(), code: body.error.code, fieldErrors: body.error.fieldErrors ?? [] };
    }
    throw error;
  }
  throw new Error("expected the call to fail");
}

beforeEach(() => {
  db.rows = [];
  db.base = "THB";
  db.vendorCodes = [];
  db.customerCodes = [];
  db.failWith = null;
});

describe("schemas (SA-CUR-04)", () => {
  it("UT-CUR-B01 uppercases a 3-letter code, bounds rates to > 0 with ≤ 4 decimals, rejects code on update", () => {
    expect(create().code).toBe("USD");
    expect(createCurrencyBodySchema.safeParse({ ...create(), code: "US1" }).success).toBe(false);
    expect(createCurrencyBodySchema.safeParse({ ...create(), sellingRate: "0.0000" }).success).toBe(false);
    expect(createCurrencyBodySchema.safeParse({ ...create(), buyingRate: "1.12345" }).success).toBe(false);
    expect(createCurrencyBodySchema.safeParse({ ...create(), buyingRate: "-1" }).success).toBe(false);
    expect(createCurrencyBodySchema.safeParse({ ...create(), description: " " }).success).toBe(false);
    expect(createCurrencyBodySchema.safeParse({ ...create(), sellingRate: null }).success).toBe(true);
    expect(updateCurrencyBodySchema.safeParse({ ...update("2026-10-26T00:00:00.000Z"), code: "EUR" }).success).toBe(false);
  });
});

describe("create / get / list", () => {
  it("UT-CUR-B02 creates with rates as 4-decimal strings and the actor; get adds the base code", async () => {
    const { id, updatedAt } = await service.create(ACTOR, create());
    expect(db.rows[0]).toMatchObject({ code: "USD", sellingRate: "33.25", buyingRate: "32.9", createdBy: ACTOR, updatedBy: ACTOR });
    expect(await service.get(id)).toMatchObject({ id, code: "USD", sellingRate: "33.2500", buyingRate: "32.9000", description: "Sales to the US", updatedAt, baseCode: "THB" });
  });

  it("UT-CUR-B03 requires both rates unless the currency is the base", async () => {
    expect(await failure(service.create(ACTOR, create({ sellingRate: null, buyingRate: null })))).toEqual({
      status: 400, code: "VALIDATION_ERROR", fieldErrors: [{ path: "sellingRate", code: "required" }, { path: "buyingRate", code: "required" }],
    });
    await service.create(ACTOR, create({ code: "THB", name: "Thai Baht", sellingRate: "5", buyingRate: null }));
    expect(db.rows[0]).toMatchObject({ code: "THB", sellingRate: null, buyingRate: null });
  });

  it("UT-CUR-B04 answers CURRENCY_CODE_TAKEN for a duplicate code", async () => {
    await service.create(ACTOR, create());
    expect(await failure(service.create(ACTOR, create()))).toEqual({ status: 409, code: "CURRENCY_CODE_TAKEN", fieldErrors: [{ path: "code", code: "duplicate" }] });
  });

  it("UT-CUR-B05 lists by code with search, keyset cursor, total and base code", async () => {
    for (const code of ["USD", "EUR", "THB"]) await service.create(ACTOR, create({ code, name: `${code} name` }));
    const first = await service.list({ limit: 2 });
    expect(first.items.map((item) => item.code)).toEqual(["EUR", "THB"]);
    expect(first).toMatchObject({ nextCursor: "THB", total: 3, baseCode: "THB" });
    expect(first.items[1]).toMatchObject({ sellingRate: null, buyingRate: null });
    expect((await service.list({ cursor: first.nextCursor })).items.map((item) => item.code)).toEqual(["USD"]);
    expect((await service.list({ q: "eur" })).items.map((item) => item.code)).toEqual(["EUR"]);
    expect(await failure(service.list({ cursor: "not-a-code" }))).toMatchObject({ status: 400, fieldErrors: [{ path: "cursor", code: "invalid" }] });
  });
});

describe("update / delete", () => {
  it("UT-CUR-B06 replaces fields with the optimistic version; a stale version is CURRENCY_CHANGED", async () => {
    const { id, updatedAt } = await service.create(ACTOR, create());
    const result = await service.update("user-2", id, update(updatedAt));
    expect(new Date(result.updatedAt).getTime()).toBeGreaterThan(new Date(updatedAt).getTime());
    expect(db.rows[0]).toMatchObject({ code: "USD", description: "Updated", sellingRate: "34", updatedBy: "user-2" });
    expect(await failure(service.update(ACTOR, id, update(updatedAt)))).toMatchObject({ status: 409, code: "CURRENCY_CHANGED" });
    expect(await failure(service.update(ACTOR, "00000000-0000-4000-8000-999999999999", update(updatedAt)))).toMatchObject({ status: 404, code: "CURRENCY_NOT_FOUND" });
  });

  it("UT-CUR-B07 keeps the base currency active and without rates", async () => {
    const { id, updatedAt } = await service.create(ACTOR, create({ code: "THB", name: "Thai Baht", sellingRate: null, buyingRate: null }));
    expect(await failure(service.update(ACTOR, id, update(updatedAt, { active: false })))).toEqual({
      status: 409, code: "CURRENCY_BASE_LOCKED", fieldErrors: [{ path: "active", code: "base_currency" }],
    });
    await service.update(ACTOR, id, update(updatedAt, { sellingRate: "2", buyingRate: "2" }));
    expect(db.rows[0]).toMatchObject({ sellingRate: null, buyingRate: null, active: true });
  });

  it("UT-CUR-B08 a former base currency needs rates again (Q-CUR-05)", async () => {
    const { id, updatedAt } = await service.create(ACTOR, create({ code: "THB", name: "Thai Baht", sellingRate: null, buyingRate: null }));
    db.base = "USD";
    expect(await failure(service.update(ACTOR, id, update(updatedAt, { sellingRate: null, buyingRate: null })))).toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
  });

  it("UT-CUR-B09 refuses to delete a currency used by Company Profile, a vendor or a customer", async () => {
    const thb = await service.create(ACTOR, create({ code: "THB", sellingRate: null, buyingRate: null }));
    const usd = await service.create(ACTOR, create());
    const eur = await service.create(ACTOR, create({ code: "EUR" }));
    expect(await failure(service.delete(ACTOR, thb.id))).toMatchObject({ status: 409, code: "CURRENCY_IN_USE" });
    db.vendorCodes = ["USD"];
    expect(await failure(service.delete(ACTOR, usd.id))).toMatchObject({ status: 409, code: "CURRENCY_IN_USE" });
    db.customerCodes = ["EUR"];
    expect(await failure(service.delete(ACTOR, eur.id))).toMatchObject({ status: 409, code: "CURRENCY_IN_USE" });
    db.customerCodes = [];
    expect(await service.delete(ACTOR, eur.id)).toEqual({ ok: true });
    expect(await failure(service.delete(ACTOR, eur.id))).toMatchObject({ status: 404, code: "CURRENCY_NOT_FOUND" });
  });
});

describe("options", () => {
  it("UT-CUR-B10 returns every currency with rates and the base code; a down database is 503", async () => {
    await service.create(ACTOR, create());
    await service.create(ACTOR, create({ code: "INR", name: "Indian Rupee", active: false, sellingRate: "0.4", buyingRate: "0.385" }));
    expect(await service.options()).toEqual({
      items: [
        { code: "INR", name: "Indian Rupee", active: false, sellingRate: "0.4000", buyingRate: "0.3850" },
        { code: "USD", name: "US Dollar", active: true, sellingRate: "33.2500", buyingRate: "32.9000" },
      ],
      baseCode: "THB",
    });
    db.failWith = Object.assign(new Error("down"), { code: "P1001" });
    expect(await failure(service.options())).toMatchObject({ status: 503, code: "PARTNER_UNAVAILABLE" });
  });
});
