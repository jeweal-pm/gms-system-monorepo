import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import { HttpException } from "@nestjs/common";
import type { Request, Response } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * IT-MR-01…08 (memo-receive SA rev 1 / ADR-0034, owner 2026-10-29) against real PostgreSQL: Document Setup numbers,
 * the Stock ID counter (row lock, year of the save, 9,999 limit), kept line ids, status guards, approval into Memo
 * Stock, the Add Memo Stock list, discount bounds through the tRPC router, Document Setup `used` and the Memo Out
 * Return DRAFT regression. IT-MR-09 (SA revision 2): line photo upload / read / grants on the real `@gms/storage`
 * local driver (a temporary `GMS_STORAGE_ROOT`) and `stored_files`, foreign photo ids and the saved photo order.
 *
 * Opt-in like the other DB integrations (INV-20261021-007): runs only with `PARTNER_TEST_DATABASE_URL` pointing at
 * a disposable `f1_system` database on 127.0.0.1 with an explicit port other than 5432, migrated with
 * `prisma migrate deploy`. The URL is pinned into `PARTNER_DATABASE_URL` before Prisma is imported. Rows are scoped
 * to vendors created here and Stock ID years 50–59 (clock faked to 2050–2059); all are removed in `afterAll`.
 */

const testUrl = process.env.PARTNER_TEST_DATABASE_URL;
const canRun = Boolean(testUrl && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(testUrl));
const ACTOR = `mr-it-${randomUUID().slice(0, 8)}`;
const YEARS = Array.from({ length: 10 }, (_, index) => 50 + index);

type Prisma = typeof import("../../src/database/prisma-client").prisma;
type Receive = InstanceType<typeof import("../../src/trade-document/memo-receive.service").MemoReceiveService>;
type Stock = InstanceType<typeof import("../../src/trade-document/memo-stock.service").MemoStockService>;
type Router = ReturnType<typeof import("../../src/master/router").createMasterRouter>;

let prisma: Prisma;
let receive: Receive;
let stock: Stock;
let router: Router;
let calculateTotals: typeof import("../../src/quotation/quotation.calculate").calculateTotals;
let setupService: InstanceType<typeof import("../../src/document-setup/document-setup.service").DocumentSetupService>;
let memoOut: InstanceType<typeof import("../../src/trade-document/memo-out.service").MemoOutService>;
let photos: typeof import("../../src/trade-document/memo-receive-photo.public.controller");
let storageDir = "";
const customers: string[] = [];
const vendors: { id: string; addressId: string }[] = [];
const created = { currency: false, setup: false };

