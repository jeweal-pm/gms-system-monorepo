/* eslint-disable @typescript-eslint/no-explicit-any -- fake clients and loosely typed JSON */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { Prisma } from "../../src/platform/db";
import { AppError, errorBody } from "../../src/platform/errors";
import { type AppEnv, errorResponse, parse } from "../../src/platform/http";
import { createLogger } from "../../src/platform/logger";
import type { Principal } from "../../src/platform/auth/principal";
import { ADJUSTMENT_SOURCED_TYPES, CARD_KINDS, DOCUMENT_TYPES, HIDDEN_STOCK_ID_TYPES, MOVEMENT_KINDS, STOCK_SOURCED_TYPES, classifyKind, documentTypeLabel, stockIdVisible } from "../../src/modules/stock/card-kinds";
import { directionOf, likePattern, readCards, readHeader, readTransactions, type CardsParams, type TransactionsParams } from "../../src/modules/stock/card";
import { ReportGuard, isQueryCanceled, runReport } from "../../src/modules/reports/stock-card/guard";
import { cardKeyParam, cardsQuerySchema, holdMetadataSchema, transactionsQuerySchema } from "../../src/modules/reports/stock-card/schemas";
import { registerStockCardRoutes } from "../../src/modules/reports/stock-card/routes";

/** Stock Card unit tests (stock-card testing.md): UT-SC-01…06 and UT-SC-A1. */

describe("UT-SC-01 CARD_KINDS registry", () => {
  it("classifies the ledger kinds: Load / Memo Out / Memo Out Return are movements, Reserve is not", () => {
    expect(MOVEMENT_KINDS).toEqual(["ADJUST", "ADJUST_REVERSAL", "LOAD_ADJUST", "LOAD_IN", "LOAD_REVERSAL", "MEMO_OUT", "MEMO_OUT_RETURN", "MEMO_OUT_RETURN_REVERSAL", "MEMO_OUT_REVERSAL", "MERGE_IN", "MERGE_OUT", "MERGE_REVERSAL", "SALE_OUT", "SALE_OUT_REVERSAL", "SPLIT_IN", "SPLIT_OUT", "SPLIT_REVERSAL", "TRANSFER_IN", "TRANSFER_IN_REVERSAL", "TRANSFER_OUT", "TRANSFER_OUT_REVERSAL"]);
    expect(classifyKind("HOLD_RESERVE")).toEqual({ documentType: "reserve", effect: "NOT_A_MOVEMENT" });
    expect(classifyKind("RELEASE_RESERVE")?.effect).toBe("NOT_A_MOVEMENT");
    expect(MOVEMENT_KINDS).not.toContain("HOLD_RESERVE");
    expect(classifyKind("MEMO_OUT_RETURN_REVERSAL")).toEqual({ documentType: "memo-out-return", effect: "MOVEMENT" });
    expect(classifyKind("LOAD_ADJUST")?.documentType).toBe("load-to-stock");
  });

  it("an unknown kind is excluded (no classification) and never reaches the SQL kind array", () => {
    expect(classifyKind("SOMETHING_NEW")).toBeUndefined();
    expect(MOVEMENT_KINDS).not.toContain("SOMETHING_NEW");
  });

  it("the Stock ID is visible on Load to Stock, Memo Out Return and Sale and hidden on Memo Out, Reserve, Quotation, Purchase, Memo Return (ADR-0055 D9 as amended)", () => {
    for (const visible of ["load-to-stock", "memo-out-return", "sale"]) expect(stockIdVisible(visible), visible).toBe(true);
    for (const hidden of ["memo-out", "reserve", "quotation", "purchase", "memo-return"]) expect(stockIdVisible(hidden), hidden).toBe(false);
    expect(stockIdVisible("future-type")).toBe(false);
    expect([...HIDDEN_STOCK_ID_TYPES]).toEqual(["memo-out", "memo-return", "purchase", "quotation", "reserve"]);
    expect([...STOCK_SOURCED_TYPES]).toEqual(["load-to-stock"]);
    expect([...ADJUSTMENT_SOURCED_TYPES]).toEqual(["stock-adjustment"]);
  });

  it("captions come from the registry; an unknown document type shows its key", () => {
    expect(documentTypeLabel("load-to-stock")).toBe("Load to Stock");
    expect(documentTypeLabel("memo-out")).toBe("Memo Out");
    expect(documentTypeLabel("memo-out-return")).toBe("Memo Out Return");
    expect(documentTypeLabel("sale")).toBe("Sale");
    expect(documentTypeLabel("stock-adjustment")).toBe("Stock Adjustment");
    for (const [name, kind] of Object.entries(CARD_KINDS)) expect(DOCUMENT_TYPES[kind.documentType], name).toBeDefined();
  });
});

