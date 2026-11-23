import { randomUUID } from "node:crypto";
import { HttpException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sendAndApprove, setApproval } from "../partner-shared/approval";

/**
 * lot-based-stock SA rev 1 testing.md IT-LOT-01…14 (BE-LOT-001…006, ADR-0055) against real PostgreSQL: the generated
 * key, the lot pickers (no Stock ID, query budget), FIFO allocation at apply (Memo Out, Reserve, Memo Return,
 * Purchase), concurrent approvals, auto-approved edits, Memo Out Return settlement and its exact reversal, the bounds,
 * `latestStockUser` through the allocation tables and the Sale consumption v2 (lot line, lot Reserve line, replay).
 * Opt-in like the other DB integrations: PARTNER_TEST_DATABASE_URL on 127.0.0.1 (not 5432). Stock ID year 64.
 */
const testUrl = process.env.PARTNER_TEST_DATABASE_URL;
const canRun = Boolean(testUrl && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(testUrl));
const ACTOR = `lot-it-${randomUUID().slice(0, 8)}`;
const YEAR = 64;
const LOT = `LT-${ACTOR.slice(-4)}`;

/* eslint-disable @typescript-eslint/no-explicit-any -- services are loaded after the env stub */
let prisma: any;
let receive: any;
let memoOut: any;
let reserve: any;
let memoReturn: any;
let memoOutReturn: any;
let quotation: any;
let purchase: any;
let lots: any;
let schemas: any;
let latestStockUser: any;
let applyConsumption: any;
const vendors: { id: string; addressId: string }[] = [];
const customer = { id: randomUUID(), shipping: randomUUID(), invoice: randomUUID() };

