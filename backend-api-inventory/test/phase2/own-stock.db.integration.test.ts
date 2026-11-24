/* eslint-disable @typescript-eslint/no-explicit-any -- api-master modules are loaded untyped (separate tsconfig with decorators) */
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { createLogger } from "../../src/platform/logger";
import { canRun, masterFixtures, masterModule, startHarness, type Harness } from "../support/harness";

/**
 * Load to Stock phase 2 end to end (SA rev 2 testing.md "Phase 2 verification plan"): the real inventory internal routes
 * (served on a port with MASTER_INVENTORY_SERVICE_TOKEN) and the real api-master services (fromStock, Quotation, Reserve,
 * Memo Out, Memo Out Return, the hold saga) on one disposable PostgreSQL with both schemas.
 * IT-LS-P2-01…15 and NP-LS-P2-01…05 plus the D22 measurements.
 */
const TAG = `p2-${randomUUID().slice(0, 8)}`;
const LOADS: string[] = [];
const ALL = ["load-to-stock:VIEW", "load-to-stock:ADD", "load-to-stock:EDIT", "load-to-stock:DELETE", "load-to-stock:APPROVE"];

let h: Harness;
let fx: Awaited<ReturnType<typeof masterFixtures>>;
let vendor: { id: string; addressId: string };
let maker: Awaited<ReturnType<Harness["user"]>>;
let server: ServerType;
let internalUrl: string;
let masterToken: string;
let invClient: any; // api-master inventory-client module
let spyClient: any;
let calls: { op: string; body: any; at: number }[] = [];
let fail: ((op: string, body: any) => "before" | "after" | null) | null = null;
/** Runs once after the next successful PUT (simulates another user acting between the acquire and tx1). */
let afterPut: (() => Promise<void>) | null = null;
let svc: { fromStock: any; quotation: any; reserve: any; memoOut: any; memoOutReturn: any; receive: any; saga: any };
let schemas: any;
let approval: any;
let customer: { id: string; shipping: string; invoice: string };
const prisma = () => h.master.prisma;

async function loadSetting(on: boolean) {
  await h.db.$executeRaw`UPDATE "inventory"."approval_setting" SET "require_approval" = ${on}, "version" = "version" + 1 WHERE "type" = 'load-to-stock'`;
}
const attrs = (patch: Record<string, unknown> = {}) => ({ stoneCodeId: null, stoneCode: "SC-1", stone: "Sapphire", shape: "Oval", size: "", color: "Blue", clarity: "", cutting: "", quality: "", lot: "L-OWN", cerType: "", cerNo: "", ...patch });

/** An applied load (approval OFF) of `rows` (pcs, weight, lot) on `docDate`; returns its stocks by row order. */
async function ownStocks(rows: { pcs: number; weightCt: string; lot?: string }[], docDate = "2026-11-10") {
  await loadSetting(false);
  const pu = await fx.purchase(vendor, rows.map((row) => fx.line({ pcs: row.pcs, weightCt: row.weightCt })));
  const response = await maker.call("POST", "/load-to-stock", {
    docDate, vendorId: vendor.id, mode: "NONE",
    rows: rows.map((row, index) => ({ sources: [{ purchaseLineId: pu.lineIds[index], pcs: row.pcs, weightCt: row.weightCt }], location: "Safe A", attrs: attrs({ lot: row.lot ?? "L-OWN" }), stockPrice: "100", salePrice: "200", photoIds: [] })),
  });
  expect(response.status).toBe(201);
  LOADS.push(response.body.id);
  const stocks = await h.ownerDb.stock.findMany({ where: { load_id: response.body.id }, orderBy: { stock_id: "asc" } });
  return { loadId: response.body.id as string, version: 1, docNo: (await h.ownerDb.load_to_stock.findUniqueOrThrow({ where: { id: response.body.id } })).doc_no, stocks };
}

