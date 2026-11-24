/* eslint-disable @typescript-eslint/no-explicit-any -- fake clients and loosely typed JSON */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { AppError, errorBody } from "../../src/platform/errors";
import { type AppEnv, errorResponse } from "../../src/platform/http";
import { createLogger } from "../../src/platform/logger";
import type { Principal } from "../../src/platform/auth/principal";
import { groupedCardsSql } from "../../src/modules/stock/card";
import { lastSalePrice, valuate, valueOrderBy, valueTxnOrderBy, type LastSaleLine, type StockForValue } from "../../src/modules/stock/value";
import { ReportGuard, STOCK_VALUE_CODES, runReport } from "../../src/modules/reports/guard";
import { ReportGuard as ReExportedGuard } from "../../src/modules/reports/stock-card/guard";
import { cardsQuerySchema, transactionsQuerySchema } from "../../src/modules/reports/stock-card/schemas";
import { valueCardsQuerySchema, valueTransactionsQuerySchema } from "../../src/modules/reports/stock-value/schemas";
import { registerStockCardRoutes } from "../../src/modules/reports/stock-card/routes";
import { registerStockValueRoutes } from "../../src/modules/reports/stock-value/routes";

/** Stock Value unit tests (stock-value testing.md): UT-SV-01…04 and UT-SV-A1. */

const stock = (patch: Partial<StockForValue> = {}): StockForValue => ({
  priceUnit: "PER_CT", salePrice: "0", unitCostBase: "0", pcs: 2, weightCt: "1.240", onHandPcs: 2, reservedPcs: 0, onHandWeightCt: "1.240", reservedWeightCt: "0", ...patch,
});
const sale = (patch: Partial<LastSaleLine> = {}): LastSaleLine => ({ priceUnit: "PER_CT", unitPrice: "9800", exchangeRate: null, pcs: 10, weightCt: "4.500", ...patch });

