import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Decimal } from "../../src/platform/db";
import { classifyKind } from "../../src/modules/stock/card-kinds";
import { allocate, type Locked } from "../../src/modules/sale/own-stock";
import { consumptionLines } from "../../src/modules/sale/prepare";
import { saleInputSchema } from "../../src/modules/sale/schemas";
import { canRun, masterFixtures, startHarness, type Harness } from "../support/harness";
import { cleanupLoads, seedLoad } from "../stock-card/support";

/**
 * Sale own stock (ADR-0058 phase A; IT-SO-*): From Stock lots of own stock consumed FIFO at apply, exact reversal on edit / delete,
 * Stock Card ledger kinds, over-consumption refusal, no master call for an own-only Sale. Opt-in like the other DB suites.
 */
const TAG = `so-${randomUUID().slice(0, 8)}`;
const MAKER = ["sale:VIEW", "sale:ADD", "sale:EDIT", "sale:DELETE", "approval-setup:VIEW", "approval-setup:EDIT"];
const APPROVER = ["sale:VIEW", "sale:APPROVE", "approval-setup:VIEW"];
const money = { discount: { type: "NONE" as const, value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [] as unknown[], labor: null };
const OL = `OL${"a".repeat(32)}`;
const OS = `OS${randomUUID()}`;
const ML = `ML${"b".repeat(32)}`;

describe("UT-SO-01 Sale own-stock schema and consumption set", () => {
  const base = { docDate: "2026-11-19", dueDate: "2026-11-30", customerId: randomUUID(), shippingAddressId: randomUUID(), invoiceAddressId: randomUUID(), currency: "THB", exchangeRate: null, ...money };
  const own = (patch: Record<string, unknown> = {}) => ({ source: "OWN_STOCK", lotKey: OL, pcs: 1, weightCt: "0.5", unitPrice: "100", discount: { type: "NONE", value: "0" }, photoIds: [], ...patch });
  const codes = (lines: unknown[]) => {
    const parsed = saleInputSchema.safeParse({ ...base, lines });
    return parsed.success ? [] : parsed.error.issues.map((issue) => `${issue.path.join(".")}:${(issue as { params?: { code?: string } }).params?.code ?? issue.code}`);
  };
  it("accepts an own lot (OL / OS key); refuses a Memo Stock key, an item id or a Reserve line on it; one lot once per document", () => {
    expect(codes([own(), own({ lotKey: OS })])).toEqual([]);
    expect(codes([own({ lotKey: ML })])).toEqual(["lines.0.reference:invalid"]);
    expect(codes([own({ memoStockId: randomUUID() })])).toEqual(["lines.0.reference:invalid"]);
    expect(codes([own({ lotKey: undefined })])).toEqual(["lines.0.reference:required"]);
    expect(codes([own(), own()])).toEqual(["lines.1.reference:duplicate"]);
  });
  it("a Memo Stock line refuses an own lot key", () => {
    expect(codes([{ ...own(), source: "STOCK" }])).toEqual(["lines.0.reference:invalid"]);
  });
  it("own lines are never sent to master", () => {
    const set = consumptionLines([
      { id: "1", source: "OWN_STOCK", reserveLineId: null, memoStockId: null, lotKey: OL, pcs: 1, weightCt: "1" },
      { id: "2", source: "STOCK", reserveLineId: null, memoStockId: randomUUID(), lotKey: null, pcs: 1, weightCt: "1" },
    ]);
    expect(set.map((line) => line.lineId)).toEqual(["2"]);
  });
  it("FIFO allocation: oldest first, pcs and weight separately, short quantities reported", () => {
    const stock = (id: string, date: string, pcs: number, weight: string): Locked => ({ id, stock_id: id, lot_key: OL, ref_doc_date: date, on_hand_pcs: pcs, on_hand_weight_ct: weight, load_syncing: false });
    const stocks = [stock("a", "2026-11-01", 3, "1.500"), stock("b", "2026-11-05", 4, "2.000")];
    const full = allocate(stocks, 5, new Decimal("2.5"));
    expect([...full.takes].map(([id, take]) => [id, take.pcs, take.weight.toFixed(3)])).toEqual([["a", 3, "1.500"], ["b", 2, "1.000"]]);
    expect([full.shortPcs, full.shortWeight]).toEqual([false, false]);
    const part = allocate(stocks, 1, new Decimal("0.2"));
    expect([...part.takes].map(([id, take]) => [id, take.pcs, take.weight.toFixed(3)])).toEqual([["a", 1, "0.200"]]);
    const short = allocate(stocks, 8, new Decimal("4"));
    expect([short.shortPcs, short.shortWeight]).toEqual([true, true]);
  });
  it("Stock Card registry: SALE_OUT / SALE_OUT_REVERSAL are Sale movements", () => {
    expect(classifyKind("SALE_OUT")).toEqual({ documentType: "sale", effect: "MOVEMENT" });
    expect(classifyKind("SALE_OUT_REVERSAL")).toEqual({ documentType: "sale", effect: "MOVEMENT" });
  });
});

let h: Harness;
let fx: Awaited<ReturnType<typeof masterFixtures>>;
let maker: Awaited<ReturnType<Harness["user"]>>;
let approver: Awaited<ReturnType<Harness["user"]>>;
let viewer: Awaited<ReturnType<Harness["user"]>>;
const customer = { id: randomUUID(), shipping: randomUUID(), invoice: randomUUID() };
const loadIds: string[] = [];
const saleIds: string[] = [];
const vendorId = randomUUID();

const body = (lines: unknown[]) => ({
  docDate: "2026-11-19", dueDate: "2026-12-19", customerId: customer.id, shippingAddressId: customer.shipping, invoiceAddressId: customer.invoice,
  currency: "THB", exchangeRate: null, ref: TAG, documentNote: "", ...money, lines,
});
const ownLine = (lotKey: string, pcs: number, weightCt: string, patch: Record<string, unknown> = {}) => ({ source: "OWN_STOCK", lotKey, pcs, weightCt, unitPrice: "200", discount: { type: "NONE", value: "0" }, photoIds: [], ...patch });
async function setting(on: boolean) {
  await h.ownerDb.$executeRaw`UPDATE "inventory"."approval_setting" SET "require_approval" = ${on}, "version" = "version" + 1 WHERE "type" = 'sale'`;
}
async function seed(pcs: number, weightCt: string, docDate: string, lot = "SO-LOT") {
  const loaded = await seedLoad(h, { pcs, weightCt, docDate, vendorId, lot, stoneCode: `SO-${TAG}`, stone: "Ruby" });
  loadIds.push(loaded.loadId);
  return loaded;
}
const stockOf = async (id: string) => {
  const s = await h.ownerDb.stock.findUniqueOrThrow({ where: { id } });
  return { onHand: s.on_hand_pcs, onHandW: s.on_hand_weight_ct.toFixed(3), sold: s.sold_pcs, soldW: s.sold_weight_ct.toFixed(3), pcs: s.pcs };
};
async function ledger(stockUuid: string) {
  return (await h.ownerDb.stock_movement.findMany({ where: { stock_uuid: stockUuid, document_type: "sale" }, orderBy: { created_at: "asc" } })).map((row) => [row.kind, row.pcs_delta, row.weight_delta.toFixed(3)]);
}

describe.runIf(canRun)("IT-SO sale own stock on PostgreSQL", () => {
  beforeAll(async () => {
    h = await startHarness();
    fx = await masterFixtures(h, TAG);
    const prisma = h.master.prisma;
    const address = { position: 1, name: `SO Customer ${TAG}`, address: "2 Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true };
    await prisma.customer.create({ data: {
      id: customer.id, name: `SO Customer ${TAG}`, nameKey: `so customer ${TAG}`.toLowerCase(), code: `SOC${TAG.slice(-5)}`.toUpperCase(), codeKey: `soc${TAG.slice(-5)}`.toLowerCase(),
      currencyCode: "THB", firstName: "It", email: "so-it@example.test", createdBy: TAG, updatedBy: TAG,
      addresses: { create: [{ ...address, id: customer.shipping, type: "SHIPPING" }, { ...address, id: customer.invoice, type: "INVOICE" }] },
    } });
    maker = await h.user(MAKER, { name: "Own Maker" });
    approver = await h.user(APPROVER, { name: "Own Approver" });
    viewer = await h.user(["sale:VIEW"], { name: "Own Viewer" });
    h.approverIds.push(approver.userId);
  }, 90_000);

  afterAll(async () => {
    if (!h) return;
    await setting(true);
    const db = h.ownerDb;
    await db.sale.deleteMany({ where: { customer_id: customer.id } });
    for (const id of saleIds) await db.stock_hold_document.deleteMany({ where: { document_type: "sale", document_id: id } });
    await cleanupLoads(h, loadIds);
    await h.master.prisma.customer.deleteMany({ where: { id: customer.id } });
    await fx.cleanup();
    await h.close();
  });

  const create = async (lines: unknown[], user = maker) => {
    const response = await user.call("POST", "/sale", body(lines));
    if (response.body.id) saleIds.push(response.body.id);
    return response;
  };
  const lotKeyOf = async (stockUuid: string) => (await h.ownerDb.stock.findUniqueOrThrow({ where: { id: stockUuid } })).lot_key!;

  it("IT-SO-01 auto-approved own-only Sale: lot picked, allocation rows, SALE_OUT ledger, Stock Card header; no master sale-consumption call", async () => {
    await setting(false);
    const stock = await seed(5, "2.500", "2026-11-01");
    const key = await lotKeyOf(stock.id);
    expect(key.startsWith("OS")).toBe(true);
    const saved = await h.measured(() => create([ownLine(key, 3, "1.500")]));
    expect(saved.result.status).toBe(201);
    expect(saved.result.body).toMatchObject({ status: "APPROVED", version: 1 });
    expect(saved.master).toEqual(["POST /internal/v1/inventory/sale/prepare", "POST /internal/v1/inventory/document-numbering/resolve"]);
    expect(await stockOf(stock.id)).toEqual({ onHand: 2, onHandW: "1.000", sold: 3, soldW: "1.500", pcs: 5 });
    expect(await ledger(stock.id)).toEqual([["SALE_OUT", -3, "-1.500"]]);
    const allocs = await h.ownerDb.sale_line_alloc.findMany({ where: { sale_line: { sale_id: saved.result.body.id } } });
    expect(allocs.map((row) => [row.own_stock_uuid, row.memo_stock_id, row.stock_id, row.pcs])).toEqual([[stock.id, null, stock.stockId, 3]]);
    const header = await h.ownerDb.stock_hold_document.findUniqueOrThrow({ where: { document_type_document_id: { document_type: "sale", document_id: saved.result.body.id } } });
    expect(header).toMatchObject({ document_no: saved.result.body.docNo, party_id: customer.id });
    const detail = await maker.call("GET", `/sale/${saved.result.body.id}`);
    expect(detail.body.lines[0]).toMatchObject({ source: "OWN_STOCK", lotKey: key, stockId: "", allocated: true, sourceDoc: { type: "LOAD", id: stock.loadId, docNo: stock.docNo }, capPcs: 5, capWeightCt: "2.500" });
    expect(await h.ownerDb.sale_line.findFirst({ where: { sale_id: saved.result.body.id }, select: { source: true, unit_price: true } })).toMatchObject({ source: "OWN_STOCK" });
  });

  it("IT-SO-02 edit down returns exactly what was taken; edit up takes more; delete returns everything; the ledger nets to zero", async () => {
    await setting(false);
    const stock = await seed(6, "3.000", "2026-11-02", "SO-LOT-2");
    const key = await lotKeyOf(stock.id);
    const saved = await create([ownLine(key, 4, "2.000")]);
    expect(saved.status).toBe(201);
    const id = saved.body.id as string;
    expect(await stockOf(stock.id)).toMatchObject({ onHand: 2, sold: 4 });
    const detail = (await maker.call("GET", `/sale/${id}`)).body;
    // The line's own quantity counts as available again at edit (cap 6), so the edit may go up to the whole lot.
    expect(detail.lines[0]).toMatchObject({ capPcs: 6, capWeightCt: "3.000" });
    const down = await maker.call("PUT", `/sale/${id}`, { ...body([{ ...ownLine(key, 1, "0.500"), id: detail.lines[0].id }]), expectedVersion: detail.version });
    expect(down.status).toBe(200);
    expect(await stockOf(stock.id)).toMatchObject({ onHand: 5, sold: 1 });
    const second = (await maker.call("GET", `/sale/${id}`)).body;
    const up = await maker.call("PUT", `/sale/${id}`, { ...body([{ ...ownLine(key, 6, "3.000"), id: second.lines[0].id }]), expectedVersion: second.version });
    expect(up.status).toBe(200);
    expect(await stockOf(stock.id)).toMatchObject({ onHand: 0, sold: 6 });
    const after = (await maker.call("GET", `/sale/${id}`)).body;
    const deleted = await maker.call("POST", `/sale/${id}/delete`, { expectedVersion: after.version });
    expect(deleted.status).toBe(200);
    expect(await stockOf(stock.id)).toMatchObject({ onHand: 6, onHandW: "3.000", sold: 0, soldW: "0.000" });
    expect(await h.ownerDb.sale_line_alloc.count({ where: { sale_line: { sale_id: id } } })).toBe(0);
    const net = (await h.ownerDb.stock_movement.aggregate({ where: { stock_uuid: stock.id, document_type: "sale" }, _sum: { pcs_delta: true } }))._sum.pcs_delta;
    expect(net).toBe(0);
  });

  it("IT-SO-03 over-consumption: Save refuses above what is on hand (exceeds_pending); an Approve that lost the race is SALE_SOURCE_SHORT and changes nothing", async () => {
    await setting(true);
    const s = await seed(3, "1.500", "2026-11-03", "SO-LOT-3");
    const key = await lotKeyOf(s.id);
    const tooMany = await create([ownLine(key, 4, "1.000")]);
    expect(tooMany.status).toBe(422);
    expect(tooMany.body.error).toMatchObject({ code: "VALIDATION_ERROR", details: { fieldErrors: [{ path: "lines.0.pcs", code: "exceeds_pending", params: { availablePcs: 3, availableWeightCt: "1.500" } }] } });
    const draft = await create([ownLine(key, 2, "1.000")]);
    expect(draft.body).toMatchObject({ status: "DRAFT" });
    expect(await stockOf(s.id)).toMatchObject({ onHand: 3, sold: 0 });
    const submitted = await maker.call("POST", `/sale/${draft.body.id}/submit`, { expectedVersion: 1 });
    expect(submitted.status).toBe(200);
    await h.ownerDb.stock.update({ where: { id: s.id }, data: { on_hand_pcs: 1, on_hand_weight_ct: "0.500", reserved_pcs: 2, reserved_weight_ct: "1.000" } });
    const refused = await approver.call("POST", `/sale/${draft.body.id}/approve`, { expectedVersion: 2 });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatchObject({ code: "SALE_SOURCE_SHORT", details: { fieldErrors: expect.arrayContaining([expect.objectContaining({ path: "lines.0.pcs", code: "exceeds_pending", params: expect.objectContaining({ availablePcs: 1 }) })]) } });
    expect(await stockOf(s.id)).toMatchObject({ onHand: 1, sold: 0 });
    expect((await maker.call("GET", `/sale/${draft.body.id}`)).body).toMatchObject({ status: "PENDING_APPROVAL", syncing: false });
    // Stock held by a Reserve (reserved bucket) is not sold: the lot shows only the on-hand piece.
    await h.ownerDb.stock.update({ where: { id: s.id }, data: { on_hand_pcs: 3, on_hand_weight_ct: "1.500", reserved_pcs: 0, reserved_weight_ct: "0" } });
    const approved = await approver.call("POST", `/sale/${draft.body.id}/approve`, { expectedVersion: 2 });
    expect(approved.status).toBe(200);
    expect(await stockOf(s.id)).toMatchObject({ onHand: 1, sold: 2 });
    expect(await ledger(s.id)).toEqual([["SALE_OUT", -2, "-1.000"]]);
  });

  it("IT-SO-04 a lot with nothing on hand is SALE_REFERENCE_INVALID; a view-only user cannot create", async () => {
    await setting(false);
    const gone = await create([ownLine(`OS${randomUUID()}`, 1, "0.100")]);
    expect(gone.status).toBe(422);
    expect(gone.body.error).toMatchObject({ code: "SALE_REFERENCE_INVALID", details: { fieldErrors: [{ path: "lines.0.reference", code: "unavailable" }] } });
    const denied = await create([ownLine(OL, 1, "0.100")], viewer);
    expect(denied.status).toBe(403);
  });
});
