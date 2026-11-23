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
import { GRANT } from "./support";

/**
 * IT-SC-M01 / IT-SC-M02 / UT-SC-M01 (queued payload) end to end: the REAL api-master documents (Memo Out, Memo Out Return,
 * Reserve) and hold saga talk to the REAL inventory internal routes, and the Stock Card is read through the HTTP app.
 * The date and customer reach the card on create, on a quantity edit (release PUT), on a metadata-only edit (PATCH), a PATCH
 * failure never fails the save, an old queued payload without the fields still works, and the backfill script fills documents
 * applied before the metadata existed (idempotent, skips documents without a hold document).
 */
const TAG = `sc-${randomUUID().slice(0, 8)}`;
const LOADS: string[] = [];

let h: Harness;
let fx: Awaited<ReturnType<typeof masterFixtures>>;
let vendor: { id: string; addressId: string };
let maker: Awaited<ReturnType<Harness["user"]>>;
let viewer: Awaited<ReturnType<Harness["user"]>>;
let server: ServerType;
let masterToken: string;
let invClient: any;
let calls: { op: string; body: any }[] = [];
let failPatch = false;
let svc: { memoOut: any; memoOutReturn: any; reserve: any; saga: any };
let schemas: any;
let approval: any;
let backfill: any;
let customer: { id: string; name: string; shipping: string; invoice: string };
let other: { id: string; name: string; shipping: string; invoice: string };
const prisma = () => h.master.prisma;