describe("UT-SC-02 registry covers every kind the ledger CHECK allows", () => {
  it("the latest stock_movement_kind_check in the migrations is a subset of the registry (a new module must add its row)", () => {
    const root = join(__dirname, "../../prisma/migrations");
    let latest: string[] | null = null;
    for (const directory of readdirSync(root).filter((name) => /^\d{14}_/.test(name)).sort()) {
      const sql = readFileSync(join(root, directory, "migration.sql"), "utf8");
      for (const match of sql.matchAll(/ADD CONSTRAINT "stock_movement_kind_check" CHECK \("kind" IN \(([^)]*)\)\)/g)) {
        latest = [...match[1].matchAll(/'([A-Z_]+)'/g)].map((entry) => entry[1]);
      }
    }
    expect(latest).not.toBeNull();
    expect(latest!.length).toBeGreaterThanOrEqual(9);
    const missing = latest!.filter((kind) => !classifyKind(kind));
    expect(missing, `kinds missing from CARD_KINDS: ${missing.join(", ")}`).toEqual([]);
    // and the registry names no kind the ledger cannot hold
    expect(Object.keys(CARD_KINDS).filter((kind) => !latest!.includes(kind))).toEqual([]);
  });
});

describe("UT-SC-03 query schemas", () => {
  const cards = (query: Record<string, string>) => cardsQuerySchema.safeParse(query);
  const issues = (query: Record<string, string>, schema: typeof cardsQuerySchema | typeof transactionsQuerySchema = cardsQuerySchema) => {
    const result = schema.safeParse(query);
    return result.success ? [] : result.error.issues.map((issue) => [issue.path.join("."), (issue as any).params?.code ?? issue.code]);
  };

  it("defaults: stoneCode asc, page 1, pageSize 25; blank text and dates are absent", () => {
    expect(cards({}).data).toMatchObject({ sort: "stoneCode", dir: "asc", page: 1, pageSize: 25 });
    expect(cards({ q: "  ", location: "", from: "", to: "" }).data).toMatchObject({ q: undefined, location: undefined, from: undefined, to: undefined });
    expect(cards({ q: " ruby ", location: " Safe A " }).data).toMatchObject({ q: "ruby", location: "Safe A" });
  });

  it("enumerations and bounds: sort, dir, pageSize 10/25/50, page 1..200, q <= 100, location <= 40", () => {
    for (const sort of ["stoneCode", "location", "lot", "balancePcs", "balanceWeightCt"]) expect(cards({ sort }).success).toBe(true);
    expect(cards({ sort: "docNo" }).success).toBe(false);
    expect(cards({ sort: "balance; DROP TABLE x" }).success).toBe(false);
    expect(cards({ dir: "sideways" }).success).toBe(false);
    for (const size of ["10", "25", "50"]) expect(cards({ pageSize: size }).data?.pageSize).toBe(Number(size));
    for (const size of ["0", "5", "100", "abc", "-10"]) expect(cards({ pageSize: size }).success, size).toBe(false);
    expect(cards({ page: "200" }).data?.page).toBe(200);
    expect(issues({ page: "201" })).toEqual([["page", "too_large"]]);
    for (const page of ["0", "-1", "1.5", "x", "99999"]) expect(cards({ page }).success, page).toBe(false);
    expect(cards({ q: "x".repeat(100) }).success).toBe(true);
    expect(cards({ q: "x".repeat(101) }).success).toBe(false);
    expect(cards({ location: "x".repeat(41) }).success).toBe(false);
  });

  it("dates are real calendar days and from <= to (error on `to`, code before_from)", () => {
    expect(cards({ from: "2026-09-01", to: "2026-09-01" }).success).toBe(true);
    expect(issues({ from: "2026-09-02", to: "2026-09-01" })).toEqual([["to", "before_from"]]);
    for (const bad of ["2026-02-30", "26-01-01", "2026/01/01", "yesterday", "2026-1-1"]) expect(cards({ from: bad }).success, bad).toBe(false);
  });

  it("strict: unknown keys are refused; the detail has its own sorts", () => {
    expect(cards({ foo: "1" }).success).toBe(false);
    expect(cards({ cardKey: "SC" }).success).toBe(false);
    for (const sort of ["date", "docNo", "stockId", "account"]) expect(transactionsQuerySchema.safeParse({ sort }).success).toBe(true);
    expect(transactionsQuerySchema.safeParse({ sort: "lot" }).success).toBe(false);
    expect(transactionsQuerySchema.safeParse({}).data).toMatchObject({ sort: "date", dir: "asc", page: 1, pageSize: 25 });
    expect(issues({ from: "2026-09-02", to: "2026-09-01" }, transactionsQuerySchema)).toEqual([["to", "before_from"]]);
    expect(transactionsQuerySchema.safeParse({ location: "x" }).success).toBe(false);
  });

  it("card key pattern and the hold metadata body", () => {
    expect(cardKeyParam(`SC${"0".repeat(32)}`)).toBe(true);
    expect(cardKeyParam(`SC${"A".repeat(32)}`)).toBe(false);
    expect(cardKeyParam(`SC${"0".repeat(31)}`)).toBe(false);
    expect(cardKeyParam("../etc/passwd")).toBe(false);
    expect(holdMetadataSchema.safeParse({}).success).toBe(true);
    expect(holdMetadataSchema.safeParse({ docDate: "2026-09-18", party: { id: "0193a000-0000-7000-8000-0000000000b1", name: " Khun Nida " } }).data?.party?.name).toBe("Khun Nida");
    expect(holdMetadataSchema.safeParse({ docDate: null, party: null }).success).toBe(true);
    expect(holdMetadataSchema.safeParse({ party: { id: "x", name: "N" } }).success).toBe(false);
    expect(holdMetadataSchema.safeParse({ party: { id: "0193a000-0000-7000-8000-0000000000b1", name: "" } }).success).toBe(false);
    expect(holdMetadataSchema.safeParse({ extra: 1 }).success).toBe(false);
    expect(() => parse(cardsQuerySchema, { page: "0" })).toThrow(AppError);
  });
});