describe("UT-SV-01 valuation rules", () => {
  it("one Stock ID priced per ct: price, amount and profit/loss (the contract example)", () => {
    const result = valuate([stock({ salePrice: "12500", unitCostBase: "8000" })], null);
    expect(result).toMatchObject({ unit: "CT", priceSource: "PRICE_LIST" });
    expect(result.price?.toFixed(4)).toBe("12500.0000");
    expect(result.value({ pcs: 2, weightCt: "1.240" })).toEqual({ amount: "15500.00", profitLoss: "5580.00" });
  });

  it("two Stock IDs of one card: the price is the quantity-weighted average; the weights follow the book balance", () => {
    const a = stock({ salePrice: "10000", pcs: 1, weightCt: "1.000", onHandPcs: 1, onHandWeightCt: "1.000" });
    const b = stock({ salePrice: "14000", pcs: 1, weightCt: "1.000", onHandPcs: 1, onHandWeightCt: "1.000" });
    expect(valuate([a, b], null).price?.toFixed(4)).toBe("12000.0000");
    expect(valuate([a, b], null).value({ pcs: 2, weightCt: "2.000" }).amount).toBe("24000.00");
    // the cheaper one went out on memo: only 0.250 ct of it is left on the book -> weights 0.25 : 1.00
    const partial = { ...a, onHandWeightCt: "0.250" };
    expect(valuate([partial, b], null).price?.toFixed(4)).toBe("13200.0000");
    // reserved quantity is still on the book
    expect(valuate([{ ...a, onHandWeightCt: "0", reservedWeightCt: "0.250" }, b], null).price?.toFixed(4)).toBe("13200.0000");
  });

  it("a card with no balance at all weights by the loaded quantity (a past Due still gets a price)", () => {
    const gone = (price: string, weight: string) => stock({ salePrice: price, pcs: 1, weightCt: weight, onHandPcs: 0, onHandWeightCt: "0" });
    expect(valuate([gone("10000", "1.000"), gone("14000", "3.000")], null).price?.toFixed(4)).toBe("13000.0000");
  });

  it("a 0.00 Sale Price is not a price (falls to Last sale); an unpriced Stock ID does not dilute a priced card and is valued at the card price", () => {
    expect(valuate([stock()], null)).toMatchObject({ priceSource: "NONE", price: null });
    expect(valuate([stock()], sale())).toMatchObject({ priceSource: "LAST_SALE" });
    const mixed = valuate([stock({ salePrice: "10000" }), stock({ salePrice: "0" })], sale());
    expect(mixed.priceSource).toBe("PRICE_LIST");
    expect(mixed.price?.toFixed(4)).toBe("10000.0000");
    expect(mixed.value({ pcs: 4, weightCt: "2.480" }).amount).toBe("24800.00");
  });

  it("unit: PCS only when every Stock ID that holds quantity is per piece; a per-piece Stock ID in a per-ct card keeps its value", () => {
    const perPiece = stock({ priceUnit: "PER_PCS", salePrice: "500", pcs: 3, weightCt: "0.900", onHandPcs: 3, onHandWeightCt: "0.900" });
    expect(valuate([perPiece], null)).toMatchObject({ unit: "PCS" });
    expect(valuate([perPiece], null).value({ pcs: 3, weightCt: "0.900" }).amount).toBe("1500.00");
    const perCt = stock({ salePrice: "1000", pcs: 1, weightCt: "1.000", onHandPcs: 1, onHandWeightCt: "1.000" });
    const both = valuate([perPiece, perCt], null);
    expect(both.unit).toBe("CT");
    // value of the card = 3 x 500 + 1 ct x 1000 = 2500 over 1.9 ct
    expect(both.value({ pcs: 4, weightCt: "1.900" }).amount).toBe("2500.00");
    // a per-ct Stock ID that holds nothing does not force CT
    const empty = stock({ salePrice: "1000", pcs: 1, weightCt: "1", onHandPcs: 0, onHandWeightCt: "0", reservedPcs: 0 });
    expect(valuate([perPiece, empty], null).unit).toBe("PCS");
  });

  it("cost: weighted average of the Stock IDs with a cost; profit/loss null without price or without cost", () => {
    const a = stock({ salePrice: "10000", unitCostBase: "6000", pcs: 1, weightCt: "1", onHandPcs: 1, onHandWeightCt: "1" });
    const b = stock({ salePrice: "10000", unitCostBase: "0", pcs: 1, weightCt: "3", onHandPcs: 1, onHandWeightCt: "3" });
    const result = valuate([a, b], null);
    expect(result.avgCost?.toFixed(4)).toBe("6000.0000");
    expect(result.value({ pcs: 2, weightCt: "4" })).toEqual({ amount: "40000.00", profitLoss: "16000.00" });
    expect(valuate([stock({ salePrice: "10000" })], null).value({ pcs: 2, weightCt: "1.240" })).toEqual({ amount: "12400.00", profitLoss: null });
    expect(valuate([stock({ unitCostBase: "8000" })], null).value({ pcs: 2, weightCt: "1.240" })).toEqual({ amount: null, profitLoss: null });
  });

  it("rounding is half away from zero, also for a negative balance; a zero weight in a CT card is 0.00", () => {
    const priced = valuate([stock({ salePrice: "0.5" })], null);
    expect(priced.value({ pcs: 1, weightCt: "1.001" }).amount).toBe("0.50"); // 0.5005
    expect(priced.value({ pcs: 1, weightCt: "0.010" }).amount).toBe("0.01"); // 0.005 ties away from zero
    expect(priced.value({ pcs: -1, weightCt: "-0.010" }).amount).toBe("-0.01");
    expect(valuate([stock({ salePrice: "100" })], null).value({ pcs: 3, weightCt: "0.000" }).amount).toBe("0.00");
  });

  it("Last sale conversion: same unit as is; per piece <-> per ct by the line's own quantities; rate applied; zero quantity unusable", () => {
    expect(lastSalePrice(sale(), "CT")?.toFixed(4)).toBe("9800.0000");
    expect(lastSalePrice(sale({ exchangeRate: "35.5" }), "CT")?.toFixed(4)).toBe("347900.0000");
    expect(lastSalePrice(sale({ priceUnit: "PER_PCS", unitPrice: "100" }), "CT")?.toFixed(4)).toBe("222.2222"); // 100 x 10 pcs / 4.500 ct
    expect(lastSalePrice(sale(), "PCS")?.toFixed(4)).toBe("4410.0000"); // 9800 x 4.5 ct / 10 pcs
    expect(lastSalePrice(sale({ priceUnit: "PER_PCS", weightCt: "0.000" }), "CT")).toBeNull();
    expect(lastSalePrice(sale({ pcs: 0 }), "PCS")).toBeNull();
    expect(valuate([stock()], sale({ priceUnit: "PER_PCS", weightCt: "0.000" })).priceSource).toBe("NONE");
  });

  it("source classification: the Price list wins over a Last sale", () => {
    expect(valuate([stock({ salePrice: "100" })], sale()).priceSource).toBe("PRICE_LIST");
  });
});