const money = { discount: { type: "NONE" as const, value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null };
const header = (patch: Record<string, unknown> = {}) => ({
  docDate: "2026-11-18", dueDate: "2026-12-18", currency: "THB", exchangeRate: null, ref: "", documentNote: "", ...money,
  customerId: customer.id, shippingAddressId: customer.shipping, invoiceAddressId: customer.invoice, ...patch,
});
const line = (item: { ownStockId?: string; memoStockId?: string }, pcs: number, weightCt: string, patch: Record<string, unknown> = {}) => ({
  source: "MANUAL", stoneCodeId: null, stoneCode: "", stone: "x", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "",
  lot: "", location: "", cerType: "", cerNo: "", pcs, weightCt, priceUnit: "PER_CT", unitPrice: "500", discount: { type: "NONE", value: "0" },
  itemNote: "", photoIds: [], ...item, ...patch,
});
const memoOutInput = (lines: unknown[], patch: Record<string, unknown> = {}) => schemas.createMemoOutSchema.parse({ ...header(patch), lines });

async function stock(id: string) {
  return h.ownerDb.stock.findUniqueOrThrow({ where: { id } });
}
async function holds(type: string, id: string) {
  return h.ownerDb.stock_hold.findMany({ where: { document_type: type, document_id: id }, orderBy: { stock_uuid: "asc" } });
}
async function failure(promise: Promise<unknown>) {
  try { await promise; } catch (error: any) {
    const body = error?.getResponse?.()?.error;
    return { status: error?.getStatus?.(), code: body?.code, fieldErrors: body?.fieldErrors, details: body?.details };
  }
  throw new Error("expected a failure");
}
async function opOf(type: string, id: string) {
  const [op] = await prisma().$queryRawUnsafe(`SELECT stage, state, revision, attempts FROM "partner"."inventory_sync_op" WHERE document_type = $1 AND document_id = $2::uuid ORDER BY created_at DESC LIMIT 1`, type, id);
  return op as { stage: string; state: string; revision: number; attempts: number } | undefined;
}
async function headerOf(model: "reserve" | "memoOut" | "memoOutReturn", id: string) {
  return prisma()[model].findUniqueOrThrow({ where: { id }, select: { syncState: true, holdRevision: true, status: true, version: true, docNo: true } });
}
/** Makes every op due now and runs one sweep tick. */
async function sweep() {
  await prisma().$executeRawUnsafe(`UPDATE "partner"."inventory_sync_op" SET next_attempt_at = now() - interval '1 second' WHERE state = 'PREPARED'`);
  return svc.saga.sweep();
}

describe.runIf(canRun)("IT-LS-P2 own stock in master documents on PostgreSQL", () => {
  beforeAll(async () => {
    h = await startHarness();
    fx = await masterFixtures(h, TAG);
    vendor = await fx.vendor(`P2 Vendor ${TAG}`);
    maker = await h.user(ALL, { name: "P2 Maker" });
    // Inventory internal routes on a port with their own token (≠ the inventory → master token).
    masterToken = randomBytes(32).toString("base64url");
    const tokenFile = join(h.dir, "master-inventory-token");
    writeFileSync(tokenFile, masterToken);
    const digest = createHash("sha256").update(masterToken).digest();
    const otherDigest = createHash("sha256").update(h.token).digest();
    const internalApp = createApp({ db: h.db, master: h.masterApi, logger: createLogger("silent"), auth: {} as never, trustedOrigins: new Set(), approvers: async () => [], storageRoot: join(h.dir, "inv2"), internal: { tokenDigest: digest, otherTokenDigest: otherDigest } });
    server = serve({ fetch: internalApp.app.fetch, port: 0, hostname: "127.0.0.1" });
    await new Promise((resolve) => server.once("listening", resolve));
    internalUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    invClient = await masterModule("src/inventory-client/inventory-client");
    const real = invClient.createInventoryClient(new URL(internalUrl), masterToken);
    const spy = {
      batch: (ids: any, options: any) => { calls.push({ op: "batch", body: ids, at: Date.now() }); if (fail?.("batch", ids) === "before") return Promise.reject(new invClient.InventoryUnavailable("test")); return real.batch(ids, options); },
      putHolds: async (type: string, id: string, body: any, options: any) => {
        calls.push({ op: `put:${type}`, body, at: Date.now() });
        const mode = fail?.(`put:${type}`, body);
        if (mode === "before") throw new invClient.InventoryUnavailable("test");
        const result = await real.putHolds(type, id, body, options);
        const hook = afterPut;
        afterPut = null;
        if (hook) await hook();
        if (mode === "after") throw new invClient.InventoryUnavailable("test");
        return result;
      },
    };
    // lot-based-stock (ADR-0055 D3/D7): the two lot reads, spied like the others.
    let afterLots: (() => Promise<void>) | null = null;
    Object.assign(spy, {
      lotsAvailable: (input: any, options: any) => { calls.push({ op: "lotsAvailable", body: input, at: Date.now() }); return real.lotsAvailable(input, options); },
      stockLots: async (keys: any, options: any) => {
        calls.push({ op: "stockLots", body: keys, at: Date.now() });
        const result = await real.stockLots(keys, options);
        const hook = afterLots; afterLots = null;
        if (hook) await hook();
        return result;
      },
    });
    (globalThis as any).__afterLots = (fn: () => Promise<void>) => { afterLots = fn; };
    spyClient = spy;
    invClient.setInventoryClient(spy);
    const { LotStockService } = await masterModule("src/trade-document/lot-stock.service");
    const { QuotationService } = await masterModule("src/quotation/quotation.service");
    const { ReserveService } = await masterModule("src/trade-document/reserve.service");
    const { MemoOutService } = await masterModule("src/trade-document/memo-out.service");
    const { MemoOutReturnService } = await masterModule("src/trade-document/memo-out-return.service");
    const { MemoReceiveService } = await masterModule("src/trade-document/memo-receive.service");
    const { holdSaga } = await masterModule("src/trade-document/inventory-hold-saga");
    svc = { fromStock: new LotStockService(), quotation: new QuotationService(), reserve: new ReserveService(), memoOut: new MemoOutService(), memoOutReturn: new MemoOutReturnService(), receive: new MemoReceiveService(), saga: holdSaga };
    schemas = { ...(await masterModule("src/trade-document/memo-schemas")), ...(await masterModule("src/quotation/quotation.schemas")) };
    approval = await masterModule("test/partner-shared/approval");
    const id = randomUUID(); const shipping = randomUUID(); const invoice = randomUUID();
    const address = { position: 1, name: "P2", address: "2 Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true };
    const code = `P2C${TAG.slice(-5)}`.toUpperCase();
    await prisma().customer.create({ data: { id, name: `P2 Customer ${TAG}`, nameKey: `p2 customer ${TAG}`, code, codeKey: code.toLowerCase(), currencyCode: "THB", firstName: "It", email: "p2@example.test", createdBy: TAG, updatedBy: TAG,
      addresses: { create: [{ ...address, id: shipping, type: "SHIPPING" }, { ...address, id: invoice, type: "INVOICE" }] } } });
    customer = { id, shipping, invoice };
    for (const type of ["reserve", "memo-out", "memo-out-return", "quotation", "memo-receive"]) await approval.setApproval(prisma(), type, false);
  }, 120_000);

  afterAll(async () => {
    if (!h) return;
    invClient?.setInventoryClient(null);
    for (const type of ["reserve", "memo-out", "memo-out-return", "quotation", "memo-receive"]) await approval.setApproval(prisma(), type, true).catch(() => undefined);
    await new Promise((resolve) => server.close(resolve));
    await loadSetting(true);
    // Master documents of this customer, then inventory holds of our loads.
    await prisma().$executeRawUnsafe(`DELETE FROM "partner"."memo_out_return" WHERE customer_id = $1::uuid`, customer.id);
    await prisma().$executeRawUnsafe(`DELETE FROM "partner"."memo_out" WHERE customer_id = $1::uuid`, customer.id);
    await prisma().$executeRawUnsafe(`DELETE FROM "partner"."reserve" WHERE customer_id = $1::uuid`, customer.id);
    await prisma().$executeRawUnsafe(`DELETE FROM "partner"."quotation" WHERE customer_id = $1::uuid`, customer.id);
    await prisma().$executeRawUnsafe(`DELETE FROM "partner"."inventory_sync_op"`);
    await h.ownerDb.$executeRawUnsafe(`DELETE FROM "inventory"."stock_hold_document"`);
    const bulk = `SELECT id FROM "inventory"."stock" WHERE stock_id LIKE '9%' AND length(stock_id) = 8`;
    await h.ownerDb.$executeRawUnsafe(`DELETE FROM "inventory"."stock_movement" WHERE stock_uuid IN (${bulk})`);
    await h.ownerDb.$executeRawUnsafe(`DELETE FROM "inventory"."stock" WHERE id IN (${bulk})`);
    await prisma().customer.delete({ where: { id: customer.id } }).catch(() => undefined);
    await prisma().$executeRawUnsafe(`DELETE FROM "partner"."memo_stock" WHERE vendor_id = $1::uuid`, vendor.id);
    await prisma().$executeRawUnsafe(`DELETE FROM "partner"."memo_receive" WHERE vendor_id = $1::uuid`, vendor.id);
    await fx.cleanup(LOADS);
    await h.close();
  });

  it("IT-LS-P2-14 migrations: ref_doc_* set from the load; stock_hold re-keyed; master CHECK refuses both stock ids", async () => {
    const load = await ownStocks([{ pcs: 2, weightCt: "1" }], "2026-11-05");
    const row = await stock(load.stocks[0].id);
    expect(row.ref_doc_no).toBe(load.docNo);
    expect(row.ref_doc_date.toISOString().slice(0, 10)).toBe("2026-11-05");
    const columns = await h.ownerDb.$queryRawUnsafe<{ column_name: string }[]>(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'inventory' AND table_name = 'stock_hold'`);
    expect(columns.map((column) => column.column_name)).not.toContain("line_id");
    expect(columns.map((column) => column.column_name)).toContain("document_no");
    const indexes = await h.ownerDb.$queryRawUnsafe<{ indexname: string }[]>(`SELECT indexname FROM pg_indexes WHERE schemaname = 'inventory' AND tablename = 'stock'`);
    expect(indexes.map((index) => index.indexname)).toContain("stock_picker_idx");
    expect(indexes.map((index) => index.indexname)).not.toContain("stock_available_idx");
    const checks = (await prisma().$queryRawUnsafe(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'reserve_line_stock_check'`)) as { def: string }[];
    expect(checks[0].def).toContain("own_stock_id IS NOT NULL");
    expect(checks[0].def).toContain("memo_stock_id IS NULL");
  });

  it("IT-LS-P2-13 internal auth: no token 401, the inventory → master token 401, the right token 200", async () => {
    const post = (authorization?: string) => fetch(`${internalUrl}/internal/v1/master/stock/batch`, { method: "POST", headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) }, body: JSON.stringify({ ids: [randomUUID()] }) });
    expect((await post()).status).toBe(401);
    expect((await post(`Bearer ${h.token}`)).status).toBe(401);
    const ok = await post(`Bearer ${masterToken}`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ items: [] });
    // The public app (nginx route /api/inventory/) has no such path.
    expect((await fetch(`${internalUrl}/api/inventory/v1/internal/v1/master/stock/batch`, { method: "POST" })).status).not.toBe(200);
  });

  it("IT-LS-P2-01 / NP-LS-P2-01 fromStock.lots: our stock first (one lot per stock, Q4), then Memo Stock lots; stable keyset paging, location / q filters, ≤ 1 inventory call and query per page", async () => {
    const lot = `LOT-${TAG}`;
    const ownA = await ownStocks([{ pcs: 3, weightCt: "1.5", lot }, { pcs: 3, weightCt: "1.5", lot }], "2081-01-03");
    await ownStocks([{ pcs: 3, weightCt: "1.5", lot }], "2081-01-01");
    const receiveLine = { source: "MANUAL", stoneCode: "", stone: "Ruby", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "", lot, cerType: "", cerNo: "", pcs: 2, weightCt: "1", priceUnit: "PER_CT", unitPrice: "100", discount: { type: "NONE", value: "0" }, itemNote: "", photoIds: [] };
    for (const docDate of ["2081-01-04", "2081-01-02"]) {
      await svc.receive.create(TAG, { docDate, dueDate: "2081-02-01", currency: "THB", exchangeRate: null, ref: "", documentNote: "", ...money, lines: [receiveLine, receiveLine], vendorId: vendor.id, addressId: vendor.addressId });
    }
    const pages: any[] = [];
    let cursor: string | null = null;
    calls = [];
    do {
      const measured: { queries: number; result: any } = await h.measured(() => svc.fromStock.fromStockLots({ q: lot, from: "2081-01-01", to: "2081-01-31", cursor, limit: 2 }));
      // Owner 2026-11-20: our stock first; Memo Stock pages call inventory no more (≤ 1 inventory query per page).
      expect(measured.queries).toBeLessThanOrEqual(1);
      pages.push(measured.result);
      cursor = measured.result.nextCursor;
    } while (cursor && pages.length < 10);
    expect(calls.filter((call) => call.op === "lotsAvailable").length).toBeLessThanOrEqual(pages.length); // ≤ one HTTP call per page
    const items = pages.flatMap((page) => page.items);
    // Own stock is not merged (Q4): 3 stocks = 3 lots. The 4 Memo Stock items (same lot, same details, no cer no.) are ONE lot.
    expect(items.map((item: any) => item.source)).toEqual(["OWN_STOCK", "OWN_STOCK", "OWN_STOCK", "MEMO_STOCK"]);
    expect(new Set(items.map((item: any) => item.lotKey)).size).toBe(4);
    expect(items.filter((item: any) => item.source === "OWN_STOCK").every((item: any) => item.merged === false && item.lotKey.startsWith("OS"))).toBe(true);
    const ownDates = items.filter((item: any) => item.source === "OWN_STOCK").map((item: any) => item.ref.docDate);
    expect([...ownDates].sort().reverse()).toEqual(ownDates);
    const own = items.find((item: any) => item.source === "OWN_STOCK");
    expect(own).toMatchObject({ location: "Safe A", lot, unitPrice: null, amount: null, vendor: null, ref: { type: "LOAD", docNo: ownA.docNo }, pendingPcs: 3 });
    expect(JSON.stringify(own)).not.toMatch(/unitCost|stockId/);
    expect(items[3]).toMatchObject({ source: "MEMO_STOCK", merged: true, pendingPcs: 8, pendingWeightCt: "4.000", refCount: 2 });
    expect(pages.every((page) => page.ownStock === "OK")).toBe(true);
    calls = [];
    const memoOnly = await svc.fromStock.fromStockLots({ q: lot, location: "memo", limit: 50 });
    expect(calls).toHaveLength(0);
    expect(memoOnly.items.every((item: any) => item.source === "MEMO_STOCK")).toBe(true);
    const ownOnly = await svc.fromStock.fromStockLots({ q: lot, location: "safe a", limit: 50 });
    expect(ownOnly.items.map((item: any) => item.source)).toEqual(["OWN_STOCK", "OWN_STOCK", "OWN_STOCK"]);
  });

  it("IT-LS-P2-02 inventory stopped / slow: Memo Stock rows only with ownStock UNAVAILABLE within the 2 s budget", async () => {
    const down = invClient.createInventoryClient(new URL("http://127.0.0.1:9"), masterToken);
    const slow = serve({ fetch: () => new Promise<Response>((resolve) => setTimeout(() => resolve(new Response("{}")), 3_000)), port: 0, hostname: "127.0.0.1" });
    await new Promise((resolve) => slow.once("listening", resolve));
    const slowClient = invClient.createInventoryClient(new URL(`http://127.0.0.1:${(slow.address() as AddressInfo).port}`), masterToken);
    const previous = calls;
    try {
      for (const client of [down, slowClient]) {
        invClient.setInventoryClient(client);
        const started = Date.now();
        const page = await svc.fromStock.fromStockLots({ limit: 5 });
        expect(page.ownStock).toBe("UNAVAILABLE");
        expect(page.items.every((item: any) => item.source === "MEMO_STOCK")).toBe(true);
        expect(Date.now() - started).toBeLessThan(2_600);
      }
    } finally {
      await new Promise((resolve) => slow.close(resolve));
      invClient.setInventoryClient(spyClient);
      calls = previous;
    }
  });
  async function memoStockItems(pcs: number, count = 1) {
    const receiveLine = { source: "MANUAL", stoneCode: "", stone: "Ruby", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "", lot: "M", cerType: "", cerNo: "", pcs, weightCt: String(pcs), priceUnit: "PER_CT", unitPrice: "100", discount: { type: "NONE", value: "0" }, itemNote: "", photoIds: [] };
    const saved = await svc.receive.create(TAG, { docDate: "2026-11-01", dueDate: "2026-12-01", currency: "THB", exchangeRate: null, ref: "", documentNote: "", ...money, lines: Array.from({ length: count }, () => receiveLine), vendorId: vendor.id, addressId: vendor.addressId });
    return prisma().memoStock.findMany({ where: { memoReceiveId: saved.id }, orderBy: { stockId: "asc" } });
  }

  it("IT-LS-P2-03 Quotation (2a): copy incl. lot, exceeds_pending, kept line saves while inventory is down, raised line 503, unknown id REFERENCE_INVALID, nothing held", async () => {
    const own = await ownStocks([{ pcs: 4, weightCt: "2", lot: "QT-LOT" }]);
    const stockUuid = own.stocks[0].id;
    const qline = (pcs: number, weightCt: string, ownStockId = stockUuid) => line({ ownStockId }, pcs, weightCt, { source: "OWN_STOCK" });
    const input = (lines: unknown[]) => schemas.createQuotationSchema.parse({ ...header(), lines });
    const saved = await svc.quotation.create(TAG, input([qline(2, "1")]));
    const detail = await svc.quotation.get(saved.id);
    expect(detail.lines[0]).toMatchObject({ source: "OWN_STOCK", ownStockId: stockUuid, memoStockId: null, stockId: null, lot: "QT-LOT", location: "Safe A", stone: "Sapphire", stoneCode: "SC-1", stockPendingPcs: 4 });
    expect(await failure(svc.quotation.create(TAG, input([qline(5, "1")])))).toMatchObject({ code: "VALIDATION_ERROR", fieldErrors: [{ path: "lines.0.pcs", code: "exceeds_pending", params: { availablePcs: 4 } }] });
    expect(await failure(svc.quotation.create(TAG, input([qline(1, "1", randomUUID())])))).toMatchObject({ code: "QUOTATION_REFERENCE_INVALID", fieldErrors: [{ path: "lines.0.ownStockId", code: "invalid_reference" }] });
    fail = (op) => (op === "batch" ? "before" : null);
    calls = [];
    try {
      const kept = await svc.quotation.update(TAG, saved.id, saved.version, input([qline(2, "1")]));
      expect(kept.version).toBe(saved.version + 1);
      expect(calls.filter((call) => call.op === "batch")).toHaveLength(0);
      expect(await failure(svc.quotation.update(TAG, saved.id, kept.version, input([qline(3, "1")])))).toMatchObject({ status: 503, code: "INVENTORY_UNAVAILABLE" });
    } finally { fail = null; }
    expect(await h.ownerDb.stock_hold.count({ where: { stock_uuid: stockUuid } })).toBe(0);
    expect((await stock(stockUuid)).on_hand_pcs).toBe(4);
  });

  it("IT-LS-P2-04 Reserve approve (ON) and Memo Out save (OFF) with Memo + own lines: buckets, holds = lines, movements, revision, IDLE", async () => {
    const own = await ownStocks([{ pcs: 5, weightCt: "2.5" }, { pcs: 5, weightCt: "2.5" }]);
    const [memo] = await memoStockItems(3);
    let reserveId = "";
    await approval.setApproval(prisma(), "reserve", true);
    try {
      const draft = await svc.reserve.create(TAG, memoOutInput([line({ ownStockId: own.stocks[0].id }, 2, "1"), line({ memoStockId: memo.id }, 1, "1")]));
      reserveId = draft.id;
      expect(await holds("reserve", draft.id)).toHaveLength(0);
      const sent = await svc.reserve.submit({ id: TAG, name: "T" }, draft.id, draft.version);
      calls = [];
      await svc.reserve.approve(TAG, draft.id, sent.version);
      expect(calls.map((call) => call.op)).toEqual(["put:reserve"]);
    } finally { await approval.setApproval(prisma(), "reserve", false); }
    const reserved = await stock(own.stocks[0].id);
    expect([reserved.on_hand_pcs, reserved.reserved_pcs, reserved.reserved_weight_ct.toFixed(3)]).toEqual([3, 2, "1.000"]);
    const reserve = await headerOf("reserve", reserveId);
    expect(reserve).toMatchObject({ syncState: "IDLE", holdRevision: 1, status: "APPROVED" });
    expect((await holds("reserve", reserveId)).map((hold) => [hold.stock_uuid, hold.pcs, hold.kind, hold.document_no])).toEqual([[own.stocks[0].id, 2, "RESERVED", reserve.docNo]]);
    expect((await h.ownerDb.stock_movement.findMany({ where: { document_id: reserveId } })).map((m) => [m.kind, m.pcs_delta])).toEqual([["HOLD_RESERVE", -2]]);
    expect((await prisma().memoStock.findUniqueOrThrow({ where: { id: memo.id } })).reservedPcs).toBe(1);
    expect((await svc.reserve.get(reserveId)).syncState).toBe("IDLE");
    expect((await svc.reserve.list({ limit: 5, deleted: false, partyId: customer.id })).items[0]).toMatchObject({ syncState: "IDLE" });

    calls = [];
    const out = await svc.memoOut.create(TAG, memoOutInput([line({ ownStockId: own.stocks[1].id }, 4, "2")]));
    expect(out.status).toBe("APPROVED");
    // Acquire (no number yet, S-P2-04), then one PUT that fills the document number: ≤ 1 batch + ≤ 2 PUTs (NP-LS-P2-04).
    expect(calls.map((call) => call.op)).toEqual(["batch", "put:memo-out", "put:memo-out"]);
    const moved = await stock(own.stocks[1].id);
    expect([moved.on_hand_pcs, moved.memo_out_pcs]).toEqual([1, 4]);
    expect(await headerOf("memoOut", out.id)).toMatchObject({ syncState: "IDLE", holdRevision: 2 });
    expect((await holds("memo-out", out.id))[0]).toMatchObject({ pcs: 4, kind: "MEMO_OUT", document_no: out.docNo });
    const detail = await svc.memoOut.get(out.id);
    expect(detail.lines[0]).toMatchObject({ source: "OWN_STOCK", ownStockId: own.stocks[1].id, stockPendingPcs: 5, lot: "L-OWN", location: "Safe A" });
  });

  it("IT-LS-P2-05 two Memo Outs of the same own stock (5 pcs; 4 and 3) approved concurrently: one wins, the other MEMO_OUT_PENDING_SHORT; on-hand 1", async () => {
    const own = await ownStocks([{ pcs: 5, weightCt: "5" }]);
    await approval.setApproval(prisma(), "memo-out", true);
    try {
      const a = await svc.memoOut.create(TAG, memoOutInput([line({ ownStockId: own.stocks[0].id }, 4, "4")]));
      const b = await svc.memoOut.create(TAG, memoOutInput([line({ ownStockId: own.stocks[0].id }, 3, "3")]));
      const sa = await svc.memoOut.submit({ id: TAG, name: "T" }, a.id, a.version);
      const sb = await svc.memoOut.submit({ id: TAG, name: "T" }, b.id, b.version);
      const results = await Promise.allSettled([svc.memoOut.approve(TAG, a.id, sa.version), svc.memoOut.approve(TAG, b.id, sb.version)]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
      expect(rejected.reason.getResponse().error).toMatchObject({ code: "MEMO_OUT_PENDING_SHORT", fieldErrors: [{ path: "lines.0.pcs", code: "exceeds_pending" }, { path: "lines.0.weightCt", code: "exceeds_pending" }] });
      const row = await stock(own.stocks[0].id);
      expect([row.on_hand_pcs, row.memo_out_pcs, row.pcs]).toEqual([1, 4, 5]);
      const loser = results[0].status === "rejected" ? a.id : b.id;
      expect(await headerOf("memoOut", loser)).toMatchObject({ syncState: "IDLE", status: "PENDING_APPROVAL" });
      expect((await opOf("memo-out", loser))?.state).toBe("REFUSED");
    } finally { await approval.setApproval(prisma(), "memo-out", false); }
  });

  it("IT-LS-P2-06 acquire OK, then Memo Stock short in tx1: compensation releases; stock and document unchanged; op ABANDONED", async () => {
    const own = await ownStocks([{ pcs: 3, weightCt: "3" }]);
    const [memo] = await memoStockItems(2);
    await approval.setApproval(prisma(), "memo-out", true);
    try {
      const draft = await svc.memoOut.create(TAG, memoOutInput([line({ ownStockId: own.stocks[0].id }, 2, "2"), line({ memoStockId: memo.id }, 2, "2")]));
      const sent = await svc.memoOut.submit({ id: TAG, name: "T" }, draft.id, draft.version);
      // Another Memo Out takes the Memo Stock between the acquire PUT and tx1.
      afterPut = async () => {
        await approval.setApproval(prisma(), "memo-out", false);
        await svc.memoOut.create(TAG, memoOutInput([line({ memoStockId: memo.id }, 2, "2")]));
        await approval.setApproval(prisma(), "memo-out", true);
      };
      calls = [];
      expect(await failure(svc.memoOut.approve(TAG, draft.id, sent.version))).toMatchObject({ code: "MEMO_OUT_PENDING_SHORT" });
      expect(calls.map((call) => [call.op, call.body.revision, call.body.holds.length])).toEqual([["put:memo-out", 1, 1], ["put:memo-out", 2, 0]]);
      expect((await stock(own.stocks[0].id)).on_hand_pcs).toBe(3);
      expect(await holds("memo-out", draft.id)).toHaveLength(0);
      expect(await opOf("memo-out", draft.id)).toMatchObject({ stage: "COMPENSATE", state: "ABANDONED", revision: 2 });
      expect(await headerOf("memoOut", draft.id)).toMatchObject({ syncState: "IDLE", status: "PENDING_APPROVAL", holdRevision: 2 });
    } finally { await approval.setApproval(prisma(), "memo-out", false); }
  });

  it("IT-LS-P2-07 kill points (unknown outcomes) end consistent after the sweep: holds = applied lines, never double-held, IDLE", async () => {
    const own = await ownStocks([{ pcs: 6, weightCt: "6" }]);
    const uuid = own.stocks[0].id;
    // (a) acquire applied in inventory but the answer is lost (kill after PUT, before tx1): 503, nothing saved; the sweep abandons.
    fail = (op) => (op === "put:memo-out" ? "after" : null);
    const lost = await failure(svc.memoOut.create(TAG, memoOutInput([line({ ownStockId: uuid }, 2, "2")])));
    fail = null;
    expect(lost).toMatchObject({ status: 503, code: "INVENTORY_UNAVAILABLE" });
    expect((await stock(uuid)).on_hand_pcs).toBe(4);
    const [orphan] = await prisma().$queryRawUnsafe(`SELECT document_id::text AS document_id FROM "partner"."inventory_sync_op" WHERE stage = 'ACQUIRE' AND state = 'PREPARED'`) as { document_id: string }[];
    expect(await sweep()).toBeGreaterThanOrEqual(1);
    expect((await stock(uuid)).on_hand_pcs).toBe(6);
    expect(await opOf("memo-out", orphan.document_id)).toMatchObject({ state: "ABANDONED" });
    expect(await prisma().memoOut.count({ where: { id: orphan.document_id } })).toBe(0);
    // (b) kill after tx0 (the PUT never left): the sweep abandons with r+1 = empty.
    fail = (op) => (op === "put:memo-out" ? "before" : null);
    expect(await failure(svc.memoOut.create(TAG, memoOutInput([line({ ownStockId: uuid }, 1, "1")])))).toMatchObject({ code: "INVENTORY_UNAVAILABLE" });
    fail = null;
    await sweep();
    expect((await stock(uuid)).on_hand_pcs).toBe(6);
    // (c) kill after tx1 before the release: the delete is saved, the document stays SYNCING (writes BUSY), the sweep finishes.
    const out = await svc.memoOut.create(TAG, memoOutInput([line({ ownStockId: uuid }, 3, "3")]));
    expect((await stock(uuid)).on_hand_pcs).toBe(3);
    fail = (op) => (op === "put:memo-out" ? "before" : null);
    const deleted = await svc.memoOut.delete(TAG, out.id, out.version);
    expect(deleted.ok).toBe(true);
    expect(await headerOf("memoOut", out.id)).toMatchObject({ syncState: "SYNCING" });
    expect((await stock(uuid)).on_hand_pcs).toBe(3); // still held: conservative, never oversold
    expect(await failure(svc.memoOut.restore(TAG, out.id, deleted.version))).toMatchObject({ status: 409, code: "MEMO_OUT_BUSY", details: { retryAfterSeconds: 5 } });
    fail = null;
    await sweep();
    expect(await headerOf("memoOut", out.id)).toMatchObject({ syncState: "IDLE" });
    expect((await stock(uuid)).on_hand_pcs).toBe(6);
    expect(await holds("memo-out", out.id)).toHaveLength(0);
    // (d) mid-compensation: tx1 fails, the compensation PUT is lost; the sweep finishes the abandon.
    const [memo] = await memoStockItems(1);
    await svc.memoOut.create(TAG, memoOutInput([line({ memoStockId: memo.id }, 1, "1")]));
    const short = await memoStockItems(1);
    await svc.memoOut.create(TAG, memoOutInput([line({ memoStockId: short[0].id }, 1, "1")]));
    let puts = 0;
    fail = (op) => (op === "put:memo-out" && ++puts === 2 ? "before" : null);
    expect(await failure(svc.memoOut.create(TAG, memoOutInput([line({ ownStockId: uuid }, 2, "2"), line({ memoStockId: short[0].id }, 1, "1")])))).toMatchObject({ code: "VALIDATION_ERROR" });
    fail = null;
    void memo;
    expect((await stock(uuid)).on_hand_pcs).toBe(4); // compensation lost: still held until the sweep
    await sweep();
    expect((await stock(uuid)).on_hand_pcs).toBe(6);
    const after = await prisma().$queryRawUnsafe(`SELECT count(*)::int AS n FROM "partner"."inventory_sync_op" WHERE state = 'PREPARED'`) as { n: number }[];
    expect(after[0].n).toBe(0);
    const row = await stock(uuid);
    expect(row.pcs).toBe(row.on_hand_pcs + row.reserved_pcs + row.memo_out_pcs + row.sold_pcs + row.consumed_pcs);
  });

  it("IT-LS-P2-07d compensation lost: tx1 fails after an acquire, the release-only PUT r+1 is lost; the sweep finishes it (ABANDONED, IDLE)", async () => {
    const own = await ownStocks([{ pcs: 3, weightCt: "3" }]);
    const [memo] = await memoStockItems(1);
    await approval.setApproval(prisma(), "memo-out", true);
    try {
      const draft = await svc.memoOut.create(TAG, memoOutInput([line({ ownStockId: own.stocks[0].id }, 2, "2"), line({ memoStockId: memo.id }, 1, "1")]));
      const sent = await svc.memoOut.submit({ id: TAG, name: "T" }, draft.id, draft.version);
      afterPut = async () => {
        await approval.setApproval(prisma(), "memo-out", false);
        await svc.memoOut.create(TAG, memoOutInput([line({ memoStockId: memo.id }, 1, "1")]));
        await approval.setApproval(prisma(), "memo-out", true);
      };
      let puts = 0;
      fail = (op) => (op === "put:memo-out" && ++puts === 2 ? "before" : null);
      expect(await failure(svc.memoOut.approve(TAG, draft.id, sent.version))).toMatchObject({ code: "MEMO_OUT_PENDING_SHORT" });
      fail = null;
      expect((await stock(own.stocks[0].id)).on_hand_pcs).toBe(1);
      expect(await opOf("memo-out", draft.id)).toMatchObject({ stage: "COMPENSATE", state: "PREPARED" });
      await sweep();
      expect((await stock(own.stocks[0].id)).on_hand_pcs).toBe(3);
      expect(await opOf("memo-out", draft.id)).toMatchObject({ state: "ABANDONED" });
      expect(await headerOf("memoOut", draft.id)).toMatchObject({ syncState: "IDLE", status: "PENDING_APPROVAL" });
    } finally { fail = null; await approval.setApproval(prisma(), "memo-out", false); }
  });

  it("IT-LS-P2-08 hold PUT replay / stale; NP-LS-P2-02 batch of 200 = 1 query; NP-LS-P2-03 a 200-stock PUT ≤ 8 statements; D22 measurements", async () => {
    const own = await ownStocks([{ pcs: 2, weightCt: "2" }]);
    const template = own.stocks[0];
    await h.ownerDb.$executeRawUnsafe(`
      INSERT INTO "inventory"."stock" (id, stock_id, load_id, status, location, price_unit, pcs, weight_ct, on_hand_pcs, on_hand_weight_ct, unit_cost_base, cost_amount_base, stock_price, sale_price, currency_code, vendor_id, ref_doc_date, ref_doc_no)
      SELECT gen_random_uuid(), '9' || lpad(n::text, 7, '0'), load_id, 'ACTIVE', location, price_unit, 3, 3, 3, 3, 1, 3, 1, 2, currency_code, vendor_id, ref_doc_date - (n % 300), ref_doc_no
      FROM "inventory"."stock", generate_series(1, 5000) AS n WHERE id = $1::uuid`, template.id);
    await h.ownerDb.$executeRawUnsafe(`ANALYZE "inventory"."stock"`);
    const bulk = (await h.ownerDb.stock.findMany({ where: { stock_id: { startsWith: "9" }, load_id: own.loadId }, select: { id: true }, take: 200 })).map((row) => row.id);
    const put = (documentId: string, body: unknown): Promise<{ status: number; json(): Promise<any> }> => fetch(`${internalUrl}/internal/v1/master/stock-holds/reserve/${documentId}`, { method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${masterToken}` }, body: JSON.stringify(body) });
    const doc = randomUUID();
    const body = { revision: 3, documentNo: "RS-T", holds: [{ stockUuid: template.id, pcs: 1, weightCt: "1" }] };
    const first = await (await put(doc, body)).json();
    expect(first).toMatchObject({ revision: 3, replayed: false, stocks: [{ stockUuid: template.id, availablePcs: 1 }] });
    expect(await (await put(doc, body)).json()).toMatchObject({ revision: 3, replayed: true, holds: [{ stockUuid: template.id, pcs: 1, weightCt: "1.000" }] });
    expect((await stock(template.id)).on_hand_pcs).toBe(1);
    const lower = await put(doc, { ...body, revision: 2 });
    expect(lower.status).toBe(409);
    expect((await lower.json()).error).toMatchObject({ code: "STOCK_HOLD_STALE", details: { appliedRevision: 3 } });
    const other = await put(doc, { ...body, holds: [] });
    expect([other.status, (await other.json()).error.code]).toEqual([409, "STOCK_HOLD_STALE"]);
    expect((await (await put(doc, { revision: 4, documentNo: "RS-T", holds: [] })).json()).holds).toEqual([]);
    expect((await stock(template.id)).on_hand_pcs).toBe(2);

    const batch: { queries: number; result: any } = await h.measured(() => fetch(`${internalUrl}/internal/v1/master/stock/batch`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${masterToken}` }, body: JSON.stringify({ ids: bulk }) }).then((r) => r.json()));
    expect(batch.result.items).toHaveLength(200);
    expect(batch.queries).toBe(1);
    const big = randomUUID();
    const started = performance.now();
    const hold: { queries: number; result: any } = await h.measured(() => put(big, { revision: 1, documentNo: null, holds: bulk.map((id) => ({ stockUuid: id, pcs: 1, weightCt: "1" })) }).then((r) => r.json()));
    const holdMs = performance.now() - started;
    expect(hold.result.holds).toHaveLength(200);
    expect(hold.queries).toBeLessThanOrEqual(8);
    const release = await h.measured(() => put(big, { revision: 2, documentNo: null, holds: [] }).then((r) => r.json()));
    expect(release.queries).toBeLessThanOrEqual(8);
    const times: number[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 40; i += 1) {
      const t0 = performance.now();
      const page: { nextCursor: string | null } = await svc.fromStock.fromStockLots({ limit: 50, cursor });
      times.push(performance.now() - t0);
      cursor = page.nextCursor;
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.ceil(times.length * 0.95) - 1];
    console.info(`[D22] hold PUT 200 stocks: ${holdMs.toFixed(0)} ms, ${hold.queries} statements; release ${release.queries}; batch 200: ${batch.queries} query; picker p95 (40 pages x 50, 5,000 own): ${p95.toFixed(0)} ms`);
    expect(holdMs).toBeLessThan(500);
    expect(p95).toBeLessThan(300);
  });

  it("IT-LS-P2-09 edit an auto-approved Memo Out: A 3→5, remove B, add C → PUT H_mid (A5, B, C) then H_new (A5, C); B released after the local commit", async () => {
    const own = await ownStocks([{ pcs: 6, weightCt: "6" }, { pcs: 6, weightCt: "6" }, { pcs: 6, weightCt: "6" }]);
    const [A, B, C] = own.stocks.map((row) => row.id);
    const out = await svc.memoOut.create(TAG, memoOutInput([line({ ownStockId: A }, 3, "3"), line({ ownStockId: B }, 2, "2")]));
    calls = [];
    const updated = await svc.memoOut.update(TAG, out.id, out.version, memoOutInput([line({ ownStockId: A }, 5, "5"), line({ ownStockId: C }, 1, "1")]));
    expect(updated.version).toBe(out.version + 1);
    const puts = calls.filter((call) => call.op === "put:memo-out").map((call) => call.body.holds.map((hold: any) => [hold.stockUuid, hold.pcs]));
    const sorted = (list: [string, number][]) => [...list].sort(([x], [y]) => (x < y ? -1 : 1));
    expect(puts).toEqual([sorted([[A, 5], [B, 2], [C, 1]]), sorted([[A, 5], [C, 1]])]);
    expect([(await stock(A)).on_hand_pcs, (await stock(B)).on_hand_pcs, (await stock(C)).on_hand_pcs]).toEqual([1, 6, 5]);
    expect(await headerOf("memoOut", out.id)).toMatchObject({ syncState: "IDLE" });
  });

  it("IT-LS-P2-10 Memo Out Return of own stock moves memo_out → on-hand; deleting it after the stock was reserved elsewhere → MEMO_OUT_RETURN_IN_USE, nothing changed", async () => {
    const own = await ownStocks([{ pcs: 4, weightCt: "4" }]);
    const uuid = own.stocks[0].id;
    const out = await svc.memoOut.create(TAG, memoOutInput([line({ ownStockId: uuid }, 4, "4")]));
    const outstanding = await svc.memoOutReturn.outstanding({ customerId: customer.id, currency: "THB", limit: 50 });
    const item = outstanding.items.find((row: any) => row.memoOut.id === out.id);
    expect(item).toMatchObject({ source: "OWN_STOCK", location: "Safe A", ownStockId: uuid, memoStockId: null, outstandingPcs: 4 });
    const ret = await svc.memoOutReturn.create(TAG, schemas.createMemoOutReturnSchema.parse({ ...header(), lines: [{ ...line({}, 2, "2"), memoOutLineId: item.memoOutLineId, outstandingPcs: 4, outstandingWeightCt: "4" }] }));
    let row = await stock(uuid);
    expect([row.on_hand_pcs, row.memo_out_pcs]).toEqual([2, 2]);
    expect((await holds("memo-out-return", ret.id))[0]).toMatchObject({ kind: "MEMO_OUT_RETURN", pcs: 2, document_no: ret.docNo });
    await svc.reserve.create(TAG, memoOutInput([line({ ownStockId: uuid }, 2, "2")]));
    const refused = await failure(svc.memoOutReturn.delete(TAG, ret.id, ret.version));
    expect(refused).toMatchObject({ status: 409, code: "MEMO_OUT_RETURN_IN_USE" });
    row = await stock(uuid);
    expect([row.on_hand_pcs, row.memo_out_pcs, row.reserved_pcs]).toEqual([0, 2, 2]);
    expect(await headerOf("memoOutReturn", ret.id)).toMatchObject({ syncState: "IDLE" });
    expect((await prisma().memoOutLine.findFirstOrThrow({ where: { memoOutId: out.id } })).returnedPcs).toBe(2);
    const { MemoOutstandingService } = await masterModule("src/trade-document/memo-outstanding.service");
    const customerItems = await new MemoOutstandingService().customerItems({ memoOutIds: [out.id] });
    expect(customerItems.items[0]).toMatchObject({ source: "OWN_STOCK", location: "Safe A", stockId: own.stocks[0].stock_id });
  });

  it("IT-LS-P2-11 a held stock makes its load read-only (LOAD_TO_STOCK_IN_USE {stockIds, holders}); the release makes it editable", async () => {
    const own = await ownStocks([{ pcs: 3, weightCt: "3" }]);
    const reserve = await svc.reserve.create(TAG, memoOutInput([line({ ownStockId: own.stocks[0].id }, 1, "1")]));
    const detail = await maker.call("GET", `/load-to-stock/${own.loadId}`);
    expect(detail.body).toMatchObject({ inUse: true, holders: [{ documentType: "reserve", documentNo: reserve.docNo }] });
    const refused = await maker.call("POST", `/load-to-stock/${own.loadId}/delete`, { expectedVersion: 1 });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatchObject({ code: "LOAD_TO_STOCK_IN_USE", details: { stockIds: [own.stocks[0].stock_id], holders: [{ documentType: "reserve", documentNo: reserve.docNo }] } });
    await svc.reserve.delete(TAG, reserve.id, reserve.version);
    expect((await maker.call("GET", `/load-to-stock/${own.loadId}`)).body).toMatchObject({ inUse: false, holders: [] });
    expect((await maker.call("POST", `/load-to-stock/${own.loadId}/delete`, { expectedVersion: 1 })).status).toBe(200);
  });

  it("IT-LS-P2-12 BUSY: hold on a SYNCING load → RESERVE_BUSY; Memo Out Return of a SYNCING Memo Out → MEMO_OUT_RETURN_BUSY; write on a SYNCING document → MEMO_OUT_BUSY", async () => {
    const own = await ownStocks([{ pcs: 3, weightCt: "3" }, { pcs: 3, weightCt: "3" }]);
    await h.ownerDb.load_to_stock.update({ where: { id: own.loadId }, data: { sync_state: "SYNCING" } });
    try {
      expect(await failure(svc.reserve.create(TAG, memoOutInput([line({ ownStockId: own.stocks[0].id }, 1, "1")])))).toMatchObject({ status: 409, code: "RESERVE_BUSY" });
    } finally { await h.ownerDb.load_to_stock.update({ where: { id: own.loadId }, data: { sync_state: "IDLE" } }); }
    const out = await svc.memoOut.create(TAG, memoOutInput([line({ ownStockId: own.stocks[1].id }, 2, "2")]));
    const [outLine] = await prisma().memoOutLine.findMany({ where: { memoOutId: out.id } });
    await prisma().memoOut.update({ where: { id: out.id }, data: { syncState: "SYNCING" } });
    try {
      const mor = schemas.createMemoOutReturnSchema.parse({ ...header(), lines: [{ ...line({}, 1, "1"), memoOutLineId: outLine.id, outstandingPcs: 2, outstandingWeightCt: "2" }] });
      expect(await failure(svc.memoOutReturn.create(TAG, mor))).toMatchObject({ status: 409, code: "MEMO_OUT_RETURN_BUSY" });
      expect(await failure(svc.memoOut.update(TAG, out.id, out.version, memoOutInput([line({ ownStockId: own.stocks[1].id }, 1, "1")])))).toMatchObject({ status: 409, code: "MEMO_OUT_BUSY" });
      expect(await failure(svc.memoOut.delete(TAG, out.id, out.version))).toMatchObject({ status: 409, code: "MEMO_OUT_BUSY" });
    } finally { await prisma().memoOut.update({ where: { id: out.id }, data: { syncState: "IDLE" } }); }
  });

  it("IT-LS-P2-15 Lot (D23): trimmed on the row, copied to the stock, synced by an applied edit, shown and searchable in the picker", async () => {
    const own = await ownStocks([{ pcs: 2, weightCt: "2", lot: `  LT-${TAG}  ` }]);
    expect((await stock(own.stocks[0].id)).lot).toBe(`LT-${TAG}`);
    const detail = (await maker.call("GET", `/load-to-stock/${own.loadId}`)).body;
    expect(detail.rows[0].attrs.lot).toBe(`LT-${TAG}`);
    const edited = await maker.call("PUT", `/load-to-stock/${own.loadId}`, {
      expectedVersion: detail.version, docDate: detail.docDate, vendorId: vendor.id, mode: "NONE",
      rows: [{ id: detail.rows[0].id, sources: [{ purchaseLineId: detail.sources[0].purchaseLineId, pcs: 2, weightCt: "2" }], location: "Safe A", attrs: attrs({ lot: `LX-${TAG}` }), stockPrice: "100", salePrice: "200", photoIds: [] }],
    });
    expect(edited.status).toBe(200);
    expect((await stock(own.stocks[0].id)).lot).toBe(`LX-${TAG}`);
    const page = await svc.fromStock.fromStockLots({ q: `LX-${TAG}`, limit: 5 });
    expect(page.items.map((item: any) => [item.source, item.lot])).toEqual([["OWN_STOCK", `LX-${TAG}`]]);
  });

  const lotKeyOf = async (stockUuid: string) => (await h.ownerDb.$queryRaw<{ lot_key: string }[]>`SELECT "lot_key" FROM "inventory"."stock" WHERE "id" = ${stockUuid}::uuid`)[0].lot_key;

  it("IT-LOT-I01 stock/lots/available and stock/lots: one row per own lot with the on-hand sum, no cost or price; FIFO candidates; invalid key → 422", async () => {
    const lot = `LOT-I01-${TAG.slice(-4)}`;
    const older = await ownStocks([{ pcs: 2, weightCt: "1", lot }], "2081-02-01");
    const newer = await ownStocks([{ pcs: 3, weightCt: "1.5", lot }, { pcs: 1, weightCt: "0.5", lot }], "2081-02-03");
    // Owner 2026-11-21 (Q4): our stock is not merged this round — every stock is its own lot (OS + id).
    const key = await lotKeyOf(older.stocks[0].id);
    expect(key).toBe(`OS${older.stocks[0].id}`);
    expect(await lotKeyOf(newer.stocks[1].id)).toBe(`OS${newer.stocks[1].id}`);
    const real = invClient.createInventoryClient(new URL(internalUrl), masterToken);
    const measured: { queries: number; result: any } = await h.measured(() => real.lotsAvailable({ q: lot, limit: 51 }));
    expect(measured.queries).toBe(1); // N+1 budget: one statement for any number of lots
    expect(measured.result).toHaveLength(3);
    expect(measured.result.every((row: any) => row.merged === false && row.refCount === 1)).toBe(true);
    expect(measured.result.find((row: any) => row.lotKey === key)).toMatchObject({
      source: "OWN_STOCK", lot, pendingPcs: 2, pendingWeightCt: "1.000", ref: expect.objectContaining({ type: "LOAD", docNo: older.docNo, docDate: "2081-02-01" }),
      unitPrice: null, netUnitPrice: null, amount: null, vendor: null, currency: null,
    });
    // ADR-0058 D7: the lot carries its Sale Price (prefill of the Sale unit price) and nothing else priced: no cost, Stock Price or Stock ID.
    expect(measured.result.every((row: any) => row.salePrice === "200.00")).toBe(true);
    expect(JSON.stringify(measured.result)).not.toMatch(/unitCost|stockPrice|stockId/);
    // Search never matches a Stock ID (Q-LOT-10a).
    expect(await real.lotsAvailable({ q: older.stocks[0].stock_id, limit: 51 })).toEqual([]);
    const groups = await real.stockLots([key]);
    expect(groups).toEqual([{ lotKey: key, rows: [expect.objectContaining({ stockUuid: older.stocks[0].id, onHandPcs: 2, refDocDate: "2081-02-01", loadSyncing: false })] }]);
    await expect(real.stockLots([`ML${"a".repeat(32)}`])).rejects.toMatchObject({ status: 422 });
    // INV-20261121-002 H3: an impossible calendar date in the cursor is a clean 422, not a database error (500).
    const badCursor = Buffer.from(`2026-02-31|${key}`).toString("base64url");
    await expect(real.lotsAvailable({ cursor: badCursor, limit: 51 })).rejects.toMatchObject({ status: 422 });
    expect(await real.lotsAvailable({ cursor: Buffer.from(`2090-01-01|${key}`).toString("base64url"), q: lot, limit: 51 })).toHaveLength(3);
  });

  it("IT-LOT-I02 / I03 Reserve with an own-stock lot: holds per stock = the FIFO allocation, own allocation rows; a stock taken between the pre-read and the PUT → line error, nothing held", async () => {
    await approval.setApproval(prisma(), "reserve", false);
    const lot = `LOT-I02-${TAG.slice(-4)}`;
    const newer = await ownStocks([{ pcs: 6, weightCt: "3", lot }], "2081-03-02");
    const key = await lotKeyOf(newer.stocks[0].id);
    const saved = await svc.reserve.create(TAG, memoOutInput([line({}, 4, "2", { lotKey: key })]));
    const detail = await svc.reserve.get(saved.id);
    expect(detail.lines[0]).toMatchObject({ source: "OWN_STOCK", lotKey: key, ownStockId: null, stockId: null, allocated: true, stockPendingPcs: 6 });
    expect((await holds("reserve", saved.id)).map((hold: any) => [hold.stock_uuid, hold.pcs])).toEqual([[newer.stocks[0].id, 4]]);
    const allocs = await prisma().$queryRawUnsafe(`SELECT seq, own_stock_id::text AS own, pcs FROM "partner"."reserve_line_alloc" WHERE line_id = $1::uuid ORDER BY seq`, detail.lines[0].id);
    expect(allocs).toEqual([{ seq: 1, own: newer.stocks[0].id, pcs: 4 }]);
    expect(await headerOf("reserve", saved.id)).toMatchObject({ syncState: "IDLE" });
    // I03: another document takes the newer stock after the pre-read (simulated: on-hand → reserved) → refused, nothing held.
    (globalThis as any).__afterLots(async () => {
      await h.ownerDb.$executeRaw`UPDATE "inventory"."stock" SET "on_hand_pcs" = 0, "reserved_pcs" = "reserved_pcs" + 2 WHERE "id" = ${newer.stocks[0].id}::uuid`;
    });
    const raced = await failure(svc.reserve.create(TAG, memoOutInput([line({}, 1, "0.5", { lotKey: key })])));
    expect(raced).toMatchObject({ status: 409, code: "RESERVE_PENDING_SHORT" });
    expect((raced.fieldErrors as any[])[0]).toMatchObject({ path: "lines.0.pcs", code: "exceeds_pending" });
    expect(JSON.stringify(raced)).not.toContain(newer.stocks[0].stock_id);
    await h.ownerDb.$executeRaw`UPDATE "inventory"."stock" SET "on_hand_pcs" = 2, "reserved_pcs" = "reserved_pcs" - 2 WHERE "id" = ${newer.stocks[0].id}::uuid`;
    // Delete (auto-approved) releases every hold and the allocation rows.
    await svc.reserve.delete(TAG, saved.id, (await headerOf("reserve", saved.id)).version);
    expect(await holds("reserve", saved.id)).toEqual([]);
    await approval.setApproval(prisma(), "reserve", true);
  });

  it("IT-LOT-F1 two drafts naming the same own lot (5 pcs): the first approve holds it, the second is refused with PENDING_SHORT and writes no hold, no allocation, no status change", async () => {
    await approval.setApproval(prisma(), "memo-out", true);
    const lot = `LOT-F1-${TAG.slice(-4)}`;
    const own = await ownStocks([{ pcs: 5, weightCt: "2.5", lot }], "2081-04-01");
    const key = await lotKeyOf(own.stocks[0].id);
    const draftA = await svc.memoOut.create(TAG, memoOutInput([line({}, 5, "2.5", { lotKey: key })]));
    const draftB = await svc.memoOut.create(TAG, memoOutInput([line({}, 5, "2.5", { lotKey: key })]));
    expect(await holds("memo-out", draftB.id)).toEqual([]);
    for (const draft of [draftA, draftB]) await svc.memoOut.submit({ id: TAG, name: null }, draft.id, draft.version);
    await svc.memoOut.approve(TAG, draftA.id, draftA.version + 1);
    expect((await holds("memo-out", draftA.id)).map((hold: any) => hold.pcs)).toEqual([5]);
    const refused = await failure(svc.memoOut.approve(TAG, draftB.id, draftB.version + 1));
    expect(refused).toMatchObject({ status: 409, code: "MEMO_OUT_PENDING_SHORT" });
    expect(refused.details).toMatchObject({ lines: [{ index: 0, lotKey: key, availablePcs: 0, availableWeightCt: "0.000" }] });
    expect(await holds("memo-out", draftB.id)).toEqual([]);
    expect(await headerOf("memoOut", draftB.id)).toMatchObject({ status: "PENDING_APPROVAL", syncState: "IDLE" });
    const lineB = await prisma().memoOutLine.findFirstOrThrow({ where: { memoOutId: draftB.id } });
    expect(await prisma().$queryRawUnsafe(`SELECT id FROM "partner"."memo_out_line_alloc" WHERE line_id = $1::uuid`, lineB.id)).toEqual([]);
    expect((await stock(own.stocks[0].id))).toMatchObject({ on_hand_pcs: 0, memo_out_pcs: 5 });
    await approval.setApproval(prisma(), "memo-out", false);
  });

  it("NP-LS-P2-05 a sweep tick with nothing due drives nothing", async () => {
    expect(await sweep()).toBe(0);
  });
});
