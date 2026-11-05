import { randomUUID } from "node:crypto";
import { HttpException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * IT-PU-B01…B06 (purchase SA rev 1 / ADR-0042, owner 2026-11-04) against real PostgreSQL: the migration's columns,
 * CHECKs and partial uniques; Memo Stock and Purchase Order approval under row locks with the over-pull guard; the
 * document lifecycle with Document Setup numbers and shared-counter Stock IDs; the Memo Stock picker; and the
 * 200-line approve measurement.
 *
 * Opt-in like the other DB integrations (INV-20261021-007): runs only with `PARTNER_TEST_DATABASE_URL` pointing at a
 * disposable `f1_system` database on 127.0.0.1 with an explicit port other than 5432, migrated with `prisma migrate
 * deploy`. Rows are scoped to vendors created here and Stock ID year 75 (clocks faked to 2075; 50–74 are used by the
 * other suites); all are removed in `afterAll`.
 */

const testUrl = process.env.PARTNER_TEST_DATABASE_URL;
const canRun = Boolean(testUrl && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(testUrl));
const ACTOR = `pu-it-${randomUUID().slice(0, 8)}`;
const YEAR = 75;
const clock = () => new Date(`20${YEAR}-06-01T03:00:00Z`);

type PrismaClient = typeof import("../../src/database/prisma-client").prisma;
type Purchase = InstanceType<typeof import("../../src/purchase/purchase.service").PurchaseService>;
type Receive = InstanceType<typeof import("../../src/trade-document/memo-receive.service").MemoReceiveService>;
type Order = InstanceType<typeof import("../../src/purchase-order/purchase-order.service").PurchaseOrderService>;
type Outstanding = InstanceType<typeof import("../../src/trade-document/memo-outstanding.service").MemoOutstandingService>;
type Setup = InstanceType<typeof import("../../src/document-setup/document-setup.service").DocumentSetupService>;
type Vendor = { id: string; addressId: string };
type Input = import("../../src/purchase/purchase.schemas").PurchaseInput;

let prisma: PrismaClient;
let purchase: Purchase;
let receive: Receive;
let order: Order;
let outstanding: Outstanding;
let setup: Setup;
let isCheckViolation: typeof import("../../src/purchase/purchase.errors").isCheckViolation;
const vendors: Vendor[] = [];
const created = { currencies: [] as string[], setup: false };

const header = (vendor: Vendor, patch: Record<string, unknown> = {}) => ({
  docDate: "2026-11-04", dueDate: "2026-12-04", currency: "THB", exchangeRate: null, ref: "", documentNote: "",
  discount: { type: "NONE" as const, value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null,
  vendorId: vendor.id, addressId: vendor.addressId, ...patch,
});
const stoneFields = { stoneCode: "", stone: "Ruby", shape: "Oval", size: "", color: "Red", clarity: "", cutting: "", quality: "", lot: "LOT-A", cerType: "GIA", cerNo: "C-1" };
const receiveLine = (patch: Record<string, unknown> = {}) => ({
  source: "MANUAL" as const, ...stoneFields, pcs: 5, weightCt: "2.5", priceUnit: "PER_CT" as "PER_CT" | "PER_PCS", unitPrice: "1000",
  discount: { type: "NONE" as "NONE" | "PERCENT" | "AMOUNT", value: "0" }, itemNote: "", photoIds: [] as string[], ...patch,
});
const orderLine = (patch: Record<string, unknown> = {}) => ({
  source: "MANUAL" as const, stoneCodeId: null, ...stoneFields, stone: "Sapphire", location: "Safe A", pcs: 10, weightCt: "4", priceUnit: "PER_PCS" as "PER_CT" | "PER_PCS",
  unitPrice: "100", discount: { type: "PERCENT" as "NONE" | "PERCENT" | "AMOUNT", value: "10" }, itemNote: "", photoIds: [] as string[], ...patch,
});
/** What the page sends for a picked line: placeholders the server replaces from the source row. */
const typed = { stoneCodeId: null, stoneCode: "typed", stone: "typed", shape: "typed", size: "", color: "", clarity: "", cutting: "", quality: "", lot: "typed",
  location: "typed", cerType: "", cerNo: "", priceUnit: "PER_PCS" as const, discount: { type: "NONE" as const, value: "0" }, itemNote: "", photoIds: [] as [] };
const stockLine = (memoStockId: string, memoGroup: "IN_STOCK" | "SOLD", pcs: number, weightCt: string, patch: Record<string, unknown> = {}) =>
  ({ ...typed, source: "STOCK" as const, memoStockId, memoGroup, pcs, weightCt, unitPrice: "900", ...patch });
const poLine = (purchaseOrderLineId: string, pcs: number, weightCt: string, patch: Record<string, unknown> = {}) =>
  ({ ...typed, source: "PURCHASE_ORDER" as const, purchaseOrderLineId, pcs, weightCt, unitPrice: "90", ...patch });
const manualLine = (patch: Record<string, unknown> = {}) =>
  ({ ...typed, stoneCode: "", stone: "Emerald", lot: "M-1", location: "Shelf 1", source: "MANUAL" as const, pcs: 1, weightCt: "0.5", unitPrice: "10", ...patch });
const purchaseInput = (vendor: Vendor, lines: unknown[], patch: Record<string, unknown> = {}) => ({ ...header(vendor, patch), lines }) as unknown as Input;

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

/** SQLSTATE class of a raw statement that must be refused (23514 check, 23505 unique). */
async function sqlState(statement: string) {
  try { await prisma.$executeRawUnsafe(statement); } catch (error) {
    const text = JSON.stringify(error, Object.getOwnPropertyNames(error));
    if (/23514|check constraint/i.test(text)) return "23514";
    if (/23505|unique constraint|P2002/i.test(text)) return "23505";
    return text;
  }
  return "accepted";
}

async function vendorFixture(name: string, currencyCode = "THB"): Promise<Vendor> {
  const id = randomUUID();
  const addressId = randomUUID();
  const code = `PUIT${vendors.length}${ACTOR.slice(-4)}`;
  await prisma.vendor.create({ data: {
    id, name, nameKey: name.toLowerCase(), code: code.toUpperCase(), codeKey: code.toLowerCase(),
    currencyCode, firstName: "It", email: "pu-it@example.test", createdBy: ACTOR, updatedBy: ACTOR,
    addresses: { create: [{ id: addressId, position: 1, name: `${name} Co.`, address: "1 Test Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true }] },
  } });
  vendors.push({ id, addressId });
  return { id, addressId };
}

/** An approved memo receive: one Memo Stock item per line (pending = received), in line order. */
async function approvedStock(vendor: Vendor, lines: ReturnType<typeof receiveLine>[], patch: Record<string, unknown> = {}) {
  const saved = await receive.create(ACTOR, { ...header(vendor, patch), lines } as never);
  await receive.approve(ACTOR, saved.id, saved.version);
  const items = await prisma.memoStock.findMany({ where: { memoReceiveId: saved.id } });
  const byLine = new Map(items.map((item) => [item.memoReceiveLineId, item]));
  const lineIds = await prisma.memoReceiveLine.findMany({ where: { memoReceiveId: saved.id }, orderBy: { position: "asc" }, select: { id: true } });
  return { receiveId: saved.id, items: lineIds.map((line) => byLine.get(line.id)!) };
}

/** An approved purchase order; returns its line ids in position order. */
async function approvedOrder(vendor: Vendor, lines: ReturnType<typeof orderLine>[], approve = true, patch: Record<string, unknown> = {}) {
  const saved = await order.create(ACTOR, { ...header(vendor, patch), lines } as never);
  if (approve) await order.approve(ACTOR, saved.id, saved.version);
  const rows = await prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: saved.id }, orderBy: { position: "asc" }, select: { id: true } });
  return { id: saved.id, docNo: saved.docNo, lineIds: rows.map((row) => row.id) };
}

/** Moves quantity from pending into sold, as a future Sale approval would (the SOLD-group fixture). */
async function sell(memoStockId: string, pcs: number, weight: string) {
  await prisma.$executeRawUnsafe(`UPDATE "partner"."memo_stock" SET pending_pcs = pending_pcs - ${pcs}, pending_weight_ct = pending_weight_ct - ${weight},
    sold_pcs = sold_pcs + ${pcs}, sold_weight_ct = sold_weight_ct + ${weight} WHERE id = '${memoStockId}'`);
}

const buckets = async (id: string) => {
  const s = await prisma.memoStock.findUniqueOrThrow({ where: { id } });
  return {
    pending: [s.pendingPcs, s.pendingWeightCt.toFixed(3)], sold: [s.soldPcs, s.soldWeightCt.toFixed(3)], purchased: [s.purchasedPcs, s.purchasedWeightCt.toFixed(3)],
    balanced: s.pendingPcs === s.receivedPcs - s.returnedPcs - s.soldPcs - s.reservedPcs
      && s.pendingWeightCt.equals(s.receivedWeightCt.minus(s.returnedWeightCt).minus(s.soldWeightCt).minus(s.reservedWeightCt)),
    version: s.version,
  };
};
const poPurchased = async (id: string) => {
  const line = await prisma.purchaseOrderLine.findUniqueOrThrow({ where: { id }, select: { purchasedPcs: true, purchasedWeightCt: true } });
  return [line.purchasedPcs, line.purchasedWeightCt.toFixed(3)];
};

describe.runIf(canRun)("IT-PU purchase on PostgreSQL", () => {
  let vendorA: Vendor;
  let vendorB: Vendor;

  beforeAll(async () => {
    vi.stubEnv("PARTNER_DATABASE_URL", testUrl!);
    vi.stubEnv("DATABASE_URL", testUrl!);
    ({ prisma } = await import("../../src/database/prisma-client"));
    const { PurchaseService } = await import("../../src/purchase/purchase.service");
    const { MemoReceiveService } = await import("../../src/trade-document/memo-receive.service");
    const { PurchaseOrderService } = await import("../../src/purchase-order/purchase-order.service");
    const { MemoOutstandingService } = await import("../../src/trade-document/memo-outstanding.service");
    const { DocumentSetupService } = await import("../../src/document-setup/document-setup.service");
    ({ isCheckViolation } = await import("../../src/purchase/purchase.errors"));
    purchase = new PurchaseService();
    purchase.clock = clock;
    receive = new MemoReceiveService();
    receive.clock = clock;
    order = new PurchaseOrderService();
    outstanding = new MemoOutstandingService();
    setup = new DocumentSetupService();
    for (const code of ["THB", "USD"]) {
      if (!(await prisma.currency.findUnique({ where: { code } }))) {
        await prisma.currency.create({ data: { code, name: code, createdBy: ACTOR, updatedBy: ACTOR } });
        created.currencies.push(code);
      }
    }
    if (!(await prisma.documentSetup.findUnique({ where: { transactionKey: "purchase" } }))) {
      await prisma.documentSetup.create({ data: {
        transactionKey: "purchase", name: "Purchase", code: "PU", startFrom: 1, updatedBy: ACTOR,
        rows: { create: [{ id: randomUUID(), effectiveDate: new Date("2026-01-01T00:00:00Z"), prefix: "PU", separator: "-", startNo: 1 }] },
      } });
      created.setup = true;
    }
    await prisma.memoStockIdCounter.deleteMany({ where: { year: YEAR } });
    vendorA = await vendorFixture("PU IT Vendor A");
    vendorB = await vendorFixture("PU IT Vendor B");
  });

  afterAll(async () => {
    if (!prisma) return;
    const ids = vendors.map((vendor) => vendor.id);
    await prisma.purchase.deleteMany({ where: { vendorId: { in: ids } } });
    await prisma.purchaseOrder.deleteMany({ where: { vendorId: { in: ids } } });
    await prisma.memoStock.deleteMany({ where: { vendorId: { in: ids } } });
    await prisma.memoReceive.deleteMany({ where: { vendorId: { in: ids } } });
    await prisma.vendor.deleteMany({ where: { id: { in: ids } } });
    await prisma.memoStockIdCounter.deleteMany({ where: { year: YEAR } });
    if (created.setup && (await prisma.purchase.count()) === 0) await prisma.documentSetup.deleteMany({ where: { transactionKey: "purchase" } });
    if (created.currencies.length > 0) await prisma.currency.deleteMany({ where: { code: { in: created.currencies } } });
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  it("IT-PU-B01 migration: purchased_* default 0, memo_stock_purchased_check, line source CHECKs and the partial uniques", async () => {
    const { items: [item] } = await approvedStock(vendorA, [receiveLine()]);
    expect(item).toMatchObject({ purchasedPcs: 0, soldPcs: 0 });
    expect(item.purchasedWeightCt.toFixed(3)).toBe("0.000");
    // purchased > sold is refused (and recognised by the service mapper as a check violation).
    expect(await sqlState(`UPDATE "partner"."memo_stock" SET purchased_pcs = 1 WHERE id = '${item.id}'`)).toBe("23514");
    expect(await sqlState(`UPDATE "partner"."memo_stock" SET purchased_weight_ct = 0.001 WHERE id = '${item.id}'`)).toBe("23514");
    let caught: unknown;
    try { await prisma.$executeRawUnsafe(`UPDATE "partner"."memo_stock" SET purchased_pcs = -1 WHERE id = '${item.id}'`); } catch (error) { caught = error; }
    expect(isCheckViolation(caught)).toBe(true);

    const saved = await purchase.create(ACTOR, purchaseInput(vendorA, [manualLine()]));
    const insert = (values: Record<string, string>) => {
      const row = { id: `'${randomUUID()}'`, purchase_id: `'${saved.id}'`, position: "50", source: "'MANUAL'", stock_id: `'${randomUUID().slice(0, 6)}'`, pcs: "1", weight_ct: "1",
        price_unit: "'PER_CT'", unit_price: "1", amount: "1", ...values };
      return sqlState(`INSERT INTO "partner"."purchase_line" (${Object.keys(row).join(", ")}) VALUES (${Object.values(row).join(", ")})`);
    };
    expect(await insert({})).toBe("accepted");
    expect(await insert({ position: "51", source: "'STOCK'" })).toBe("23514"); // STOCK without memo_stock_id / memo_group
    expect(await insert({ position: "52", source: "'MANUAL'", memo_stock_id: `'${item.id}'` })).toBe("23514");
    expect(await insert({ position: "53", source: "'PURCHASE_ORDER'" })).toBe("23514");
    expect(await insert({ position: "54", source: "'STOCK'", memo_stock_id: `'${item.id}'`, memo_group: "'RESERVED'" })).toBe("23514");
    expect(await insert({ position: "55", pcs: "0", weight_ct: "0" })).toBe("23514");
    expect(await insert({ position: "56", unit_price: "0" })).toBe("23514");
    // Issued Stock IDs never repeat; a STOCK line repeats its item's id freely; one item × group and one PO line per document.
    const issued = (await prisma.purchaseLine.findFirstOrThrow({ where: { purchaseId: saved.id, position: 1 } })).stockId;
    expect(await insert({ position: "57", stock_id: `'${issued}'` })).toBe("23505");
    expect(await insert({ position: "58", source: "'STOCK'", memo_stock_id: `'${item.id}'`, memo_group: "'IN_STOCK'", stock_id: `'${item.stockId}'` })).toBe("accepted");
    expect(await insert({ position: "59", source: "'STOCK'", memo_stock_id: `'${item.id}'`, memo_group: "'SOLD'", stock_id: `'${item.stockId}'` })).toBe("accepted");
    expect(await insert({ position: "60", source: "'STOCK'", memo_stock_id: `'${item.id}'`, memo_group: "'IN_STOCK'", stock_id: `'${item.stockId}'` })).toBe("23505");
    const po = await approvedOrder(vendorA, [orderLine()]);
    expect(await insert({ position: "61", source: "'PURCHASE_ORDER'", purchase_order_line_id: `'${po.lineIds[0]}'` })).toBe("accepted");
    expect(await insert({ position: "62", source: "'PURCHASE_ORDER'", purchase_order_line_id: `'${po.lineIds[0]}'` })).toBe("23505");
    // Indexes exist with their partial predicates.
    const indexes = await prisma.$queryRawUnsafe<{ indexname: string; indexdef: string }[]>(
      `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'partner' AND indexname IN ('memo_stock_sold_open_idx', 'purchase_order_line_open_idx', 'purchase_line_issued_stock_id_key')`);
    expect(indexes.map((row) => row.indexname).sort()).toEqual(["memo_stock_sold_open_idx", "purchase_line_issued_stock_id_key", "purchase_order_line_open_idx"]);
    expect(indexes.find((row) => row.indexname === "memo_stock_sold_open_idx")!.indexdef).toMatch(/WHERE \(\(sold_pcs > purchased_pcs\) OR \(sold_weight_ct > purchased_weight_ct\)\)/);
    await purchase.delete(ACTOR, saved.id, 1);
  });

  it("IT-PU-B02 Memo Stock approve: IN_STOCK moves pending → sold + purchased, SOLD adds purchased; save holds nothing; the report shows Sold", async () => {
    const { receiveId, items: [x, y] } = await approvedStock(vendorA, [receiveLine({ lot: "X" }), receiveLine({ lot: "Y", pcs: 3, weightCt: "1.5" })]);
    await sell(y.id, 2, "1.000");
    const saved = await purchase.create(ACTOR, purchaseInput(vendorA, [stockLine(x.id, "IN_STOCK", 2, "1"), stockLine(y.id, "SOLD", 1, "0.5"), stockLine(y.id, "IN_STOCK", 1, "0.5")]));
    expect(saved.stockIds).toEqual([x.stockId, y.stockId, y.stockId]);
    // Save checks and copies but moves nothing (D2).
    expect(await buckets(x.id)).toMatchObject({ pending: [5, "2.500"], sold: [0, "0.000"], purchased: [0, "0.000"] });
    const pending = await purchase.get(saved.id);
    expect(pending.lines.map((line) => [line.memoGroup, line.limitPcs, line.limitWeightCt, line.stone, line.lot, line.location, line.priceUnit, line.memoReceive?.docNo])).toEqual([
      ["IN_STOCK", 5, "2.500", "Ruby", "X", "Memo", "PER_CT", expect.any(String)],
      ["SOLD", 2, "1.000", "Ruby", "Y", "Memo", "PER_CT", expect.any(String)],
      ["IN_STOCK", 1, "0.500", "Ruby", "Y", "Memo", "PER_CT", expect.any(String)],
    ]);

    const approved = await purchase.approve(ACTOR, saved.id, saved.version);
    expect(approved).toEqual({ id: saved.id, version: 2, status: "APPROVED", lineCount: 3 });
    expect(await buckets(x.id)).toMatchObject({ pending: [3, "1.500"], sold: [2, "1.000"], purchased: [2, "1.000"], balanced: true, version: 2 });
    expect(await buckets(y.id)).toMatchObject({ pending: [0, "0.000"], sold: [3, "1.500"], purchased: [2, "1.000"], balanced: true });
    const after = await purchase.get(saved.id);
    expect(after).toMatchObject({ status: "APPROVED", approvedBy: ACTOR });
    expect(after.lines.every((line) => line.limitPcs === null && line.limitWeightCt === null)).toBe(true);

    // Memo Outstanding › Vendor: the quantity shows in Sold and Outstanding drops (no code change, SA-PU-05).
    const report = await outstanding.vendorItems({ memoReceiveIds: [receiveId] });
    expect(report.items.map((row) => [row.lot, row.sold, row.outstanding])).toEqual([
      ["X", { pcs: 2, weightCt: "1.000" }, { pcs: 3, weightCt: "1.500" }],
      ["Y", { pcs: 3, weightCt: "1.500" }, { pcs: 0, weightCt: "0.000" }],
    ]);

    // Two pending purchases of the same quantity: the first approval wins, the second is short and changes nothing.
    const first = await purchase.create(ACTOR, purchaseInput(vendorA, [stockLine(x.id, "IN_STOCK", 3, "1.5")]));
    const second = await purchase.create(ACTOR, purchaseInput(vendorA, [manualLine(), stockLine(x.id, "IN_STOCK", 3, "1.5")]));
    await purchase.approve(ACTOR, first.id, 1);
    const before = await buckets(x.id);
    expect(await failure(purchase.approve(ACTOR, second.id, 1))).toEqual({
      status: 409, code: "PURCHASE_PENDING_SHORT",
      fieldErrors: [{ path: "lines.1.pcs", code: "exceeds_available" }, { path: "lines.1.weightCt", code: "exceeds_available" }],
    });
    expect(await buckets(x.id)).toEqual(before);
    expect(await prisma.purchase.findUniqueOrThrow({ where: { id: second.id }, select: { status: true, version: true } })).toEqual({ status: "PENDING_APPROVAL", version: 1 });
    // A fully bought memo receive leaves the report through the existing open filter.
    expect((await outstanding.vendorItems({ memoReceiveIds: [receiveId] })).items).toEqual([]);

    // Parallel approvals that name the same two items in opposite orders do not deadlock (locks in id order).
    const { items: [z1, z2] } = await approvedStock(vendorA, [receiveLine({ lot: "Z1" }), receiveLine({ lot: "Z2" })]);
    const p = await purchase.create(ACTOR, purchaseInput(vendorA, [stockLine(z1.id, "IN_STOCK", 1, "0.5"), stockLine(z2.id, "IN_STOCK", 1, "0.5")]));
    const q = await purchase.create(ACTOR, purchaseInput(vendorA, [stockLine(z2.id, "IN_STOCK", 2, "1"), stockLine(z1.id, "IN_STOCK", 2, "1")]));
    const results = await Promise.all([purchase.approve(ACTOR, p.id, 1), purchase.approve(ACTOR, q.id, 1)]);
    expect(results.map((result) => result.status)).toEqual(["APPROVED", "APPROVED"]);
    expect(await buckets(z1.id)).toMatchObject({ pending: [2, "1.000"], sold: [3, "1.500"], purchased: [3, "1.500"], balanced: true, version: 3 });
  });

  it("IT-PU-B03 Purchase Order approve: purchased_* added under the lock, ordered − purchased guard, picker counts, foreign or unapproved PO refused", async () => {
    const po = await approvedOrder(vendorA, [orderLine(), orderLine({ stone: "Topaz", pcs: 2, weightCt: "1" })]);
    const pendingPo = await approvedOrder(vendorA, [orderLine()], false);
    const otherVendorPo = await approvedOrder(vendorB, [orderLine()]);
    const usdPo = await approvedOrder(vendorA, [orderLine()], true, { currency: "USD", exchangeRate: "35" });
    const [l1, l2] = po.lineIds;
    const picker = (status: "ALL" | "OPEN" | "PARTLY_PURCHASED" = "ALL") => purchase.purchaseOrderLines({ vendorId: vendorA.id, currency: "THB", status, q: po.docNo, limit: 50 });
    expect((await picker()).counts).toEqual({ all: 2, open: 2, partlyPurchased: 0 });

    const saved = await purchase.create(ACTOR, purchaseInput(vendorA, [poLine(l1, 4, "1.5")]));
    expect(saved.stockIds[0]).toMatch(new RegExp(`^${YEAR}\\d{4}$`));
    const line = (await purchase.get(saved.id)).lines[0];
    expect(line).toMatchObject({ source: "PURCHASE_ORDER", purchaseOrderLineId: l1, stone: "Sapphire", location: "Safe A", priceUnit: "PER_PCS", limitPcs: 10, limitWeightCt: "4.000",
      purchaseOrder: { id: po.id, docNo: po.docNo, position: 1 }, discount: { type: "NONE" } });
    expect(await poPurchased(l1)).toEqual([0, "0.000"]);
    await purchase.approve(ACTOR, saved.id, 1);
    expect(await poPurchased(l1)).toEqual([4, "1.500"]);
    expect((await order.get(po.id)).lines[0]).toMatchObject({ purchasedPcs: 4, purchasedWeightCt: "1.500" });
    expect((await picker()).counts).toEqual({ all: 2, open: 1, partlyPurchased: 1 });
    const partly = await picker("PARTLY_PURCHASED");
    expect(partly.items.map((row) => [row.purchaseOrderLineId, row.status, row.availablePcs, row.availableWeightCt, row.netUnitPrice])).toEqual([[l1, "PARTLY_PURCHASED", 6, "2.500", "90.00"]]);

    // Two purchases of one PO line: the second approval is short.
    const q2 = await purchase.create(ACTOR, purchaseInput(vendorA, [poLine(l1, 6, "2.5")]));
    const q3 = await purchase.create(ACTOR, purchaseInput(vendorA, [poLine(l1, 1, "0.1")]));
    await purchase.approve(ACTOR, q2.id, 1);
    expect(await failure(purchase.approve(ACTOR, q3.id, 1))).toMatchObject({ code: "PURCHASE_PENDING_SHORT", fieldErrors: [{ path: "lines.0.pcs" }, { path: "lines.0.weightCt" }] });
    expect(await poPurchased(l1)).toEqual([10, "4.000"]);
    // The fully purchased line leaves the picker.
    expect((await picker()).items.map((row) => row.purchaseOrderLineId)).toEqual([l2]);

    // Save-time refusals: over availability, a PO that is not approved, another vendor's PO, another currency.
    expect(await failure(purchase.create(ACTOR, purchaseInput(vendorA, [poLine(l2, 3, "1")])))).toMatchObject({ code: "VALIDATION_ERROR", fieldErrors: [{ path: "lines.0.pcs", code: "exceeds_available" }] });
    for (const lineId of [pendingPo.lineIds[0], otherVendorPo.lineIds[0], usdPo.lineIds[0]]) {
      expect(await failure(purchase.create(ACTOR, purchaseInput(vendorA, [poLine(lineId, 1, "0.1")])))).toMatchObject({
        status: 422, code: "PURCHASE_REFERENCE_INVALID", fieldErrors: [{ path: "lines.0.purchaseOrderLineId", code: "invalid_reference" }],
      });
    }
    // A Memo Stock item of another vendor is refused the same way.
    const { items: [foreign] } = await approvedStock(vendorB, [receiveLine()]);
    expect(await failure(purchase.create(ACTOR, purchaseInput(vendorA, [stockLine(foreign.id, "IN_STOCK", 1, "0.5")])))).toMatchObject({
      code: "PURCHASE_REFERENCE_INVALID", fieldErrors: [{ path: "lines.0.memoStockId" }],
    });
    // Approved purchase orders stay read-only, so Purchase is the only writer of purchased_* (SA-PO-05).
    expect((await failure(order.update(ACTOR, po.id, 2, { ...header(vendorA), lines: [orderLine()] } as never))).code).toBe("PURCHASE_ORDER_STATUS_INVALID");
  });

  it("IT-PU-B04 lifecycle: numbers, Stock IDs kept by line id, version guard, delete pending only, approve read-only, Document Setup used", async () => {
    const { items: [item] } = await approvedStock(vendorA, [receiveLine({ lot: "LC" })]);
    const po = await approvedOrder(vendorA, [orderLine()]);
    const preview = await purchase.nextNumber("2026-11-04");
    const saved = await purchase.create(ACTOR, purchaseInput(vendorA, [manualLine(), stockLine(item.id, "IN_STOCK", 1, "0.5"), poLine(po.lineIds[0], 1, "0.4")]));
    expect(saved.docNo).toMatch(/^PU-\d+$/);
    expect(saved.docNo).toBe(preview.docNo);
    expect(saved.stockIds[1]).toBe(item.stockId);
    expect(saved.stockIds[0]).toMatch(new RegExp(`^${YEAR}\\d{4}$`));
    expect(saved.stockIds[2]).toMatch(new RegExp(`^${YEAR}\\d{4}$`));
    const plain = await purchase.create(ACTOR, purchaseInput(vendorA, [manualLine()], { docDate: "2025-06-01", dueDate: "2025-06-30" }));
    expect(plain.docNo).toMatch(/^\d+$/);

    const detail = await purchase.get(saved.id);
    const [manualId, stockLineId, poLineId] = detail.lines.map((line) => line.id);
    const updated = await purchase.update(ACTOR, saved.id, 1, purchaseInput(vendorA, [
      manualLine({ id: manualId, pcs: 2 }), poLine(po.lineIds[0], 2, "0.8", { id: poLineId }), stockLine(item.id, "IN_STOCK", 1, "0.5", { id: stockLineId }), manualLine({ stone: "New" }),
    ]));
    expect(updated.version).toBe(2);
    expect(updated.stockIds.slice(0, 3)).toEqual([saved.stockIds[0], saved.stockIds[2], item.stockId]);
    expect(updated.stockIds[3]).not.toBe(saved.stockIds[0]);
    expect((await purchase.get(saved.id)).lines.slice(0, 2).map((line) => line.id)).toEqual([manualId, poLineId]);
    expect(await failure(purchase.update(ACTOR, saved.id, 1, purchaseInput(vendorA, [manualLine()])))).toMatchObject({ status: 409, code: "PURCHASE_CHANGED" });

    const listed = await purchase.list({ partyId: vendorA.id, status: "PENDING_APPROVAL", q: saved.docNo, limit: 50 });
    expect(listed.items.map((row) => row.id)).toEqual([saved.id]);
    expect(listed.items[0]).toMatchObject({ vendorName: "PU IT Vendor A", status: "PENDING_APPROVAL" });

    // Document Setup counts purchase numbers as used.
    const purchaseSetup = (await setup.get("purchase")).setup!;
    expect(purchaseSetup.rows.some((row) => row.used)).toBe(true);

    // Delete pending: no stock change.
    const before = await buckets(item.id);
    const doomed = await purchase.create(ACTOR, purchaseInput(vendorA, [stockLine(item.id, "IN_STOCK", 1, "0.5")]));
    expect(await failure(purchase.delete(ACTOR, doomed.id, 2))).toMatchObject({ code: "PURCHASE_CHANGED" });
    expect(await purchase.delete(ACTOR, doomed.id, 1)).toEqual({ ok: true });
    expect(await failure(purchase.get(doomed.id))).toMatchObject({ status: 404, code: "PURCHASE_NOT_FOUND" });
    expect(await buckets(item.id)).toEqual(before);

    await purchase.approve(ACTOR, saved.id, 2);
    expect(await failure(purchase.update(ACTOR, saved.id, 3, purchaseInput(vendorA, [manualLine()])))).toMatchObject({ code: "PURCHASE_STATUS_INVALID" });
    expect(await failure(purchase.delete(ACTOR, saved.id, 3))).toMatchObject({ code: "PURCHASE_STATUS_INVALID" });
    expect(await failure(purchase.approve(ACTOR, saved.id, 3))).toMatchObject({ code: "PURCHASE_STATUS_INVALID" });
    expect(await failure(purchase.approve(ACTOR, plain.id, 9))).toMatchObject({ code: "PURCHASE_CHANGED" });
    expect(await failure(purchase.approve(ACTOR, randomUUID(), 1))).toMatchObject({ code: "PURCHASE_NOT_FOUND" });
    // Manual-only purchases approve with no stock change.
    expect(await purchase.approve(ACTOR, plain.id, 1)).toMatchObject({ status: "APPROVED", lineCount: 1 });
  });

  it("IT-PU-B05 purchase.memoStock: vendor + currency scope, SOLD first across pages, counts with q and dates, reserved never listed, q escaping", async () => {
    const vendorC = await vendorFixture("PU IT Vendor C");
    const { items: [a, b, c, d] } = await approvedStock(vendorC, [
      receiveLine({ lot: "50%_\\" }), receiveLine({ lot: "500" }), receiveLine({ lot: "RES" }), receiveLine({ lot: "PART" }),
    ]);
    const { items: [older] } = await approvedStock(vendorC, [receiveLine({ lot: "OLD" })], { docDate: "2026-01-10", dueDate: "2026-02-10" });
    await approvedStock(vendorC, [receiveLine({ lot: "USD" })], { currency: "USD", exchangeRate: "35" });
    await sell(d.id, 2, "1.000"); // partly sold: one SOLD row and one IN_STOCK row
    await sell(older.id, 5, "2.500"); // fully sold: SOLD row only
    // Fully reserved (out on Memo Out / Reserve): never listed (D5).
    await prisma.$executeRawUnsafe(`UPDATE "partner"."memo_stock" SET reserved_pcs = pending_pcs, reserved_weight_ct = pending_weight_ct, pending_pcs = 0, pending_weight_ct = 0 WHERE id = '${c.id}'`);
    const base = { vendorId: vendorC.id, currency: "THB", status: "ALL" as const, limit: 50 };

    const all = await purchase.memoStock(base);
    expect(all.items.map((row) => [row.lot, row.status])).toEqual([
      ["PART", "SOLD"], ["OLD", "SOLD"], ["PART", "IN_STOCK"], ["500", "IN_STOCK"], ["50%_\\", "IN_STOCK"],
    ]);
    expect(all.counts).toEqual({ all: 5, sold: 2, inStock: 3 });
    // From Stock Ref. (owner 2026-11-04): every row names its source Memo Receive.
    expect(all.items.map((row) => row.ref)).toEqual(all.items.map((row) => ({ type: "MEMO_RECEIVE", id: row.memoReceive.id, docNo: row.memoReceive.docNo, docDate: row.memoReceive.docDate })));
    expect(all.items[0]).toMatchObject({ key: `${d.id}:SOLD`, availablePcs: 2, availableWeightCt: "1.000", amount: "1000.00", sale: null, locationType: null, location: "Memo", priceUnit: "CTS" });
    expect(all.items[2]).toMatchObject({ key: `${d.id}:IN_STOCK`, availablePcs: 3, availableWeightCt: "1.500", amount: "1500.00" });

    // Pages of 2 keep the SOLD-first order across the group boundary.
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: Awaited<ReturnType<Purchase["memoStock"]>> = await purchase.memoStock({ ...base, limit: 2, cursor });
      seen.push(...page.items.map((row) => row.key));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toEqual(all.items.map((row) => row.key));

    expect((await purchase.memoStock({ ...base, status: "SOLD" })).items.map((row) => row.lot)).toEqual(["PART", "OLD"]);
    const escaped = await purchase.memoStock({ ...base, q: "50%" });
    expect(escaped.items.map((row) => row.lot)).toEqual(["50%_\\"]);
    expect(escaped.counts).toEqual({ all: 1, sold: 0, inStock: 1 });
    const dated = await purchase.memoStock({ ...base, from: "2026-01-01", to: "2026-01-31" });
    expect(dated.items.map((row) => row.lot)).toEqual(["OLD"]);
    expect(dated.counts).toEqual({ all: 1, sold: 1, inStock: 0 });
    expect((await purchase.memoStock({ ...base, currency: "USD" })).items.map((row) => row.lot)).toEqual(["USD"]);
    expect((await purchase.memoStock({ ...base, vendorId: vendorB.id })).items.every((row) => row.memoStockId !== a.id && row.memoStockId !== b.id)).toBe(true);

    // The SOLD group is bought too: purchased += q only, and the row leaves the SOLD group once fully bought.
    const bought = await purchase.create(ACTOR, purchaseInput(vendorC, [stockLine(older.id, "SOLD", 5, "2.5")]));
    await purchase.approve(ACTOR, bought.id, 1);
    expect(await buckets(older.id)).toMatchObject({ pending: [0, "0.000"], sold: [5, "2.500"], purchased: [5, "2.500"], balanced: true });
    expect((await purchase.memoStock({ ...base, status: "SOLD" })).items.map((row) => row.lot)).toEqual(["PART"]);
  });

  it("IT-PU-B06 approve with 200 STOCK lines on distinct items: one UPDATE per table, latency recorded", async () => {
    const vendorD = await vendorFixture("PU IT Vendor D");
    const { items } = await approvedStock(vendorD, Array.from({ length: 200 }, (_, n) => receiveLine({ lot: `B${n}`, pcs: 2, weightCt: "1" })));
    expect(items).toHaveLength(200);
    const saved = await purchase.create(ACTOR, purchaseInput(vendorD, items.map((item) => stockLine(item.id, "IN_STOCK", 1, "0.5"))));

    let updates = 0;
    const original = prisma.$transaction.bind(prisma) as (fn: (tx: unknown) => Promise<unknown>, options?: unknown) => Promise<unknown>;
    const spy = vi.spyOn(prisma, "$transaction").mockImplementation(((fn: (tx: unknown) => Promise<unknown>, options?: unknown) => original(async (tx) => fn(new Proxy(tx as object, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        if (property !== "$executeRaw") return value;
        return (...args: unknown[]) => { updates += 1; return (value as (...a: unknown[]) => unknown).apply(target, args); };
      },
    })), options)) as never);
    const started = performance.now();
    const approved = await purchase.approve(ACTOR, saved.id, 1);
    const elapsed = performance.now() - started;
    spy.mockRestore();

    expect(approved).toMatchObject({ status: "APPROVED", lineCount: 200 });
    expect(updates).toBe(1);
    const moved = await prisma.memoStock.aggregate({ where: { vendorId: vendorD.id }, _sum: { pendingPcs: true, soldPcs: true, purchasedPcs: true } });
    expect(moved._sum).toEqual({ pendingPcs: 200, soldPcs: 200, purchasedPcs: 200 });
    console.info(`IT-PU-B06 approve 200 STOCK lines: ${elapsed.toFixed(0)} ms (target < 500 ms)`);
    expect(elapsed).toBeLessThan(2_000);
  });
});
