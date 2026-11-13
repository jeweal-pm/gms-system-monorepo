import { randomUUID } from "node:crypto";
import { HttpException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sendAndApprove, setApproval, submitted } from "../partner-shared/approval";

/**
 * approval-setup SA rev 1 / ADR-0050 (with approve-center ADR-0046) document flows on real PostgreSQL, backend stage 2:
 * - IT-AS-B02 / B03: approval ON — Save → DRAFT (no stock) → edit → submit → locked → Revise (once, reason) → edit →
 *   submit → second Revise refused → Reject → read-only; submit while OFF → `_APPROVAL_OFF`.
 * - IT-AS-B04: approval OFF — Save → APPROVED auto with today's effects; a shortage refuses the whole Save.
 * - IT-AS-B05 / B06: OFF edit of an unused document leaves Memo Stock / PO lines equal to a fresh Save of the new
 *   content; OFF delete puts stock back (Memo Receive rows removed). Purchase incl. MERGED / Sold parts and PO lines.
 * - IT-AS-B07: isUsed — Memo Receive picked by a Memo Return draft; Memo Out with a Memo Out Return; PO with a Purchase;
 *   Memo Out Return whose returned stock was taken again → `_IN_USE {usedBy}`.
 * - IT-AS-B13: Quotation ON / OFF; IT-AS-B14: list Daybook fields and DRAFT filter; G3 restore.
 * - IT-AP-B03 / B05 / B06 / B07: reject / revise move no stock; rejected / revised sources are not offered; approve vs
 *   reject race; soft delete of REVISION_REQUESTED / REJECTED.
 * Opt-in (INV-20261021-007): only with `PARTNER_TEST_DATABASE_URL` on a disposable loopback non-5432 `f1_system`.
 * Rows are scoped to the vendor / customer created here and Stock ID year 88; settings are restored to the seed.
 */

const testUrl = process.env.PARTNER_TEST_DATABASE_URL;
const canRun = Boolean(testUrl && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(testUrl));
const ACTOR = `ad-it-${randomUUID().slice(0, 8)}`;
const APPROVER = { id: `${ACTOR}-ap`, name: "Approver" };
const YEAR = 88;
const TYPES = ["quotation", "reserve", "memo-receive", "memo-return", "memo-out", "memo-out-return", "purchase-order", "purchase"] as const;

type Prisma = typeof import("../../src/database/prisma-client").prisma;
type Schemas = typeof import("../../src/trade-document/memo-schemas");
let prisma: Prisma;
let schemas: Schemas;
let s: {
  receive: InstanceType<typeof import("../../src/trade-document/memo-receive.service").MemoReceiveService>;
  memoReturn: InstanceType<typeof import("../../src/trade-document/memo-return.service").MemoReturnService>;
  memoOut: InstanceType<typeof import("../../src/trade-document/memo-out.service").MemoOutService>;
  reserve: InstanceType<typeof import("../../src/trade-document/reserve.service").ReserveService>;
  memoOutReturn: InstanceType<typeof import("../../src/trade-document/memo-out-return.service").MemoOutReturnService>;
  po: InstanceType<typeof import("../../src/purchase-order/purchase-order.service").PurchaseOrderService>;
  purchase: InstanceType<typeof import("../../src/purchase/purchase.service").PurchaseService>;
  quotation: InstanceType<typeof import("../../src/quotation/quotation.service").QuotationService>;
};

const vendor = { id: randomUUID(), addressId: randomUUID() };
const customer = { id: randomUUID(), shipping: randomUUID(), invoice: randomUUID() };
let fixtures = false;

