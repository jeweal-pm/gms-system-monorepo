import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { HttpException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sendAndApprove, setApproval } from "../partner-shared/approval";

/**
 * Master side of Sale on PostgreSQL through real HTTP (sale SA rev 1 testing.md; BE-SL-001/002): IT-SL-M01 (migration,
 * CHECKs, indexes, down script), M02 (RESERVE apply), M03 (STOCK apply + Purchase SOLD group), M04 (partial), M05
 * (idempotency / stale), M06 (concurrent consumption), M07 (Memo Out hold safety), M08 (unavailable), M09 (release /
 * IN_USE), M10 (Reserve used), M11 (reads + query budgets), M12 (internal token), M13 (numbering), M14 (reserve.get).
 *
 * Opt-in: `PARTNER_TEST_DATABASE_URL` → disposable `f1_system` on 127.0.0.1 (port ≠ 5432), migrated. Rows are scoped
 * to the vendor and customer created here; Stock ID year 83 (clock faked); everything is removed in afterAll.
 */
type PgClient = { connect(): Promise<void>; end(): Promise<void>; query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Client } = require("pg") as { Client: new (options: { connectionString?: string }) => PgClient };

const testUrl = process.env.PARTNER_TEST_DATABASE_URL;
const canRun = Boolean(testUrl && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(testUrl));
const ACTOR = `sl-it-${randomUUID().slice(0, 8)}`;
const YEAR = 83;
const TOKEN = randomBytes(32).toString("base64url");
const dir = mkdtempSync(join(tmpdir(), "gms-sl-master-it-"));

type PrismaClient = typeof import("../../src/database/prisma-client").prisma;
type Json = Record<string, unknown> & { error?: { code: string; details?: Record<string, unknown> } };
type Vendor = { id: string; addressId: string };

let prisma: PrismaClient;
let app: INestApplication;
let base = "";
let receive: InstanceType<typeof import("../../src/trade-document/memo-receive.service").MemoReceiveService>;
let reserve: InstanceType<typeof import("../../src/trade-document/reserve.service").ReserveService>;
let memoOut: InstanceType<typeof import("../../src/trade-document/memo-out.service").MemoOutService>;
let createMemoOutSchema: typeof import("../../src/trade-document/memo-schemas").createMemoOutSchema;
const sales: string[] = [];
const queries: string[] = [];
let counting = false;
let vendor: Vendor;
const customer = { id: randomUUID(), shipping: randomUUID(), invoice: randomUUID() };
const other = { id: randomUUID(), shipping: randomUUID(), invoice: randomUUID() };

