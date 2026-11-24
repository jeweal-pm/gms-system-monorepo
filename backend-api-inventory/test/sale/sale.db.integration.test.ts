/* eslint-disable @typescript-eslint/no-explicit-any -- api-master services are loaded untyped (separate tsconfig with decorators) */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MasterUnavailable } from "../../src/platform/master-client";
import { sweepAll } from "../../src/platform/sync/saga";
import { canRun, masterFixtures, masterModule, startHarness, type Harness } from "../support/harness";
import { cleanupLoads, seedLoad } from "../stock-card/support";

/**
 * Sale end to end on PostgreSQL with the REAL master internal API (sale SA rev 1 testing.md, BE-SL-003…007):
 * IT-SL-B01 (create ON), B02 (create OFF + refusal), B03 (approve both sources + notification + Approve Center),
 * B04 (approve short), B05 (crash between steps), B06 (busy / stale / deleted / status / revise limit), B07 (edit /
 * delete auto-approved, SALE_IN_USE), B08 (restore), B09 (approval setting), B10 (photos), B11 (HTTP), B12 (N+1
 * budgets), B13 (notifications), plus the reads (options, next-number, reserve-lines, list).
 * Opt-in: INVENTORY_TEST_DATABASE_URL (the disposable database with auth, partner and inventory migrated).
 */
const TAG = `sl-it-${randomUUID().slice(0, 8)}`;
const YEAR = 85;
const SALES: string[] = [];
const OWN_LOADS: string[] = [];
const MAKER = ["sale:VIEW", "sale:ADD", "sale:EDIT", "sale:DELETE", "approval-setup:VIEW", "approval-setup:EDIT"];
const APPROVER = ["sale:VIEW", "sale:APPROVE", "approval-setup:VIEW"];

type User = Awaited<ReturnType<Harness["user"]>>;
let h: Harness;
let fx: Awaited<ReturnType<typeof masterFixtures>>;
let prisma: any;
let receive: any;
let reserve: any;
let createMemoOutSchema: any;
let sendAndApprove: (service: any, actor: string, id: string, version: number) => Promise<unknown>;
let setMasterApproval: (prisma: any, type: string, on: boolean) => Promise<void>;
let maker: User;
let approver: User;
let viewer: User;
let stranger: User;
const vendor = { id: randomUUID(), addressId: randomUUID() };
const customer = { id: randomUUID(), shipping: randomUUID(), invoice: randomUUID() };
const other = { id: randomUUID(), shipping: randomUUID(), invoice: randomUUID() };