const attrs = (patch: Record<string, unknown> = {}) => ({ stoneCodeId: null, stoneCode: `SC-${TAG}`, stone: "Sapphire", shape: "Oval", size: "", color: "Blue", clarity: "", cutting: "", quality: "", lot: "L-OWN", cerType: "", cerNo: "", ...patch });
async function loadSetting(on: boolean) {
  await h.db.$executeRaw`UPDATE "inventory"."approval_setting" SET "require_approval" = ${on}, "version" = "version" + 1 WHERE "type" = 'load-to-stock'`;
}
let seq = 0;
async function ownStock(pcs: number, weightCt: string, docDate = "2026-11-10") {
  seq += 1;
  await loadSetting(false);
  const pu = await fx.purchase(vendor, [fx.line({ pcs, weightCt })]);
  const response = await maker.call("POST", "/load-to-stock", {
    docDate, vendorId: vendor.id, mode: "NONE",
    rows: [{ sources: [{ purchaseLineId: pu.lineIds[0], pcs, weightCt }], location: "Safe A", attrs: attrs({ stoneCode: `SC-${TAG}-${seq}` }), stockPrice: "100", salePrice: "200", photoIds: [] }],
  });
  expect(response.status).toBe(201);
  LOADS.push(response.body.id);
  const stock = await h.ownerDb.stock.findFirstOrThrow({ where: { load_id: response.body.id } });
  return { id: stock.id, stockId: stock.stock_id, cardKey: stock.card_key!, docNo: (await h.ownerDb.load_to_stock.findUniqueOrThrow({ where: { id: response.body.id } })).doc_no };
}
const money = { discount: { type: "NONE" as const, value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null };
const header = (patch: Record<string, unknown> = {}, who = customer) => ({
  docDate: "2026-11-18", dueDate: "2026-12-18", currency: "THB", exchangeRate: null, ref: "", documentNote: "", ...money,
  customerId: who.id, shippingAddressId: who.shipping, invoiceAddressId: who.invoice, ...patch,
});
const line = (item: { ownStockId?: string }, pcs: number, weightCt: string) => ({
  source: "MANUAL", stoneCodeId: null, stoneCode: "", stone: "x", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "",
  lot: "", location: "", cerType: "", cerNo: "", pcs, weightCt, priceUnit: "PER_CT", unitPrice: "500", discount: { type: "NONE", value: "0" }, itemNote: "", photoIds: [], ...item,
});
const memoOutInput = (lines: unknown[], patch: Record<string, unknown> = {}, who = customer) => schemas.createMemoOutSchema.parse({ ...header(patch, who), lines });
const holdDoc = (type: string, id: string) => h.ownerDb.stock_hold_document.findUniqueOrThrow({ where: { document_type_document_id: { document_type: type, document_id: id } } });
const day = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
async function card(cardKey: string) {
  const response = await viewer.call("GET", `/stock-card/cards/${cardKey}/transactions`);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body.items as any[];
}
async function newCustomer(name: string) {
  const id = randomUUID(); const shipping = randomUUID(); const invoice = randomUUID();
  const address = { position: 1, name: "SC", address: "2 Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true };
  const code = `SC${randomUUID().slice(0, 6)}`.toUpperCase();
  await prisma().customer.create({ data: { id, name, nameKey: name.toLowerCase(), code, codeKey: code.toLowerCase(), currencyCode: "THB", firstName: "It", email: "sc@example.test", createdBy: TAG, updatedBy: TAG,
    addresses: { create: [{ ...address, id: shipping, type: "SHIPPING" }, { ...address, id: invoice, type: "INVOICE" }] } } });
  return { id, name, shipping, invoice };
}

describe.runIf(canRun)("IT-SC-M master hold saga carries the Stock Card metadata", () => {
  beforeAll(async () => {
    h = await startHarness();
    fx = await masterFixtures(h, TAG);
    vendor = await fx.vendor(`SC Vendor ${TAG}`);
    maker = await h.user(["load-to-stock:VIEW", "load-to-stock:ADD", "load-to-stock:EDIT", "load-to-stock:DELETE", "load-to-stock:APPROVE"], { name: "SC Maker" });
    viewer = await h.user(GRANT, { name: "SC Viewer" });
    masterToken = randomBytes(32).toString("base64url");
    writeFileSync(join(h.dir, "master-inventory-token"), masterToken);
    const internalApp = createApp({ db: h.db, master: h.masterApi, logger: createLogger("silent"), auth: {} as never, trustedOrigins: new Set(), approvers: async () => [], storageRoot: join(h.dir, "inv2"),
      internal: { tokenDigest: createHash("sha256").update(masterToken).digest(), otherTokenDigest: createHash("sha256").update(h.token).digest() } });
    server = serve({ fetch: internalApp.app.fetch, port: 0, hostname: "127.0.0.1" });
    await new Promise((resolve) => server.once("listening", resolve));
    invClient = await masterModule("src/inventory-client/inventory-client");
    const real = invClient.createInventoryClient(new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}`), masterToken);
    invClient.setInventoryClient({
      batch: (ids: any, options: any) => real.batch(ids, options),
      putHolds: (type: string, id: string, body: any, options: any) => { calls.push({ op: `put:${type}`, body }); return real.putHolds(type, id, body, options); },
      patchMetadata: (type: string, id: string, body: any, options: any) => {
        calls.push({ op: `patch:${type}`, body });
        if (failPatch) return Promise.reject(new invClient.InventoryUnavailable("test"));
        return real.patchMetadata(type, id, body, options);
      },
      lotsAvailable: (input: any, options: any) => real.lotsAvailable(input, options),
      stockLots: (keys: any, options: any) => real.stockLots(keys, options),
    });
    const { ReserveService } = await masterModule("src/trade-document/reserve.service");
    const { MemoOutService } = await masterModule("src/trade-document/memo-out.service");
    const { MemoOutReturnService } = await masterModule("src/trade-document/memo-out-return.service");
    const { holdSaga } = await masterModule("src/trade-document/inventory-hold-saga");
    svc = { memoOut: new MemoOutService(), memoOutReturn: new MemoOutReturnService(), reserve: new ReserveService(), saga: holdSaga };
    schemas = await masterModule("src/trade-document/memo-schemas");
    backfill = await masterModule("src/scripts/stock-card-backfill");
    approval = await masterModule("test/partner-shared/approval");
    customer = await newCustomer(`SC Customer ${TAG}`);
    other = await newCustomer(`SC Other ${TAG}`);
    for (const type of ["reserve", "memo-out", "memo-out-return"]) await approval.setApproval(prisma(), type, false);
  }, 120_000);

  afterAll(async () => {
    if (!h) return;
    invClient?.setInventoryClient(null);
    for (const type of ["reserve", "memo-out", "memo-out-return"]) await approval.setApproval(prisma(), type, true).catch(() => undefined);
    await new Promise((resolve) => server.close(resolve));
    await loadSetting(true);
    for (const who of [customer, other]) {
      for (const table of ["memo_out_return", "memo_out", "reserve"]) await prisma().$executeRawUnsafe(`DELETE FROM "partner"."${table}" WHERE customer_id = $1::uuid`, who.id);
    }
    await prisma().$executeRawUnsafe(`DELETE FROM "partner"."inventory_sync_op"`);
    const stocks = (await h.ownerDb.stock.findMany({ where: { load_id: { in: LOADS } }, select: { id: true } })).map((row) => row.id);
    const docs = await h.ownerDb.stock_hold.findMany({ where: { stock_uuid: { in: stocks } }, select: { document_type: true, document_id: true } });
    for (const doc of docs) await h.ownerDb.stock_hold_document.deleteMany({ where: { document_type: doc.document_type, document_id: doc.document_id } });
    await h.ownerDb.stock_movement.deleteMany({ where: { stock_uuid: { in: stocks } } });
    for (const who of [customer, other]) await prisma().customer.delete({ where: { id: who.id } }).catch(() => undefined);
    await fx.cleanup(LOADS);
    await h.close();
  });

  it("IT-SC-M01 create sends the date and customer; the card shows them; a quantity edit and a date-only edit keep them current", async () => {
    const own = await ownStock(6, "6.000");
    calls = [];
    const out = await svc.memoOut.create(TAG, memoOutInput([line({ ownStockId: own.id }, 4, "4")]));
    const puts = calls.filter((call) => call.op === "put:memo-out");
    // acquire (no number yet) carries nothing; the release PUT with the number carries the date and the customer
    expect(puts[0].body.docDate).toBeUndefined();
    expect(puts[puts.length - 1].body).toMatchObject({ documentNo: out.docNo, docDate: "2026-11-18", party: { id: customer.id, name: customer.name } });
    expect(calls.filter((call) => call.op.startsWith("patch"))).toHaveLength(0);
    const row = await holdDoc("memo-out", out.id);
    expect([day(row.doc_date), row.party_id, row.party_name, row.document_no]).toEqual(["2026-11-18", customer.id, customer.name, out.docNo]);
    let items = await card(own.cardKey);
    expect(items.map((item) => [item.docType, item.docNo, item.docDate, item.accountName, item.outPcs ?? item.inPcs])).toEqual([
      ["load-to-stock", own.docNo, "2026-11-10", expect.stringContaining("SC Vendor"), 6], ["memo-out", out.docNo, "2026-11-18", customer.name, 4],
    ]);
    expect(items[1].stockId).toBeNull();

    // quantity edit (4 -> 3): release PUT carries the metadata again
    calls = [];
    let current = await svc.memoOut.update(TAG, out.id, out.version, memoOutInput([line({ ownStockId: own.id }, 3, "3")], { docDate: "2026-11-19" }));
    expect(calls.filter((call) => call.op === "put:memo-out").pop()!.body).toMatchObject({ docDate: "2026-11-19", party: { id: customer.id } });
    items = await card(own.cardKey);
    expect(items[1]).toMatchObject({ docDate: "2026-11-19", outPcs: 3, accountName: customer.name });

    // date-only edit: no quantity change, so no PUT; the saga sends one PATCH after the commit
    calls = [];
    current = await svc.memoOut.update(TAG, out.id, current.version, memoOutInput([line({ ownStockId: own.id }, 3, "3")], { docDate: "2026-11-25" }));
    expect(calls.map((call) => call.op)).toEqual(["patch:memo-out"]);
    expect(calls[0].body).toEqual({ docDate: "2026-11-25", party: { id: customer.id, name: customer.name } });
    expect((await card(own.cardKey))[1]).toMatchObject({ docDate: "2026-11-25", outPcs: 3 });

    // customer-only edit
    calls = [];
    current = await svc.memoOut.update(TAG, out.id, current.version, memoOutInput([line({ ownStockId: own.id }, 3, "3")], { docDate: "2026-11-25" }, other));
    expect(calls.map((call) => call.op)).toEqual(["patch:memo-out"]);
    expect((await card(own.cardKey))[1]).toMatchObject({ accountName: other.name, accountId: other.id });
    expect((await holdDoc("memo-out", out.id)).applied_revision).toBeGreaterThanOrEqual(2);

    // a PATCH failure never fails the save; the card keeps the older value until the next save repairs it
    failPatch = true;
    calls = [];
    try {
      current = await svc.memoOut.update(TAG, out.id, current.version, memoOutInput([line({ ownStockId: own.id }, 3, "3")], { docDate: "2026-11-27" }, other));
    } finally { failPatch = false; }
    expect(calls.map((call) => call.op)).toEqual(["patch:memo-out"]);
    expect((await prisma().memoOut.findUniqueOrThrow({ where: { id: out.id } })).docDate.toISOString().slice(0, 10)).toBe("2026-11-27");
    expect((await card(own.cardKey))[1].docDate).toBe("2026-11-25");
    current = await svc.memoOut.update(TAG, out.id, current.version, memoOutInput([line({ ownStockId: own.id }, 3, "3")], { docDate: "2026-11-27" }, other));
    expect((await card(own.cardKey))[1].docDate).toBe("2026-11-27");

    // delete: the stock returns, the row disappears
    await svc.memoOut.delete(TAG, out.id, current.version);
    expect((await card(own.cardKey)).map((item) => item.docType)).toEqual(["load-to-stock"]);
  });

  it("IT-SC-M01 Memo Out Return and Reserve: the return carries its own date and customer; a Reserve is not on the card; Memo-Stock-only documents make no metadata call", async () => {
    const own = await ownStock(5, "5.000");
    const out = await svc.memoOut.create(TAG, memoOutInput([line({ ownStockId: own.id }, 5, "5")], { docDate: "2026-11-12" }));
    const outstanding = await svc.memoOutReturn.outstanding({ customerId: customer.id, currency: "THB", limit: 50 });
    const item = outstanding.items.find((entry: any) => entry.memoOut.id === out.id);
    calls = [];
    const ret = await svc.memoOutReturn.create(TAG, schemas.createMemoOutReturnSchema.parse({ ...header({ docDate: "2026-11-20" }), lines: [{ ...line({}, 2, "2"), memoOutLineId: item.memoOutLineId, outstandingPcs: 5, outstandingWeightCt: "5" }] }));
    expect(calls.filter((call) => call.op === "put:memo-out-return").pop()!.body).toMatchObject({ documentNo: ret.docNo, docDate: "2026-11-20", party: { id: customer.id, name: customer.name } });
    const reserve = await svc.reserve.create(TAG, memoOutInput([line({ ownStockId: own.id }, 1, "1")], { docDate: "2026-11-21" }));
    const items = await card(own.cardKey);
    expect(items.map((entry) => [entry.docType, entry.docDate, entry.inPcs, entry.outPcs, entry.balancePcs])).toEqual([
      ["load-to-stock", "2026-11-10", 5, null, 5],
      ["memo-out", "2026-11-12", null, 5, 0],
      ["memo-out-return", "2026-11-20", 2, null, 2],
    ]);
    expect(items[2]).toMatchObject({ accountName: customer.name, accountId: customer.id, docNo: ret.docNo });
    expect((await holdDoc("reserve", reserve.id)).doc_date?.toISOString().slice(0, 10)).toBe("2026-11-21");
    expect(items.some((entry) => entry.docType === "reserve")).toBe(false);
  });

  it("UT-SC-M01 a queued op payload stored before the metadata existed is sent without docDate and party", async () => {
    const own = await ownStock(3, "3.000");
    const documentId = randomUUID();
    const holds = [{ stockUuid: own.id, pcs: 1, weightCt: "1.000" }];
    // a RELEASE op as an older master would have stored it (no `meta`), re-driven by the sweep
    await prisma().$executeRaw`INSERT INTO "partner"."inventory_sync_op" (id, document_type, document_id, stage, state, revision, request_hash, payload, attempts, next_attempt_at, created_by)
      VALUES (${randomUUID()}::uuid, 'memo-out', ${documentId}::uuid, 'RELEASE', 'PREPARED', 1, ${"0".repeat(64)}, ${JSON.stringify({ holds, old: [], docNo: "MO-OLD" })}::jsonb, 0, now() - interval '1 second', 'test')`;
    calls = [];
    await prisma().$executeRawUnsafe(`UPDATE "partner"."inventory_sync_op" SET next_attempt_at = now() - interval '1 second' WHERE state = 'PREPARED'`);
    await svc.saga.sweep();
    const put = calls.find((call) => call.op === "put:memo-out" && call.body.documentNo === "MO-OLD");
    expect(put?.body).toEqual({ revision: 1, documentNo: "MO-OLD", holds });
    expect(Object.keys(put!.body)).not.toContain("docDate");
    expect(Object.keys(put!.body)).not.toContain("party");
    await h.ownerDb.stock_hold_document.deleteMany({ where: { document_type: "memo-out", document_id: documentId } });
  });

  it("IT-SC-M02 backfill: fills documents applied before the metadata existed, a second run changes nothing, a document without a hold document is skipped, dry run sends nothing", async () => {
    const own = await ownStock(4, "4.000");
    const out = await svc.memoOut.create(TAG, memoOutInput([line({ ownStockId: own.id }, 2, "2")], { docDate: "2026-11-15" }));
    const memoOnly = await svc.memoOut.create(TAG, memoOutInput([line({ ownStockId: own.id }, 1, "1")], { docDate: "2026-11-16" }, other));
    // As before the migration: the hold documents exist but carry no date or account
    await h.ownerDb.stock_hold_document.updateMany({ where: { document_id: { in: [out.id, memoOnly.id] } }, data: { doc_date: null, party_id: null, party_name: "" } });
    expect((await card(own.cardKey)).slice(1).map((item) => item.accountName)).toEqual(["", ""]);
    // one document whose hold document is unknown to inventory (404)
    await h.ownerDb.stock_hold_document.deleteMany({ where: { document_id: memoOnly.id } });
    const lines: string[] = [];

    calls = [];
    const dry = await backfill.backfillStockCardMetadata({ dryRun: true, delayMs: 0, log: (text: string) => lines.push(text) });
    expect(calls.filter((call) => call.op.startsWith("patch"))).toHaveLength(0);
    expect(dry.find((entry: any) => entry.type === "memo-out").seen).toBeGreaterThanOrEqual(2);
    expect((await holdDoc("memo-out", out.id)).doc_date).toBeNull();

    const first = await backfill.backfillStockCardMetadata({ delayMs: 0, log: (text: string) => lines.push(text) });
    const memoOut = first.find((entry: any) => entry.type === "memo-out");
    expect(memoOut).toMatchObject({ failed: 0 });
    expect(memoOut.patched).toBeGreaterThanOrEqual(1);
    expect(memoOut.skipped).toBeGreaterThanOrEqual(1);
    const row = await holdDoc("memo-out", out.id);
    expect([day(row.doc_date), row.party_id, row.party_name]).toEqual(["2026-11-15", customer.id, customer.name]);
    expect((await card(own.cardKey))[1]).toMatchObject({ docDate: "2026-11-15", accountName: customer.name });
    const before = JSON.stringify(await h.ownerDb.stock_hold_document.findMany({ where: { document_id: out.id } }));
    const second = await backfill.backfillStockCardMetadata({ delayMs: 0, log: (text: string) => lines.push(text) });
    expect(second.find((entry: any) => entry.type === "memo-out").failed).toBe(0);
    expect(JSON.stringify(await h.ownerDb.stock_hold_document.findMany({ where: { document_id: out.id } }))).toBe(before);
    // counts only in the output: no customer names
    expect(lines.join("\n")).not.toContain(customer.name);
    expect(lines.some((text) => /^stock-card:backfill memo-out: seen \d+, patched \d+/.test(text))).toBe(true);
  });
});