const money = { discount: { type: "NONE" as const, value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null };
const receiveLine = (patch: Record<string, unknown> = {}) => ({
  source: "MANUAL" as const, stoneCode: "", stone: "Ruby", shape: "Oval", size: "", color: "Red", clarity: "", cutting: "", quality: "",
  lot: `SL-${ACTOR.slice(-4)}`, cerType: "GIA", cerNo: "C-1", pcs: 10, weightCt: "5", priceUnit: "PER_CT" as "PER_CT" | "PER_PCS", unitPrice: "1000",
  discount: { type: "NONE" as const, value: "0" }, itemNote: "", photoIds: [] as [], ...patch,
});
const stockLine = (memoStockId: string, pcs: number, weightCt: string, patch: Record<string, unknown> = {}) => ({
  source: "MANUAL" as const, stoneCodeId: null, stoneCode: "", stone: "x", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "",
  lot: "", location: "", cerType: "", cerNo: "", pcs, weightCt, priceUnit: "PER_PCS" as const, unitPrice: "2500", discount: { type: "NONE" as const, value: "0" },
  itemNote: "", photoIds: [] as string[], memoStockId, ...patch,
});
const docInput = (lines: Record<string, unknown>[], patch: Record<string, unknown> = {}) => createMemoOutSchema.parse({
  docDate: "2026-11-10", dueDate: "2026-12-10", currency: "THB", exchangeRate: null, ref: "", documentNote: "", ...money, lines,
  customerId: customer.id, shippingAddressId: customer.shipping, invoiceAddressId: customer.invoice, ...patch,
});

async function call(method: string, path: string, body?: unknown, token = TOKEN): Promise<{ status: number; body: Json }> {
  const response = await fetch(`${base}/internal/v1/inventory${path}`, {
    method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-actor-user-id": ACTOR }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) as Json : {} };
}
async function measured<T>(run: () => Promise<T>): Promise<{ result: T; count: number }> {
  queries.length = 0;
  counting = true;
  try {
    const result = await run();
    return { result, count: queries.filter((sql) => !/^\s*(BEGIN|COMMIT|ROLLBACK|SET TRANSACTION)/i.test(sql)).length };
  } finally {
    counting = false;
  }
}
const domainCode = async (promise: Promise<unknown>) => {
  try { await promise; } catch (error) {
    if (error instanceof HttpException) return { code: (error.getResponse() as { error: { code: string; details?: Record<string, unknown> } }).error.code, details: (error.getResponse() as { error: { details?: Record<string, unknown> } }).error.details };
    throw error;
  }
  return { code: "ok" };
};

async function approvedStock(lines: ReturnType<typeof receiveLine>[]) {
  const saved = await receive.create(ACTOR, { docDate: "2026-11-01", dueDate: "2026-12-01", currency: "THB", exchangeRate: null, ref: "", documentNote: "", ...money, lines, vendorId: vendor.id, addressId: vendor.addressId });
  await sendAndApprove(receive, ACTOR, saved.id, saved.version);
  return prisma.memoStock.findMany({ where: { memoReceiveId: saved.id }, orderBy: { stockId: "asc" } });
}
/** An approved Reserve (approval ON → submit + approve, or OFF → auto-approved) over Memo Stock lines. */
async function approvedReserve(lines: Record<string, unknown>[], options: { auto?: boolean; patch?: Record<string, unknown> } = {}) {
  await setApproval(prisma, "reserve", !options.auto);
  const saved = await reserve.create(ACTOR, docInput(lines, options.patch));
  if (!options.auto) await sendAndApprove(reserve, ACTOR, saved.id, saved.version);
  await setApproval(prisma, "reserve", true);
  const rows = await prisma.reserveLine.findMany({ where: { reserveId: saved.id }, orderBy: { position: "asc" } });
  return { id: saved.id, docNo: saved.docNo, lineIds: rows.map((row) => row.id) };
}
const buckets = async (id: string) => {
  const s = await prisma.memoStock.findUniqueOrThrow({ where: { id } });
  return { pending: s.pendingPcs, reserved: s.reservedPcs, sold: s.soldPcs, soldWeight: s.soldWeightCt.toFixed(3), purchased: s.purchasedPcs };
};
const soldOf = async (lineId: string) => {
  const l = await prisma.reserveLine.findUniqueOrThrow({ where: { id: lineId } });
  return [l.soldPcs, l.soldWeightCt.toFixed(3)];
};
const newSale = () => { const id = randomUUID(); sales.push(id); return id; };
const put = (saleId: string, revision: number, lines: unknown[], patch: Record<string, unknown> = {}) =>
  call("PUT", `/sale-consumptions/${saleId}`, { revision, saleDocNo: `SL-${saleId.slice(0, 6)}`, customerId: customer.id, currency: "THB", lines, ...patch });
const rLine = (reserveLineId: string, memoStockId: string, pcs: number, weightCt: string, lineId: string = randomUUID()) => ({ lineId, source: "RESERVE", reserveLineId, memoStockId, pcs, weightCt });
const sLine = (memoStockId: string, pcs: number, weightCt: string, lineId: string = randomUUID()) => ({ lineId, source: "STOCK", memoStockId, pcs, weightCt });

describe.runIf(canRun)("IT-SL master sale consumption on PostgreSQL", () => {
  beforeAll(async () => {
    const tokenFile = join(dir, "inventory-token");
    writeFileSync(tokenFile, `${TOKEN}\n`);
    vi.stubEnv("PARTNER_DATABASE_URL", testUrl!);
    vi.stubEnv("DATABASE_URL", testUrl!);
    vi.stubEnv("PARTNER_SERVICE_TOKEN", `partner-${randomBytes(24).toString("base64url")}`);
    vi.stubEnv("INVENTORY_MASTER_SERVICE_TOKEN_FILE", tokenFile);
    vi.stubEnv("GMS_STORAGE_ROOT", dir);
    vi.stubEnv("PRISMA_QUERY_EVENTS", "1");
    ({ prisma } = await import("../../src/database/prisma-client"));
    (prisma as unknown as { $on(event: "query", listener: (event: { query: string }) => void): void }).$on("query", (event) => { if (counting) queries.push(event.query); });
    const { MemoReceiveService } = await import("../../src/trade-document/memo-receive.service");
    const { ReserveService } = await import("../../src/trade-document/reserve.service");
    const { MemoOutService } = await import("../../src/trade-document/memo-out.service");
    ({ createMemoOutSchema } = await import("../../src/trade-document/memo-schemas"));
    const { InventoryInternalService } = await import("../../src/inventory-internal/inventory-internal.service");
    const { InventoryInternalController } = await import("../../src/inventory-internal/inventory-internal.controller");
    const { InventoryServiceTokenGuard } = await import("../../src/inventory-internal/inventory-token.guard");
    const { ServiceTokenGuard } = await import("../../src/internal-auth/service-token.guard");
    const { EnvelopeExceptionFilter } = await import("../../src/common/exception.filter");
    const { Module } = await import("@nestjs/common");
    const { APP_FILTER, APP_GUARD, NestFactory } = await import("@nestjs/core");
    const express = (await import("express")).default;
    receive = new MemoReceiveService();
    receive.clock = () => new Date(`20${YEAR}-06-01T03:00:00Z`);
    reserve = new ReserveService();
    memoOut = new MemoOutService();
    const internal = new InventoryInternalService();
    class TestModule {}
    Module({
      controllers: [InventoryInternalController],
      providers: [{ provide: InventoryInternalService, useValue: internal }, InventoryServiceTokenGuard, { provide: APP_GUARD, useClass: ServiceTokenGuard }, { provide: APP_FILTER, useClass: EnvelopeExceptionFilter }],
    })(TestModule);
    app = await NestFactory.create(TestModule, { bodyParser: false, logger: false });
    app.use(express.json({ limit: "256kb" }));
    await app.listen(0, "127.0.0.1");
    base = (await app.getUrl()).replace("[::1]", "127.0.0.1");
    if (!(await prisma.currency.findUnique({ where: { code: "THB" } }))) await prisma.currency.create({ data: { code: "THB", name: "THB", createdBy: ACTOR, updatedBy: ACTOR } });
    if (!(await prisma.currency.findUnique({ where: { code: "USD" } }))) await prisma.currency.create({ data: { code: "USD", name: "USD", createdBy: ACTOR, updatedBy: ACTOR } });
    await prisma.memoStockIdCounter.deleteMany({ where: { year: YEAR } });
    vendor = { id: randomUUID(), addressId: randomUUID() };
    await prisma.vendor.create({ data: {
      id: vendor.id, name: `SL IT Vendor ${ACTOR}`, nameKey: `sl it vendor ${ACTOR}`.toLowerCase(), code: `SLIT${ACTOR.slice(-4)}`.toUpperCase(), codeKey: `slit${ACTOR.slice(-4)}`.toLowerCase(), currencyCode: "THB", firstName: "It", email: "sl-it@example.test", createdBy: ACTOR, updatedBy: ACTOR,
      addresses: { create: [{ id: vendor.addressId, position: 1, name: "SL IT Vendor Co.", address: "1 Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true }] },
    } });
    for (const [c, n] of [[customer, "A"], [other, "B"]] as const) {
      const address = { position: 1, name: `SL IT Customer ${n}`, address: "2 Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true };
      await prisma.customer.create({ data: {
        id: c.id, name: `SL IT Customer ${n} ${ACTOR}`, nameKey: `sl it customer ${n} ${ACTOR}`.toLowerCase(), code: `SLC${n}${ACTOR.slice(-4)}`.toUpperCase(), codeKey: `slc${n}${ACTOR.slice(-4)}`.toLowerCase(),
        currencyCode: "THB", firstName: "It", email: "sl-it@example.test", createdBy: ACTOR, updatedBy: ACTOR,
        addresses: { create: [{ ...address, id: c.shipping, type: "SHIPPING" }, { ...address, id: c.invoice, type: "INVOICE" }] },
      } });
    }
    for (const type of ["memo-receive", "memo-out", "reserve"] as const) await setApproval(prisma, type, true);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    if (prisma) {
      await prisma.saleConsumption.deleteMany({ where: { saleId: { in: sales } } });
      await prisma.reserve.deleteMany({ where: { customerId: { in: [customer.id, other.id] } } });
      await prisma.memoOut.deleteMany({ where: { customerId: { in: [customer.id, other.id] } } });
      await prisma.memoStock.deleteMany({ where: { vendorId: vendor.id } });
      await prisma.memoReceive.deleteMany({ where: { vendorId: vendor.id } });
      await prisma.customer.deleteMany({ where: { id: { in: [customer.id, other.id] } } });
      await prisma.vendor.deleteMany({ where: { id: vendor.id } });
      await prisma.memoStockIdCounter.deleteMany({ where: { year: YEAR } });
      await prisma.documentNumbering.updateMany({ where: { transactionKey: "sale" }, data: { externalUsedAt: null } });
      for (const type of ["memo-receive", "memo-out", "reserve"] as const) await setApproval(prisma, type, true);
      await prisma.$disconnect();
    }
    rmSync(dir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("IT-SL-M01 migration: sold defaults 0; CHECK rejects sold > qty and sold on a manual line; partial indexes; down script (rolled back)", async () => {
    const [item] = await approvedStock([receiveLine({ pcs: 2, weightCt: "1" })]);
    const rs = await approvedReserve([stockLine(item.id, 2, "1")]);
    expect(await soldOf(rs.lineIds[0])).toEqual([0, "0.000"]);
    const state = async (sql: string) => prisma.$executeRawUnsafe(sql).then(() => "accepted", (error: unknown) => (/23514|check constraint/i.test(JSON.stringify(error, Object.getOwnPropertyNames(error))) ? "23514" : String(error)));
    expect(await state(`UPDATE "partner"."reserve_line" SET sold_pcs = 3 WHERE id = '${rs.lineIds[0]}'`)).toBe("23514");
    expect(await state(`UPDATE "partner"."reserve_line" SET sold_weight_ct = 1.001 WHERE id = '${rs.lineIds[0]}'`)).toBe("23514");
    expect(await state(`UPDATE "partner"."reserve_line" SET memo_stock_id = NULL, sold_pcs = 1 WHERE id = '${rs.lineIds[0]}'`)).toBe("23514");
    const indexes = await prisma.$queryRawUnsafe<{ indexname: string }[]>(`SELECT indexname FROM pg_indexes WHERE schemaname = 'partner' AND indexname IN ('reserve_line_open_idx', 'reserve_open_customer_idx', 'sale_consumption_line_reserve_line_key', 'sale_consumption_line_memo_stock_idx') ORDER BY indexname`);
    // ADR-0055 D7: the (sale, reserve line) unique key is dropped (a lot Reserve line consumes several items).
    expect(indexes.map((row) => row.indexname)).toEqual(["reserve_line_open_idx", "reserve_open_customer_idx", "sale_consumption_line_memo_stock_idx"]);
    const client = new Client({ connectionString: testUrl });
    await client.connect();
    try {
      await client.query("BEGIN");
      // A later migration (sale_consumption_own, ADR-0058) depends on sale_consumption; its own rollback goes first (empty here).
      await client.query(readFileSync(resolve(__dirname, "../../prisma/rollback/20261124090000_sale_consumption_own.down.sql"), "utf8"));
      await client.query(readFileSync(resolve(__dirname, "../../prisma/rollback/20261118090000_sale_consumption.down.sql"), "utf8"));
      const gone = await client.query(`SELECT to_regclass('partner.sale_consumption') AS t, (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'partner' AND table_name = 'reserve_line' AND column_name = 'sold_pcs')::int AS c`);
      expect(gone.rows[0]).toEqual({ t: null, c: 0 });
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });

  it("IT-SL-M02/M03/M04/M14 RESERVE + STOCK apply: Reserve line sold, Memo Stock reserved → sold and pending → sold; Reserve stays APPROVED; partial leaves the rest open; Purchase SOLD group; reserve.get soldPcs", async () => {
    const [a, b] = await approvedStock([receiveLine({ pcs: 10, weightCt: "5" }), receiveLine({ pcs: 6, weightCt: "3", lot: `SLB-${ACTOR.slice(-4)}` })]);
    const rs = await approvedReserve([stockLine(a.id, 10, "5")]);
    const saleId = newSale();
    const ok = await put(saleId, 1, [rLine(rs.lineIds[0], a.id, 3, "1.5"), sLine(b.id, 2, "1")]);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ revision: 1, replayed: false });
    expect((ok.body.lines as unknown[])).toHaveLength(2);
    expect(await soldOf(rs.lineIds[0])).toEqual([3, "1.500"]);
    expect(await buckets(a.id)).toMatchObject({ pending: 0, reserved: 7, sold: 3 });
    expect(await buckets(b.id)).toMatchObject({ pending: 4, reserved: 0, sold: 2 });
    expect((await prisma.reserve.findUniqueOrThrow({ where: { id: rs.id } })).status).toBe("APPROVED");
    // Purchase's Sold lots (ADR-0055 D3): one row per lot with the sold-open quantity.
    const { LotStockService } = await import("../../src/trade-document/lot-stock.service");
    const sold = await new LotStockService().purchaseMemoStockLots({ vendorId: vendor.id, currency: "THB", group: "SOLD", limit: 50 } as never) as unknown as { items: { lotKey: string; pendingPcs: number }[] };
    const [itemA, itemB] = await prisma.memoStock.findMany({ where: { id: { in: [a.id, b.id] } }, orderBy: { stockId: "asc" } });
    expect(sold.items.filter((row) => [itemA.lotKey, itemB.lotKey].includes(row.lotKey)).map((row) => [row.lotKey, row.pendingPcs]).sort())
      .toEqual([[itemA.lotKey, itemA.id === a.id ? 3 : 2], [itemB.lotKey, itemB.id === a.id ? 3 : 2]].sort());
    const picker = await call("POST", "/sale/reserve-lines/search", { customerId: customer.id, currency: "THB", q: rs.docNo });
    expect((picker.body.items as { reserveId: string }[]).filter((row) => row.reserveId === rs.id)).toEqual([expect.objectContaining({ reserveLineId: rs.lineIds[0], openPcs: 7, openWeightCt: "3.500", reserveNo: rs.docNo, memoStockId: a.id, netUnitPrice: "2500.0000", priceUnit: "PER_CT", openAmount: "8750.00" })]);
    const detail = await reserve.get(rs.id);
    expect(detail.lines[0]).toMatchObject({ soldPcs: 3, soldWeightCt: "1.500" });
  });

  it("IT-SL-M05 idempotency: same revision + payload replays (no double move); changed payload or lower revision → STALE; GET returns the applied revision", async () => {
    const [a] = await approvedStock([receiveLine({ pcs: 4, weightCt: "2" })]);
    const saleId = newSale();
    const lines = [sLine(a.id, 1, "0.5")];
    expect((await put(saleId, 1, lines)).body.replayed).toBe(false);
    const replay = await measured(() => put(saleId, 1, lines));
    expect(replay.result.body).toMatchObject({ revision: 1, replayed: true });
    expect(replay.count).toBe(1);
    expect(await buckets(a.id)).toMatchObject({ pending: 3, sold: 1 });
    expect((await put(saleId, 1, [sLine(a.id, 2, "0.5", (lines[0] as { lineId: string }).lineId)])).body.error?.code).toBe("SALE_CONSUMPTION_STALE");
    expect((await put(saleId, 2, [sLine(a.id, 2, "1", (lines[0] as { lineId: string }).lineId)])).status).toBe(200);
    expect((await put(saleId, 1, lines)).body.error?.code).toBe("SALE_CONSUMPTION_STALE");
    expect(await buckets(a.id)).toMatchObject({ pending: 2, sold: 2 });
    expect((await call("GET", `/sale-consumptions/${saleId}`)).body).toMatchObject({ revision: 2, lines: [expect.objectContaining({ capPcs: 4 })] });
    expect((await call("GET", `/sale-consumptions/${randomUUID()}`)).status).toBe(404);
  });

  it("IT-SL-M06 concurrency: two Sales of one Reserve line in parallel → one 200, one EXCEEDS_AVAILABLE; totals correct; a parallel Memo Out approve on the same item does not deadlock", async () => {
    const [a] = await approvedStock([receiveLine({ pcs: 4, weightCt: "2" })]);
    const rs = await approvedReserve([stockLine(a.id, 2, "1")]);
    const out = await memoOut.create(ACTOR, docInput([stockLine(a.id, 2, "1")]));
    const sent = await memoOut.submit({ id: ACTOR, name: "IT" }, out.id, out.version);
    const [s1, s2] = [newSale(), newSale()];
    const results = await Promise.all([put(s1, 1, [rLine(rs.lineIds[0], a.id, 2, "1")]), put(s2, 1, [rLine(rs.lineIds[0], a.id, 2, "1")]), domainCode(memoOut.approve(ACTOR, out.id, sent.version))]);
    const statuses = results.slice(0, 2).map((r) => (r as { status: number }).status).sort();
    expect(statuses).toEqual([200, 409]);
    const refused = results.slice(0, 2).find((r) => (r as { status: number }).status === 409) as { body: Json };
    expect(refused.body.error).toMatchObject({ code: "SALE_CONSUMPTION_EXCEEDS_AVAILABLE", details: { lines: expect.arrayContaining([expect.objectContaining({ field: "pcs", code: "exceeds_open", availablePcs: 0 })]) } });
    expect(results[2]).toEqual({ code: "ok" });
    expect(await soldOf(rs.lineIds[0])).toEqual([2, "1.000"]);
    expect(await buckets(a.id)).toMatchObject({ pending: 0, reserved: 2, sold: 2 });
  });

  it("IT-SL-M07 Memo Out hold safety: reserved 2 (Memo Out) + Reserve line open 1; a Sale asking 2 on the Reserve line is refused; the Memo Out quantity is untouched", async () => {
    const [a] = await approvedStock([receiveLine({ pcs: 3, weightCt: "0" })]);
    const out = await memoOut.create(ACTOR, docInput([stockLine(a.id, 2, "0")]));
    await sendAndApprove(memoOut, ACTOR, out.id, out.version);
    const rs = await approvedReserve([stockLine(a.id, 1, "0")]);
    const before = await buckets(a.id);
    expect(before).toMatchObject({ pending: 0, reserved: 3 });
    const refused = await put(newSale(), 1, [rLine(rs.lineIds[0], a.id, 2, "0")]);
    expect(refused.body.error).toMatchObject({ code: "SALE_CONSUMPTION_EXCEEDS_AVAILABLE", details: { lines: [expect.objectContaining({ code: "exceeds_open", availablePcs: 1 })] } });
    expect(await buckets(a.id)).toEqual(before);
  });

  it("IT-SL-M08 unavailable: Reserve not approved / deleted / other customer / other currency / unknown Memo Stock → LINE_UNAVAILABLE, nothing changed", async () => {
    const [a] = await approvedStock([receiveLine({ pcs: 4, weightCt: "2" })]);
    await setApproval(prisma, "reserve", true);
    const draft = await reserve.create(ACTOR, docInput([stockLine(a.id, 1, "0.5")]));
    const draftLine = (await prisma.reserveLine.findFirstOrThrow({ where: { reserveId: draft.id } })).id;
    const rs = await approvedReserve([stockLine(a.id, 1, "0.5")], { auto: true });
    const before = await buckets(a.id);
    const unavailable = async (lines: unknown[], patch: Record<string, unknown> = {}) => (await put(newSale(), 1, lines, patch)).body.error;
    expect(await unavailable([rLine(draftLine, a.id, 1, "0.5")])).toMatchObject({ code: "SALE_CONSUMPTION_LINE_UNAVAILABLE", details: { lineIds: [expect.any(String)] } });
    expect((await unavailable([rLine(rs.lineIds[0], a.id, 1, "0.5")], { customerId: other.id }))?.code).toBe("SALE_CONSUMPTION_LINE_UNAVAILABLE");
    expect((await unavailable([rLine(rs.lineIds[0], a.id, 1, "0.5")], { currency: "USD" }))?.code).toBe("SALE_CONSUMPTION_LINE_UNAVAILABLE");
    expect((await unavailable([sLine(randomUUID(), 1, "0.5")]))?.code).toBe("SALE_CONSUMPTION_LINE_UNAVAILABLE");
    // reserve_deleted_check: only an auto-approved APPROVED Reserve can be soft-deleted (ADR-0050 D4).
    await prisma.reserve.update({ where: { id: rs.id }, data: { deletedAt: new Date(), deletedBy: ACTOR } });
    expect((await unavailable([rLine(rs.lineIds[0], a.id, 1, "0.5")]))?.code).toBe("SALE_CONSUMPTION_LINE_UNAVAILABLE");
    expect(await buckets(a.id)).toEqual(before);
  });

  it("IT-SL-M09 release: the empty set releases everything back (RESERVE → reserved, STOCK → pending); a release below purchased → IN_USE, nothing changed", async () => {
    const [a, b] = await approvedStock([receiveLine({ pcs: 4, weightCt: "2" }), receiveLine({ pcs: 4, weightCt: "2" })]);
    const rs = await approvedReserve([stockLine(a.id, 2, "1")]);
    const saleId = newSale();
    await put(saleId, 1, [rLine(rs.lineIds[0], a.id, 2, "1"), sLine(b.id, 2, "1")]);
    const released = await put(saleId, 2, []);
    expect(released.status).toBe(200);
    expect(await soldOf(rs.lineIds[0])).toEqual([0, "0.000"]);
    expect(await buckets(a.id)).toMatchObject({ pending: 2, reserved: 2, sold: 0 });
    expect(await buckets(b.id)).toMatchObject({ pending: 4, sold: 0 });
    await put(saleId, 3, [sLine(b.id, 2, "1")]);
    await prisma.$executeRawUnsafe(`UPDATE "partner"."memo_stock" SET purchased_pcs = 1, purchased_weight_ct = 0.5 WHERE id = '${b.id}'`);
    const used = await put(saleId, 4, []);
    expect(used.body.error).toMatchObject({ code: "SALE_CONSUMPTION_IN_USE", details: { stockIds: [b.stockId] } });
    expect(await buckets(b.id)).toMatchObject({ pending: 2, sold: 2, purchased: 1 });
    await prisma.$executeRawUnsafe(`UPDATE "partner"."memo_stock" SET purchased_pcs = 0, purchased_weight_ct = 0 WHERE id = '${b.id}'`);
    expect((await put(saleId, 4, [])).status).toBe(200);
  });

  it("IT-SL-M10 Reserve used: an auto-approved Reserve with a sold line refuses update / delete with RESERVE_IN_USE {usedBy: Sale No.}; after release it is editable", async () => {
    const [a] = await approvedStock([receiveLine({ pcs: 4, weightCt: "2" })]);
    const rs = await approvedReserve([stockLine(a.id, 2, "1")], { auto: true });
    const saleId = newSale();
    await put(saleId, 1, [rLine(rs.lineIds[0], a.id, 1, "0.5")], { saleDocNo: "SL-USED-1" });
    const version = (await prisma.reserve.findUniqueOrThrow({ where: { id: rs.id } })).version;
    await setApproval(prisma, "reserve", false);
    try {
      expect(await domainCode(reserve.update(ACTOR, rs.id, version, docInput([stockLine(a.id, 1, "0.5")])))).toEqual({ code: "RESERVE_IN_USE", details: { usedBy: "SL-USED-1" } });
      expect((await domainCode(reserve.delete(ACTOR, rs.id, version))).code).toBe("RESERVE_IN_USE");
      expect(await reserve.get(rs.id)).toMatchObject({ usedBy: { docNo: "SL-USED-1" } });
      await put(saleId, 2, [], { saleDocNo: "SL-USED-1" });
      expect((await domainCode(reserve.delete(ACTOR, rs.id, version))).code).toBe("ok");
    } finally {
      await setApproval(prisma, "reserve", true);
    }
  });

  it("IT-SL-M11 reads: picker filters (customer, currency, q, dates, exclude), oldest first, keyset, 1 query; prepare caps with own add-back, party checks, ≤ 4 queries", async () => {
    const items = await approvedStock([receiveLine({ pcs: 2, weightCt: "1" }), receiveLine({ pcs: 2, weightCt: "1" }), receiveLine({ pcs: 2, weightCt: "1" }), receiveLine({ pcs: 2, weightCt: "1" })]);
    const early = await approvedReserve([stockLine(items[0].id, 2, "1"), stockLine(items[1].id, 2, "1")], { patch: { docDate: "2026-10-01", ref: "early" } });
    const late = await approvedReserve([stockLine(items[2].id, 2, "1")], { patch: { docDate: "2026-11-05" } });
    const base = { customerId: customer.id, currency: "THB" };
    const all = await measured(() => call("POST", "/sale/reserve-lines/search", { ...base, from: "2026-09-01", to: "2026-11-06", limit: 50 }));
    const mine = (all.result.body.items as { reserveLineId: string }[]).map((row) => row.reserveLineId).filter((id) => [...early.lineIds, ...late.lineIds].includes(id));
    expect(mine).toEqual([...early.lineIds, ...late.lineIds]);
    expect(all.count).toBe(1);
    const page1 = await call("POST", "/sale/reserve-lines/search", { ...base, from: "2026-10-01", to: "2026-10-01", limit: 1 });
    expect(page1.body.items).toHaveLength(1);
    const page2 = await call("POST", "/sale/reserve-lines/search", { ...base, from: "2026-10-01", to: "2026-10-01", limit: 1, cursor: page1.body.nextCursor });
    expect([...(page1.body.items as { reserveLineId: string }[]), ...(page2.body.items as { reserveLineId: string }[])].map((row) => row.reserveLineId)).toEqual(early.lineIds);
    expect(((await call("POST", "/sale/reserve-lines/search", { ...base, q: early.docNo, exclude: [early.lineIds[0]] })).body.items as { reserveId: string }[]).filter((row) => row.reserveId === early.id)).toEqual([expect.objectContaining({ reserveLineId: early.lineIds[1] })]);
    expect((await call("POST", "/sale/reserve-lines/search", { ...base, currency: "USD", q: early.docNo })).body.items).toEqual([]);
    expect((await call("POST", "/sale/reserve-lines/search", { ...base, customerId: other.id, q: early.docNo })).body.items).toEqual([]);
    expect((await call("POST", "/sale/reserve-lines/search", { ...base, cursor: "!!" })).status).toBe(400);

    const saleId = newSale();
    expect((await put(saleId, 1, [rLine(early.lineIds[0], items[0].id, 2, "1"), sLine(items[3].id, 0, "0.5")])).status).toBe(200);
    const prepareBody = { party: { customerId: customer.id, shippingAddressId: customer.shipping, invoiceAddressId: customer.invoice }, currency: "THB", reserveLineIds: [early.lineIds[0], early.lineIds[1]], memoStockIds: [items[3].id] };
    const without = await measured(() => call("POST", "/sale/prepare", prepareBody));
    expect(without.count).toBeLessThanOrEqual(4);
    expect(without.result.body).toMatchObject({ party: { code: expect.any(String), name: `SL IT Customer A ${ACTOR}` }, partyErrors: [], currencyActive: true });
    const byId = (body: Json) => new Map((body.reserveLines as { reserveLineId: string; status: string; openPcs: number }[]).map((row) => [row.reserveLineId, row]));
    expect(byId(without.result.body).get(early.lineIds[0])).toMatchObject({ status: "CLOSED", openPcs: 0, customerId: customer.id, currency: "THB" });
    expect(byId(without.result.body).get(early.lineIds[1])).toMatchObject({ status: "OPEN", openPcs: 2 });
    expect(without.result.body.memoStocks).toEqual([expect.objectContaining({ memoStockId: items[3].id, status: "OK", pendingPcs: 2, pendingWeightCt: "0.500" })]);
    const own = await call("POST", "/sale/prepare", { ...prepareBody, saleId });
    expect(byId(own.body).get(early.lineIds[0])).toMatchObject({ status: "OPEN", openPcs: 2, openWeightCt: "1.000" });
    expect(own.body.memoStocks).toEqual([expect.objectContaining({ pendingPcs: 2, pendingWeightCt: "1.000" })]);
    const badParty = await call("POST", "/sale/prepare", { ...prepareBody, party: { ...prepareBody.party, shippingAddressId: customer.invoice } });
    expect(badParty.body.partyErrors).toEqual([{ path: "shippingAddressId", code: "invalid_reference" }]);
    const unknown = await call("POST", "/sale/prepare", { currency: "XXX", reserveLineIds: [], memoStockIds: [] });
    expect(unknown.body).toMatchObject({ party: null, currencyActive: false });
    const reference = await call("GET", `/sale/reference?includeCustomerId=${customer.id}`);
    expect(reference.body).toMatchObject({ currencies: expect.arrayContaining(["THB"]), chargeTypes: expect.arrayContaining(["SHIPPING"]), numbering: { configured: expect.any(Boolean) } });
  });

  it("IT-SL-M12/M13 service token and numbering: sale routes refuse a missing or wrong token; `sale` numbering resolves (markUsed) and an unknown key is refused", async () => {
    for (const [method, path] of [["GET", "/sale/reference"], ["POST", "/sale/prepare"], ["POST", "/sale/reserve-lines/search"], ["PUT", `/sale-consumptions/${randomUUID()}`], ["GET", `/sale-consumptions/${randomUUID()}`]] as const) {
      expect((await call(method, path, method === "GET" ? undefined : {}, "wrong-token-".repeat(4))).status).toBe(401);
      expect((await call(method, path, method === "GET" ? undefined : {}, "")).status).toBe(401);
    }
    const resolved = await call("POST", "/document-numbering/resolve", { transactionKey: "sale", docDate: "2026-11-18", markUsed: true });
    expect(resolved.status).toBe(200);
    expect(resolved.body).toHaveProperty("numbering");
    expect((await call("POST", "/document-numbering/resolve", { transactionKey: "reserve", docDate: "2026-11-18", markUsed: true })).status).toBe(400);
  });

  it("NP-SL-M consumption budget: a 1-line and a 30-line apply use the same bounded statement count (≤ 10)", async () => {
    const many = await approvedStock(Array.from({ length: 30 }, () => receiveLine({ pcs: 2, weightCt: "1" })));
    const one = await measured(() => put(newSale(), 1, [sLine(many[0].id, 1, "0.5")]));
    const thirty = await measured(() => put(newSale(), 1, many.map((item) => sLine(item.id, 1, "0.5"))));
    expect([one.result.status, thirty.result.status]).toEqual([200, 200]);
    expect(thirty.count).toBe(one.count);
    expect(thirty.count).toBeLessThanOrEqual(10);
  });
});
