/* eslint-disable @typescript-eslint/no-explicit-any -- api-master Prisma client is loaded untyped (separate tsconfig) */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canRun, masterFixtures, startHarness, type Harness } from "../support/harness";
import { cleanupLoads, seedLoad } from "../stock-card/support";

/**
 * Sale From Reserve over OWN stock (ADR-0058 phase B, IT-SO-B*): the Reserve line holds Load to Stock stock (inventory
 * `stock_hold`, reserved bucket); the Sale settles it through the REAL master consumption (oldest seq first), inventory moves
 * reserved -> sold, shrinks the Reserve hold and writes SALE_OUT; edit / delete return exactly that. Opt-in like the other DB suites.
 */
const TAG = `sr-${randomUUID().slice(0, 8)}`;
const MAKER = ["sale:VIEW", "sale:ADD", "sale:EDIT", "sale:DELETE", "approval-setup:VIEW", "approval-setup:EDIT"];
const money = { discount: { type: "NONE" as const, value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [] as unknown[], labor: null };

let h: Harness;
let fx: Awaited<ReturnType<typeof masterFixtures>>;
let maker: Awaited<ReturnType<Harness["user"]>>;
let prisma: any;
const customer = { id: randomUUID(), shipping: randomUUID(), invoice: randomUUID() };
const vendorId = randomUUID();
const loadIds: string[] = [];
const reserveIds: string[] = [];
const saleIds: string[] = [];

async function setting(on: boolean) {
  await h.ownerDb.$executeRaw`UPDATE "inventory"."approval_setting" SET "require_approval" = ${on}, "version" = "version" + 1 WHERE "type" = 'sale'`;
}
/** An approved own-stock Reserve of `reserved` out of a fresh stock: master reserve + line + allocation, inventory hold + reserved bucket. */
async function ownReserve(total: { pcs: number; weightCt: string }, reserved: { pcs: number; weightCt: string }) {
  const stock = await seedLoad(h, { pcs: total.pcs, weightCt: total.weightCt, vendorId, lot: `SR-${TAG.slice(-4)}`, stoneCode: `SR-${TAG}` });
  loadIds.push(stock.loadId);
  const key = (await h.ownerDb.stock.findUniqueOrThrow({ where: { id: stock.id } })).lot_key!;
  const reserveId = randomUUID();
  const lineId = randomUUID();
  reserveIds.push(reserveId);
  const run = Math.floor(Math.random() * 1_000_000) + 1;
  const docNo = `RS-${TAG}-${run}`;
  await prisma.$executeRaw`
    INSERT INTO "partner"."reserve" ("id", "running_no", "doc_no", "status", "doc_date", "due_date", "customer_id", "customer_code_snapshot", "customer_name_snapshot", "shipping_address_snapshot",
      "invoice_address_snapshot", "currency_code", "discount_type", "discount_value", "tax_enabled", "tax_rate", "tax_included", "subtotal", "discount_amount", "price_before_tax", "tax_amount",
      "charges_amount", "labor_amount", "grand_total", "created_by", "updated_by", "line_count", "total_pcs", "total_weight_ct", "approved_at", "approved_by", "auto_approved")
    VALUES (${reserveId}::uuid, ${run}::int, ${docNo}, 'APPROVED', '2026-11-10'::date, '2026-12-10'::date, ${customer.id}::uuid, 'C', 'C', '', '', 'THB', 'NONE', 0, false, 7, false, 0, 0, 0, 0, 0, 0, 0,
      'it', 'it', 1, ${reserved.pcs}::int, ${reserved.weightCt}::numeric, now(), 'it', true)`;
  await prisma.$executeRaw`
    INSERT INTO "partner"."reserve_line" ("id", "reserve_id", "position", "source", "stone", "pcs", "weight_ct", "price_unit", "unit_price", "amount", "lot_key", "stock_count", "stock_pending_pcs", "stock_pending_weight_ct", "lot", "location")
    VALUES (${lineId}::uuid, ${reserveId}::uuid, 1, 'OWN_STOCK', 'Ruby', ${reserved.pcs}::int, ${reserved.weightCt}::numeric, 'PER_CT', 1000, 1000, ${key}, 1, ${total.pcs}::int, ${total.weightCt}::numeric, 'SR', 'Safe A')`;
  await prisma.$executeRaw`
    INSERT INTO "partner"."reserve_line_alloc" ("id", "line_id", "seq", "own_stock_id", "stock_id", "pcs", "weight_ct")
    VALUES (gen_random_uuid(), ${lineId}::uuid, 1, ${stock.id}::uuid, ${stock.stockId}, ${reserved.pcs}::int, ${reserved.weightCt}::numeric)`;
  const db = h.ownerDb;
  await db.stock.update({ where: { id: stock.id }, data: {
    on_hand_pcs: total.pcs - reserved.pcs, on_hand_weight_ct: (Number(total.weightCt) - Number(reserved.weightCt)).toFixed(3), reserved_pcs: reserved.pcs, reserved_weight_ct: reserved.weightCt,
  } });
  await db.stock_hold_document.create({ data: { document_type: "reserve", document_id: reserveId, applied_revision: 1, request_hash: "a".repeat(64), document_no: docNo } });
  await db.stock_hold.create({ data: { id: randomUUID(), document_type: "reserve", document_id: reserveId, stock_uuid: stock.id, kind: "RESERVED", pcs: reserved.pcs, weight_ct: reserved.weightCt, revision: 1, document_no: docNo } });
  return { stock, reserveId, lineId, docNo };
}
const rLine = (reserveLineId: string, pcs: number, weightCt: string, patch: Record<string, unknown> = {}) => ({ source: "RESERVE", reserveLineId, pcs, weightCt, unitPrice: "3000", discount: { type: "NONE", value: "0" }, photoIds: [], ...patch });
const body = (lines: unknown[]) => ({
  docDate: "2026-11-19", dueDate: "2026-12-19", customerId: customer.id, shippingAddressId: customer.shipping, invoiceAddressId: customer.invoice,
  currency: "THB", exchangeRate: null, ref: TAG, documentNote: "", ...money, lines,
});
const stockOf = async (id: string) => {
  const s = await h.ownerDb.stock.findUniqueOrThrow({ where: { id } });
  return { onHand: s.on_hand_pcs, reserved: s.reserved_pcs, sold: s.sold_pcs, soldW: s.sold_weight_ct.toFixed(3), reservedW: s.reserved_weight_ct.toFixed(3) };
};
const holdOf = async (reserveId: string, stockUuid: string) => (await h.ownerDb.stock_hold.findFirst({ where: { document_type: "reserve", document_id: reserveId, stock_uuid: stockUuid } }))?.pcs ?? 0;
const masterLine = async (lineId: string) => {
  const l = await prisma.reserveLine.findUniqueOrThrow({ where: { id: lineId } });
  const a = await prisma.reserveLineAlloc.findMany({ where: { lineId } });
  return { sold: l.soldPcs, soldW: l.soldWeightCt.toFixed(3), settled: a.map((row: { settledPcs: number }) => row.settledPcs) };
};

describe.runIf(canRun)("IT-SO-B sale From Reserve over own stock", () => {
  beforeAll(async () => {
    h = await startHarness();
    fx = await masterFixtures(h, TAG);
    prisma = h.master.prisma;
    const address = { position: 1, name: `SR Customer ${TAG}`, address: "2 Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true };
    await prisma.customer.create({ data: {
      id: customer.id, name: `SR Customer ${TAG}`, nameKey: `sr customer ${TAG}`.toLowerCase(), code: `SRC${TAG.slice(-5)}`.toUpperCase(), codeKey: `src${TAG.slice(-5)}`.toLowerCase(),
      currencyCode: "THB", firstName: "It", email: "sr-it@example.test", createdBy: TAG, updatedBy: TAG,
      addresses: { create: [{ ...address, id: customer.shipping, type: "SHIPPING" }, { ...address, id: customer.invoice, type: "INVOICE" }] },
    } });
    maker = await h.user(MAKER, { name: "Reserve Maker" });
  }, 90_000);

  afterAll(async () => {
    if (!h) return;
    await setting(true);
    const db = h.ownerDb;
    await db.sale.deleteMany({ where: { customer_id: customer.id } });
    await prisma.saleConsumption.deleteMany({ where: { saleId: { in: saleIds } } });
    for (const id of saleIds) await db.stock_hold_document.deleteMany({ where: { document_type: "sale", document_id: id } });
    await prisma.reserve.deleteMany({ where: { id: { in: reserveIds } } });
    await cleanupLoads(h, loadIds);
    for (const id of reserveIds) await db.stock_hold_document.deleteMany({ where: { document_type: "reserve", document_id: id } });
    await prisma.customer.deleteMany({ where: { id: customer.id } });
    await fx.cleanup();
    await h.close();
  });

  it("IT-SO-B01 From Reserve lists the own-stock Reserve line; Sale approves: Reserve sold / settled, stock reserved -> sold, hold shrinks, SALE_OUT; edit and delete return exactly", async () => {
    await setting(false);
    const r = await ownReserve({ pcs: 5, weightCt: "2.500" }, { pcs: 3, weightCt: "1.500" });
    const listed = await maker.call("GET", `/sale/reserve-lines?customerId=${customer.id}&currency=THB&q=${encodeURIComponent(r.docNo)}`);
    expect(listed.status).toBe(200);
    expect(listed.body.items).toEqual([expect.objectContaining({ reserveLineId: r.lineId, source: "OWN_STOCK", openPcs: 3, openWeightCt: "1.500" })]);
    const saved = await maker.call("POST", "/sale", body([rLine(r.lineId, 2, "1.000")]));
    if (saved.body.id) saleIds.push(saved.body.id);
    expect(saved.status).toBe(201);
    expect(saved.body).toMatchObject({ status: "APPROVED" });
    expect(await masterLine(r.lineId)).toEqual({ sold: 2, soldW: "1.000", settled: [2] });
    expect(await stockOf(r.stock.id)).toEqual({ onHand: 2, reserved: 1, sold: 2, soldW: "1.000", reservedW: "0.500" });
    expect(await holdOf(r.reserveId, r.stock.id)).toBe(1);
    const ledger = await h.ownerDb.stock_movement.findMany({ where: { stock_uuid: r.stock.id, document_type: "sale" } });
    expect(ledger.map((row) => [row.kind, row.pcs_delta, row.weight_delta.toFixed(3)])).toEqual([["SALE_OUT", -2, "-1.000"]]);
    const allocs = await h.ownerDb.sale_line_alloc.findMany({ where: { sale_line: { sale_id: saved.body.id } } });
    expect(allocs.map((row) => [row.own_stock_uuid, row.pcs])).toEqual([[r.stock.id, 2]]);
    const after = await maker.call("GET", `/sale/reserve-lines?customerId=${customer.id}&currency=THB&q=${encodeURIComponent(r.docNo)}`);
    expect(after.body.items[0]).toMatchObject({ openPcs: 1, openWeightCt: "0.500" });
    const detail = (await maker.call("GET", `/sale/${saved.body.id}`)).body;
    expect(detail.lines[0]).toMatchObject({ source: "RESERVE", capPcs: 3 });
    const up = await maker.call("PUT", `/sale/${saved.body.id}`, { ...body([rLine(r.lineId, 3, "1.500", { id: detail.lines[0].id })]), expectedVersion: detail.version });
    expect(up.status).toBe(200);
    expect(await stockOf(r.stock.id)).toMatchObject({ reserved: 0, sold: 3, onHand: 2 });
    expect(await holdOf(r.reserveId, r.stock.id)).toBe(0);
    const second = (await maker.call("GET", `/sale/${saved.body.id}`)).body;
    expect((await maker.call("POST", `/sale/${saved.body.id}/delete`, { expectedVersion: second.version })).status).toBe(200);
    expect(await masterLine(r.lineId)).toEqual({ sold: 0, soldW: "0.000", settled: [0] });
    expect(await stockOf(r.stock.id)).toEqual({ onHand: 2, reserved: 3, sold: 0, soldW: "0.000", reservedW: "1.500" });
    expect(await holdOf(r.reserveId, r.stock.id)).toBe(3);
    const net = (await h.ownerDb.stock_movement.aggregate({ where: { stock_uuid: r.stock.id, document_type: "sale" }, _sum: { pcs_delta: true } }))._sum.pcs_delta;
    expect(net).toBe(0);
  });

  it("IT-SO-B02 selling more than the Reserve line's open quantity is refused (exceeds_open) and nothing moves", async () => {
    await setting(false);
    const r = await ownReserve({ pcs: 4, weightCt: "2.000" }, { pcs: 2, weightCt: "1.000" });
    const refused = await maker.call("POST", "/sale", body([rLine(r.lineId, 3, "1.500")]));
    expect(refused.status).toBe(422);
    expect(refused.body.error.details.fieldErrors).toEqual(expect.arrayContaining([expect.objectContaining({ path: "lines.0.pcs", code: "exceeds_open" })]));
    expect(await stockOf(r.stock.id)).toMatchObject({ reserved: 2, sold: 0 });
    expect(await masterLine(r.lineId)).toMatchObject({ sold: 0 });
  });
});