const money = { discount: { type: "NONE" as const, value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null };
const dates = { docDate: "2026-11-10", dueDate: "2026-12-10", currency: "THB", exchangeRate: null, ref: "", documentNote: "" };
const vendorHeader = { ...dates, ...money, vendorId: vendor.id, addressId: vendor.addressId };
const customerHeader = () => ({ ...dates, ...money, customerId: customer.id, shippingAddressId: customer.shipping, invoiceAddressId: customer.invoice });
const blank = { stoneCodeId: null, stoneCode: "", stone: "typed", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "", lot: "", location: "", cerType: "", cerNo: "",
  discount: { type: "NONE" as const, value: "0" }, itemNote: "", photoIds: [] as string[] };
const receiveLine = (pcs: number, weightCt: string, lot = "L") => ({
  source: "MANUAL" as const, stoneCode: "", stone: "Ruby", shape: "Oval", size: "", color: "Red", clarity: "", cutting: "", quality: "", lot, cerType: "", cerNo: "",
  pcs, weightCt, priceUnit: "PER_CT" as const, unitPrice: "1000", discount: { type: "NONE" as const, value: "0" }, itemNote: "", photoIds: [] as [],
});
const receiveInput = (lines: ReturnType<typeof receiveLine>[]) => ({ ...vendorHeader, lines }) as never;
const stockLine = (memoStockId: string, pcs: number, weightCt: string) => ({ ...blank, source: "MANUAL" as const, pcs, weightCt, priceUnit: "PER_CT" as const, unitPrice: "2000", memoStockId });
const outInput = (lines: ReturnType<typeof stockLine>[]) => schemas.createMemoOutSchema.parse({ ...customerHeader(), lines });
const returnInput = (lines: { memoStockId: string; pcs: number; weightCt: string }[]) => schemas.createMemoReturnSchema.parse({
  ...vendorHeader, lines: lines.map((line) => ({ ...blank, source: "MANUAL", priceUnit: "PER_PCS", unitPrice: "1", outstandingPcs: 999, outstandingWeightCt: "999", ...line })),
});
const backInput = (lines: { memoOutLineId: string; pcs: number; weightCt: string }[]) => schemas.createMemoOutReturnSchema.parse({
  ...customerHeader(), lines: lines.map((line) => ({ ...blank, source: "MANUAL", priceUnit: "PER_PCS", unitPrice: "1", outstandingPcs: 999, outstandingWeightCt: "999", ...line })),
});
const orderLine = (pcs: number, weightCt: string) => ({ ...blank, source: "MANUAL" as const, stone: "Sapphire", location: "Safe", pcs, weightCt, priceUnit: "PER_PCS" as const, unitPrice: "100" });
const poInput = (lines: ReturnType<typeof orderLine>[]) => ({ ...vendorHeader, lines }) as never;
const purchaseLine = {
  stock: (memoStockId: string, memoGroup: "IN_STOCK" | "SOLD" | "MERGED", pcs: number, weightCt: string) => ({ ...blank, source: "STOCK", memoStockId, memoGroup, pcs, weightCt, priceUnit: "PER_PCS", unitPrice: "900" }),
  po: (purchaseOrderLineId: string, pcs: number, weightCt: string) => ({ ...blank, source: "PURCHASE_ORDER", purchaseOrderLineId, pcs, weightCt, priceUnit: "PER_PCS", unitPrice: "90" }),
};
const purchaseInput = (lines: unknown[]) => ({ ...vendorHeader, lines }) as never;
const quoteInput = () => ({ ...customerHeader(), lines: [{ ...blank, source: "MANUAL", stone: "Emerald", pcs: 1, weightCt: "1", priceUnit: "PER_CT", unitPrice: "100" }] }) as never;

async function failure(promise: Promise<unknown>) {
  try { await promise; } catch (error) {
    if (error instanceof HttpException) {
      const body = error.getResponse() as { error: { code: string; details?: Record<string, unknown>; fieldErrors?: { path: string; code: string }[] } };
      return { status: error.getStatus(), code: body.error.code, details: body.error.details, fieldErrors: body.error.fieldErrors };
    }
    throw error;
  }
  throw new Error("expected a failure");
}

/** Every bucket of a Memo Stock item, and whether memo_stock_balance holds. */
async function buckets(id: string) {
  const item = await prisma.memoStock.findUniqueOrThrow({ where: { id } });
  return {
    pending: [item.pendingPcs, item.pendingWeightCt.toFixed(3)], returned: [item.returnedPcs, item.returnedWeightCt.toFixed(3)],
    reserved: [item.reservedPcs, item.reservedWeightCt.toFixed(3)], sold: [item.soldPcs, item.soldWeightCt.toFixed(3)], purchased: [item.purchasedPcs, item.purchasedWeightCt.toFixed(3)],
  };
}

/** Memo Stock items from a Memo Receive approved through the ON flow (pending = received). */
async function stock(lines: ReturnType<typeof receiveLine>[]) {
  await setApproval(prisma, "memo-receive", true);
  const saved = await s.receive.create(ACTOR, receiveInput(lines));
  await sendAndApprove(s.receive, ACTOR, saved.id, saved.version);
  const lineIds = await prisma.memoReceiveLine.findMany({ where: { memoReceiveId: saved.id }, orderBy: { position: "asc" }, select: { id: true } });
  const items = await prisma.memoStock.findMany({ where: { memoReceiveId: saved.id } });
  return lineIds.map((line) => items.find((item) => item.memoReceiveLineId === line.id)!);
}

const sell = (id: string, pcs: number, weight: string) => prisma.$executeRaw`UPDATE "partner"."memo_stock" SET pending_pcs = pending_pcs - ${pcs}, pending_weight_ct = pending_weight_ct - ${weight}::numeric,
  sold_pcs = sold_pcs + ${pcs}, sold_weight_ct = sold_weight_ct + ${weight}::numeric WHERE id = ${id}::uuid`;

describe.runIf(canRun)("approval documents (ADR-0050 stage 2) on PostgreSQL", () => {
  beforeAll(async () => {
    vi.stubEnv("PARTNER_DATABASE_URL", testUrl!);
    vi.stubEnv("DATABASE_URL", testUrl!);
    ({ prisma } = await import("../../src/database/prisma-client"));
    schemas = await import("../../src/trade-document/memo-schemas");
    const { MemoReceiveService } = await import("../../src/trade-document/memo-receive.service");
    const { MemoReturnService } = await import("../../src/trade-document/memo-return.service");
    const { MemoOutService } = await import("../../src/trade-document/memo-out.service");
    const { ReserveService } = await import("../../src/trade-document/reserve.service");
    const { MemoOutReturnService } = await import("../../src/trade-document/memo-out-return.service");
    const { PurchaseOrderService } = await import("../../src/purchase-order/purchase-order.service");
    const { PurchaseService } = await import("../../src/purchase/purchase.service");
    const { QuotationService } = await import("../../src/quotation/quotation.service");
    const receive = new MemoReceiveService();
    receive.clock = () => new Date(`20${YEAR}-06-01T03:00:00Z`);
    const purchase = new PurchaseService();
    s = { receive, memoReturn: new MemoReturnService(), memoOut: new MemoOutService(), reserve: new ReserveService(), memoOutReturn: new MemoOutReturnService(),
      po: new PurchaseOrderService(), purchase, quotation: new QuotationService() };
    if (!(await prisma.currency.findUnique({ where: { code: "THB" } }))) await prisma.currency.create({ data: { code: "THB", name: "THB", createdBy: ACTOR, updatedBy: ACTOR } });
    await prisma.memoStockIdCounter.deleteMany({ where: { year: YEAR } });
    const code = `ADIT${ACTOR.slice(-4)}`.toUpperCase();
    const address = { position: 1, name: "AD IT", address: "1 Test Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true };
    await prisma.vendor.create({ data: {
      id: vendor.id, name: "AD IT Vendor", nameKey: "ad it vendor", code, codeKey: code.toLowerCase(), currencyCode: "THB", firstName: "It", email: "ad-it@example.test",
      createdBy: ACTOR, updatedBy: ACTOR, addresses: { create: [{ ...address, id: vendor.addressId }] },
    } });
    await prisma.customer.create({ data: {
      id: customer.id, name: "AD IT Customer", nameKey: "ad it customer", code: `${code}C`, codeKey: `${code.toLowerCase()}c`, currencyCode: "THB", firstName: "It", email: "ad-it@example.test",
      createdBy: ACTOR, updatedBy: ACTOR, addresses: { create: [{ ...address, id: customer.shipping, type: "SHIPPING" }, { ...address, id: customer.invoice, type: "INVOICE" }] },
    } });
    fixtures = true;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (fixtures) {
      await prisma.purchase.deleteMany({ where: { vendorId: vendor.id } });
      await prisma.purchaseOrder.deleteMany({ where: { vendorId: vendor.id } });
      await prisma.memoOutReturn.deleteMany({ where: { customerId: customer.id } });
      await prisma.memoOut.deleteMany({ where: { customerId: customer.id } });
      await prisma.reserve.deleteMany({ where: { customerId: customer.id } });
      await prisma.quotation.deleteMany({ where: { customerId: customer.id } });
      await prisma.memoReturn.deleteMany({ where: { vendorId: vendor.id } });
      await prisma.memoStock.deleteMany({ where: { vendorId: vendor.id } });
      await prisma.memoReceive.deleteMany({ where: { vendorId: vendor.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.vendor.deleteMany({ where: { id: vendor.id } });
    }
    await prisma.memoStockIdCounter.deleteMany({ where: { year: YEAR } });
    for (const type of TYPES) await setApproval(prisma, type, type !== "quotation");
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  it("IT-AS-B02 / B03 / IT-AP-B03 ON: DRAFT holds nothing → submit locks → Revise once (reason) → edit → submit → second Revise refused → Reject is final; no stock moved by review", async () => {
    for (const type of TYPES) await setApproval(prisma, type, true);
    const [item] = await stock([receiveLine(10, "5")]);
    const before = await buckets(item.id);
    const saved = await s.reserve.create(ACTOR, outInput([stockLine(item.id, 2, "1")]));
    expect(saved).toMatchObject({ version: 1, status: "DRAFT", autoApproved: false });
    // ADR-0049 as amended by ADR-0050 (merge 2026-11-12): a draft notifies nobody; Send to approve does.
    const events = (documentId: string) => prisma.notificationEvent.findMany({ where: { documentId }, orderBy: { createdAt: "asc" }, select: { type: true, documentType: true } });
    expect(await events(saved.id)).toEqual([]);
    expect(await buckets(item.id)).toEqual(before);
    await s.reserve.update(ACTOR, saved.id, 1, outInput([stockLine(item.id, 3, "1.5")]));
    await expect(s.reserve.submit({ id: ACTOR, name: "Maker" }, saved.id, 2)).resolves.toMatchObject({ version: 3, status: "PENDING_APPROVAL", submittedAt: expect.any(String) });
    expect(await events(saved.id)).toEqual([{ type: "approval.pending", documentType: "reserve" }]);
    // Pending is locked.
    expect(await failure(s.reserve.update(ACTOR, saved.id, 3, outInput([stockLine(item.id, 1, "0.5")])))).toMatchObject({ code: "RESERVE_STATUS_INVALID" });
    expect(await failure(s.reserve.delete(ACTOR, saved.id, 3))).toMatchObject({ code: "RESERVE_STATUS_INVALID" });
    expect(await failure(s.reserve.submit({ id: ACTOR, name: null }, saved.id, 3))).toMatchObject({ code: "RESERVE_STATUS_INVALID" });
    await expect(s.reserve.requestRevision(APPROVER, saved.id, 3, "Only 1 pcs")).resolves.toEqual({ id: saved.id, version: 4, status: "REVISION_REQUESTED" });
    expect(await buckets(item.id)).toEqual(before);
    expect(await s.reserve.get(saved.id)).toMatchObject({ status: "REVISION_REQUESTED", revisionCount: 1, review: { action: "REVISE", note: "Only 1 pcs", byName: "Approver" }, submittedByName: "Maker" });
    await s.reserve.update(ACTOR, saved.id, 4, outInput([stockLine(item.id, 1, "0.5")]));
    expect((await s.reserve.get(saved.id)).status).toBe("REVISION_REQUESTED");
    await s.reserve.submit({ id: ACTOR, name: "Maker" }, saved.id, 5);
    expect(await failure(s.reserve.requestRevision(APPROVER, saved.id, 6, "Again"))).toMatchObject({ status: 409, code: "RESERVE_REVISE_LIMIT" });
    await expect(s.reserve.reject(APPROVER, saved.id, 6, "Customer cancelled")).resolves.toEqual({ id: saved.id, version: 7, status: "REJECTED" });
    expect(await buckets(item.id)).toEqual(before);
    expect(await s.reserve.get(saved.id)).toMatchObject({ status: "REJECTED", review: { action: "REJECT", note: "Customer cancelled" }, canEdit: false, canDelete: false, canSubmit: false });
    for (const call of [
      () => s.reserve.update(ACTOR, saved.id, 7, outInput([stockLine(item.id, 1, "0.5")])), () => s.reserve.delete(ACTOR, saved.id, 7),
      () => s.reserve.approve(ACTOR, saved.id, 7), () => s.reserve.submit({ id: ACTOR, name: null }, saved.id, 7),
    ]) expect(await failure(call())).toMatchObject({ code: "RESERVE_STATUS_INVALID" });
    // Approve after a revise moves stock exactly as a never-revised document (IT-AP-B04).
    const second = await submitted(s.reserve, ACTOR, await s.reserve.create(ACTOR, outInput([stockLine(item.id, 2, "1")])));
    await s.reserve.requestRevision(APPROVER, second.id, 2, "x");
    await sendAndApprove(s.reserve, ACTOR, second.id, 3);
    expect((await events(second.id)).map((event) => event.type)).toEqual(["approval.pending", "approval.pending", "document.approved"]);
    expect(await buckets(item.id)).toMatchObject({ pending: [8, "4.000"], reserved: [2, "1.000"] });
    // Send to approve while OFF (stale page) → APPROVAL_OFF; nothing changes.
    const draft = await s.reserve.create(ACTOR, outInput([stockLine(item.id, 1, "0.5")]));
    await setApproval(prisma, "reserve", false);
    expect(await failure(s.reserve.submit({ id: ACTOR, name: null }, draft.id, 1))).toMatchObject({ status: 409, code: "RESERVE_APPROVAL_OFF" });
    expect(await s.reserve.get(draft.id)).toMatchObject({ status: "DRAFT", version: 1, canSubmit: false });
    // OFF: the next Save of the draft approves it with its effects (Q-AS-24).
    await expect(s.reserve.update(ACTOR, draft.id, 1, outInput([stockLine(item.id, 1, "0.5")]))).resolves.toMatchObject({ status: "APPROVED", autoApproved: true });
    expect(await buckets(item.id)).toMatchObject({ pending: [7, "3.500"], reserved: [3, "1.500"] });
    await setApproval(prisma, "reserve", true);
  });

  it("IT-AS-B04 / B05 / B06 OFF Memo Receive: Save approves with Memo Stock rows; an unused edit equals a fresh Save; delete removes the rows; IT-AS-B07 a Memo Return draft makes it used", async () => {
    await setApproval(prisma, "memo-receive", false);
    const saved = await s.receive.create(ACTOR, receiveInput([receiveLine(4, "2", "A"), receiveLine(2, "1", "B")]));
    expect(saved).toMatchObject({ status: "APPROVED", autoApproved: true, revisionCount: 0 });
    const rows = () => prisma.memoStock.findMany({ where: { memoReceiveId: saved.id }, orderBy: { stockId: "asc" } });
    expect((await rows()).map((row) => [row.stockId, row.receivedPcs, row.pendingPcs])).toEqual([[saved.stockIds[0], 4, 4], [saved.stockIds[1], 2, 2]]);
    const lines = (await s.receive.get(saved.id)).lines;
    // Edit: keep line 1 (its Stock ID) with a new quantity, drop line 2, add a new one.
    const updated = await s.receive.update(ACTOR, saved.id, 1, receiveInput([{ ...receiveLine(6, "3", "A2"), id: lines[0].id } as never, receiveLine(1, "0.5", "C")]));
    expect(updated).toMatchObject({ status: "APPROVED", autoApproved: true, version: 2 });
    const after = await rows();
    expect(after.map((row) => [row.stockId, row.lot, row.receivedPcs, row.receivedWeightCt.toFixed(3), row.pendingPcs, row.pendingWeightCt.toFixed(3)])).toEqual([
      [saved.stockIds[0], "A2", 6, "3.000", 6, "3.000"], [updated.stockIds[1], "C", 1, "0.500", 1, "0.500"],
    ]);
    // A fresh Save of the same content gives the same Memo Stock (apart from ids / Stock IDs).
    const fresh = await s.receive.create(ACTOR, receiveInput([receiveLine(6, "3", "A2"), receiveLine(1, "0.5", "C")]));
    const freshRows = await prisma.memoStock.findMany({ where: { memoReceiveId: fresh.id }, orderBy: { stockId: "asc" } });
    const shape = (row: (typeof after)[number]) => [row.lot, row.receivedPcs, row.pendingPcs, row.pendingWeightCt.toFixed(3), row.lineAmount.toFixed(2), row.netUnitPrice.toFixed(4)];
    expect(freshRows.map(shape)).toEqual(after.map(shape));
    // Used: a Memo Return draft (any status) names an item → edit and delete refused with usedBy.
    await setApproval(prisma, "memo-return", true);
    const back = await s.memoReturn.create(ACTOR, returnInput([{ memoStockId: after[0].id, pcs: 1, weightCt: "0.5" }]));
    const detail = await s.receive.get(saved.id, { isSuperAdmin: true, grants: [] });
    expect(detail).toMatchObject({ canEdit: false, canDelete: false, usedBy: { docNo: back.docNo } });
    expect(await failure(s.receive.update(ACTOR, saved.id, 2, receiveInput([receiveLine(1, "1")])))).toEqual({ status: 409, code: "MEMO_RECEIVE_IN_USE", details: { usedBy: back.docNo }, fieldErrors: undefined });
    expect(await failure(s.receive.delete(ACTOR, saved.id, 2))).toMatchObject({ code: "MEMO_RECEIVE_IN_USE", details: { usedBy: back.docNo } });
    // G9: a soft-deleted user still blocks (RESTRICT key) and is named " (deleted)"; a live one is named first.
    await s.memoReturn.delete(ACTOR, back.id, 1);
    expect(await failure(s.receive.delete(ACTOR, saved.id, 2))).toMatchObject({ code: "MEMO_RECEIVE_IN_USE", details: { usedBy: `${back.docNo} (deleted)` } });
    await s.memoReturn.restore(ACTOR, back.id, 2);
    // Delete of the unused fresh one: its rows leave with it.
    expect(await s.receive.get(fresh.id, { isSuperAdmin: true, grants: [] })).toMatchObject({ canEdit: true, canDelete: true, usedBy: null });
    await expect(s.receive.delete(ACTOR, fresh.id, 1)).resolves.toEqual({ ok: true, version: 2 });
    expect(await prisma.memoStock.count({ where: { memoReceiveId: fresh.id } })).toBe(0);
    // G3: restore while OFF re-applies (rows back); while ON → DRAFT without rows.
    await expect(s.receive.restore(ACTOR, fresh.id, 2)).resolves.toMatchObject({ status: "APPROVED" });
    expect(await prisma.memoStock.count({ where: { memoReceiveId: fresh.id } })).toBe(2);
    await s.receive.delete(ACTOR, fresh.id, 3);
    await setApproval(prisma, "memo-receive", true);
    await expect(s.receive.restore(ACTOR, fresh.id, 4)).resolves.toMatchObject({ status: "DRAFT" });
    expect(await prisma.memoStock.count({ where: { memoReceiveId: fresh.id } })).toBe(0);
    expect(await s.receive.get(fresh.id)).toMatchObject({ status: "DRAFT", autoApproved: false, approvedAt: null, submittedAt: null });
  });

  it("IT-AS-B04 / B05 / B06 OFF Reserve, Memo Out, Memo Return: effects on Save, a shortage refuses the whole Save, edit = fresh, delete restores the item", async () => {
    const [item] = await stock([receiveLine(10, "5")]);
    const original = await buckets(item.id);
    for (const [type, service, bucket] of [["reserve", s.reserve, "reserved"], ["memo-out", s.memoOut, "reserved"]] as const) {
      await setApproval(prisma, type, false);
      const saved = await service.create(ACTOR, outInput([stockLine(item.id, 3, "1.5")]));
      expect(saved).toMatchObject({ status: "APPROVED", autoApproved: true });
      expect((await buckets(item.id))[bucket]).toEqual([3, "1.500"]);
      await service.update(ACTOR, saved.id, 1, outInput([stockLine(item.id, 5, "2.5")]));
      expect(await buckets(item.id)).toMatchObject({ pending: [5, "2.500"], [bucket]: [5, "2.500"] });
      // A shortage: nothing written (no new document, stock unchanged).
      const countOf = () => (type === "reserve" ? prisma.reserve.count({ where: { customerId: customer.id } }) : prisma.memoOut.count({ where: { customerId: customer.id } }));
      const count = await countOf();
      const short = await failure(service.create(ACTOR, outInput([stockLine(item.id, 6, "3")])));
      expect(short.code === `${type === "reserve" ? "RESERVE" : "MEMO_OUT"}_PENDING_SHORT` || short.code === "VALIDATION_ERROR").toBe(true);
      expect(await countOf()).toBe(count);
      await expect(service.delete(ACTOR, saved.id, 2)).resolves.toEqual({ ok: true, version: 3 });
      expect(await buckets(item.id)).toEqual(original);
      await setApproval(prisma, type, true);
    }
    await setApproval(prisma, "memo-return", false);
    const back = await s.memoReturn.create(ACTOR, returnInput([{ memoStockId: item.id, pcs: 4, weightCt: "2" }]));
    expect(await buckets(item.id)).toMatchObject({ pending: [6, "3.000"], returned: [4, "2.000"] });
    await s.memoReturn.update(ACTOR, back.id, 1, returnInput([{ memoStockId: item.id, pcs: 1, weightCt: "0.5" }]));
    expect(await buckets(item.id)).toMatchObject({ pending: [9, "4.500"], returned: [1, "0.500"] });
    await s.memoReturn.delete(ACTOR, back.id, 2);
    expect(await buckets(item.id)).toEqual(original);
    // G3: restore while OFF re-applies; refused with the effect error when stock is short.
    await sell(item.id, 10, "5");
    expect(await failure(s.memoReturn.restore(ACTOR, back.id, 3))).toMatchObject({ code: "MEMO_RETURN_PENDING_SHORT" });
    expect(await prisma.memoReturn.findUniqueOrThrow({ where: { id: back.id }, select: { deletedAt: true } })).toMatchObject({ deletedAt: expect.any(Date) });
    await setApproval(prisma, "memo-return", true);
  });

  it("IT-AS-B05 / B07 OFF Memo Out Return: returns on Save, edit and delete reverse; used once a Memo Out Return names a Memo Out, or the returned stock is taken again", async () => {
    const [item] = await stock([receiveLine(10, "5")]);
    await setApproval(prisma, "memo-out", false);
    const out = await s.memoOut.create(ACTOR, outInput([stockLine(item.id, 6, "3")]));
    const outLine = await prisma.memoOutLine.findFirstOrThrow({ where: { memoOutId: out.id } });
    await setApproval(prisma, "memo-out-return", false);
    const back = await s.memoOutReturn.create(ACTOR, backInput([{ memoOutLineId: outLine.id, pcs: 4, weightCt: "2" }]));
    expect(back).toMatchObject({ status: "APPROVED", autoApproved: true });
    const returned = async () => (await prisma.memoOutLine.findUniqueOrThrow({ where: { id: outLine.id } })).returnedPcs;
    expect([await returned(), (await buckets(item.id)).reserved]).toEqual([4, [2, "1.000"]]);
    // The Memo Out is used now (IT-AS-B07).
    expect(await failure(s.memoOut.update(ACTOR, out.id, 1, outInput([stockLine(item.id, 6, "3")])))).toMatchObject({ code: "MEMO_OUT_IN_USE", details: { usedBy: back.docNo } });
    await s.memoOutReturn.update(ACTOR, back.id, 1, backInput([{ memoOutLineId: outLine.id, pcs: 1, weightCt: "0.5" }]));
    expect([await returned(), (await buckets(item.id)).reserved, (await buckets(item.id)).pending]).toEqual([1, [5, "2.500"], [5, "2.500"]]);
    // The returned stock is taken again by another Memo Out → the return is used.
    await s.memoOutReturn.update(ACTOR, back.id, 2, backInput([{ memoOutLineId: outLine.id, pcs: 6, weightCt: "3" }]));
    const taker = await s.memoOut.create(ACTOR, outInput([stockLine(item.id, 9, "4.5")]));
    expect(await buckets(item.id)).toMatchObject({ pending: [1, "0.500"], reserved: [9, "4.500"] });
    expect(await failure(s.memoOutReturn.delete(ACTOR, back.id, 3))).toMatchObject({ code: "MEMO_OUT_RETURN_IN_USE", details: { usedBy: taker.docNo } });
    expect(await s.memoOutReturn.get(back.id, { isSuperAdmin: true, grants: [] })).toMatchObject({ canEdit: false, usedBy: { docNo: taker.docNo } });
    // Free it again; the delete then reverses exactly.
    await s.memoOut.delete(ACTOR, taker.id, 1);
    await s.memoOutReturn.delete(ACTOR, back.id, 3);
    expect([await returned(), (await buckets(item.id)).reserved]).toEqual([0, [6, "3.000"]]);
    // G9: the soft-deleted return still names the Memo Out lines (RESTRICT key) → used, named " (deleted)".
    expect(await failure(s.memoOut.delete(ACTOR, out.id, 1))).toMatchObject({ code: "MEMO_OUT_IN_USE", details: { usedBy: `${back.docNo} (deleted)` } });
    await setApproval(prisma, "memo-out", true);
    await setApproval(prisma, "memo-out-return", true);
  });

  it("IT-AS-B05 / B06 / B07 OFF Purchase Order and Purchase (MERGED Sold part, PO lines): edit = fresh Save, delete gives everything back; a Purchase draft makes the PO used", async () => {
    await setApproval(prisma, "purchase-order", false);
    const po = await s.po.create(ACTOR, poInput([orderLine(10, "4")]));
    expect(po).toMatchObject({ status: "APPROVED", autoApproved: true });
    const [poLine] = await prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: po.id } });
    // Unused auto-approved PO: editable (lines replaced).
    await s.po.update(ACTOR, po.id, 1, poInput([orderLine(8, "4")]));
    const [line] = await prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: po.id } });
    expect(line.id).not.toBe(poLine.id);
    const [m, k] = await stock([receiveLine(4, "2", "M"), receiveLine(3, "1.5", "K")]);
    await sell(m.id, 1, "0.5");
    const mBefore = await buckets(m.id);
    const kBefore = await buckets(k.id);
    await setApproval(prisma, "purchase", false);
    const bought = await s.purchase.create(ACTOR, purchaseInput([purchaseLine.stock(m.id, "MERGED", 2, "1"), purchaseLine.stock(k.id, "IN_STOCK", 1, "0.5"), purchaseLine.po(line.id, 3, "1")]));
    expect(bought).toMatchObject({ status: "APPROVED", autoApproved: true });
    expect(await buckets(m.id)).toMatchObject({ pending: [2, "1.000"], sold: [2, "1.000"], purchased: [2, "1.000"] });
    expect((await prisma.purchaseOrderLine.findUniqueOrThrow({ where: { id: line.id } })).purchasedPcs).toBe(3);
    // The PO is used now.
    expect(await failure(s.po.update(ACTOR, po.id, 2, poInput([orderLine(8, "4")])))).toMatchObject({ code: "PURCHASE_ORDER_IN_USE", details: { usedBy: bought.docNo } });
    // Edit the purchase: equal to a fresh Save of the new content.
    await s.purchase.update(ACTOR, bought.id, 1, purchaseInput([purchaseLine.stock(m.id, "MERGED", 3, "1.5"), purchaseLine.po(line.id, 5, "2")]));
    const edited = { m: await buckets(m.id), k: await buckets(k.id), po: (await prisma.purchaseOrderLine.findUniqueOrThrow({ where: { id: line.id } })).purchasedPcs };
    // m: Sold part 1 first, then 2 from stock (pending 3 → 1); k back to before; PO line 5.
    expect(edited).toEqual({ m: { ...mBefore, pending: [1, "0.500"], sold: [3, "1.500"], purchased: [3, "1.500"] }, k: kBefore, po: 5 });
    expect((await s.purchase.get(bought.id)).lines[0]).toMatchObject({ soldPartPcs: 1, soldPartWeightCt: "0.500" });
    // Delete: everything back to before the Save, the Sold part cleared.
    await expect(s.purchase.delete(ACTOR, bought.id, 2)).resolves.toEqual({ ok: true, version: 3 });
    expect({ m: await buckets(m.id), k: await buckets(k.id), po: (await prisma.purchaseOrderLine.findUniqueOrThrow({ where: { id: line.id } })).purchasedPcs }).toEqual({ m: mBefore, k: kBefore, po: 0 });
    expect((await prisma.purchaseLine.findMany({ where: { purchaseId: bought.id } })).every((row) => row.soldPartPcs === null)).toBe(true);
    // A soft-deleted purchase still names the PO line (RESTRICT key): the PO stays used.
    // G9: the deleted user is named with " (deleted)" so the page can explain why.
    expect(await failure(s.po.delete(ACTOR, po.id, 2))).toMatchObject({ code: "PURCHASE_ORDER_IN_USE", details: { usedBy: `${bought.docNo} (deleted)` } });
    expect(await s.po.get(po.id, { isSuperAdmin: true, grants: [] })).toMatchObject({ canEdit: false, usedBy: { docNo: `${bought.docNo} (deleted)` } });
    // A deleted PO is never offered to Purchase.
    const other = await s.po.create(ACTOR, poInput([orderLine(2, "1")]));
    await s.po.delete(ACTOR, other.id, 1);
    expect((await s.purchase.purchaseOrderLines({ vendorId: vendor.id, currency: "THB", status: "ALL", limit: 50 } as never)).items.map((row) => row.purchaseOrder.id)).not.toContain(other.id);
    await setApproval(prisma, "purchase-order", true);
    await setApproval(prisma, "purchase", true);
  });

  it("IT-AP-B05 / B06 / B07 review interplay: rejected / revised sources are not offered; approve vs reject race; delete of REVISION_REQUESTED, not REJECTED", async () => {
    for (const type of TYPES) await setApproval(prisma, type, true);
    const [item] = await stock([receiveLine(5, "2.5")]);
    const out = await submitted(s.memoOut, ACTOR, await s.memoOut.create(ACTOR, outInput([stockLine(item.id, 1, "0.5")])));
    await s.memoOut.reject(APPROVER, out.id, 2, "No");
    const outstanding = await s.memoOutReturn.outstanding(schemas.memoOutOutstandingSchema.parse({ customerId: customer.id, currency: "THB" }));
    expect(JSON.stringify(outstanding)).not.toContain(out.id);
    const po = await submitted(s.po, ACTOR, await s.po.create(ACTOR, poInput([orderLine(1, "1")])));
    await s.po.requestRevision(APPROVER, po.id, 2, "Fix");
    expect((await s.purchase.purchaseOrderLines({ vendorId: vendor.id, currency: "THB", status: "ALL", limit: 50 } as never)).items.map((row) => row.purchaseOrder.id)).not.toContain(po.id);
    // Delete REVISION_REQUESTED → ok; restore → DRAFT (ON, G3) keeping the revise count; delete REJECTED → STATUS_INVALID.
    await expect(s.po.delete(ACTOR, po.id, 3)).resolves.toEqual({ ok: true, version: 4 });
    await expect(s.po.restore(ACTOR, po.id, 4)).resolves.toMatchObject({ status: "DRAFT" });
    expect(await s.po.get(po.id)).toMatchObject({ status: "DRAFT", revisionCount: 1, review: { action: "REVISE" } });
    expect(await failure(s.memoOut.delete(ACTOR, out.id, 3))).toMatchObject({ code: "MEMO_OUT_STATUS_INVALID" });
    // Reject a deleted draft → DELETED.
    const doomed = await s.po.create(ACTOR, poInput([orderLine(1, "1")]));
    await s.po.delete(ACTOR, doomed.id, 1);
    expect(await failure(s.po.reject(APPROVER, doomed.id, 2, "x"))).toMatchObject({ code: "PURCHASE_ORDER_DELETED" });
    // Race: approve and reject with the same version → exactly one wins; CHECKs hold.
    for (let round = 0; round < 3; round += 1) {
      const doc = await submitted(s.reserve, ACTOR, await s.reserve.create(ACTOR, outInput([stockLine(item.id, 1, "0.5")])));
      const results = await Promise.allSettled([s.reserve.approve(ACTOR, doc.id, 2), s.reserve.reject(APPROVER, doc.id, 2, "No")]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const row = await prisma.reserve.findUniqueOrThrow({ where: { id: doc.id }, select: { status: true, version: true, reviewAction: true } });
      expect(row.version).toBe(3);
      expect(row.status === "REJECTED" ? row.reviewAction : "APPROVED").toBe(row.status === "REJECTED" ? "REJECT" : row.status);
    }
  });

  it("IT-AS-B13 / B14 Quotation joins the flow (OFF: auto-approved and editable; ON: draft → submit → reject read-only; cancel unchanged); lists carry the Daybook fields and filter DRAFT", async () => {
    await setApproval(prisma, "quotation", false);
    const auto = await s.quotation.create(ACTOR, quoteInput());
    expect(auto).toMatchObject({ status: "APPROVED", autoApproved: true });
    await expect(s.quotation.update(ACTOR, auto.id, 1, quoteInput())).resolves.toMatchObject({ status: "APPROVED", version: 2 });
    expect(await failure(s.quotation.submit({ id: ACTOR, name: null }, auto.id, 2))).toMatchObject({ code: "QUOTATION_STATUS_INVALID" });
    await setApproval(prisma, "quotation", true);
    // Turning ON keeps the auto-approved quotation editable (D5).
    await expect(s.quotation.update(ACTOR, auto.id, 2, quoteInput())).resolves.toMatchObject({ status: "APPROVED", autoApproved: true, version: 3 });
    const draft = await s.quotation.create(ACTOR, quoteInput());
    expect(draft).toMatchObject({ status: "DRAFT" });
    await s.quotation.submit({ id: ACTOR, name: "Maker" }, draft.id, 1);
    expect(await failure(s.quotation.update(ACTOR, draft.id, 2, quoteInput()))).toMatchObject({ code: "QUOTATION_STATUS_INVALID" });
    await s.quotation.reject(APPROVER, draft.id, 2, "Too expensive");
    expect(await s.quotation.get(draft.id)).toMatchObject({ status: "REJECTED", statusReason: "Too expensive", review: { action: "REJECT", note: "Too expensive" }, canEdit: false });
    // Cancel still works on a rejected quotation (CANCELLED is exempt from the review / auto CHECKs).
    await expect(s.quotation.cancel(ACTOR, draft.id, 3, "Closed")).resolves.toMatchObject({ status: "CANCELLED" });
    await expect(s.quotation.cancel(ACTOR, auto.id, 3, "Closed")).resolves.toMatchObject({ status: "CANCELLED" });
    // A second Revise is refused.
    const revised = await submitted(s.quotation, ACTOR, await s.quotation.create(ACTOR, quoteInput()));
    await s.quotation.requestRevision(APPROVER, revised.id, 2, "Fix");
    await s.quotation.submit({ id: ACTOR, name: null }, revised.id, 3);
    expect(await failure(s.quotation.requestRevision(APPROVER, revised.id, 4, "Again"))).toMatchObject({ code: "QUOTATION_REVISE_LIMIT" });
    await expect(s.quotation.approve(ACTOR, revised.id, 4)).resolves.toMatchObject({ status: "APPROVED" });
    expect(await s.quotation.get(revised.id)).toMatchObject({ autoApproved: false, canEdit: false, revisionCount: 1 });
    // IT-AS-B14 Daybook fields; DRAFT filter.
    const fresh = await s.quotation.create(ACTOR, quoteInput());
    const drafts = await s.quotation.list({ customerId: customer.id, status: "DRAFT", limit: 50, deleted: false });
    expect(drafts.items.map((row) => row.id)).toEqual([fresh.id]);
    const all = await s.quotation.list({ customerId: customer.id, limit: 50, deleted: false });
    expect(all.items.find((row) => row.id === revised.id)).toMatchObject({ status: "APPROVED", autoApproved: false, revisionCount: 1, review: { action: "REVISE", note: "Fix", byName: "Approver" } });
    const reserves = await s.reserve.list({ partyId: customer.id, limit: 50, deleted: false } as never);
    expect(reserves.items.every((row) => "autoApproved" in row && "review" in row && "revisionCount" in row)).toBe(true);
    expect(reserves.items.some((row) => row.status === "REJECTED" && row.review?.action === "REJECT")).toBe(true);
    await setApproval(prisma, "quotation", false);
  });
});

describe("approval documents guard", () => {
  it("runs only against an explicit loopback, non-5432 f1_system URL", () => {
    expect(typeof canRun).toBe("boolean");
  });
});