/** A client that records the SQL it is given and answers with canned rows (one answer per statement). */
function fakeClient(...answers: unknown[][]) {
  const statements: Prisma.Sql[] = [];
  const client = { $queryRaw: async (sql: Prisma.Sql) => { statements.push(sql); return answers[statements.length - 1] ?? []; } };
  return { client: client as any, statements };
}
const listParams = (patch: Partial<CardsParams> = {}): CardsParams => ({ sort: "stoneCode", dir: "asc", page: 1, pageSize: 25, ...patch });
const txParams = (patch: Partial<TransactionsParams> = {}): TransactionsParams => ({ sort: "date", dir: "asc", page: 1, pageSize: 25, ...patch });

describe("UT-SC-04 SQL builders", () => {
  it("likePattern escapes the LIKE metacharacters \\ % _", () => {
    expect(likePattern("ruby")).toBe("%ruby%");
    expect(likePattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
  });

  it("user text only travels as a bound parameter, never inside the SQL text", async () => {
    const evil = "'; DROP TABLE inventory.stock; --";
    const { client, statements } = fakeClient([]);
    await readCards(client, listParams({ q: evil, location: evil, from: "2026-01-01", to: "2026-12-31" }));
    expect(statements).toHaveLength(1);
    expect(statements[0].sql).not.toContain("DROP TABLE");
    expect(statements[0].values).toEqual(expect.arrayContaining([likePattern(evil), evil, "2026-01-01", "2026-12-31"]));
  });

  it("mode choice: no dates reads only the stock rows; a Start or Due reads the ledger; one statement either way", async () => {
    const current = fakeClient([]);
    expect((await readCards(current.client, listParams())).mode).toBe("CURRENT");
    expect(current.statements).toHaveLength(1);
    expect(current.statements[0].sql).not.toContain("stock_movement");
    for (const dates of [{ from: "2026-01-01" }, { to: "2026-01-01" }, { from: "2026-01-01", to: "2026-02-01" }]) {
      const ranged = fakeClient([]);
      const page = await readCards(ranged.client, listParams(dates));
      expect(page.mode).toBe("RANGE");
      expect(page.asOf).toBe((dates as { to?: string }).to ?? null);
      expect(ranged.statements).toHaveLength(1);
      expect(ranged.statements[0].sql).toContain("stock_movement");
      expect(ranged.statements[0].values).toContainEqual([...MOVEMENT_KINDS]);
    }
  });

  it("ORDER BY comes from the enumeration: the first key flips with dir, ties keep the card key last", async () => {
    const expected: Record<string, RegExp> = {
      stoneCode: /ORDER BY COALESCE\(NULLIF\(n\."stone_code", ''\)[\s\S]*? DESC, n\."location", n\."lot", g\."card_key"\s+LIMIT/,
      location: /ORDER BY n\."location" DESC, COALESCE\(/,
      lot: /ORDER BY n\."lot" DESC, COALESCE\(/,
      balancePcs: /ORDER BY g\."bal_pcs" DESC, COALESCE\(/,
      balanceWeightCt: /ORDER BY g\."bal_w" DESC, COALESCE\(/,
    };
    for (const [sort, pattern] of Object.entries(expected)) {
      const { client, statements } = fakeClient([]);
      await readCards(client, listParams({ sort: sort as CardsParams["sort"], dir: "desc" }));
      expect(statements[0].sql, sort).toMatch(pattern);
    }
    const asc = fakeClient([]);
    await readCards(asc.client, listParams({ sort: "balancePcs", dir: "asc" }));
    expect(asc.statements[0].sql).toContain(`ORDER BY g."bal_pcs" ASC`);
  });

  it("paging: limit and offset are parameters (page 3 of 50 -> offset 100)", async () => {
    const { client, statements } = fakeClient([]);
    await readCards(client, listParams({ page: 3, pageSize: 50 }));
    expect(statements[0].values.slice(-2)).toEqual([50, 100]);
  });

  it("detail ORDER BY: date flips every key, the others flip the first key and keep the chronological tie-break", async () => {
    const stats = { card_exists: true, entries: 1, movements: 1, total: 1, opening_pcs: 0, opening_w: "0", in_pcs: 0, in_w: "0", out_pcs: 0, out_w: "0", bal_pcs: 0, bal_w: "0" };
    const orderOf = async (sort: TransactionsParams["sort"], dir: "asc" | "desc") => {
      const { client, statements } = fakeClient([stats], []);
      await readTransactions(client, `SC${"0".repeat(32)}`, txParams({ sort, dir }));
      return /ORDER BY ([^\n]*)\n\s*LIMIT/.exec(statements[1].sql)![1];
    };
    expect(await orderOf("date", "desc")).toBe(`"doc_date" DESC, "first_at" DESC, "document_id" DESC, "document_type" DESC`);
    expect(await orderOf("docNo", "desc")).toBe(`"doc_no" DESC, "doc_date", "first_at", "document_id", "document_type"`);
    expect(await orderOf("stockId", "asc")).toBe(`"stock_id" ASC NULLS LAST, "doc_date", "first_at", "document_id", "document_type"`);
    expect(await orderOf("account", "asc")).toBe(`"account_name" ASC, "doc_date", "first_at", "document_id", "document_type"`);
  });

  it("the entry CTE reads the movement kinds as one array parameter and hides Stock IDs by type", async () => {
    const { client, statements } = fakeClient([{ card_exists: true, entries: 0, movements: 0, total: 0, opening_pcs: 0, opening_w: "0", in_pcs: 0, in_w: "0", out_pcs: 0, out_w: "0", bal_pcs: 0, bal_w: "0" }]);
    await readTransactions(client, `SC${"1".repeat(32)}`, txParams({ q: "MO-1" }));
    expect(statements).toHaveLength(1); // nothing to page: the second statement is skipped
    const values = statements[0].values;
    expect(values).toContainEqual([...MOVEMENT_KINDS]);
    expect(values).toContainEqual([...HIDDEN_STOCK_ID_TYPES]);
    expect(values).toContainEqual([...STOCK_SOURCED_TYPES]);
    expect(values).toContain(likePattern("MO-1"));
    expect(statements[0].sql).toContain("Asia/Bangkok");
  });
});

describe("UT-SC-05 entry math", () => {
  it("net > 0 is IN and net < 0 is OUT, per dimension", () => {
    expect(directionOf(4, "1.240")).toEqual({ inPcs: 4, inWeightCt: "1.240", outPcs: null, outWeightCt: null });
    expect(directionOf(-2, "-0.620")).toEqual({ inPcs: null, inWeightCt: null, outPcs: 2, outWeightCt: "0.620" });
  });

  it("opposite signs are classified separately; a zero dimension follows the other one", () => {
    expect(directionOf(2, "-0.500")).toEqual({ inPcs: 2, inWeightCt: null, outPcs: null, outWeightCt: "0.500" });
    expect(directionOf(-2, "0.500")).toEqual({ inPcs: null, inWeightCt: "0.500", outPcs: 2, outWeightCt: null });
    expect(directionOf(0, "0.100")).toEqual({ inPcs: 0, inWeightCt: "0.100", outPcs: null, outWeightCt: null });
    expect(directionOf(3, "0")).toEqual({ inPcs: 3, inWeightCt: "0.000", outPcs: null, outWeightCt: null });
    expect(directionOf(0, "-0.100")).toEqual({ inPcs: null, inWeightCt: null, outPcs: 0, outWeightCt: "0.100" });
  });

  it("transactions: rows, opening, totals and a negative running balance are returned as the database computed them", async () => {
    const stats = { card_exists: true, entries: 3, movements: 4, total: 3, opening_pcs: 1, opening_w: "0.5", in_pcs: 4, in_w: "1.24", out_pcs: 6, out_w: "1.5", bal_pcs: -1, bal_w: "-0.26" };
    const rows = [
      { document_type: "load-to-stock", document_id: "d1", doc_no: "LS1", doc_date: "2026-09-04", stock_id: "260214", stock_count: 3, account_id: "v1", account_name: "Vendor", pcs: 4, weight: "1.24", bal_pcs: 5, bal_w: "1.74" },
      { document_type: "memo-out", document_id: "d2", doc_no: "MO1", doc_date: "2026-09-18", stock_id: null, stock_count: 0, account_id: null, account_name: "", pcs: -6, weight: "-1.5", bal_pcs: -1, bal_w: "-0.26" },
    ];
    const { client } = fakeClient([stats], rows);
    const page = await readTransactions(client, `SC${"2".repeat(32)}`, txParams({ from: "2026-09-01", pageSize: 10 }));
    expect(page.items[0]).toMatchObject({ id: "load-to-stock:d1", docTypeLabel: "Load to Stock", stockId: "260214", stockIdExtra: 2, inPcs: 4, inWeightCt: "1.240", outPcs: null, balancePcs: 5, balanceWeightCt: "1.740" });
    expect(page.items[1]).toMatchObject({ docType: "memo-out", stockId: null, stockIdExtra: 0, accountId: null, accountName: "", outPcs: 6, outWeightCt: "1.500", inPcs: null, balancePcs: -1, balanceWeightCt: "-0.260" });
    expect(page.opening).toEqual({ pcs: 1, weightCt: "0.500" });
    expect(page.totals).toEqual({ inPcs: 4, inWeightCt: "1.240", outPcs: 6, outWeightCt: "1.500", balancePcs: -1, balanceWeightCt: "-0.260" });
    expect(page).toMatchObject({ total: 3, page: 1, pageSize: 10 });
  });

  it("a missing card is 404 and an oversize card is 422 STOCK_CARD_TOO_LARGE before the page is read", async () => {
    const base = { entries: 0, movements: 0, total: 0, opening_pcs: 0, opening_w: "0", in_pcs: 0, in_w: "0", out_pcs: 0, out_w: "0", bal_pcs: 0, bal_w: "0" };
    const key = `SC${"3".repeat(32)}`;
    await expect(readTransactions(fakeClient([{ ...base, card_exists: false }]).client, key, txParams())).rejects.toMatchObject({ status: 404, code: "STOCK_CARD_NOT_FOUND" });
    await expect(readTransactions(fakeClient([]).client, key, txParams())).rejects.toMatchObject({ status: 404 });
    const big = fakeClient([{ ...base, card_exists: true, entries: 5001, movements: 5001, total: 5001 }]);
    await expect(readTransactions(big.client, key, txParams())).rejects.toMatchObject({ status: 422, code: "STOCK_CARD_TOO_LARGE", details: { entries: 5001, limit: 5000 } });
    expect(big.statements).toHaveLength(1);
    const heavy = fakeClient([{ ...base, card_exists: true, entries: 10, movements: 50_001, total: 10 }]);
    await expect(readTransactions(heavy.client, key, txParams())).rejects.toMatchObject({ code: "STOCK_CARD_TOO_LARGE" });
    await expect(readTransactions(fakeClient([{ ...base, card_exists: true, entries: 5000, movements: 50_000, total: 1 }], []).client, key, txParams())).resolves.toMatchObject({ total: 1, items: [] });
  });

  it("an out-of-range page skips the second statement; the header 404s without an active stock", async () => {
    const stats = { card_exists: true, entries: 2, movements: 2, total: 2, opening_pcs: 0, opening_w: "0", in_pcs: 0, in_w: "0", out_pcs: 0, out_w: "0", bal_pcs: 0, bal_w: "0" };
    const paged = fakeClient([stats]);
    expect((await readTransactions(paged.client, `SC${"4".repeat(32)}`, txParams({ page: 3 }))).items).toEqual([]);
    expect(paged.statements).toHaveLength(1);
    await expect(readHeader(fakeClient([]).client, `SC${"4".repeat(32)}`)).rejects.toMatchObject({ status: 404, code: "STOCK_CARD_NOT_FOUND" });
  });

  it("list rows are mapped with weights at 3 decimals; an empty page keeps the exact total", async () => {
    const row = { total: 2, card_key: `SC${"5".repeat(32)}`, location: "Safe A", lot: "", vendor_name: "V", vendor_count: 2, bal_pcs: 7, bal_w: "3", stoneCode: "", stone: "Ruby", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "" };
    const page = await readCards(fakeClient([row, { ...row, card_key: `SC${"6".repeat(32)}` }]).client, listParams());
    expect(page).toMatchObject({ total: 2, mode: "CURRENT", asOf: null });
    expect(page.items[0]).toMatchObject({ cardKey: row.card_key, balanceWeightCt: "3.000", vendorCount: 2, stone: "Ruby", lot: "" });
    const empty = await readCards(fakeClient([{ total: 9, card_key: null }]).client, listParams({ page: 9 }));
    expect(empty).toMatchObject({ total: 9, items: [] });
  });
});

describe("UT-SC-06 concurrency guard and statement timeout", () => {
  const gate = () => { let open: () => void = () => undefined; const promise = new Promise<void>((resolve) => { open = resolve; }); return { promise, open }; };

  it("two run at once, the third waits then gets STOCK_CARD_BUSY; the slot is released on success and on error", async () => {
    const guard = new ReportGuard(2, 40);
    const first = gate();
    const a = guard.run(() => first.promise);
    const b = guard.run(() => first.promise);
    expect(guard.inFlight).toBe(2);
    const started = Date.now();
    const refused = await guard.run(async () => "never").catch((error) => error);
    expect(Date.now() - started).toBeGreaterThanOrEqual(30);
    expect(refused).toMatchObject({ status: 503, code: "STOCK_CARD_BUSY", details: { retryAfterSeconds: 2 }, headers: { "Retry-After": "2" } });
    first.open();
    await Promise.all([a, b]);
    expect(guard.inFlight).toBe(0);
    await expect(guard.run(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(guard.inFlight).toBe(0);
    await expect(guard.run(async () => "ok")).resolves.toBe("ok");
  });

  it("a waiter gets the slot when a running report finishes inside the wait", async () => {
    const guard = new ReportGuard(1, 500);
    const first = gate();
    const a = guard.run(() => first.promise);
    const b = guard.run(async () => "second");
    setTimeout(first.open, 20);
    await expect(b).resolves.toBe("second");
    await a;
    expect(guard.inFlight).toBe(0);
  });

  it("a canceled statement (57014, however Prisma wraps it) becomes STOCK_CARD_TIMEOUT and frees the slot", async () => {
    const wrapped = Object.assign(new Error("canceling statement due to statement timeout"), { code: "P2010", meta: { code: "57014", message: "canceling statement" } });
    expect(isQueryCanceled(wrapped)).toBe(true);
    expect(isQueryCanceled({ cause: { originalCode: "57014" } })).toBe(true);
    expect(isQueryCanceled(new Error("other"))).toBe(false);
    const db = { $transaction: async (work: (tx: unknown) => Promise<unknown>) => work({ $queryRaw: async () => { throw wrapped; } }) } as any;
    const guard = new ReportGuard();
    const error = await runReport(db, guard, {}, async (tx: any) => tx.$queryRaw`x`).catch((failure) => failure);
    expect(error).toMatchObject({ status: 503, code: "STOCK_CARD_TIMEOUT", details: { limitSeconds: 5 } });
    expect(guard.inFlight).toBe(0);
    const other = await runReport({ $transaction: async () => { throw new AppError(404, "STOCK_CARD_NOT_FOUND"); } } as any, guard, {}, async () => 1).catch((failure) => failure);
    expect(other.code).toBe("STOCK_CARD_NOT_FOUND");
  });

  it("the report transaction sets the timeout first and RepeatableRead only when asked", async () => {
    const seen: { sql: string; options: any }[] = [];
    const db = { $transaction: async (work: (tx: unknown) => Promise<unknown>, options: any) => work({ $queryRaw: async (strings: TemplateStringsArray) => { seen.push({ sql: strings.join("?"), options }); return []; } }) } as any;
    await runReport(db, new ReportGuard(), { statementTimeoutMs: 1234 }, async () => 1);
    expect(seen[0].sql).toContain("set_config('statement_timeout'");
    expect(seen[0].sql).toContain("transaction_read_only");
  });
});

describe("UT-SC-A1 route guard", () => {
  const principal = (grants: string[], admin = false): Principal => ({ userId: "u1", sessionId: "s1", isSuperAdmin: admin, grants: new Set(grants), displayName: null, accessExpiresAt: null });
  const KEY = `SC${"a".repeat(32)}`;
  const ROUTES = ["/stock-card/options", "/stock-card/cards", `/stock-card/cards/${KEY}`, `/stock-card/cards/${KEY}/transactions`];

  function appFor(who: Principal) {
    let touched = 0;
    const db = { $transaction: async () => { touched += 1; return { locations: [] }; } } as any;
    const api = new Hono<AppEnv>();
    api.use("*", async (c, next) => { c.set("principal", who); c.set("requestId", "req-test-0001"); await next(); });
    registerStockCardRoutes(api, { db });
    const app = new Hono<AppEnv>();
    app.onError((error, c) => errorResponse(c, error, createLogger("silent")));
    app.route("/api/inventory/v1", api);
    return { app, touched: () => touched };
  }

  it("every route needs stock-card:VIEW before it reads anything; other leaves do not count", async () => {
    for (const grants of [[], ["load-to-stock:VIEW"], ["sale:VIEW", "stock-card:PRINT", "stock-card:EXCEL"], ["stock-value:VIEW"]]) {
      const { app, touched } = appFor(principal(grants));
      for (const route of ROUTES) {
        const response = await app.request(`/api/inventory/v1${route}`);
        expect(response.status, `${grants.join(",")} ${route}`).toBe(403);
        expect(await response.json()).toMatchObject({ error: { code: "PERMISSION_DENIED" } });
      }
      expect(touched()).toBe(0);
    }
  });

  it("the grant (and Super Admin) passes the guard and reaches the database", async () => {
    for (const who of [principal(["stock-card:VIEW"]), principal([], true)]) {
      const { app, touched } = appFor(who);
      const response = await app.request("/api/inventory/v1/stock-card/options");
      expect(response.status).toBe(200);
      expect(touched()).toBe(1);
    }
  });

  it("a malformed card key is the same 404 as an unknown one and never reaches the database", async () => {
    const { app, touched } = appFor(principal(["stock-card:VIEW"]));
    for (const path of ["/stock-card/cards/zzz", "/stock-card/cards/SC123", "/stock-card/cards/zzz/transactions", `/stock-card/cards/${KEY.toUpperCase()}`]) {
      const response = await app.request(`/api/inventory/v1${path}`);
      expect(response.status, path).toBe(404);
      const body = await response.json() as { error: { code: string; message: string } };
      expect(body.error).toMatchObject({ code: "STOCK_CARD_NOT_FOUND", message: errorBody("STOCK_CARD_NOT_FOUND", "x").error.message });
    }
    expect(touched()).toBe(0);
  });

  it("an invalid query is a 422 before the database is touched", async () => {
    const { app, touched } = appFor(principal(["stock-card:VIEW"]));
    const response = await app.request("/api/inventory/v1/stock-card/cards?page=500&foo=1");
    expect(response.status).toBe(422);
    expect(touched()).toBe(0);
  });
});