describe("UT-SV-02 query schemas", () => {
  it("the value sorts are accepted on the list and detail; Stock Card's schemas are unchanged", () => {
    for (const sort of ["stoneCode", "location", "lot", "balancePcs", "balanceWeightCt", "price", "amount", "profitLoss"]) expect(valueCardsQuerySchema.safeParse({ sort }).success, sort).toBe(true);
    for (const sort of ["date", "docNo", "stockId", "account", "profitLoss"]) expect(valueTransactionsQuerySchema.safeParse({ sort }).success, sort).toBe(true);
    for (const sort of ["cost", "docNo", "price; DROP TABLE x"]) expect(valueCardsQuerySchema.safeParse({ sort }).success, sort).toBe(false);
    expect(valueTransactionsQuerySchema.safeParse({ sort: "amount" }).success).toBe(false);
    expect(cardsQuerySchema.safeParse({ sort: "price" }).success).toBe(false);
    expect(transactionsQuerySchema.safeParse({ sort: "profitLoss" }).success).toBe(false);
  });

  it("defaults, bounds, from <= to and strict keys are Stock Card's", () => {
    expect(valueCardsQuerySchema.safeParse({}).data).toMatchObject({ sort: "stoneCode", dir: "asc", page: 1, pageSize: 25 });
    expect(valueTransactionsQuerySchema.safeParse({}).data).toMatchObject({ sort: "date", dir: "asc", page: 1, pageSize: 25 });
    expect(valueCardsQuerySchema.safeParse({ page: "200" }).success).toBe(true);
    for (const bad of [{ page: "201" }, { page: "0" }, { pageSize: "100" }, { q: "x".repeat(101) }, { location: "x".repeat(41) }, { foo: "1" }, { from: "2026-02-30" }]) {
      expect(valueCardsQuerySchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
    const reversed = valueCardsQuerySchema.safeParse({ from: "2026-09-02", to: "2026-09-01" });
    expect(reversed.success ? [] : reversed.error.issues.map((issue) => [issue.path.join("."), (issue as any).params?.code])).toEqual([["to", "before_from"]]);
    expect(valueTransactionsQuerySchema.safeParse({ location: "x" }).success).toBe(false);
  });
});

describe("UT-SV-03 SQL builders", () => {
  const sqlOf = (fragment: { sql: string }) => fragment.sql;

  it("the value sorts put missing values last in both directions; every sort is an enumeration with fixed text", () => {
    for (const [sort, column] of [["price", '"price"'], ["amount", '"amount"'], ["profitLoss", '"profit_loss"']] as const) {
      for (const dir of ["asc", "desc"] as const) expect(sqlOf(valueOrderBy(sort, dir))).toContain(`g.${column} ${dir.toUpperCase()} NULLS LAST, `);
    }
    expect(sqlOf(valueOrderBy("stoneCode", "desc"))).toContain("DESC");
    expect(sqlOf(valueOrderBy("balanceWeightCt", "asc"))).toContain('g."bal_w" ASC');
    expect(sqlOf(valueOrderBy("amount", "asc"))).toMatch(/g\."card_key"$/);
    expect(sqlOf(valueTxnOrderBy("profitLoss", "desc"))).toBe('"profit_loss" DESC NULLS LAST, "doc_date", "first_at", "document_id", "document_type"');
    expect(sqlOf(valueTxnOrderBy("date", "desc"))).toContain('"doc_date" DESC');
    expect(() => valueOrderBy("amount; DROP TABLE stock" as never, "asc")).toThrow();
  });

  it("the cards fragment is Stock Card's own function (one definition of cards and balance); the mode follows Start / Due; user text is bound", () => {
    expect(groupedCardsSql({}).ranged).toBe(false);
    expect(groupedCardsSql({ from: "2026-01-01" }).ranged).toBe(true);
    expect(groupedCardsSql({ to: "2026-01-01" }).ranged).toBe(true);
    const fragment = groupedCardsSql({ q: "x'; DROP TABLE stock; --", location: "Safe A" }).sql;
    expect(fragment.sql).not.toContain("DROP TABLE");
    expect(fragment.values).toContain("%x'; DROP TABLE stock; --%");
  });

  it("the migration is additive: two generated columns and one index; the rollback drops exactly those", () => {
    const up = readFileSync(join(__dirname, "../../prisma/migrations/20261123110000_stock_value/migration.sql"), "utf8");
    const down = readFileSync(join(__dirname, "../../prisma/rollback/20261123110000_stock_value.down.sql"), "utf8");
    expect(up.match(/GENERATED ALWAYS AS/g)).toHaveLength(2);
    expect(up).toContain('CREATE INDEX "sale_line_item_key_idx" ON "inventory"."sale_line" ("item_key")');
    expect(up.split("\n").filter((line) => !line.startsWith("--")).join("\n")).not.toMatch(/\b(UPDATE|DELETE|TRUNCATE)\b|DROP\s/i);
    for (const statement of ['DROP INDEX "inventory"."sale_line_item_key_idx"', 'ALTER TABLE "inventory"."sale_line" DROP COLUMN "item_key"', 'ALTER TABLE "inventory"."stock" DROP COLUMN "item_key"']) expect(down).toContain(statement);
  });
});

describe("UT-SV-04 shared guard", () => {
  const gate = () => { let open: () => void = () => undefined; const promise = new Promise<void>((resolve) => { open = resolve; }); return { promise, open }; };

  it("Stock Card keeps its import path; the codes belong to the caller: the third report call gets its own busy code", async () => {
    expect(ReExportedGuard).toBe(ReportGuard);
    const guard = new ReportGuard(2, 30);
    const first = gate();
    const a = guard.run(() => first.promise); // a Stock Card call
    const b = guard.run(() => first.promise, STOCK_VALUE_CODES.busy); // a Stock Value call
    expect(guard.inFlight).toBe(2);
    const refusedValue = await guard.run(async () => "never", STOCK_VALUE_CODES.busy).catch((error) => error);
    expect(refusedValue).toMatchObject({ status: 503, code: "STOCK_VALUE_BUSY", details: { retryAfterSeconds: 2 }, headers: { "Retry-After": "2" } });
    const refusedCard = await guard.run(async () => "never").catch((error) => error);
    expect(refusedCard).toMatchObject({ status: 503, code: "STOCK_CARD_BUSY" });
    first.open();
    await Promise.all([a, b]);
    expect(guard.inFlight).toBe(0);
  });

  it("a canceled statement becomes the caller's timeout code and frees the slot; Stock Card's default is unchanged", async () => {
    const wrapped = Object.assign(new Error("canceling statement due to statement timeout"), { code: "P2010", meta: { code: "57014" } });
    const db = { $transaction: async (work: (tx: unknown) => Promise<unknown>) => work({ $queryRaw: async () => { throw wrapped; } }) } as any;
    const guard = new ReportGuard();
    const value = await runReport(db, guard, { codes: STOCK_VALUE_CODES }, async (tx: any) => tx.$queryRaw`x`).catch((failure) => failure);
    expect(value).toMatchObject({ status: 503, code: "STOCK_VALUE_TIMEOUT", details: { limitSeconds: 5 } });
    const card = await runReport(db, guard, {}, async (tx: any) => tx.$queryRaw`x`).catch((failure) => failure);
    expect(card.code).toBe("STOCK_CARD_TIMEOUT");
    expect(guard.inFlight).toBe(0);
    const other = await runReport({ $transaction: async () => { throw new AppError(404, "STOCK_VALUE_NOT_FOUND"); } } as any, guard, { codes: STOCK_VALUE_CODES }, async () => 1).catch((failure) => failure);
    expect(other.code).toBe("STOCK_VALUE_NOT_FOUND");
  });

  it("the error catalog has a fixed English message for each STOCK_VALUE code", () => {
    for (const code of ["STOCK_VALUE_NOT_FOUND", "STOCK_VALUE_TOO_LARGE", "STOCK_VALUE_BUSY", "STOCK_VALUE_TIMEOUT"]) {
      expect(errorBody(code, "req").error.message, code).not.toBe(errorBody("INTERNAL_ERROR", "req").error.message);
    }
  });
});

describe("UT-SV-A1 route guard", () => {
  const principal = (grants: string[], admin = false): Principal => ({ userId: "u1", sessionId: "s1", isSuperAdmin: admin, grants: new Set(grants), displayName: null, accessExpiresAt: null });
  const KEY = `SC${"a".repeat(32)}`;
  const ROUTES = ["/stock-value/options", "/stock-value/cards", `/stock-value/cards/${KEY}`, `/stock-value/cards/${KEY}/transactions`];

  function appFor(who: Principal) {
    let touched = 0;
    const db = { $transaction: async () => { touched += 1; return { locations: [] }; } } as any;
    const guard = new ReportGuard();
    const api = new Hono<AppEnv>();
    api.use("*", async (c, next) => { c.set("principal", who); c.set("requestId", "req-test-0001"); await next(); });
    registerStockValueRoutes(api, { db, guard });
    registerStockCardRoutes(api, { db, guard });
    const app = new Hono<AppEnv>();
    app.onError((error, c) => errorResponse(c, error, createLogger("silent")));
    app.route("/api/inventory/v1", api);
    return { app, touched: () => touched };
  }

  it("every route needs stock-value:VIEW before it reads anything; stock-card:VIEW and other leaves do not count", async () => {
    for (const grants of [[], ["stock-card:VIEW"], ["sale:VIEW", "load-to-stock:VIEW"], ["stock-value:PRINT", "stock-value:EXCEL"]]) {
      const { app, touched } = appFor(principal(grants));
      for (const route of ROUTES) {
        const response = await app.request(`/api/inventory/v1${route}`);
        expect(response.status, `${grants.join(",")} ${route}`).toBe(403);
        expect(await response.json()).toMatchObject({ error: { code: "PERMISSION_DENIED" } });
      }
      expect(touched()).toBe(0);
    }
  });

  it("the grant and Super Admin pass; stock-value:VIEW does not open Stock Card", async () => {
    for (const who of [principal(["stock-value:VIEW"]), principal([], true)]) {
      const { app, touched } = appFor(who);
      expect((await app.request("/api/inventory/v1/stock-value/options")).status).toBe(200);
      expect(touched()).toBe(1);
    }
    const { app, touched } = appFor(principal(["stock-value:VIEW"]));
    expect((await app.request("/api/inventory/v1/stock-card/options")).status).toBe(403);
    expect(touched()).toBe(0);
  });

  it("a malformed card key is the same 404 as an unknown one and never reaches the database; an invalid query is a 422", async () => {
    const { app, touched } = appFor(principal(["stock-value:VIEW"]));
    for (const path of ["/stock-value/cards/zzz", "/stock-value/cards/SC123", "/stock-value/cards/zzz/transactions", `/stock-value/cards/${KEY.toUpperCase()}`]) {
      const response = await app.request(`/api/inventory/v1${path}`);
      expect(response.status, path).toBe(404);
      const body = await response.json() as { error: { code: string; message: string } };
      expect(body.error).toMatchObject({ code: "STOCK_VALUE_NOT_FOUND", message: errorBody("STOCK_VALUE_NOT_FOUND", "x").error.message });
    }
    expect(touched()).toBe(0);
    for (const path of ["/stock-value/cards?page=500&foo=1", `/stock-value/cards/${KEY}/transactions?sort=amount`, "/stock-value/cards?sort=cost"]) {
      expect((await app.request(`/api/inventory/v1${path}`)).status, path).toBe(422);
    }
    expect(touched()).toBe(0);
  });
});