const money = { discount: { type: "NONE" as const, value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [] as unknown[], labor: null };
const receiveLine = (patch: Record<string, unknown> = {}) => ({
  source: "MANUAL" as const, stoneCode: "", stone: "Ruby", shape: "Oval", size: "", color: "Red", clarity: "", cutting: "", quality: "",
  lot: `SL-${TAG.slice(-4)}`, cerType: "GIA", cerNo: "C-1", pcs: 10, weightCt: "5", priceUnit: "PER_CT", unitPrice: "1000",
  discount: { type: "NONE" as const, value: "0" }, itemNote: "", photoIds: [] as string[], ...patch,
});
const stockLine = (memoStockId: string, pcs: number, weightCt: string) => ({
  source: "MANUAL" as const, stoneCodeId: null, stoneCode: "", stone: "x", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "",
  lot: "", location: "", cerType: "", cerNo: "", pcs, weightCt, priceUnit: "PER_PCS" as const, unitPrice: "2500", discount: { type: "NONE" as const, value: "0" },
  itemNote: "", photoIds: [] as string[], memoStockId,
});

async function setting(on: boolean) {
  await h.ownerDb.$executeRaw`UPDATE "inventory"."approval_setting" SET "require_approval" = ${on}, "version" = "version" + 1 WHERE "type" = 'sale'`;
}
/** Approved Memo Receive → its Memo Stock items (pending = received). */
async function memoStock(lines: Record<string, unknown>[]) {
  const saved = await receive.create(TAG, { docDate: "2026-11-01", dueDate: "2026-12-01", currency: "THB", exchangeRate: null, ref: "", documentNote: "", ...money, lines, vendorId: vendor.id, addressId: vendor.addressId });
  await sendAndApprove(receive, TAG, saved.id, saved.version);
  return prisma.memoStock.findMany({ where: { memoReceiveId: saved.id }, orderBy: { stockId: "asc" } }) as Promise<{ id: string; stockId: string }[]>;
}
/** Approved Reserve of `customer` in THB over Memo Stock lines. */
async function approvedReserve(lines: { memoStockId: string; pcs: number; weightCt: string }[], patch: Record<string, unknown> = {}) {
  const input = createMemoOutSchema.parse({
    docDate: "2026-11-10", dueDate: "2026-12-10", currency: "THB", exchangeRate: null, ref: "", documentNote: "", ...money,
    lines: lines.map((line) => stockLine(line.memoStockId, line.pcs, line.weightCt)), customerId: customer.id, shippingAddressId: customer.shipping, invoiceAddressId: customer.invoice, ...patch,
  });
  await setMasterApproval(prisma, "reserve", true);
  const saved = await reserve.create(TAG, input);
  await sendAndApprove(reserve, TAG, saved.id, saved.version);
  const rows = await prisma.reserveLine.findMany({ where: { reserveId: saved.id }, orderBy: { position: "asc" } });
  return { id: saved.id as string, docNo: saved.docNo as string, lineIds: rows.map((row: { id: string }) => row.id) as string[] };
}
const buckets = async (id: string) => {
  const s = await prisma.memoStock.findUniqueOrThrow({ where: { id } });
  return { pending: s.pendingPcs, reserved: s.reservedPcs, sold: s.soldPcs, soldWeight: s.soldWeightCt.toFixed(3) };
};
const soldOf = async (lineId: string) => {
  const l = await prisma.reserveLine.findUniqueOrThrow({ where: { id: lineId } });
  return [l.soldPcs, l.soldWeightCt.toFixed(3)];
};
const rLine = (reserveLineId: string, pcs: number, weightCt: string, patch: Record<string, unknown> = {}) => ({ source: "RESERVE", reserveLineId, pcs, weightCt, unitPrice: "3000", discount: { type: "NONE", value: "0" }, photoIds: [], ...patch });
const sLine = (memoStockId: string, pcs: number, weightCt: string, patch: Record<string, unknown> = {}) => ({ source: "STOCK", memoStockId, pcs, weightCt, unitPrice: "2000", discount: { type: "NONE", value: "0" }, photoIds: [], ...patch });
const body = (lines: unknown[], patch: Record<string, unknown> = {}) => ({
  docDate: "2026-11-19", dueDate: "2026-12-19", customerId: customer.id, shippingAddressId: customer.shipping, invoiceAddressId: customer.invoice,
  currency: "THB", exchangeRate: null, ref: TAG, documentNote: "", ...money, lines, ...patch,
});
async function created(payload: unknown, user = maker) {
  const response = await user.call("POST", "/sale", payload);
  if (response.body.id) SALES.push(response.body.id);
  return response;
}
const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const form = (bytes: Uint8Array, type = "image/png") => { const data = new FormData(); data.append("file", new Blob([bytes], { type }), "x.png"); return data; };

describe.runIf(canRun)("IT-SL sale on PostgreSQL", () => {
  beforeAll(async () => {
    h = await startHarness();
    fx = await masterFixtures(h, TAG);
    prisma = h.master.prisma;
    const { MemoReceiveService } = await masterModule("src/trade-document/memo-receive.service");
    const { ReserveService } = await masterModule("src/trade-document/reserve.service");
    ({ createMemoOutSchema } = await masterModule("src/trade-document/memo-schemas"));
    ({ sendAndApprove, setApproval: setMasterApproval } = await masterModule("test/partner-shared/approval"));
    receive = new MemoReceiveService();
    receive.clock = () => new Date(`20${YEAR}-06-01T03:00:00Z`);
    reserve = new ReserveService();
    await prisma.memoStockIdCounter.deleteMany({ where: { year: YEAR } });
    await prisma.vendor.create({ data: {
      id: vendor.id, name: `SL Inv Vendor ${TAG}`, nameKey: `sl inv vendor ${TAG}`, code: `SLV${TAG.slice(-5)}`.toUpperCase(), codeKey: `slv${TAG.slice(-5)}`, currencyCode: "THB", firstName: "It", email: "sl-it@example.test", createdBy: TAG, updatedBy: TAG,
      addresses: { create: [{ id: vendor.addressId, position: 1, name: "SL Vendor Co.", address: "1 Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true }] },
    } });
    for (const [c, n] of [[customer, "A"], [other, "B"]] as const) {
      const address = { position: 1, name: `SL Customer ${n}`, address: "2 Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true };
      await prisma.customer.create({ data: {
        id: c.id, name: `SL Inv Customer ${n} ${TAG}`, nameKey: `sl inv customer ${n} ${TAG}`.toLowerCase(), code: `SLC${n}${TAG.slice(-5)}`.toUpperCase(), codeKey: `slc${n}${TAG.slice(-5)}`.toLowerCase(),
        currencyCode: "THB", firstName: "It", email: "sl-it@example.test", createdBy: TAG, updatedBy: TAG,
        addresses: { create: [{ ...address, id: c.shipping, type: "SHIPPING" }, { ...address, id: c.invoice, type: "INVOICE" }] },
      } });
    }
    for (const type of ["memo-receive", "memo-out", "reserve"]) await setMasterApproval(prisma, type, true);
    maker = await h.user(MAKER, { name: "Sale Maker" });
    approver = await h.user(APPROVER, { name: "Sale Approver" });
    viewer = await h.user(["sale:VIEW"], { name: "Sale Viewer" });
    stranger = await h.user(["load-to-stock:VIEW"]);
    h.approverIds.push(approver.userId);
    await h.ownerDb.$executeRaw`UPDATE "inventory"."sale" SET "deleted_at" = now(), "deleted_by" = 'it' WHERE "status" IN ('PENDING_APPROVAL', 'REVISION_REQUESTED') AND "deleted_at" IS NULL`;
  }, 90_000);

  afterAll(async () => {
    if (!h) return;
    await setting(true);
    await h.ownerDb.sale.deleteMany({ where: { customer_id: { in: [customer.id, other.id] } } });
    await cleanupLoads(h, OWN_LOADS);
    await prisma.saleConsumption.deleteMany({ where: { saleId: { in: SALES } } });
    await prisma.reserve.deleteMany({ where: { customerId: { in: [customer.id, other.id] } } });
    await prisma.memoOut.deleteMany({ where: { customerId: { in: [customer.id, other.id] } } });
    await prisma.memoStock.deleteMany({ where: { vendorId: vendor.id } });
    await prisma.memoReceive.deleteMany({ where: { vendorId: vendor.id } });
    await prisma.customer.deleteMany({ where: { id: { in: [customer.id, other.id] } } });
    await prisma.vendor.deleteMany({ where: { id: vendor.id } });
    await prisma.memoStockIdCounter.deleteMany({ where: { year: YEAR } });
    await fx.cleanup();
    await h.close();
  });

  it("reads: options (customers, currencies, charge types), next-number preview, reserve-lines picker (customer + currency, exclude, keyset) — VIEW only", async () => {
    const options = await viewer.call("GET", `/sale/options?customerId=${customer.id}`);
    expect(options.status).toBe(200);
    expect(options.body).toMatchObject({ currencies: expect.arrayContaining(["THB"]), companyCurrency: "THB", chargeTypes: expect.arrayContaining(["SHIPPING"]), numbering: { configured: expect.any(Boolean) } });
    expect(options.body.customers.map((row: { id: string }) => row.id)).toContain(customer.id);
    expect(options.response.headers.get("cache-control")).toBe("no-store");
    expect((await viewer.call("GET", "/sale/next-number?docDate=2026-11-19")).body).toEqual({ docNo: expect.any(String) });
    const [a, b] = await memoStock([receiveLine({ pcs: 4, weightCt: "2" }), receiveLine({ pcs: 4, weightCt: "2" })]);
    const rs = await approvedReserve([{ memoStockId: a.id, pcs: 2, weightCt: "1" }, { memoStockId: b.id, pcs: 2, weightCt: "1" }]);
    const mine = (items: { reserveId: string; reserveLineId: string }[]) => items.filter((row) => row.reserveId === rs.id).map((row) => row.reserveLineId);
    const all = await viewer.call("GET", `/sale/reserve-lines?customerId=${customer.id}&currency=THB&q=${encodeURIComponent(rs.docNo)}`);
    expect(mine(all.body.items)).toEqual(rs.lineIds);
    expect(all.body.items.find((row: { reserveLineId: string }) => row.reserveLineId === rs.lineIds[0])).toMatchObject({ reserveNo: rs.docNo, memoStockId: a.id, openPcs: 2, openWeightCt: "1.000", netUnitPrice: expect.any(String) });
    expect(mine((await viewer.call("GET", `/sale/reserve-lines?customerId=${customer.id}&currency=THB&q=${encodeURIComponent(rs.docNo)}&exclude=${rs.lineIds[0]}`)).body.items)).toEqual([rs.lineIds[1]]);
    expect(mine((await viewer.call("GET", `/sale/reserve-lines?customerId=${customer.id}&currency=THB&q=${encodeURIComponent(rs.docNo)}&exclude=${rs.lineIds[0]}&exclude=${rs.lineIds[1]}`)).body.items)).toEqual([]);
    expect(mine((await viewer.call("GET", `/sale/reserve-lines?customerId=${other.id}&currency=THB`)).body.items)).toEqual([]);
    expect(mine((await viewer.call("GET", `/sale/reserve-lines?customerId=${customer.id}&currency=USD`)).body.items)).toEqual([]);
    expect((await viewer.call("GET", `/sale/reserve-lines?currency=THB`)).status).toBe(422);
    expect((await stranger.call("GET", `/sale/reserve-lines?customerId=${customer.id}&currency=THB`)).status).toBe(403);
    expect((await stranger.call("GET", "/sale/options")).status).toBe(403);
  });

  it("IT-SL-B01 create ON → DRAFT, number issued, nothing applied, ≤ 2 master calls; Save checks open / pending without holding (exceeds → VALIDATION_ERROR, unavailable → SALE_REFERENCE_INVALID)", async () => {
    await setting(true);
    const [a, b] = await memoStock([receiveLine({ pcs: 5, weightCt: "2.5" }), receiveLine({ pcs: 5, weightCt: "2.5" })]);
    const rs = await approvedReserve([{ memoStockId: a.id, pcs: 3, weightCt: "1.5" }]);
    const before = [await buckets(a.id), await buckets(b.id)];
    const saved = await h.measured(() => created(body([rLine(rs.lineIds[0], 2, "1"), sLine(b.id, 1, "0.5", { itemNote: "n" })])));
    expect(saved.result.status).toBe(201);
    expect(saved.result.body).toMatchObject({ status: "DRAFT", version: 1, docNo: expect.any(String) });
    expect(saved.master).toEqual(["POST /internal/v1/inventory/sale/prepare", "POST /internal/v1/inventory/document-numbering/resolve"]);
    expect([await buckets(a.id), await buckets(b.id)]).toEqual(before);
    const detail = await maker.call("GET", `/sale/${saved.result.body.id}`);
    expect(detail.body).toMatchObject({
      status: "DRAFT", customer: { name: `SL Inv Customer A ${TAG}` }, currency: "THB", exchangeRate: null, approval: { requireApproval: true, autoApproved: false },
      flow: { canEdit: true, canDelete: true, canSubmit: true, canRestore: false, usedBy: null }, syncing: false, deleted: null,
      totals: { lineCount: 2, pcs: 3, weightCt: "1.500", subtotal: "4000.00", grandTotal: "4000.00" },
    });
    expect(detail.body.lines).toEqual([
      expect.objectContaining({ position: 1, source: "RESERVE", reserveLineId: rs.lineIds[0], memoStockId: a.id, stockId: a.stockId, lotKey: null, sourceDoc: { type: "RESERVE", id: rs.id, docNo: rs.docNo }, capPcs: 3, capWeightCt: "1.500", priceUnit: "PER_CT", amount: "3000.00" }),
      expect.objectContaining({ position: 2, source: "STOCK", reserveLineId: null, memoStockId: b.id, sourceDoc: expect.objectContaining({ type: "MEMO_RECEIVE" }), capPcs: 5, itemNote: "n", amount: "1000.00" }),
    ]);
    const exceeds = await created(body([rLine(rs.lineIds[0], 4, "1")]));
    expect(exceeds.status).toBe(422);
    expect(exceeds.body.error).toMatchObject({ code: "VALIDATION_ERROR", details: { fieldErrors: [{ path: "lines.0.pcs", code: "exceeds_open", params: { availablePcs: 3, availableWeightCt: "1.500" } }] } });
    const otherCustomer = await created(body([rLine(rs.lineIds[0], 1, "0.5")], { customerId: other.id, shippingAddressId: other.shipping, invoiceAddressId: other.invoice }));
    expect(otherCustomer.body.error).toMatchObject({ code: "SALE_REFERENCE_INVALID", details: { fieldErrors: [{ path: "lines.0.reference", code: "unavailable" }] } });
    const gone = await created(body([sLine(randomUUID(), 1, "0.5")]));
    expect(gone.body.error.code).toBe("SALE_REFERENCE_INVALID");
    const badAddress = await created(body([sLine(b.id, 1, "0.5")], { shippingAddressId: customer.invoice }));
    expect(badAddress.body.error).toMatchObject({ code: "VALIDATION_ERROR", details: { fieldErrors: [{ path: "shippingAddressId", code: "invalid_reference" }] } });
    const list = await viewer.call("GET", `/sale?q=${encodeURIComponent(saved.result.body.docNo)}`);
    expect(list.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: saved.result.body.id, status: "DRAFT", customerName: `SL Inv Customer A ${TAG}`, lineCount: 2, grandTotal: "4000.00", currency: "THB" })]));
  });

  it("IT-SL-B03/B13 approval ON: Submit notifies approvers (not the actor), Approve applies BOTH sources in one master call (Reserve line sold, reserved → sold, pending → sold), notifies the creator; Approve Center count", async () => {
    await setting(true);
    const [a, b] = await memoStock([receiveLine({ pcs: 6, weightCt: "3" }), receiveLine({ pcs: 6, weightCt: "3" })]);
    const rs = await approvedReserve([{ memoStockId: a.id, pcs: 4, weightCt: "2" }]);
    const saved = await created(body([rLine(rs.lineIds[0], 3, "1.5"), sLine(b.id, 2, "1")]));
    const pushes: unknown[] = [];
    const close = h.hub.open({ userId: approver.userId, push: (event) => pushes.push(event), close: () => undefined });
    const sent = await maker.call("POST", `/sale/${saved.body.id}/submit`, { expectedVersion: 1 });
    expect(sent.body).toMatchObject({ status: "PENDING_APPROVAL", version: 2, submittedAt: expect.any(String) });
    expect(pushes).toEqual([{ id: expect.any(String), type: "approval.pending", documentType: "sale" }]);
    const inbox = await approver.call("GET", "/notifications");
    expect(inbox.body.items[0]).toMatchObject({ type: "approval.pending", documentType: "sale", documentId: saved.body.id, docNo: saved.body.docNo, summary: { partyName: `SL Inv Customer A ${TAG}`, currency: "THB" } });
    expect((await maker.call("GET", "/notifications")).body.items.find((item: { documentId: string }) => item.documentId === saved.body.id)).toBeUndefined();
    const summary = await approver.call("GET", "/approval/summary");
    expect(summary.body.items).toEqual(expect.arrayContaining([{ type: "sale", count: expect.any(Number) }]));
    expect((await maker.call("GET", "/approval/summary")).body.items).toEqual([]);
    const pending = await approver.call("GET", `/approval/pending?type=sale&q=${encodeURIComponent(saved.body.docNo)}`);
    expect(pending.body.items).toEqual([expect.objectContaining({ id: saved.body.id, partyName: `SL Inv Customer A ${TAG}`, totalPcs: 5, value: "6500.00", currency: "THB", revisionCount: 0 })]);
    expect((await maker.call("GET", "/approval/pending?type=sale")).status).toBe(403);
    expect((await maker.call("POST", `/sale/${saved.body.id}/approve`, { expectedVersion: 2 })).status).toBe(403);
    expect((await maker.call("PUT", `/sale/${saved.body.id}`, { ...body([sLine(b.id, 1, "0.5")]), expectedVersion: 2 })).body.error).toMatchObject({ code: "SALE_STATUS_INVALID", details: { status: "PENDING_APPROVAL" } });
    const approved = await h.measured(() => approver.call("POST", `/sale/${saved.body.id}/approve`, { expectedVersion: 2 }));
    expect(approved.result.body).toMatchObject({ status: "APPROVED", version: 3 });
    expect(approved.master).toEqual([`PUT /internal/v1/inventory/sale-consumptions/${saved.body.id}`]);
    expect(await soldOf(rs.lineIds[0])).toEqual([3, "1.500"]);
    expect(await buckets(a.id)).toMatchObject({ pending: 2, reserved: 1, sold: 3 });
    expect(await buckets(b.id)).toMatchObject({ pending: 4, reserved: 0, sold: 2 });
    const creatorInbox = await maker.call("GET", "/notifications");
    expect(creatorInbox.body.items[0]).toMatchObject({ type: "document.approved", documentType: "sale", documentId: saved.body.id });
    const detail = await viewer.call("GET", `/sale/${saved.body.id}`);
    expect(detail.body).toMatchObject({ status: "APPROVED", approvedBy: approver.userId, flow: { canEdit: false, canDelete: false, canSubmit: false }, approval: { autoApproved: false } });
    // An approval-ON Sale is final (Q-SL-16): no edit / delete.
    expect((await maker.call("POST", `/sale/${saved.body.id}/delete`, { expectedVersion: 3 })).body.error).toMatchObject({ code: "SALE_STATUS_INVALID", details: { status: "APPROVED" } });
    // The Reserve is now "used" in master (ADR-0050 D4 amendment) and reserve.get shows the sold quantity.
    const reserveDetail = await reserve.get(rs.id);
    expect(reserveDetail.lines[0]).toMatchObject({ soldPcs: 3, soldWeightCt: "1.500" });
    close?.();
  });

  it("IT-SL-B04 concurrent approvals of one Reserve line: one APPROVED, the other SALE_SOURCE_SHORT with the row error, back to PENDING_APPROVAL, nothing applied twice", async () => {
    await setting(true);
    const [a] = await memoStock([receiveLine({ pcs: 4, weightCt: "2" })]);
    const rs = await approvedReserve([{ memoStockId: a.id, pcs: 2, weightCt: "1" }]);
    const ids: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      const saved = await created(body([rLine(rs.lineIds[0], 2, "1")]));
      await maker.call("POST", `/sale/${saved.body.id}/submit`, { expectedVersion: 1 });
      ids.push(saved.body.id);
    }
    const results = await Promise.all(ids.map((id) => approver.call("POST", `/sale/${id}/approve`, { expectedVersion: 2 })));
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const refused = results.find((result) => result.status === 409)!;
    expect(refused.body.error).toMatchObject({ code: "SALE_SOURCE_SHORT", details: { fieldErrors: expect.arrayContaining([{ path: "lines.0.pcs", code: "exceeds_open", params: { availablePcs: 0, availableWeightCt: "0.000" } }]) } });
    const refusedId = ids[results.indexOf(refused)];
    expect((await viewer.call("GET", `/sale/${refusedId}`)).body).toMatchObject({ status: "PENDING_APPROVAL", syncing: false, version: 3 });
    expect(await soldOf(rs.lineIds[0])).toEqual([2, "1.000"]);
    expect(await buckets(a.id)).toMatchObject({ pending: 2, reserved: 0, sold: 2 });
    // The refused Sale can be sent back and rejected (Revise once, then Reject).
    const revised = await approver.call("POST", `/sale/${refusedId}/request-revision`, { expectedVersion: 3, note: "fix rows" });
    expect(revised.body).toMatchObject({ status: "REVISION_REQUESTED", version: 4 });
    expect((await maker.call("GET", "/notifications")).body.items[0]).toMatchObject({ type: "document.revision_requested", documentType: "sale", summary: expect.objectContaining({ reason: "fix rows" }) });
  });

  it("IT-SL-B02 approval OFF: Save applies at once (APPROVED, auto); a master refusal deletes the provisional Sale (never listed) and returns the row errors", async () => {
    await setting(false);
    const [a] = await memoStock([receiveLine({ pcs: 3, weightCt: "1.5" })]);
    const saved = await created(body([sLine(a.id, 2, "1")]));
    expect(saved.status).toBe(201);
    expect(saved.body).toMatchObject({ status: "APPROVED", version: 1 });
    expect(await buckets(a.id)).toMatchObject({ pending: 1, sold: 2 });
    expect((await viewer.call("GET", `/sale/${saved.body.id}`)).body).toMatchObject({ status: "APPROVED", approval: { autoApproved: true, requireApproval: false }, flow: { canEdit: false, canDelete: false } });
    expect((await maker.call("GET", `/sale/${saved.body.id}`)).body.flow).toMatchObject({ canEdit: true, canDelete: true, canSubmit: false });
    // A race between Save's check and the apply: master refuses → provisional deleted.
    const original = h.masterApi.salePrepare.bind(h.masterApi);
    const spy = vi.spyOn(h.masterApi, "salePrepare").mockImplementation(async (input, options) => {
      const prepared = await original(input, options);
      return { ...prepared, memoStocks: prepared.memoStocks.map((item) => ({ ...item, pendingPcs: 9, pendingWeightCt: "9.000" })) };
    });
    try {
      const refused = await maker.call("POST", "/sale", body([sLine(a.id, 2, "1")], { ref: `race-${TAG}` }));
      expect(refused.status).toBe(409);
      expect(refused.body.error).toMatchObject({ code: "SALE_SOURCE_SHORT", details: { fieldErrors: expect.arrayContaining([expect.objectContaining({ path: "lines.0.pcs", code: "exceeds_pending" })]) } });
    } finally {
      spy.mockRestore();
    }
    expect(await h.ownerDb.sale.count({ where: { ref: `race-${TAG}` } })).toBe(0);
    expect(await buckets(a.id)).toMatchObject({ pending: 1, sold: 2 });
  });

  it("IT-LOT-I04 Sale lot line (OFF): master allocates the lot FIFO, inventory copies it into sale_line_alloc; detail shows lotKey / allocated, never a Stock ID; edit re-allocates; delete releases", async () => {
    await setting(false);
    const lot = `SLLOT-${TAG.slice(-4)}`;
    const items = await memoStock([receiveLine({ lot, cerNo: "", pcs: 2, weightCt: "1" }), receiveLine({ lot, cerNo: "", pcs: 3, weightCt: "1.5" })]);
    const key = (await prisma.memoStock.findUniqueOrThrow({ where: { id: items[0].id } })).lotKey as string;
    expect((await prisma.memoStock.findUniqueOrThrow({ where: { id: items[1].id } })).lotKey).toBe(key);
    const lotLine = (pcs: number, weightCt: string, patch: Record<string, unknown> = {}) => ({ source: "STOCK", lotKey: key, pcs, weightCt, unitPrice: "2000", discount: { type: "NONE", value: "0" }, photoIds: [], ...patch });
    const saved = await created(body([lotLine(3, "1.5")]));
    expect(saved.body.status).toBe("APPROVED");
    const detail = await maker.call("GET", `/sale/${saved.body.id}`);
    // A lot line has no single Stock ID (""); the per-stock allocation stays server-side.
    expect(detail.body.lines[0]).toMatchObject({ source: "STOCK", lotKey: key, memoStockId: null, stockId: "", allocated: true, lot, capPcs: 5 });
    const allocs = async () => h.ownerDb.$queryRaw<{ seq: number; memo_stock_id: string; stock_id: string; pcs: number }[]>`SELECT a."seq", a."memo_stock_id"::text AS "memo_stock_id", a."stock_id", a."pcs" FROM "inventory"."sale_line_alloc" a JOIN "inventory"."sale_line" l ON l."id" = a."sale_line_id" WHERE l."sale_id" = ${saved.body.id}::uuid ORDER BY a."seq"`;
    expect(await allocs()).toEqual([{ seq: 1, memo_stock_id: items[0].id, stock_id: items[0].stockId, pcs: 2 }, { seq: 2, memo_stock_id: items[1].id, stock_id: items[1].stockId, pcs: 1 }]);
    expect(await buckets(items[0].id)).toMatchObject({ pending: 0, sold: 2 });
    const edited = await maker.call("PUT", `/sale/${saved.body.id}`, { ...body([lotLine(1, "0.5", { id: detail.body.lines[0].id })]), expectedVersion: 1 });
    expect(edited.body).toMatchObject({ status: "APPROVED", version: 2 });
    expect((await allocs()).map((row) => [row.memo_stock_id, row.pcs])).toEqual([[items[0].id, 1]]);
    expect(await buckets(items[1].id)).toMatchObject({ pending: 3, sold: 0 });
    const short = await maker.call("PUT", `/sale/${saved.body.id}`, { ...body([lotLine(9, "0", { id: detail.body.lines[0].id })]), expectedVersion: 2 });
    expect(short.status).toBeGreaterThanOrEqual(400);
    const deleted = await maker.call("POST", `/sale/${saved.body.id}/delete`, { expectedVersion: 2 });
    expect(deleted.status).toBe(200);
    expect(await allocs()).toEqual([]);
    expect(await buckets(items[0].id)).toMatchObject({ pending: 2, sold: 0 });
  });

  it("IT-SL-B07 auto-approved edit / delete until used: edit re-applies the delta; delete releases everything; after a Purchase took a sold quantity → SALE_IN_USE, nothing changes", async () => {
    await setting(false);
    const [a, b] = await memoStock([receiveLine({ pcs: 6, weightCt: "3" }), receiveLine({ pcs: 6, weightCt: "3" })]);
    const rs = await approvedReserve([{ memoStockId: a.id, pcs: 4, weightCt: "2" }]);
    const saved = await created(body([rLine(rs.lineIds[0], 2, "1"), sLine(b.id, 2, "1")]));
    expect(saved.body.status).toBe("APPROVED");
    const detail = await maker.call("GET", `/sale/${saved.body.id}`);
    expect(detail.body.lines[0]).toMatchObject({ capPcs: 4, capWeightCt: "2.000" }); // own applied quantity counts back
    const lines = detail.body.lines as { id: string }[];
    const edited = await maker.call("PUT", `/sale/${saved.body.id}`, { ...body([rLine(rs.lineIds[0], 3, "1.5", { id: lines[0].id }), sLine(b.id, 1, "0.5", { id: lines[1].id })]), expectedVersion: 1 });
    expect(edited.body).toMatchObject({ status: "APPROVED", version: 2 });
    expect(await soldOf(rs.lineIds[0])).toEqual([3, "1.500"]);
    expect(await buckets(a.id)).toMatchObject({ reserved: 1, sold: 3 });
    expect(await buckets(b.id)).toMatchObject({ pending: 5, sold: 1 });
    expect((await maker.call("GET", `/sale/${saved.body.id}`)).body.lines.map((line: { id: string; pcs: number }) => [line.id, line.pcs])).toEqual([[lines[0].id, 3], [lines[1].id, 1]]);
    await prisma.$executeRawUnsafe(`UPDATE "partner"."memo_stock" SET purchased_pcs = 1, purchased_weight_ct = 0.5 WHERE id = '${b.id}'`);
    const used = await maker.call("POST", `/sale/${saved.body.id}/delete`, { expectedVersion: 2 });
    expect(used.status).toBe(409);
    expect(used.body.error).toMatchObject({ code: "SALE_IN_USE", details: { stockIds: [b.stockId] } });
    expect((await maker.call("GET", `/sale/${saved.body.id}`)).body).toMatchObject({ status: "APPROVED", deleted: null, syncing: false, version: 3 });
    await prisma.$executeRawUnsafe(`UPDATE "partner"."memo_stock" SET purchased_pcs = 0, purchased_weight_ct = 0 WHERE id = '${b.id}'`);
    const removed = await maker.call("POST", `/sale/${saved.body.id}/delete`, { expectedVersion: 3 });
    expect(removed.body).toEqual({ id: saved.body.id, version: 4 });
    expect(await soldOf(rs.lineIds[0])).toEqual([0, "0.000"]);
    expect(await buckets(a.id)).toMatchObject({ reserved: 4, sold: 0 });
    expect(await buckets(b.id)).toMatchObject({ pending: 6, sold: 0 });
    expect((await maker.call("GET", `/sale/${saved.body.id}`)).body).toMatchObject({ deleted: { by: maker.userId }, flow: { canRestore: true, canEdit: false } });
    expect((await viewer.call("GET", "/sale?deleted=true")).body.items.map((item: { id: string }) => item.id)).toContain(saved.body.id);
  });

  it("IT-SL-B08 restore: a deleted Sale returns as DRAFT with nothing applied and keeps its number; the next Save under OFF applies it (APPLY_DRAFT)", async () => {
    await setting(false);
    const [a] = await memoStock([receiveLine({ pcs: 4, weightCt: "2" })]);
    const saved = await created(body([sLine(a.id, 2, "1")]));
    await maker.call("POST", `/sale/${saved.body.id}/delete`, { expectedVersion: 1 });
    expect(await buckets(a.id)).toMatchObject({ pending: 4, sold: 0 });
    expect((await viewer.call("POST", `/sale/${saved.body.id}/restore`, { expectedVersion: 2 })).status).toBe(403);
    const restored = await maker.call("POST", `/sale/${saved.body.id}/restore`, { expectedVersion: 2 });
    expect(restored.body).toEqual({ id: saved.body.id, version: 3, status: "DRAFT" });
    expect((await maker.call("POST", `/sale/${saved.body.id}/restore`, { expectedVersion: 3 })).body.error).toMatchObject({ code: "SALE_STATUS_INVALID" });
    const detail = await maker.call("GET", `/sale/${saved.body.id}`);
    expect(detail.body).toMatchObject({ status: "DRAFT", docNo: saved.body.docNo, deleted: null, approval: { autoApproved: false, submitted: null }, approvedAt: null });
    expect(await buckets(a.id)).toMatchObject({ pending: 4, sold: 0 });
    const again = await maker.call("PUT", `/sale/${saved.body.id}`, { ...body([sLine(a.id, 1, "0.5")]), expectedVersion: 3 });
    expect(again.body).toMatchObject({ status: "APPROVED", version: 4 });
    expect(await buckets(a.id)).toMatchObject({ pending: 3, sold: 1 });
    expect((await maker.call("GET", `/sale/${saved.body.id}`)).body.approval).toMatchObject({ autoApproved: true });
  });

  it("IT-SL-B05 crash between steps: master applied but the answer was lost → SYNC_PENDING, SALE_BUSY while syncing; re-drive (access / sweep) completes once (master replays); a failure before the call is re-driven too", async () => {
    await setting(false);
    const [a, b] = await memoStock([receiveLine({ pcs: 4, weightCt: "2" }), receiveLine({ pcs: 4, weightCt: "2" })]);
    const original = h.masterApi.putSaleConsumption.bind(h.masterApi);
    const lost = vi.spyOn(h.masterApi, "putSaleConsumption").mockImplementationOnce(async (...args) => {
      await original(...args);
      throw new MasterUnavailable("timeout");
    });
    const pending = await maker.call("POST", "/sale", body([sLine(a.id, 2, "1")], { ref: `crash-${TAG}` }));
    lost.mockRestore();
    expect(pending.status).toBe(503);
    expect(pending.body.error).toMatchObject({ code: "SYNC_PENDING", details: { id: expect.any(String), retryAfterSeconds: 5 } });
    const id = pending.body.error.details.id as string;
    SALES.push(id);
    expect(await buckets(a.id)).toMatchObject({ pending: 2, sold: 2 }); // master applied once
    expect((await h.ownerDb.sale.findUniqueOrThrow({ where: { id } }))).toMatchObject({ sync_state: "SYNCING", provisional: true });
    expect((await maker.call("GET", "/sale?q=crash-")).body.items.map((item: { id: string }) => item.id)).not.toContain(id); // provisional never listed
    await h.ownerDb.$executeRaw`UPDATE "inventory"."sale_sync_op" SET "next_attempt_at" = now() - interval '1 second' WHERE "sale_id" = ${id}::uuid`;
    expect(await sweepAll([h.service.sync, h.saleService.sync])).toBeGreaterThanOrEqual(1);
    expect(await h.ownerDb.sale.findUniqueOrThrow({ where: { id } })).toMatchObject({ sync_state: "IDLE", provisional: false, status: "APPROVED", auto_approved: true, applied_revision: 1 });
    expect(await buckets(a.id)).toMatchObject({ pending: 2, sold: 2 }); // replayed, not applied twice
    const [op] = await h.ownerDb.$queryRaw<{ state: string; result: { replayed: boolean } }[]>`SELECT "state", "result" FROM "inventory"."sale_sync_op" WHERE "sale_id" = ${id}::uuid`;
    expect(op).toEqual({ state: "DONE", result: { revision: 1, replayed: true } });

    // (b) the process fails before the master call: the op stays PREPARED, the Sale answers SALE_BUSY, access re-drives it.
    const down = vi.spyOn(h.masterApi, "putSaleConsumption").mockRejectedValueOnce(new MasterUnavailable("connection"));
    const second = await maker.call("POST", "/sale", body([sLine(b.id, 1, "0.5")]));
    down.mockRestore();
    expect(second.body.error.code).toBe("SYNC_PENDING");
    const secondId = second.body.error.details.id as string;
    SALES.push(secondId);
    expect(await buckets(b.id)).toMatchObject({ pending: 4, sold: 0 });
    await h.ownerDb.$executeRaw`UPDATE "inventory"."sale" SET "provisional" = false WHERE "id" = ${secondId}::uuid`; // visible: write guards answer BUSY
    expect((await maker.call("POST", `/sale/${secondId}/delete`, { expectedVersion: 1 })).body.error).toMatchObject({ code: "SALE_BUSY", details: { retryAfterSeconds: 5 } });
    await h.ownerDb.$executeRaw`UPDATE "inventory"."sale" SET "provisional" = true WHERE "id" = ${secondId}::uuid`;
    await h.ownerDb.$executeRaw`UPDATE "inventory"."sale_sync_op" SET "next_attempt_at" = now() - interval '1 second' WHERE "sale_id" = ${secondId}::uuid`;
    expect((await h.saleService.sync.unstick(secondId))?.outcome).toBe("DONE");
    expect(await buckets(b.id)).toMatchObject({ pending: 3, sold: 1 });
  });

  it("IT-SL-B06 guards: SALE_CHANGED (stale version), SALE_STATUS_INVALID (submit with OFF, approve a DRAFT), SALE_REVISE_LIMIT, SALE_DELETED, SALE_NOT_FOUND", async () => {
    await setting(true);
    const [a] = await memoStock([receiveLine({ pcs: 4, weightCt: "2" })]);
    const saved = await created(body([sLine(a.id, 1, "0.5")]));
    expect((await maker.call("PUT", `/sale/${saved.body.id}`, { ...body([sLine(a.id, 2, "1")]), expectedVersion: 9 })).body.error).toMatchObject({ code: "SALE_CHANGED", details: { currentVersion: 1 } });
    expect((await approver.call("POST", `/sale/${saved.body.id}/approve`, { expectedVersion: 1 })).body.error).toMatchObject({ code: "SALE_STATUS_INVALID", details: { status: "DRAFT" } });
    await maker.call("POST", `/sale/${saved.body.id}/submit`, { expectedVersion: 1 });
    await approver.call("POST", `/sale/${saved.body.id}/request-revision`, { expectedVersion: 2, note: "once" });
    await maker.call("POST", `/sale/${saved.body.id}/submit`, { expectedVersion: 3 });
    expect((await approver.call("POST", `/sale/${saved.body.id}/request-revision`, { expectedVersion: 4, note: "twice" })).body.error.code).toBe("SALE_REVISE_LIMIT");
    const rejected = await approver.call("POST", `/sale/${saved.body.id}/reject`, { expectedVersion: 4, reason: "no" });
    expect(rejected.body).toMatchObject({ status: "REJECTED", version: 5 });
    expect((await maker.call("GET", "/notifications")).body.items[0]).toMatchObject({ type: "document.rejected", documentType: "sale" });
    expect((await maker.call("POST", `/sale/${saved.body.id}/delete`, { expectedVersion: 5 })).body).toEqual({ id: saved.body.id, version: 6 });
    expect((await maker.call("PUT", `/sale/${saved.body.id}`, { ...body([sLine(a.id, 1, "0.5")]), expectedVersion: 6 })).body.error.code).toBe("SALE_DELETED");
    expect((await maker.call("POST", `/sale/${saved.body.id}/submit`, { expectedVersion: 6 })).body.error.code).toBe("SALE_DELETED");
    expect((await maker.call("GET", `/sale/${randomUUID()}`)).body.error.code).toBe("SALE_NOT_FOUND");
    expect((await maker.call("GET", "/sale/not-a-uuid")).body.error.code).toBe("SALE_NOT_FOUND");
    await setting(false);
    const draft = await h.ownerDb.sale.findFirstOrThrow({ where: { id: saved.body.id } });
    expect(draft.status).toBe("REJECTED");
    const offDraft = await created(body([sLine(a.id, 1, "0.5")]));
    expect(offDraft.body.status).toBe("APPROVED");
    await setting(true);
  });

  it("IT-SL-B09 approval settings: `sale` listed with waiting counts; turning OFF is refused while a sale waits", async () => {
    await setting(true);
    const [a] = await memoStock([receiveLine({ pcs: 2, weightCt: "1" })]);
    const saved = await created(body([sLine(a.id, 1, "0.5")]));
    await maker.call("POST", `/sale/${saved.body.id}/submit`, { expectedVersion: 1 });
    const list = await maker.call("GET", "/approval-settings");
    const item = list.body.items.find((entry: { type: string }) => entry.type === "sale");
    expect(item).toMatchObject({ requireApproval: true, waitingCount: { pending: expect.any(Number), revision: expect.any(Number) } });
    expect(item.waitingCount.pending).toBeGreaterThanOrEqual(1);
    const refused = await maker.call("PUT", "/approval-settings/sale", { requireApproval: false, expectedVersion: item.version });
    expect(refused.body.error).toMatchObject({ code: "APPROVAL_SETTING_HAS_WAITING" });
    await approver.call("POST", `/sale/${saved.body.id}/reject`, { expectedVersion: 2, reason: "x" });
    await h.ownerDb.$executeRaw`UPDATE "inventory"."sale" SET "deleted_at" = now(), "deleted_by" = 'it' WHERE "status" IN ('PENDING_APPROVAL', 'REVISION_REQUESTED') AND "deleted_at" IS NULL`;
    const off = await maker.call("PUT", "/approval-settings/sale", { requireApproval: false, expectedVersion: item.version });
    expect(off.body).toMatchObject({ type: "sale", requireApproval: false });
    await setting(true);
  });

  it("IT-SL-B10 photos: upload ADD/EDIT only, signature + size checks, key under sale/; read = linked or own unlinked upload; unlink keeps bytes + metadata; foreign files refused; limiter 429", async () => {
    await setting(true);
    expect((await viewer.call("POST", "/sale/photos", form(png()))).status).toBe(403);
    expect((await maker.call("POST", "/sale/photos", form(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])))).body.error.code).toBe("PHOTO_TYPE_INVALID");
    expect((await maker.call("POST", "/sale/photos", form(new Uint8Array(5 * 1024 * 1024 + 1).fill(0x89)))).status).toBe(413);
    const up = await maker.call("POST", "/sale/photos", form(png()));
    expect(up.status).toBe(201);
    const file = await h.ownerDb.stored_file.findUniqueOrThrow({ where: { id: up.body.id } });
    expect(file).toMatchObject({ source_type: "sale-line", status: "ready", created_by: maker.userId, bucket: "files" });
    expect(file.object_key.startsWith("sale/")).toBe(true);
    expect(existsSync(join(h.dir, "inventory", "files", file.object_key))).toBe(true);
    expect((await maker.call("GET", `/sale/photos/${up.body.id}`)).status).toBe(200);
    expect((await viewer.call("GET", `/sale/photos/${up.body.id}`)).status).toBe(404); // another user's unlinked upload
    const [a] = await memoStock([receiveLine({ pcs: 2, weightCt: "1" })]);
    const foreign = await approver.call("POST", "/sale/photos", form(png())).catch(() => null);
    expect(foreign?.status).toBe(403);
    const otherUpload = await h.user(["sale:VIEW", "sale:ADD"]);
    const theirs = await otherUpload.call("POST", "/sale/photos", form(png()));
    const refused = await created(body([sLine(a.id, 1, "0.5", { photoIds: [theirs.body.id] })]));
    expect(refused.body.error).toMatchObject({ code: "SALE_PHOTO_INVALID", details: { fieldErrors: [{ path: "lines.0.photoIds.0", code: "invalid_photo" }] } });
    const saved = await created(body([sLine(a.id, 1, "0.5", { photoIds: [up.body.id] })]));
    expect(saved.status).toBe(201);
    const response = await viewer.call("GET", `/sale/photos/${up.body.id}`);
    expect(response.status).toBe(200);
    expect(response.response.headers.get("cache-control")).toBe("private, max-age=300");
    expect(response.response.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await maker.call("GET", `/sale/${saved.body.id}`)).body.lines[0].photoIds).toEqual([up.body.id]);
    await maker.call("PUT", `/sale/${saved.body.id}`, { ...body([sLine(a.id, 1, "0.5")]), expectedVersion: 1 });
    expect(await h.ownerDb.stored_file.count({ where: { id: up.body.id } })).toBe(1); // unlinked, kept (ADR-0030)
    expect(existsSync(join(h.dir, "inventory", "files", file.object_key))).toBe(true);
    // A held slot per in-flight transfer: with 3 taken, the next upload is refused at once.
    const gates: (() => void)[] = [];
    const held = [0, 1, 2].map(() => h.salePhotos.writes.run(() => new Promise<void>((resolve) => gates.push(resolve))));
    expect((await maker.call("POST", "/sale/photos", form(png()))).body.error.code).toBe("RATE_LIMITED");
    gates.forEach((open) => open());
    await Promise.all(held);
  });

  it("IT-SL-B11 HTTP: sign-in, CSRF, grants per route, JSON cap, strict body, error envelope", async () => {
    const response = await h.app.request("/api/inventory/v1/sale", { method: "GET" });
    expect(response.status).toBe(401);
    expect((await maker.call("POST", "/sale", body([]), { origin: "https://evil.test" })).body.error.code).toBe("CSRF_INVALID");
    expect((await viewer.call("POST", "/sale", body([sLine(randomUUID(), 1, "1")]))).status).toBe(403);
    expect((await viewer.call("POST", `/sale/${randomUUID()}/delete`, { expectedVersion: 1 })).status).toBe(403);
    expect((await approver.call("PUT", `/sale/${randomUUID()}`, { ...body([sLine(randomUUID(), 1, "1")]), expectedVersion: 1 })).status).toBe(403);
    const big = await maker.call("POST", "/sale", { ...body([]), documentNote: "x".repeat(300 * 1024) });
    expect(big.status).toBe(413);
    const invalid = await maker.call("POST", "/sale", { ...body([sLine(randomUUID(), 0, "0", { unitPrice: "0" })]), extra: 1 });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error).toMatchObject({ code: "VALIDATION_ERROR", requestId: expect.any(String), message: expect.any(String) });
    const strict = await maker.call("POST", "/sale", body([sLine(randomUUID(), 0, "0", { unitPrice: "0" })], { dueDate: "2026-11-01" }));
    expect(strict.body.error.details.fieldErrors).toEqual(expect.arrayContaining([
      { path: "dueDate", code: "before_doc_date" }, { path: "lines.0.pcs", code: "required" }, { path: "lines.0.unitPrice", code: "required" },
    ]));
  });

  it("IT-SL-B12 N+1 budgets: get = 3 statements + ≤ 1 master call for 1 or 20 lines; list = 1 statement; Save = 2 master calls and constant statements; approve = 1 master call", async () => {
    await setting(true);
    const items = await memoStock(Array.from({ length: 20 }, () => receiveLine({ pcs: 2, weightCt: "1" })));
    const one = await created(body([sLine(items[0].id, 1, "0.5")]));
    const many = await h.measured(() => created(body(items.map((item) => sLine(item.id, 1, "0.5")))));
    const single = await h.measured(() => created(body([sLine(items[1].id, 1, "0.5")])));
    expect(many.master).toHaveLength(2);
    expect(many.queries).toBe(single.queries);
    const readOne = await h.measured(() => maker.call("GET", `/sale/${one.body.id}`));
    const readMany = await h.measured(() => maker.call("GET", `/sale/${many.result.body.id}`));
    expect(readMany.result.body.lines).toHaveLength(20);
    expect(readOne.queries).toBe(3);
    expect(readMany.queries).toBe(3);
    expect(readMany.master).toEqual(["POST /internal/v1/inventory/sale/prepare"]);
    const list = await h.measured(() => maker.call("GET", "/sale?limit=50"));
    expect(list.queries).toBe(1);
    expect(list.master).toEqual([]);
    for (const id of [one.body.id, many.result.body.id]) await maker.call("POST", `/sale/${id}/submit`, { expectedVersion: 1 });
    const approveOne = await h.measured(() => approver.call("POST", `/sale/${one.body.id}/approve`, { expectedVersion: 2 }));
    const approveMany = await h.measured(() => approver.call("POST", `/sale/${many.result.body.id}/approve`, { expectedVersion: 2 }));
    expect(approveMany.result.body.status).toBe("APPROVED");
    expect(approveMany.master).toHaveLength(1);
    expect(approveMany.queries).toBe(approveOne.queries);
    const readApproved = await h.measured(() => maker.call("GET", `/sale/${many.result.body.id}`));
    expect(readApproved.master).toEqual([]); // read-only documents need no master call
    const pending = await h.measured(() => approver.call("GET", "/approval/pending?type=sale&limit=50"));
    expect(pending.queries).toBe(1);
  });

  it("IT-SO-M01 a Sale mixing an own-stock lot and a Memo Stock lot: both consumed (own locally, Memo Stock by master) and both returned by delete", async () => {
    await setting(false);
    const [item] = await memoStock([receiveLine({ pcs: 5, weightCt: "2.5" })]);
    const own = await seedLoad(h, { pcs: 4, weightCt: "2.000", lot: `MX-${TAG.slice(-4)}` });
    OWN_LOADS.push(own.loadId);
    const key = (await h.ownerDb.stock.findUniqueOrThrow({ where: { id: own.id } })).lot_key!;
    const ownLine = { source: "OWN_STOCK", lotKey: key, pcs: 3, weightCt: "1.500", unitPrice: "200", discount: { type: "NONE", value: "0" }, photoIds: [] };
    const saved = await created(body([ownLine, sLine(item.id, 2, "1")]));
    expect(saved.status).toBe(201);
    expect(saved.body).toMatchObject({ status: "APPROVED" });
    expect(await buckets(item.id)).toMatchObject({ pending: 3, sold: 2 });
    const stock = await h.ownerDb.stock.findUniqueOrThrow({ where: { id: own.id } });
    expect([stock.on_hand_pcs, stock.sold_pcs]).toEqual([1, 3]);
    const detail = (await maker.call("GET", `/sale/${saved.body.id}`)).body;
    expect(detail.lines.map((line: { source: string }) => line.source)).toEqual(["OWN_STOCK", "STOCK"]);
    const removed = await maker.call("POST", `/sale/${saved.body.id}/delete`, { expectedVersion: detail.version });
    expect(removed.status).toBe(200);
    expect(await buckets(item.id)).toMatchObject({ pending: 5, sold: 0 });
    const back = await h.ownerDb.stock.findUniqueOrThrow({ where: { id: own.id } });
    expect([back.on_hand_pcs, back.sold_pcs]).toEqual([4, 0]);
  });
});