const money = { discount: { type: "NONE" as const, value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null };
const receiveLine = (patch: Record<string, unknown> = {}) => ({
  source: "MANUAL" as const, stoneCode: "", stone: "Ruby", shape: "Oval", size: "", color: "Red", clarity: "", cutting: "", quality: "",
  lot: LOT, cerType: "", cerNo: "", pcs: 2, weightCt: "1", priceUnit: "PER_PCS" as const, unitPrice: "100",
  discount: { type: "NONE" as const, value: "0" }, itemNote: "", photoIds: [] as [], ...patch,
});
const customerHeader = (patch: Record<string, unknown> = {}) => ({
  docDate: "2026-11-20", dueDate: "2026-12-20", currency: "THB", exchangeRate: null, ref: "", documentNote: "", ...money,
  customerId: customer.id, shippingAddressId: customer.shipping, invoiceAddressId: customer.invoice, ...patch,
});
const lotLine = (lotKey: string, pcs: number, weightCt: string, patch: Record<string, unknown> = {}) => ({
  source: "MANUAL" as const, stoneCodeId: null, stoneCode: "", stone: "client", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "",
  lot: "", location: "", cerType: "", cerNo: "", pcs, weightCt, priceUnit: "PER_PCS" as const, unitPrice: "500", discount: { type: "NONE" as const, value: "0" },
  itemNote: "", photoIds: [] as string[], lotKey, ...patch,
});
const outInput = (lines: unknown[]) => schemas.createMemoOutSchema.parse({ ...customerHeader(), lines });

async function failure(promise: Promise<unknown>) {
  try { await promise; } catch (error) {
    if (error instanceof HttpException) {
      const body = error.getResponse() as { error: { code: string; fieldErrors?: unknown[]; details?: Record<string, unknown> } };
      return { status: error.getStatus(), code: body.error.code, fieldErrors: body.error.fieldErrors, details: body.error.details };
    }
    throw error;
  }
  throw new Error("expected a failure");
}

async function vendorFixture(name: string) {
  const id = randomUUID();
  const addressId = randomUUID();
  const code = `LOT${vendors.length}${ACTOR.slice(-4)}`.toUpperCase();
  await prisma.vendor.create({ data: {
    id, name, nameKey: name.toLowerCase(), code, codeKey: code.toLowerCase(), currencyCode: "THB", firstName: "It", email: "lot-it@example.test", createdBy: ACTOR, updatedBy: ACTOR,
    addresses: { create: [{ id: addressId, position: 1, name, address: "1 Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true }] },
  } });
  vendors.push({ id, addressId });
  return { id, addressId };
}

/** One approved Memo Receive per date (FIFO by receive date, then Stock ID); returns its items in Stock ID order. */
async function received(vendor: { id: string; addressId: string }, lines: ReturnType<typeof receiveLine>[], docDate = "2026-11-01") {
  const saved = await receive.create(ACTOR, { docDate, dueDate: "2026-12-30", currency: "THB", exchangeRate: null, ref: "", documentNote: "", ...money, lines, vendorId: vendor.id, addressId: vendor.addressId });
  await sendAndApprove(receive, ACTOR, saved.id, saved.version);
  return prisma.memoStock.findMany({ where: { memoReceiveId: saved.id }, orderBy: { stockId: "asc" } }) as Promise<{ id: string; stockId: string; lotKey: string }[]>;
}
const pendingOf = async (ids: string[]) => (await prisma.memoStock.findMany({ where: { id: { in: ids } }, orderBy: { stockId: "asc" } })).map((row: any) => [row.pendingPcs, row.reservedPcs, row.returnedPcs]);
const allocsOf = async (table: string, lineIds: string[]) => prisma.$queryRawUnsafe(
  `SELECT a.seq, s.stock_id, a.pcs, a.settled_pcs FROM "partner"."${table}" a JOIN "partner"."memo_stock" s ON s.id = a.memo_stock_id WHERE a.line_id = ANY($1::uuid[]) ORDER BY a.seq`, lineIds) as Promise<{ seq: number; stock_id: string; pcs: number; settled_pcs: number }[]>;

describe.runIf(canRun)("IT-LOT lot-based stock on PostgreSQL", () => {
  let vendorA: { id: string; addressId: string };
  let vendorB: { id: string; addressId: string };

  beforeAll(async () => {
    vi.stubEnv("PARTNER_DATABASE_URL", testUrl!);
    vi.stubEnv("DATABASE_URL", testUrl!);
    vi.stubEnv("INVENTORY_INTERNAL_URL", "");
    ({ prisma } = await import("../../src/database/prisma-client"));
    const { MemoReceiveService } = await import("../../src/trade-document/memo-receive.service");
    const { MemoOutService } = await import("../../src/trade-document/memo-out.service");
    const { ReserveService } = await import("../../src/trade-document/reserve.service");
    const { MemoReturnService } = await import("../../src/trade-document/memo-return.service");
    const { MemoOutReturnService } = await import("../../src/trade-document/memo-out-return.service");
    const { QuotationService } = await import("../../src/quotation/quotation.service");
    const { PurchaseService } = await import("../../src/purchase/purchase.service");
    const { LotStockService } = await import("../../src/trade-document/lot-stock.service");
    ({ latestStockUser } = await import("../../src/trade-document/memo-stock.service"));
    ({ applyConsumption } = await import("../../src/inventory-internal/sale-consumption"));
    schemas = { ...(await import("../../src/trade-document/memo-schemas")), ...(await import("../../src/quotation/quotation.schemas")), ...(await import("../../src/purchase/purchase.schemas")) };
    receive = new MemoReceiveService();
    receive.clock = () => new Date(`20${YEAR}-06-01T03:00:00Z`);
    memoOut = new MemoOutService();
    reserve = new ReserveService();
    memoReturn = new MemoReturnService();
    memoOutReturn = new MemoOutReturnService();
    quotation = new QuotationService();
    purchase = new PurchaseService();
    lots = new LotStockService();
    if (!(await prisma.currency.findUnique({ where: { code: "THB" } }))) await prisma.currency.create({ data: { code: "THB", name: "THB", createdBy: ACTOR, updatedBy: ACTOR } });
    await prisma.memoStockIdCounter.deleteMany({ where: { year: YEAR } });
    vendorA = await vendorFixture("LOT IT Vendor A");
    vendorB = await vendorFixture("LOT IT Vendor B");
    const address = { position: 1, name: "LOT IT Customer", address: "2 Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true };
    await prisma.customer.create({ data: {
      id: customer.id, name: "LOT IT Customer", nameKey: "lot it customer", code: `LOTC${ACTOR.slice(-4)}`.toUpperCase(), codeKey: `lotc${ACTOR.slice(-4)}`, currencyCode: "THB",
      firstName: "It", email: "lot-it@example.test", createdBy: ACTOR, updatedBy: ACTOR,
      addresses: { create: [{ ...address, id: customer.shipping, type: "SHIPPING" }, { ...address, id: customer.invoice, type: "INVOICE" }] },
    } });
    for (const type of ["memo-receive", "memo-out", "reserve", "memo-return", "memo-out-return", "quotation", "purchase"] as const) await setApproval(prisma, type, true);
  });

  afterAll(async () => {
    if (!prisma) return;
    const ids = vendors.map((vendor) => vendor.id);
    await prisma.$executeRawUnsafe(`DELETE FROM "partner"."sale_consumption" WHERE sale_doc_no LIKE $1`, `${ACTOR}%`);
    await prisma.memoOutReturn.deleteMany({ where: { customerId: customer.id } });
    await prisma.memoOut.deleteMany({ where: { customerId: customer.id } });
    await prisma.reserve.deleteMany({ where: { customerId: customer.id } });
    await prisma.quotation.deleteMany({ where: { customerId: customer.id } });
    await prisma.memoReturn.deleteMany({ where: { vendorId: { in: ids } } });
    await prisma.purchase.deleteMany({ where: { vendorId: { in: ids } } });
    await prisma.memoStock.deleteMany({ where: { vendorId: { in: ids } } });
    await prisma.memoReceive.deleteMany({ where: { vendorId: { in: ids } } });
    await prisma.customer.deleteMany({ where: { id: customer.id } });
    await prisma.vendor.deleteMany({ where: { id: { in: ids } } });
    await prisma.memoStockIdCounter.deleteMany({ where: { year: YEAR } });
    for (const type of ["memo-receive", "memo-out", "reserve", "memo-return", "memo-out-return", "quotation", "purchase"] as const) await setApproval(prisma, type, true);
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  it("IT-LOT-01 generated key: same lot (case / spaces) + same details → one key, also at another price (owner 2026-11-21 Q1); another colour, note or vendor → another; no lot or a cer no → MS<id>; the lot row shows the weighted average price", async () => {
    const items = await received(vendorA, [
      receiveLine({ lot: `${LOT}-K` }), receiveLine({ lot: ` ${LOT.toLowerCase()}-k ` }), receiveLine({ lot: `${LOT}-K`, color: "Pink" }),
      receiveLine({ lot: `${LOT}-K`, unitPrice: "101" }), receiveLine({ lot: `${LOT}-K`, itemNote: "chipped" }), receiveLine({ lot: "" }), receiveLine({ lot: `${LOT}-K`, cerNo: "GIA-1" }),
    ]);
    const [other] = await received(vendorB, [receiveLine({ lot: `${LOT}-K` })]);
    const keys = items.map((item) => item.lotKey);
    expect(keys[0]).toMatch(/^ML[0-9a-f]{32}$/);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[3]).toBe(keys[0]); // price is not in the key
    expect(new Set([keys[0], keys[2], keys[4], other.lotKey]).size).toBe(4);
    const [row] = (await lots.memoStockLots({ vendorId: vendorA.id, currency: "THB", q: `${LOT}-K`, limit: 50 })).items.filter((item: any) => item.lotKey === keys[0]);
    // 2 pcs at 100, 2 at 100, 2 at 101 (PER_PCS) → (200 + 200 + 202) / 6 = 100.33; amount = Σ item amounts.
    expect(row).toMatchObject({ pendingPcs: 6, unitPrice: "100.33", netUnitPrice: "100.3333", amount: "602.00" });
    expect(keys[5]).toBe(`MS${items[5].id}`);
    expect(keys[6]).toBe(`MS${items[6].id}`);
  });

  it("IT-LOT-02 / IT-LOT-15 memoStock.lots, purchase.memoStockLots, fromStock.lots: one row per lot with sums and the newest ref, no Stock ID; any matching row selects the whole lot; one statement per page", async () => {
    const [old] = await received(vendorA, [receiveLine({ lot: `${LOT}-P`, pcs: 2 })], "2026-11-02");
    const newer = await received(vendorA, [receiveLine({ lot: `${LOT}-P`, pcs: 3 }), receiveLine({ lot: `${LOT}-P`, pcs: 4, itemNote: "other note" })], "2026-11-03");
    const spy = vi.spyOn(prisma, "$queryRaw");
    const page = await lots.memoStockLots(schemas.createMemoOutSchema ? { vendorId: vendorA.id, currency: "THB", q: `${LOT}-P`, limit: 50 } : null);
    expect(spy).toHaveBeenCalledTimes(1); // N+1 budget: ONE statement for any number of lots
    spy.mockRestore();
    expect(page.items).toHaveLength(2);
    const merged = page.items.find((row: any) => row.itemNote === "");
    expect(merged).toMatchObject({
      lotKey: old.lotKey, source: "MEMO_STOCK", lot: `${LOT}-P`, merged: true, pendingPcs: 5, pendingWeightCt: "2.000", refCount: 2,
      ref: { type: "MEMO_RECEIVE", docDate: "2026-11-03" }, priceUnit: "PER_PCS", unitPrice: "100.00", amount: "500.00", currency: "THB", vendor: { id: vendorA.id },
    });
    for (const row of page.items) expect(Object.keys(row)).not.toEqual(expect.arrayContaining(["stockId", "stockIds", "stockCount"]));
    expect(JSON.stringify(page)).not.toContain(old.stockId);
    // Q-LOT-10a: the Stock ID is not searchable; the cer-free lot is found by its lot text.
    expect((await lots.memoStockLots({ vendorId: vendorA.id, currency: "THB", q: newer[0].stockId, limit: 50 })).items).toEqual([]);
    // Keyset paging is stable.
    const first = await lots.memoStockLots({ vendorId: vendorA.id, currency: "THB", q: `${LOT}-P`, limit: 1 });
    const second = await lots.memoStockLots({ vendorId: vendorA.id, currency: "THB", q: `${LOT}-P`, limit: 1, cursor: first.nextCursor });
    expect([...first.items, ...second.items].map((row: any) => row.lotKey)).toEqual(page.items.map((row: any) => row.lotKey));
    expect(second.nextCursor).toBeNull();
    // Purchase lots (In stock group) and fromStock.lots (Memo Stock section; inventory disabled → UNAVAILABLE notice).
    const pu = await lots.purchaseMemoStockLots({ vendorId: vendorA.id, currency: "THB", group: "IN_STOCK", q: `${LOT}-P`, limit: 50 });
    expect(pu.items.map((row: any) => [row.memoGroup, row.pendingPcs])).toEqual(expect.arrayContaining([["IN_STOCK", 5]]));
    const from = await lots.fromStockLots({ q: `${LOT}-P`, limit: 50 });
    expect(from.ownStock).toBe("UNAVAILABLE");
    expect(from.items.map((row: any) => row.lotKey)).toEqual(expect.arrayContaining([old.lotKey]));
    expect((await lots.fromStockLots({ q: `${LOT}-P`, location: "Memo", limit: 50 })).ownStock).toBe("OK");
  });

  it("IT-LOT-03 / IT-LOT-14 Memo Out approve of a lot (2 / 3 / 4 pcs, request 5): the two oldest are allocated; buckets per Stock ID; latestStockUser finds it", async () => {
    const items = [
      ...(await received(vendorA, [receiveLine({ lot: `${LOT}-F`, pcs: 2, weightCt: "1" })], "2026-11-04")),
      ...(await received(vendorA, [receiveLine({ lot: `${LOT}-F`, pcs: 3, weightCt: "1.5" }), receiveLine({ lot: `${LOT}-F`, pcs: 4, weightCt: "2" })], "2026-11-05")),
    ];
    const key = items[0].lotKey;
    const saved = await memoOut.create(ACTOR, outInput([lotLine(key, 5, "2.5")]));
    const draft = await memoOut.get(saved.id);
    expect(draft.lines[0]).toMatchObject({ source: "STOCK", lotKey: key, stockId: null, memoStockId: null, allocated: false, lot: `${LOT}-F`, stockPendingPcs: 9, stockPendingWeightCt: "4.500" });
    expect(await pendingOf(items.map((item) => item.id))).toEqual([[2, 0, 0], [3, 0, 0], [4, 0, 0]]); // a draft holds nothing
    await sendAndApprove(memoOut, ACTOR, saved.id, saved.version);
    expect(await pendingOf(items.map((item) => item.id))).toEqual([[0, 2, 0], [0, 3, 0], [4, 0, 0]]);
    const line = await prisma.memoOutLine.findFirstOrThrow({ where: { memoOutId: saved.id } });
    expect(await allocsOf("memo_out_line_alloc", [line.id])).toEqual([{ seq: 1, stock_id: items[0].stockId, pcs: 2, settled_pcs: 0 }, { seq: 2, stock_id: items[1].stockId, pcs: 3, settled_pcs: 0 }]);
    expect((await memoOut.get(saved.id)).lines[0]).toMatchObject({ allocated: true, stockId: null });
    expect(await latestStockUser(prisma, [items[1].id])).toBe((await prisma.memoOut.findUniqueOrThrow({ where: { id: saved.id } })).docNo);

    // IT-LOT-06: a Memo Out Return of 2 pcs settles the oldest allocation; its delete (auto-approved) reverses it exactly.
    await setApproval(prisma, "memo-out-return", false);
    const back = await memoOutReturn.create(ACTOR, schemas.createMemoOutReturnSchema.parse({ ...customerHeader(), lines: [{ ...(({ lotKey: _k, ...rest }) => rest)(lotLine(key, 2, "1")), memoOutLineId: line.id, outstandingPcs: 5, outstandingWeightCt: "2.5" }] }));
    expect(await pendingOf(items.map((item) => item.id))).toEqual([[2, 0, 0], [0, 3, 0], [4, 0, 0]]);
    expect((await allocsOf("memo_out_line_alloc", [line.id])).map((row) => row.settled_pcs)).toEqual([2, 0]);
    const outstanding = await memoOutReturn.outstanding(schemas.memoOutOutstandingSchema.parse({ customerId: customer.id, currency: "THB" }));
    expect(outstanding.items.find((row: any) => row.memoOutLineId === line.id)).toMatchObject({ lotKey: key, outstandingPcs: 3 });
    await memoOutReturn.delete(ACTOR, back.id, back.version);
    expect(await pendingOf(items.map((item) => item.id))).toEqual([[0, 2, 0], [0, 3, 0], [4, 0, 0]]);
    expect((await allocsOf("memo_out_line_alloc", [line.id])).map((row) => row.settled_pcs)).toEqual([0, 0]);
    await setApproval(prisma, "memo-out-return", true);
  });

  it("IT-LOT-04 concurrent approvals of one lot: one succeeds, the other is short with nothing changed (details per lot)", async () => {
    const items = await received(vendorA, [receiveLine({ lot: `${LOT}-C`, pcs: 3 }), receiveLine({ lot: `${LOT}-C`, pcs: 3 })], "2026-11-06");
    const key = items[0].lotKey;
    const docs = await Promise.all([memoOut.create(ACTOR, outInput([lotLine(key, 4, "0")])), reserve.create(ACTOR, outInput([lotLine(key, 4, "0")]))]);
    await memoOut.submit({ id: ACTOR, name: null }, docs[0].id, docs[0].version);
    await reserve.submit({ id: ACTOR, name: null }, docs[1].id, docs[1].version);
    const results = await Promise.allSettled([memoOut.approve(ACTOR, docs[0].id, docs[0].version + 1), reserve.approve(ACTOR, docs[1].id, docs[1].version + 1)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    const body = (rejected.reason as HttpException).getResponse() as any;
    expect(body.error.code).toMatch(/^(MEMO_OUT|RESERVE)_PENDING_SHORT$/);
    expect(body.error.details.lines).toEqual([{ index: 0, lotKey: key, availablePcs: 2, availableWeightCt: "2.000" }]);
    const after = await prisma.memoStock.findMany({ where: { id: { in: items.map((item) => item.id) } } });
    expect(after.reduce((sum: number, row: any) => sum + row.pendingPcs, 0)).toBe(2);
    expect(after.reduce((sum: number, row: any) => sum + row.reservedPcs, 0)).toBe(4);
  });

  it("IT-LOT-05 auto-approved edit (approval OFF): raise allocates more FIFO, lower gives back newest first", async () => {
    await setApproval(prisma, "reserve", false);
    const items = await received(vendorA, [receiveLine({ lot: `${LOT}-E`, pcs: 2 }), receiveLine({ lot: `${LOT}-E`, pcs: 2 }), receiveLine({ lot: `${LOT}-E`, pcs: 2 })], "2026-11-07");
    const key = items[0].lotKey;
    const saved = await reserve.create(ACTOR, outInput([lotLine(key, 3, "0")]));
    expect(await pendingOf(items.map((item) => item.id))).toEqual([[0, 2, 0], [1, 1, 0], [2, 0, 0]]);
    const raised = await reserve.update(ACTOR, saved.id, saved.version, schemas.updateReserveSchema.parse({ ...customerHeader(), lines: [lotLine(key, 5, "0")], id: saved.id, expectedVersion: saved.version }));
    expect(await pendingOf(items.map((item) => item.id))).toEqual([[0, 2, 0], [0, 2, 0], [1, 1, 0]]);
    await reserve.update(ACTOR, saved.id, raised.version, schemas.updateReserveSchema.parse({ ...customerHeader(), lines: [lotLine(key, 1, "0")], id: saved.id, expectedVersion: raised.version }));
    expect(await pendingOf(items.map((item) => item.id))).toEqual([[1, 1, 0], [2, 0, 0], [2, 0, 0]]);
    await setApproval(prisma, "reserve", true);
  });

  it("IT-LOT-07 Memo Return of a lot: the oldest borrowed are returned first; another vendor's lot → vendor_mismatch", async () => {
    const items = await received(vendorA, [receiveLine({ lot: `${LOT}-R`, pcs: 2 }), receiveLine({ lot: `${LOT}-R`, pcs: 2 })], "2026-11-08");
    const key = items[0].lotKey;
    const input = (vendor: { id: string; addressId: string }) => schemas.createMemoReturnSchema.parse({
      docDate: "2026-11-20", dueDate: "2026-12-20", currency: "THB", exchangeRate: null, ref: "", documentNote: "", ...money, vendorId: vendor.id, addressId: vendor.addressId,
      lines: [{ ...lotLine(key, 3, "0"), outstandingPcs: 4, outstandingWeightCt: "2" }],
    });
    expect(await failure(memoReturn.create(ACTOR, input(vendorB)))).toMatchObject({ status: 400, fieldErrors: [{ path: "lines.0.reference", code: "vendor_mismatch" }] });
    const saved = await memoReturn.create(ACTOR, input(vendorA));
    expect((await memoReturn.get(saved.id)).lines[0]).toMatchObject({ lotKey: key, memoStockId: null, stockId: null, unitPrice: "100.00", outstandingPcs: 4 });
    await sendAndApprove(memoReturn, ACTOR, saved.id, saved.version);
    expect(await pendingOf(items.map((item) => item.id))).toEqual([[0, 0, 2], [1, 0, 1]]);
  });

  it("IT-LOT-08 Purchase lot lines: SOLD exact, IN_STOCK from pending, MERGED sold part first; buckets equal a per-Stock-ID purchase", async () => {
    const items = await received(vendorA, [receiveLine({ lot: `${LOT}-U`, pcs: 2 }), receiveLine({ lot: `${LOT}-U`, pcs: 2 })], "2026-11-09");
    const key = items[0].lotKey;
    // A Sale sold 1 pcs of the first item (pending → sold) — written directly, balance CHECK kept.
    await prisma.$executeRawUnsafe(`UPDATE "partner"."memo_stock" SET pending_pcs = pending_pcs - 1, sold_pcs = 1 WHERE id = $1::uuid`, items[0].id);
    const line = (group: string, pcs: number) => ({ ...lotLine(key, pcs, "0", { unitPrice: "100" }), source: "STOCK", memoGroup: group });
    const pInput = (lines: unknown[]) => schemas.createPurchaseSchema.parse({ docDate: "2026-11-20", dueDate: "2026-12-20", currency: "THB", exchangeRate: null, ref: "", documentNote: "", ...money, vendorId: vendorA.id, addressId: vendorA.addressId, lines });
    expect(await failure(purchase.create(ACTOR, pInput([line("SOLD", 2)])))).toMatchObject({ status: 400, fieldErrors: [{ path: "lines.0.pcs", code: "must_equal_sold" }] });
    const saved = await purchase.create(ACTOR, pInput([line("MERGED", 3)]));
    expect((await purchase.get(saved.id)).lines[0]).toMatchObject({ source: "STOCK", lotKey: key, memoStockId: null, stockId: null, allocated: false });
    await sendAndApprove(purchase, ACTOR, saved.id, saved.version);
    const rows = await prisma.memoStock.findMany({ where: { id: { in: items.map((item) => item.id) } }, orderBy: { stockId: "asc" } });
    expect(rows.map((row: any) => [row.pendingPcs, row.soldPcs, row.purchasedPcs])).toEqual([[0, 2, 2], [1, 1, 1]]);
    const pl = await prisma.purchaseLine.findFirstOrThrow({ where: { purchaseId: saved.id } });
    expect([pl.soldPartPcs]).toEqual([1]);
    const allocs = await prisma.$queryRawUnsafe(`SELECT part, pcs FROM "partner"."purchase_line_alloc" WHERE line_id = $1::uuid ORDER BY seq`, pl.id);
    expect(allocs).toEqual([{ part: "SOLD", pcs: 1 }, { part: "IN_STOCK", pcs: 1 }, { part: "IN_STOCK", pcs: 1 }]);
  });

  it("IT-LOT-09 Quotation lot line copies the snapshot and holds nothing; an empty lot → STOCK_LOT_UNAVAILABLE", async () => {
    const items = await received(vendorA, [receiveLine({ lot: `${LOT}-Q`, pcs: 2 }), receiveLine({ lot: `${LOT}-Q`, pcs: 1 })], "2026-11-10");
    const key = items[0].lotKey;
    const qInput = (lines: unknown[]) => schemas.createQuotationSchema.parse({ ...customerHeader(), lines });
    const saved = await quotation.create(ACTOR, qInput([{ ...lotLine(key, 3, "0"), source: "STOCK" }]));
    expect((await quotation.get(saved.id)).lines[0]).toMatchObject({ source: "STOCK", lotKey: key, stockId: null, stockPendingPcs: 3, lot: `${LOT}-Q` });
    expect(await pendingOf(items.map((item) => item.id))).toEqual([[2, 0, 0], [1, 0, 0]]);
    expect(await failure(quotation.create(ACTOR, qInput([{ ...lotLine(`ML${"0".repeat(32)}`, 1, "0"), source: "STOCK" }])))).toMatchObject({ status: 422, code: "STOCK_LOT_UNAVAILABLE", fieldErrors: [{ path: "lines.0.reference", code: "unavailable" }] });
  });

  it("IT-LOT-H2 FE-LOT-008: a new item reference is refused with lot_required; the legacy line already on the document stays editable; a lot line is accepted", async () => {
    const items = await received(vendorA, [receiveLine({ lot: `${LOT}-H1`, pcs: 3, cerNo: "C-9" }), receiveLine({ lot: `${LOT}-H2`, pcs: 3, cerNo: "C-8" })], "2026-11-14");
    const itemLine = (id: string, pcs: number) => { const { lotKey: _key, ...rest } = lotLine("x", pcs, "0"); return { ...rest, memoStockId: id }; };
    const update = (id: string, version: number, lines: unknown[]) => memoOut.update(ACTOR, id, version, schemas.updateMemoOutSchema.parse({ ...customerHeader(), lines, id, expectedVersion: version }));
    const lotRequired = (path: string) => ({ status: 400, code: "VALIDATION_ERROR", fieldErrors: [{ path, code: "lot_required" }] });
    const before = process.env.LOT_TEST_ACCEPT_ITEM_REFS;
    try {
      process.env.LOT_TEST_ACCEPT_ITEM_REFS = "1"; // a document saved before the change names an item
      const saved = await memoOut.create(ACTOR, outInput([itemLine(items[0].id, 1)]));
      process.env.LOT_TEST_ACCEPT_ITEM_REFS = "0"; // production behaviour
      expect(await failure(memoOut.create(ACTOR, outInput([itemLine(items[1].id, 1)])))).toMatchObject(lotRequired("lines.0.reference"));
      const kept = await update(saved.id, saved.version, [itemLine(items[0].id, 2)]);
      expect(await failure(update(saved.id, kept.version, [itemLine(items[0].id, 2), itemLine(items[1].id, 1)]))).toMatchObject(lotRequired("lines.1.reference"));
      const mixed = await update(saved.id, kept.version, [itemLine(items[0].id, 2), lotLine(items[1].lotKey, 1, "0")]);
      expect((await memoOut.get(saved.id)).lines.map((l: any) => [l.memoStockId === items[0].id, l.lotKey])).toEqual([[true, null], [false, items[1].lotKey]]);
      expect(mixed.version).toBe(kept.version + 1);
      // Quotation and Memo Return refuse a new item reference too.
      expect(await failure(quotation.create(ACTOR, schemas.createQuotationSchema.parse({ ...customerHeader(), lines: [{ ...itemLine(items[1].id, 1), source: "STOCK" }] })))).toMatchObject(lotRequired("lines.0.reference"));
      const returnInput = schemas.createMemoReturnSchema.parse({
        docDate: "2026-11-20", dueDate: "2026-12-20", currency: "THB", exchangeRate: null, ref: "", documentNote: "", ...money, vendorId: vendorA.id, addressId: vendorA.addressId,
        lines: [{ ...itemLine(items[1].id, 1), outstandingPcs: 3, outstandingWeightCt: "1" }],
      });
      expect(await failure(memoReturn.create(ACTOR, returnInput))).toMatchObject(lotRequired("lines.0.reference"));
    } finally {
      if (before === undefined) delete process.env.LOT_TEST_ACCEPT_ITEM_REFS; else process.env.LOT_TEST_ACCEPT_ITEM_REFS = before;
    }
  });

  it("IT-LOT-10 a lot of 501 open rows → 422 STOCK_LOT_TOO_LARGE at approve, nothing changed", async () => {
    const all: { id: string; lotKey: string }[] = [];
    for (const size of [200, 200, 101]) all.push(...(await received(vendorB, Array.from({ length: size }, () => receiveLine({ lot: `${LOT}-BIG`, pcs: 1, weightCt: "0" })), "2026-11-11")));
    const key = all[0].lotKey;
    expect(new Set(all.map((item) => item.lotKey)).size).toBe(1);
    const saved = await memoOut.create(ACTOR, outInput([lotLine(key, 2, "0")]));
    await memoOut.submit({ id: ACTOR, name: null }, saved.id, saved.version);
    expect(await failure(memoOut.approve(ACTOR, saved.id, saved.version + 1))).toMatchObject({ status: 422, code: "STOCK_LOT_TOO_LARGE", details: { lotKey: key, limit: 500 } });
    expect(await prisma.memoStock.count({ where: { lotKey: key, reservedPcs: { gt: 0 } } })).toBe(0);
  }, 120_000);

  it("IT-LOT-I04 (master side) Sale consumption v2: a lot line is allocated FIFO and stored; the same revision replays the same allocation; a lot Reserve line settles oldest first", async () => {
    const items = await received(vendorA, [receiveLine({ lot: `${LOT}-S`, pcs: 2 }), receiveLine({ lot: `${LOT}-S`, pcs: 3 })], "2026-11-12");
    const key = items[0].lotKey;
    const saleId = randomUUID();
    const lineId = randomUUID();
    const request = { revision: 1, saleDocNo: `${ACTOR}-S1`, customerId: customer.id, currency: "THB", lines: [{ lineId, source: "STOCK" as const, lotKey: key, pcs: 3, weightCt: "0" }] };
    const result = await prisma.$transaction((tx: any) => applyConsumption(tx, saleId, request, ACTOR));
    expect(result.allocations).toEqual([{ lineId, rows: [
      expect.objectContaining({ seq: 1, stockUuid: items[0].id, stockId: items[0].stockId, pcs: 2 }), expect.objectContaining({ seq: 2, stockUuid: items[1].id, pcs: 1 }),
    ] }]);
    expect(result.lines).toEqual([{ lineId, capPcs: 5, capWeightCt: "2.000" }]);
    const replay = await prisma.$transaction((tx: any) => applyConsumption(tx, saleId, request, ACTOR));
    expect(replay).toMatchObject({ replayed: true, allocations: result.allocations });
    expect(await prisma.memoStock.findMany({ where: { id: { in: items.map((item) => item.id) } }, orderBy: { stockId: "asc" }, select: { pendingPcs: true, soldPcs: true } })).toEqual([{ pendingPcs: 0, soldPcs: 2 }, { pendingPcs: 2, soldPcs: 1 }]);
    // Short → 409 SALE_CONSUMPTION_EXCEEDS_AVAILABLE with the lot's available; nothing changes.
    const short = await prisma.$transaction((tx: any) => applyConsumption(tx, saleId, { ...request, revision: 2, lines: [{ ...request.lines[0], pcs: 9 }] }, ACTOR)).catch((error: HttpException) => error);
    expect((short as HttpException).getStatus()).toBe(409);
    // A lot Reserve line: approved Reserve allocation 2 + 2, the Sale takes 3 → the oldest row settled first.
    const more = await received(vendorA, [receiveLine({ lot: `${LOT}-SR`, pcs: 2 }), receiveLine({ lot: `${LOT}-SR`, pcs: 2 })], "2026-11-13");
    const rs = await reserve.create(ACTOR, outInput([lotLine(more[0].lotKey, 4, "0")]));
    await sendAndApprove(reserve, ACTOR, rs.id, rs.version);
    const rl = await prisma.reserveLine.findFirstOrThrow({ where: { reserveId: rs.id } });
    const sale2 = randomUUID();
    const reserveLineId = randomUUID();
    await prisma.$transaction((tx: any) => applyConsumption(tx, sale2, { revision: 1, saleDocNo: `${ACTOR}-S2`, customerId: customer.id, currency: "THB", lines: [{ lineId: reserveLineId, source: "RESERVE", reserveLineId: rl.id, pcs: 3, weightCt: "0" }] }, ACTOR));
    expect((await allocsOf("reserve_line_alloc", [rl.id])).map((row) => row.settled_pcs)).toEqual([2, 1]);
    expect((await prisma.reserveLine.findUniqueOrThrow({ where: { id: rl.id } })).soldPcs).toBe(3);
  });
});