const line = (patch: Record<string, unknown> = {}) => ({
  source: "MANUAL" as const, stoneCode: "", stone: "Ruby", shape: "Oval", size: "", color: "Red", clarity: "", cutting: "", quality: "",
  lot: "LOT-A", cerType: "GIA", cerNo: "C-1", pcs: 2, weightCt: "1.5", priceUnit: "PER_CT" as "PER_CT" | "PER_PCS", unitPrice: "1000",
  discount: { type: "NONE" as "NONE" | "PERCENT" | "AMOUNT", value: "0" }, itemNote: "", photoIds: [] as [],
  ...patch,
});
type Line = ReturnType<typeof line> & { id?: string };
const input = (vendor: { id: string; addressId: string }, lines: Line[], patch: Record<string, unknown> = {}) => ({
  docDate: "2026-10-29", dueDate: "2026-11-29", currency: "THB", exchangeRate: null, ref: "", documentNote: "", lines,
  discount: { type: "NONE" as const, value: "0" }, tax: { enabled: true, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null,
  vendorId: vendor.id, addressId: vendor.addressId, ...patch,
});
const clockAt = (year: number) => () => new Date(`${year}-06-01T03:00:00Z`);

async function failure(promise: Promise<unknown>) {
  try { await promise; } catch (error) {
    if (error instanceof HttpException) {
      const body = error.getResponse() as { error: { code: string; fieldErrors?: { path: string; code: string }[] } };
      return { status: error.getStatus(), code: body.error.code, fieldErrors: body.error.fieldErrors };
    }
    throw error;
  }
  throw new Error("expected a failure");
}

async function vendorFixture(name: string) {
  const id = randomUUID();
  const addressId = randomUUID();
  await prisma.vendor.create({ data: {
    id, name, nameKey: name.toLowerCase(), code: `MRIT${vendors.length}${ACTOR.slice(-4)}`.toUpperCase(), codeKey: `MRIT${vendors.length}${ACTOR.slice(-4)}`.toLowerCase(),
    currencyCode: "THB", firstName: "It", email: "mr-it@example.test", createdBy: ACTOR, updatedBy: ACTOR,
    addresses: { create: [{ id: addressId, position: 1, name: `${name} Co.`, address: "1 Test Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true }] },
  } });
  const vendor = { id, addressId };
  vendors.push(vendor);
  return vendor;
}

describe.runIf(canRun)("IT-MR memo receive + memo stock on PostgreSQL", () => {
  let vendorA: { id: string; addressId: string };
  let vendorB: { id: string; addressId: string };

  beforeAll(async () => {
    vi.stubEnv("PARTNER_DATABASE_URL", testUrl!);
    vi.stubEnv("DATABASE_URL", testUrl!);
    storageDir = await mkdtemp(path.join(tmpdir(), "mr-it-photos-"));
    vi.stubEnv("GMS_STORAGE_ROOT", storageDir);
    photos = await import("../../src/trade-document/memo-receive-photo.public.controller");
    ({ prisma } = await import("../../src/database/prisma-client"));
    const { MemoReceiveService } = await import("../../src/trade-document/memo-receive.service");
    const { MemoStockService } = await import("../../src/trade-document/memo-stock.service");
    const { MemoOutService } = await import("../../src/trade-document/memo-out.service");
    const { DocumentSetupService } = await import("../../src/document-setup/document-setup.service");
    const { createMasterRouter } = await import("../../src/master/router");
    ({ calculateTotals } = await import("../../src/quotation/quotation.calculate"));
    receive = new MemoReceiveService();
    stock = new MemoStockService();
    memoOut = new MemoOutService();
    setupService = new DocumentSetupService();
    const unused = {} as never;
    router = createMasterRouter({
      customer: unused, vendor: unused, companyProfile: unused, stoneMaster: unused, documentSetup: unused, currency: unused, quotation: unused,
      memoOut: unused, memoOutReturn: unused, memoReceive: receive, memoStock: stock,
    });

    if (!(await prisma.currency.findUnique({ where: { code: "THB" } }))) {
      await prisma.currency.create({ data: { code: "THB", name: "Thai Baht", createdBy: ACTOR, updatedBy: ACTOR } });
      created.currency = true;
    }
    if (!(await prisma.documentSetup.findUnique({ where: { transactionKey: "memo-receive" } }))) {
      await prisma.documentSetup.create({ data: {
        transactionKey: "memo-receive", name: "Memo Receive", code: "MR", startFrom: 1, updatedBy: ACTOR,
        rows: { create: [{ id: randomUUID(), effectiveDate: new Date("2026-01-01T00:00:00Z"), prefix: "MR", separator: "-", startNo: 1 }] },
      } });
      created.setup = true;
    }
    await prisma.memoStockIdCounter.deleteMany({ where: { year: { in: YEARS } } });
    vendorA = await vendorFixture("MR IT Vendor A");
    vendorB = await vendorFixture("MR IT Vendor B");
  });

  beforeEach(() => {
    receive.clock = clockAt(2050);
  });

  afterAll(async () => {
    if (!prisma) return;
    const ids = vendors.map((vendor) => vendor.id);
    await prisma.memoStock.deleteMany({ where: { vendorId: { in: ids } } });
    await prisma.memoReceive.deleteMany({ where: { vendorId: { in: ids } } });
    await prisma.memoOut.deleteMany({ where: { customerId: { in: customers } } });
    await prisma.customer.deleteMany({ where: { id: { in: customers } } });
    await prisma.vendor.deleteMany({ where: { id: { in: ids } } });
    // Disposable test database only: photo rows this run created (product code never deletes uploads, ADR-0030).
    await prisma.storedFile.deleteMany({ where: { createdBy: ACTOR } });
    await prisma.memoStockIdCounter.deleteMany({ where: { year: { in: YEARS } } });
    if (created.setup) await prisma.documentSetup.deleteMany({ where: { transactionKey: "memo-receive" } });
    if (created.currency) await prisma.currency.deleteMany({ where: { code: "THB" } });
    await prisma.$disconnect();
    if (storageDir) await rm(storageDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("IT-MR-01 create → PENDING_APPROVAL, Document Setup / plain number, Stock IDs YY0001… in line order, server totals", async () => {
    const lines = [line(), line({ priceUnit: "PER_PCS", pcs: 3, unitPrice: "250", discount: { type: "PERCENT", value: "10" } })];
    const result = await receive.create(ACTOR, input(vendorA, lines));
    expect(result).toMatchObject({ docNo: expect.stringMatching(/^MR-\d+$/), version: 1, stockIds: ["500001", "500002"] });
    const detail = await receive.get(result.id);
    expect(detail).toMatchObject({ status: "PENDING_APPROVAL", approvedAt: null, approvedBy: null, vendorId: vendorA.id, vendor: { name: "MR IT Vendor A" } });
    expect(detail.lines.map((entry) => entry.stockId)).toEqual(["500001", "500002"]);
    expect(detail.lines[0]).not.toHaveProperty("location");
    expect(detail.lines[0]).not.toHaveProperty("stoneCodeId");
    const totals = calculateTotals(input(vendorA, lines) as unknown as Parameters<typeof calculateTotals>[0]);
    expect(detail.totals).toEqual({
      subtotal: totals.subtotal.toFixed(2), discountAmount: totals.discountAmount.toFixed(2), priceBeforeTax: totals.priceBeforeTax.toFixed(2),
      taxAmount: totals.taxAmount.toFixed(2), chargesAmount: totals.chargesAmount.toFixed(2), laborAmount: totals.laborAmount.toFixed(2), grandTotal: totals.grandTotal.toFixed(2),
    });
    expect(detail.lines[1]).toMatchObject({ discountAmount: "75.00", amount: "675.00" });
    // No Document Setup row in effect on the Doc Date → plain running number.
    const plain = await receive.create(ACTOR, input(vendorA, [line()], { docDate: "2025-06-01", dueDate: "2025-06-30" }));
    expect(plain.docNo).toMatch(/^\d+$/);
    expect(plain.stockIds).toEqual(["500003"]);
    expect((await receive.nextNumber("2026-10-29")).docNo).toMatch(/^MR-\d+$/);
    const listed = await receive.list({ partyId: vendorA.id, status: "PENDING_APPROVAL", limit: 50 });
    expect(listed.items.map((item) => item.id)).toEqual(expect.arrayContaining([result.id, plain.id]));
    expect(listed.items[0]).toMatchObject({ status: "PENDING_APPROVAL", vendorName: "MR IT Vendor A" });
    expect((await receive.list({ partyId: vendorA.id, status: "APPROVED", limit: 50 })).items.map((item) => item.id)).not.toContain(result.id);
  });

  it("IT-MR-02 Stock ID year = year of the save (not the Doc Date); parallel saves never duplicate; 9,999 per year then EXHAUSTED", async () => {
    receive.clock = clockAt(2051);
    expect((await receive.create(ACTOR, input(vendorA, [line()], { docDate: "2026-12-31", dueDate: "2026-12-31" }))).stockIds).toEqual(["510001"]);
    receive.clock = clockAt(2052);
    expect((await receive.create(ACTOR, input(vendorA, [line()], { docDate: "2026-01-02" }))).stockIds).toEqual(["520001"]);

    receive.clock = clockAt(2053);
    const parallel = await Promise.all([receive.create(ACTOR, input(vendorA, [line(), line()])), receive.create(ACTOR, input(vendorA, [line(), line()]))]);
    expect(parallel.flatMap((entry) => entry.stockIds).sort()).toEqual(["530001", "530002", "530003", "530004"]);
    expect(new Set(parallel.map((entry) => entry.docNo)).size).toBe(2);

    receive.clock = clockAt(2054);
    await prisma.memoStockIdCounter.create({ data: { year: 54, lastNo: 9_998 } });
    const before = await prisma.memoReceive.count({ where: { vendorId: vendorA.id } });
    expect(await failure(receive.create(ACTOR, input(vendorA, [line(), line()])))).toMatchObject({ status: 409, code: "MEMO_RECEIVE_STOCK_ID_EXHAUSTED" });
    expect(await prisma.memoReceive.count({ where: { vendorId: vendorA.id } })).toBe(before);
    expect((await prisma.memoStockIdCounter.findUnique({ where: { year: 54 } }))?.lastNo).toBe(9_998);
    expect((await receive.create(ACTOR, input(vendorA, [line()]))).stockIds).toEqual(["549999"]);
    expect(await failure(receive.create(ACTOR, input(vendorA, [line()])))).toMatchObject({ status: 409, code: "MEMO_RECEIVE_STOCK_ID_EXHAUSTED" });
    expect(await prisma.memoReceive.count({ where: { vendorId: vendorA.id } })).toBe(before + 1);
  });

  it("IT-MR-03 update keeps Stock IDs of lines sent with id, numbers new lines, never reuses removed numbers; a foreign id is unknown_line", async () => {
    receive.clock = clockAt(2055);
    const doc = await receive.create(ACTOR, input(vendorA, [line({ lot: "L1" }), line({ lot: "L2" }), line({ lot: "L3" })]));
    expect(doc.stockIds).toEqual(["550001", "550002", "550003"]);
    const saved = (await receive.get(doc.id)).lines;
    const updated = await receive.update(ACTOR, doc.id, 1, input(vendorA, [
      { ...line({ lot: "L1b" }), id: saved[0].id }, line({ lot: "NEW" }), { ...line({ lot: "L3" }), id: saved[2].id },
    ]));
    expect(updated).toEqual({ id: doc.id, version: 2, stockIds: ["550001", "550004", "550003"] });
    const after = (await receive.get(doc.id)).lines;
    expect(after.map((entry) => [entry.id, entry.stockId, entry.lot])).toEqual([[saved[0].id, "550001", "L1b"], [after[1].id, "550004", "NEW"], [saved[2].id, "550003", "L3"]]);
    expect(after[1].id).not.toBe(saved[1].id);
    // The removed line's number 550002 is not reused.
    expect((await receive.create(ACTOR, input(vendorA, [line()]))).stockIds).toEqual(["550005"]);

    const other = await receive.create(ACTOR, input(vendorA, [line()]));
    const foreign = (await receive.get(other.id)).lines[0].id;
    expect(await failure(receive.update(ACTOR, doc.id, 2, input(vendorA, [{ ...line(), id: saved[0].id }, { ...line(), id: foreign }]))))
      .toMatchObject({ status: 400, code: "VALIDATION_ERROR", fieldErrors: [{ path: "lines.1.id", code: "unknown_line" }] });
    expect((await receive.get(doc.id)).version).toBe(2);
    expect((await prisma.memoStockIdCounter.findUnique({ where: { year: 55 } }))?.lastNo).toBe(6);
  });

  it("IT-MR-04 stale version → CHANGED; update / delete of an APPROVED document → STATUS_INVALID; pending delete works", async () => {
    const doc = await receive.create(ACTOR, input(vendorA, [line()]));
    expect(await failure(receive.update(ACTOR, doc.id, 7, input(vendorA, [line()])))).toMatchObject({ status: 409, code: "MEMO_RECEIVE_CHANGED" });
    expect(await failure(receive.delete(ACTOR, doc.id, 7))).toMatchObject({ status: 409, code: "MEMO_RECEIVE_CHANGED" });
    await receive.approve(ACTOR, doc.id, 1);
    expect(await failure(receive.update(ACTOR, doc.id, 2, input(vendorA, [line()])))).toMatchObject({ status: 409, code: "MEMO_RECEIVE_STATUS_INVALID" });
    expect(await failure(receive.update(ACTOR, doc.id, 1, input(vendorA, [line()])))).toMatchObject({ status: 409, code: "MEMO_RECEIVE_STATUS_INVALID" });
    expect(await failure(receive.delete(ACTOR, doc.id, 2))).toMatchObject({ status: 409, code: "MEMO_RECEIVE_STATUS_INVALID" });
    expect((await receive.get(doc.id)).status).toBe("APPROVED");

    const pending = await receive.create(ACTOR, input(vendorA, [line()]));
    await expect(receive.delete(ACTOR, pending.id, 1)).resolves.toEqual({ ok: true });
    expect(await failure(receive.get(pending.id))).toMatchObject({ status: 404, code: "MEMO_RECEIVE_NOT_FOUND" });
    expect(await failure(receive.approve(ACTOR, pending.id, 1))).toMatchObject({ status: 404, code: "MEMO_RECEIVE_NOT_FOUND" });
  });

  it("IT-MR-05 approve → APPROVED + approved_at/by + version+1 + one Memo Stock row per line; repeat → STATUS_INVALID; parallel → one wins", async () => {
    const lines = [line({ discount: { type: "AMOUNT", value: "100" } }), line({ priceUnit: "PER_PCS", pcs: 4, weightCt: "2.2", unitPrice: "300" })];
    const doc = await receive.create(ACTOR, input(vendorA, lines));
    expect(await failure(receive.approve(ACTOR, doc.id, 9))).toMatchObject({ status: 409, code: "MEMO_RECEIVE_CHANGED" });
    await expect(receive.approve("approver-1", doc.id, 1)).resolves.toEqual({ id: doc.id, version: 2, status: "APPROVED", memoStockCount: 2 });
    const detail = await receive.get(doc.id);
    expect(detail).toMatchObject({ status: "APPROVED", version: 2, approvedBy: "approver-1", approvedAt: expect.any(String) });
    const rows = await prisma.memoStock.findMany({ where: { memoReceiveId: doc.id }, orderBy: { stockId: "asc" } });
    expect(rows.map((row) => row.stockId)).toEqual(doc.stockIds);
    expect(rows.map((row) => row.memoReceiveLineId)).toEqual(detail.lines.map((entry) => entry.id));
    for (const row of rows) {
      expect(row).toMatchObject({ location: "Memo", vendorId: vendorA.id, receivedDocNo: doc.docNo, currencyCode: "THB", createdBy: "approver-1", version: 1 });
      expect(row.pendingPcs).toBe(row.receivedPcs);
      expect(row.pendingWeightCt.toFixed(3)).toBe(row.receivedWeightCt.toFixed(3));
    }
    expect(rows[0]).toMatchObject({ receivedPcs: 2, priceUnit: "PER_CT" });
    expect([rows[0].unitPrice.toFixed(2), rows[0].lineAmount.toFixed(2), rows[0].netUnitPrice.toFixed(4)]).toEqual(["1000.00", "1400.00", "933.3333"]);
    expect([rows[1].lineAmount.toFixed(2), rows[1].netUnitPrice.toFixed(4)]).toEqual(["1200.00", "300.0000"]);

    expect(await failure(receive.approve(ACTOR, doc.id, 2))).toMatchObject({ status: 409, code: "MEMO_RECEIVE_STATUS_INVALID" });
    expect(await failure(receive.approve(ACTOR, doc.id, 1))).toMatchObject({ status: 409, code: "MEMO_RECEIVE_STATUS_INVALID" });
    expect(await prisma.memoStock.count({ where: { memoReceiveId: doc.id } })).toBe(2);

    const race = await receive.create(ACTOR, input(vendorA, [line(), line(), line()]));
    const outcomes = await Promise.allSettled([receive.approve(ACTOR, race.id, 1), receive.approve(ACTOR, race.id, 1)]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected") as PromiseRejectedResult;
    expect(await failure(Promise.reject(rejected.reason))).toMatchObject({ status: 409, code: "MEMO_RECEIVE_STATUS_INVALID" });
    expect(await prisma.memoStock.count({ where: { memoReceiveId: race.id } })).toBe(3);
  });

  it("IT-MR-06 memoStock.list: one vendor, pending > 0 only, q and date filters, keyset pages without gaps, net price and amount", async () => {
    receive.clock = clockAt(2056);
    const approve = async (docDate: string, lines: Line[]) => {
      const doc = await receive.create(ACTOR, input(vendorB, lines, { docDate, dueDate: "2026-12-31" }));
      await receive.approve(ACTOR, doc.id, 1);
      return doc;
    };
    const jan = await approve("2026-01-10", [line({ lot: "JAN-1" }), line({ lot: "JAN-2", discount: { type: "PERCENT", value: "10" } })]);
    const feb = await approve("2026-02-10", [line({ lot: "FEB-1", priceUnit: "PER_PCS", pcs: 3, unitPrice: "100", discount: { type: "AMOUNT", value: "1" } })]);
    const mar = await approve("2026-03-10", [line({ lot: "MAR-1" }), line({ lot: "MAR-2", cerNo: "FINDME" })]);
    await receive.create(ACTOR, input(vendorB, [line({ lot: "PENDING-DOC" })], { docDate: "2026-03-20", dueDate: "2026-12-31" }));
    // Fully returned item (Memo Return later): pending 0 → not listed. Partly returned PCS item: amount by pieces.
    await prisma.memoStock.update({ where: { stockId: mar.stockIds[0] }, data: { pendingPcs: 0, pendingWeightCt: "0" } });
    await prisma.memoStock.update({ where: { stockId: feb.stockIds[0] }, data: { pendingPcs: 1, pendingWeightCt: "0.5" } });

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: Awaited<ReturnType<Stock["list"]>> = await stock.list({ vendorId: vendorB.id, limit: 2, ...(cursor ? { cursor } : {}) });
      expect(page.items.length).toBeLessThanOrEqual(2);
      seen.push(...page.items.map((item) => item.stockId));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toEqual([mar.stockIds[1], feb.stockIds[0], jan.stockIds[1], jan.stockIds[0]]);

    const all = (await stock.list({ vendorId: vendorB.id, limit: 50 })).items;
    const byLot = new Map(all.map((item) => [item.lot, item]));
    expect(byLot.get("JAN-1")).toMatchObject({
      location: "Memo", priceUnit: "CTS", receivedPcs: 2, receivedWeightCt: "1.500", pendingPcs: 2, pendingWeightCt: "1.500",
      unitPrice: "1000.00", netUnitPrice: "1000.0000", amount: "1500.00", currency: "THB",
      vendor: { id: vendorB.id, name: "MR IT Vendor B" }, memoReceive: { id: jan.id, docNo: jan.docNo, docDate: "2026-01-10", dueDate: "2026-12-31" },
    });
    expect(byLot.get("JAN-2")).toMatchObject({ unitPrice: "1000.00", netUnitPrice: "900.0000", amount: "1350.00" });
    // PCS: line amount 299.00 for 3 pcs; 1 pending → 99.67.
    expect(byLot.get("FEB-1")).toMatchObject({ priceUnit: "PCS", netUnitPrice: "99.6667", pendingPcs: 1, amount: "99.67" });
    expect(byLot.has("MAR-1")).toBe(false);
    expect(byLot.has("PENDING-DOC")).toBe(false);
    expect(all.every((item) => item.vendor.id === vendorB.id)).toBe(true);

    expect((await stock.list({ vendorId: vendorB.id, q: "findme", limit: 50 })).items.map((item) => item.lot)).toEqual(["MAR-2"]);
    expect((await stock.list({ vendorId: vendorB.id, q: jan.docNo, limit: 50 })).items.map((item) => item.lot).sort()).toEqual(["JAN-1", "JAN-2"]);
    expect((await stock.list({ vendorId: vendorB.id, q: "%", limit: 50 })).items).toEqual([]);
    expect((await stock.list({ vendorId: vendorB.id, from: "2026-02-01", to: "2026-02-28", limit: 50 })).items.map((item) => item.lot)).toEqual(["FEB-1"]);
    expect((await stock.list({ vendorId: vendorA.id, q: "JAN", limit: 50 })).items).toEqual([]);
    expect(await failure(stock.list({ vendorId: vendorB.id, cursor: "not-a-cursor", limit: 50 }))).toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
  });

  it("IT-MR-07 discount bounds through the router → VALIDATION_ERROR; totals never negative", async () => {
    const caller = router.createCaller({
      principal: { userId: ACTOR, sessionId: "s-1", isSuperAdmin: false, grants: ["memo-receive:VIEW", "memo-receive:ADD"] },
      authorization: "CURRENT", license: "ELIGIBLE", csrfVerified: true,
    });
    const reject = async (body: ReturnType<typeof input>, path: string) => {
      await expect(caller.memoReceive.create(body as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
      try { await caller.memoReceive.create(body as never); } catch (error) {
        const cause = (error as { cause?: { issues?: { path: PropertyKey[] }[] } }).cause;
        expect(cause?.issues?.map((issue) => issue.path.join("."))).toContain(path);
      }
    };
    const before = await prisma.memoReceive.count({ where: { vendorId: vendorA.id } });
    await reject(input(vendorA, [line({ discount: { type: "PERCENT", value: "100.5" } })]), "lines.0.discount.value");
    await reject(input(vendorA, [line({ discount: { type: "AMOUNT", value: "1500.01" } })]), "lines.0.discount.value");
    await reject(input(vendorA, [line()], { discount: { type: "AMOUNT", value: "1500.01" } }), "discount.value");
    expect(await prisma.memoReceive.count({ where: { vendorId: vendorA.id } })).toBe(before);

    const full = await caller.memoReceive.create(input(vendorA, [line({ discount: { type: "AMOUNT", value: "1500" } }), line()], { discount: { type: "AMOUNT", value: "1500" } }) as never);
    const totals = (await receive.get(full.id)).totals;
    expect(totals).toMatchObject({ subtotal: "1500.00", discountAmount: "1500.00", priceBeforeTax: "0.00", taxAmount: "0.00", grandTotal: "0.00" });
  });

  it("IT-MR-09 photos: upload/read/grants on real storage; a quotation photo id is refused; save and update keep the order; approved stays read-only", async () => {
    const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("png-body")]);
    const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("jpeg-body")]);
    const ctx = (grants: string[], csrfVerified = true) => ({
      principal: { userId: ACTOR, sessionId: "s-1", isSuperAdmin: false, grants }, authorization: "CURRENT" as const, license: "ELIGIBLE" as const, csrfVerified,
    });
    const controller = (grants: string[], csrfVerified = true) =>
      new photos.MemoReceivePhotoPublicController({ createContext: async () => ctx(grants, csrfVerified) } as never);
    const body = (contentType: string, data: Buffer) => ({ headers: { "content-type": contentType }, body: data }) as unknown as Request;
    const read = async (grants: string[], id: string) => {
      const chunks: Buffer[] = [];
      const headers: Record<string, string> = {};
      const response = Object.assign(new Writable({ write(chunk: Buffer, _encoding, callback) { chunks.push(chunk); callback(); } }), {
        setHeader: (key: string, value: string) => { headers[key] = value; },
        status: () => undefined,
      });
      await controller(grants).read({} as Request, id, response as unknown as Response);
      return { bytes: Buffer.concat(chunks), headers };
    };
    const code = async (promise: Promise<unknown>) => {
      try { await promise; } catch (error) {
        if (error instanceof HttpException) return (error.getResponse() as { error: { code: string } }).error.code;
        return (error as Error).message;
      }
      throw new Error("expected a failure");
    };

    const vendor = await vendorFixture("MR IT Photo Vendor");
    receive.clock = clockAt(2055);
    const add = controller(["memo-receive:ADD"]);
    const ids = [
      (await add.upload(body("image/png", PNG))).photoId,
      (await controller(["memo-receive:EDIT"]).upload(body("image/jpeg", JPEG))).photoId,
      (await add.upload(body("image/png", PNG))).photoId,
    ];
    const rows = await prisma.storedFile.findMany({ where: { id: { in: ids } } });
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toMatchObject({ kind: "memo-receive-photo", bucket: "files", status: "ready", sourceType: "memo_receive.line-photo", createdBy: ACTOR });
      expect(row.objectKey.startsWith("memo-receive-photo/")).toBe(true);
    }
    expect(await code(controller(["memo-receive:VIEW"]).upload(body("image/png", PNG)))).toBe("PERMISSION_DENIED");
    expect(await code(controller(["memo-receive:ADD"], false).upload(body("image/png", PNG)))).toBe("CSRF_INVALID");
    expect(await code(add.upload(body("image/jpeg", PNG)))).toBe("MEMO_RECEIVE_PHOTO_INVALID");

    // Streamed back byte for byte with immutable caching; memo receive VIEW is required.
    const png = await read(["memo-receive:VIEW"], ids[0]);
    expect(png.bytes).toEqual(PNG);
    expect(png.headers).toMatchObject({ "content-type": "image/png", "content-length": String(PNG.length), "cache-control": "private, max-age=31536000, immutable" });
    expect((await read(["memo-receive:VIEW"], ids[1])).bytes).toEqual(JPEG);
    expect(await code(read(["quotation:VIEW"], ids[0]))).toBe("PERMISSION_DENIED");
    expect(await code(read(["memo-receive:VIEW"], randomUUID()))).toBe("MEMO_RECEIVE_NOT_FOUND");

    // A Quotation photo (another module's ready stored file) can't be read or linked here.
    const quotationPhoto = randomUUID();
    await prisma.storedFile.create({ data: {
      id: quotationPhoto, kind: "quotation-photo", bucket: "files", objectKey: `quotation-photo/${quotationPhoto}.png`, filename: `${quotationPhoto}.png`, contentType: "image/png",
      sizeBytes: BigInt(PNG.length), sha256: "c".repeat(64), status: "ready", sourceType: "quotation.line-photo", sourceId: quotationPhoto, createdBy: ACTOR, readyAt: new Date(),
    } });
    expect(await code(read(["memo-receive:VIEW"], quotationPhoto))).toBe("MEMO_RECEIVE_NOT_FOUND");
    const before = await prisma.memoReceive.count({ where: { vendorId: vendor.id } });
    expect(await failure(receive.create(ACTOR, input(vendor, [line({ photoIds: [ids[0], quotationPhoto] as never })])))).toEqual({
      status: 422, code: "MEMO_RECEIVE_PHOTO_INVALID", fieldErrors: [{ path: "lines.0.photoIds.1", code: "invalid_photo" }],
    });
    expect(await failure(receive.create(ACTOR, input(vendor, [line(), line({ photoIds: [randomUUID()] as never })])))).toMatchObject({
      code: "MEMO_RECEIVE_PHOTO_INVALID", fieldErrors: [{ path: "lines.1.photoIds.0" }],
    });
    expect(await prisma.memoReceive.count({ where: { vendorId: vendor.id } })).toBe(before);

    // Save keeps each line's photos in order (the first is the main photo).
    const created = await receive.create(ACTOR, input(vendor, [line({ photoIds: [ids[2], ids[0], ids[1]] as never }), line()]));
    let detail = await receive.get(created.id);
    expect(detail.lines.map((entry) => entry.photoIds)).toEqual([[ids[2], ids[0], ids[1]], []]);
    // Update replaces the links: a kept line keeps only the photos it sends, in the new order.
    const [first, second] = detail.lines;
    await receive.update(ACTOR, created.id, 1, input(vendor, [{ ...line({ photoIds: [ids[1], ids[2]] as never }), id: first.id }, { ...line({ photoIds: [ids[0]] as never }), id: second.id }]));
    detail = await receive.get(created.id);
    expect(detail.lines.map((entry) => [entry.id, entry.stockId, entry.photoIds])).toEqual([[first.id, first.stockId, [ids[1], ids[2]]], [second.id, second.stockId, [ids[0]]]]);
    expect(await prisma.memoReceiveLinePhoto.count({ where: { line: { memoReceiveId: created.id } } })).toBe(3);
    // An invalid update rolls back: the stored links stay.
    expect(await failure(receive.update(ACTOR, created.id, 2, input(vendor, [{ ...line({ photoIds: [quotationPhoto] as never }), id: first.id }])))).toMatchObject({ code: "MEMO_RECEIVE_PHOTO_INVALID" });
    expect((await receive.get(created.id)).lines.map((entry) => entry.photoIds)).toEqual([[ids[1], ids[2]], [ids[0]]]);

    // Approved → read-only (existing status guard); photo links stay and a linked file can't be deleted (RESTRICT).
    await receive.approve(ACTOR, created.id, 2);
    expect(await failure(receive.update(ACTOR, created.id, 3, input(vendor, [{ ...line(), id: first.id }])))).toMatchObject({ status: 409, code: "MEMO_RECEIVE_STATUS_INVALID" });
    expect((await receive.get(created.id)).lines[0].photoIds).toEqual([ids[1], ids[2]]);
    await expect(prisma.storedFile.delete({ where: { id: ids[1] } })).rejects.toThrow();
  });

  it("IT-MR-08 Document Setup row is used once a memo receive references it; Memo Out still creates and edits DRAFT", async () => {
    const { setup } = await setupService.get("memo-receive");
    expect(setup?.rows.find((row) => row.effectiveDate === "2026-01-01")?.used).toBe(true);

    const customerId = randomUUID();
    const [shipping, invoice] = [randomUUID(), randomUUID()];
    const address = { position: 1, name: "MR IT Customer", address: "2 Test Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true };
    await prisma.customer.create({ data: {
      id: customerId, name: "MR IT Customer", nameKey: "mr it customer", code: `MRITC${ACTOR.slice(-4)}`.toUpperCase(), codeKey: `mritc${ACTOR.slice(-4)}`.toLowerCase(),
      currencyCode: "THB", firstName: "It", email: "mr-it@example.test", createdBy: ACTOR, updatedBy: ACTOR,
      addresses: { create: [{ ...address, id: shipping, type: "SHIPPING" }, { ...address, id: invoice, type: "INVOICE" }] },
    } });
    customers.push(customerId);
    const { vendorId: _vendorId, addressId: _addressId, ...shared } = input(vendorA, [{ ...line(), stoneCodeId: null, location: "Shelf 1" } as never]);
    const out = await memoOut.create(ACTOR, { ...shared, customerId, shippingAddressId: shipping, invoiceAddressId: invoice } as never);
    const detail = await memoOut.get(out.id);
    expect(detail).toMatchObject({ status: "DRAFT", version: 1, lines: [expect.objectContaining({ location: "Shelf 1", stoneCodeId: null })] });
    expect(detail.lines[0]).not.toHaveProperty("stockId");
    await expect(memoOut.update(ACTOR, out.id, 1, { ...shared, customerId, shippingAddressId: shipping, invoiceAddressId: invoice } as never)).resolves.toEqual({ id: out.id, version: 2 });
    await expect(memoOut.delete(ACTOR, out.id, 2)).resolves.toEqual({ ok: true });
  });
});

describe("IT-MR guard", () => {
  it("IT-MR-00 runs only against an explicit loopback, non-5432 f1_system URL", () => {
    const pattern = /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/;
    expect(pattern.test("postgresql://u:p@127.0.0.1:55440/f1_system")).toBe(true);
    expect(pattern.test("postgresql://u:p@127.0.0.1:5432/f1_system")).toBe(false);
    expect(pattern.test("postgresql://u:p@localhost:55440/f1_system")).toBe(false);
    expect(pattern.test("postgresql://u:p@10.0.0.5:55440/f1_system")).toBe(false);
  });
});
