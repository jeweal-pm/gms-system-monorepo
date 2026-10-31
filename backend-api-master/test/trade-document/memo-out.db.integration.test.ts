import { randomUUID } from "node:crypto";
import { HttpException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * IT-MO-01…05 (memo-out SA rev 2 / ADR-0033 rev 2, owner 2026-10-31) against real PostgreSQL:
 * - From Stock lines are completed from Memo Stock and saving reserves nothing.
 * - Manual lines cut nothing.
 * - Save rejects a missing item or more than pending.
 * - Approval moves pending into Reserve (CHECK memo_stock_balance) and the document becomes read-only.
 * - The over-pull guard refuses a second document over the rest, and parallel approvals never exceed pending.
 * - The From Stock list works across vendors.
 *
 * Opt-in like the other DB integrations (INV-20261021-007): runs only with `PARTNER_TEST_DATABASE_URL` pointing at
 * a disposable `f1_system` database on 127.0.0.1 with an explicit port other than 5432, migrated with
 * `prisma migrate deploy`. Rows are scoped to the vendors and customer created here and Stock ID year 71 (50–59 memo receive, 60–69 memo outstanding, 70 memo return; clock faked
 * to 2071); all are removed in `afterAll`.
 */

const testUrl = process.env.PARTNER_TEST_DATABASE_URL;
const canRun = Boolean(testUrl && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(testUrl));
const ACTOR = `mo-it-${randomUUID().slice(0, 8)}`;
const YEAR = 71;

type Prisma = typeof import("../../src/database/prisma-client").prisma;
type Receive = InstanceType<typeof import("../../src/trade-document/memo-receive.service").MemoReceiveService>;
type Out = InstanceType<typeof import("../../src/trade-document/memo-out.service").MemoOutService>;
type Stock = InstanceType<typeof import("../../src/trade-document/memo-stock.service").MemoStockService>;
type Vendor = { id: string; addressId: string };

let prisma: Prisma;
let receive: Receive;
let memoOut: Out;
let stock: Stock;
let createMemoOutSchema: typeof import("../../src/trade-document/memo-schemas").createMemoOutSchema;
const vendors: Vendor[] = [];
const customer = { id: randomUUID(), shipping: randomUUID(), invoice: randomUUID() };
let customerCreated = false;

const money = { discount: { type: "NONE" as const, value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null };
const receiveLine = (patch: Record<string, unknown> = {}) => ({
  source: "MANUAL" as const, stoneCode: "", stone: "Ruby", shape: "Oval", size: "", color: "Red", clarity: "", cutting: "", quality: "",
  lot: "LOT-A", cerType: "GIA", cerNo: "C-1", pcs: 10, weightCt: "5", priceUnit: "PER_CT" as "PER_CT" | "PER_PCS", unitPrice: "1000",
  discount: { type: "NONE" as "NONE" | "PERCENT" | "AMOUNT", value: "0" }, itemNote: "", photoIds: [] as [],
  ...patch,
});
/** What the page sends for a From Stock row: stock fields are placeholders the server replaces from Memo Stock. */
const stockLine = (memoStockId: string, pcs: number, weightCt: string, patch: Record<string, unknown> = {}) => ({
  source: "MANUAL" as const, stoneCodeId: null, stoneCode: "", stone: "typed by client", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "",
  lot: "", location: "", cerType: "", cerNo: "", pcs, weightCt, priceUnit: "PER_PCS" as const, unitPrice: "2500", discount: { type: "NONE" as const, value: "0" },
  itemNote: "for viewing", photoIds: [] as string[], memoStockId, ...patch,
});
const manualLine = () => ({ ...stockLine("", 1, "0.5", { stone: "Topaz", location: "Shelf 1" }), memoStockId: null });
const outInput = (lines: Record<string, unknown>[], patch: Record<string, unknown> = {}) => createMemoOutSchema.parse({
  docDate: "2026-10-31", dueDate: "2026-11-30", currency: "THB", exchangeRate: null, ref: "", documentNote: "", ...money, lines,
  customerId: customer.id, shippingAddressId: customer.shipping, invoiceAddressId: customer.invoice, ...patch,
});

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

async function vendorFixture(name: string): Promise<Vendor> {
  const id = randomUUID();
  const addressId = randomUUID();
  const code = `MOIT${vendors.length}${ACTOR.slice(-4)}`;
  await prisma.vendor.create({ data: {
    id, name, nameKey: name.toLowerCase(), code: code.toUpperCase(), codeKey: code.toLowerCase(),
    currencyCode: "THB", firstName: "It", email: "mo-it@example.test", createdBy: ACTOR, updatedBy: ACTOR,
    addresses: { create: [{ id: addressId, position: 1, name: `${name} Co.`, address: "1 Test Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true }] },
  } });
  vendors.push({ id, addressId });
  return { id, addressId };
}

/** An approved memo receive: its lines are now Memo Stock items (pending = received). */
async function approvedStock(vendor: Vendor, lines: ReturnType<typeof receiveLine>[]) {
  const saved = await receive.create(ACTOR, {
    docDate: "2026-10-29", dueDate: "2026-11-29", currency: "THB", exchangeRate: null, ref: "", documentNote: "", ...money, lines, vendorId: vendor.id, addressId: vendor.addressId,
  });
  await receive.approve(ACTOR, saved.id, saved.version);
  return prisma.memoStock.findMany({ where: { memoReceiveId: saved.id }, orderBy: { stockId: "asc" } });
}

const bucketsOf = async (id: string) => {
  const item = await prisma.memoStock.findUniqueOrThrow({ where: { id } });
  return { pending: [item.pendingPcs, item.pendingWeightCt.toFixed(3)], reserved: [item.reservedPcs, item.reservedWeightCt.toFixed(3)] };
};

describe.runIf(canRun)("IT-MO memo out From Stock on PostgreSQL", () => {
  let vendorA: Vendor;
  let vendorB: Vendor;

  beforeAll(async () => {
    vi.stubEnv("PARTNER_DATABASE_URL", testUrl!);
    vi.stubEnv("DATABASE_URL", testUrl!);
    ({ prisma } = await import("../../src/database/prisma-client"));
    const { MemoReceiveService } = await import("../../src/trade-document/memo-receive.service");
    const { MemoOutService } = await import("../../src/trade-document/memo-out.service");
    const { MemoStockService } = await import("../../src/trade-document/memo-stock.service");
    ({ createMemoOutSchema } = await import("../../src/trade-document/memo-schemas"));
    receive = new MemoReceiveService();
    receive.clock = () => new Date(`20${YEAR}-06-01T03:00:00Z`);
    memoOut = new MemoOutService();
    stock = new MemoStockService();
    if (!(await prisma.currency.findUnique({ where: { code: "THB" } }))) {
      await prisma.currency.create({ data: { code: "THB", name: "THB", createdBy: ACTOR, updatedBy: ACTOR } });
    }
    await prisma.memoStockIdCounter.deleteMany({ where: { year: YEAR } });
    vendorA = await vendorFixture("MO IT Vendor A");
    vendorB = await vendorFixture("MO IT Vendor B");
    const address = { position: 1, name: "MO IT Customer", address: "2 Test Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true };
    await prisma.customer.create({ data: {
      id: customer.id, name: "MO IT Customer", nameKey: "mo it customer", code: `MOITC${ACTOR.slice(-4)}`.toUpperCase(), codeKey: `moitc${ACTOR.slice(-4)}`.toLowerCase(),
      currencyCode: "THB", firstName: "It", email: "mo-it@example.test", createdBy: ACTOR, updatedBy: ACTOR,
      addresses: { create: [{ ...address, id: customer.shipping, type: "SHIPPING" }, { ...address, id: customer.invoice, type: "INVOICE" }] },
    } });
    customerCreated = true;
  });

  afterAll(async () => {
    if (!prisma) return;
    const ids = vendors.map((vendor) => vendor.id);
    if (customerCreated) await prisma.memoOut.deleteMany({ where: { customerId: customer.id } });
    await prisma.memoStock.deleteMany({ where: { vendorId: { in: ids } } });
    await prisma.memoReceive.deleteMany({ where: { vendorId: { in: ids } } });
    if (customerCreated) await prisma.customer.deleteMany({ where: { id: customer.id } });
    await prisma.vendor.deleteMany({ where: { id: { in: ids } } });
    await prisma.memoStockIdCounter.deleteMany({ where: { year: YEAR } });
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  it("IT-MO-01 save copies a From Stock row from Memo Stock (any vendor), keeps the Sale Price, reserves nothing; manual rows stay manual", async () => {
    const [item] = await approvedStock(vendorA, [receiveLine()]);
    const saved = await memoOut.create(ACTOR, outInput([stockLine(item.id, 4, "2"), manualLine()]));
    expect(saved).toMatchObject({ docNo: expect.any(String), version: 1 });
    const detail = await memoOut.get(saved.id);
    expect(detail).toMatchObject({ status: "PENDING_APPROVAL", approvedAt: null, approvedBy: null });
    expect(detail.lines[0]).toMatchObject({
      source: "STOCK", memoStockId: item.id, stockId: item.stockId, stoneCodeId: null, stoneCode: "", stone: "Ruby", lot: "LOT-A", location: "Memo",
      cerType: "GIA", cerNo: "C-1", priceUnit: "PER_CT", pcs: 4, weightCt: "2.000", unitPrice: "2500.00", amount: "5000.00", itemNote: "for viewing",
      stockPendingPcs: 10, stockPendingWeightCt: "5.000",
    });
    expect(detail.lines[1]).toMatchObject({ source: "MANUAL", memoStockId: null, stockId: null, stockPendingPcs: null, stone: "Topaz", location: "Shelf 1" });
    expect(await bucketsOf(item.id)).toEqual({ pending: [10, "5.000"], reserved: [0, "0.000"] });
    // From Stock lists every vendor's items (no vendorId).
    const listed = (await stock.list({ limit: 50 })).items.map((row) => row.id);
    expect(listed).toContain(item.id);
  });

  it("IT-MO-02 save rejects a missing item and more than pending; the schema refuses duplicates and a stock row without a Sale Price", async () => {
    const [item] = await approvedStock(vendorB, [receiveLine({ pcs: 3, weightCt: "1.5" })]);
    expect(await failure(memoOut.create(ACTOR, outInput([stockLine(item.id, 4, "1")]))))
      .toMatchObject({ status: 400, code: "VALIDATION_ERROR", fieldErrors: [{ path: "lines.0.pcs", code: "exceeds_pending" }] });
    expect(await failure(memoOut.create(ACTOR, outInput([stockLine(item.id, 1, "1.501")]))))
      .toMatchObject({ status: 400, fieldErrors: [{ path: "lines.0.weightCt", code: "exceeds_pending" }] });
    expect(await failure(memoOut.create(ACTOR, outInput([stockLine(randomUUID(), 1, "0.5")]))))
      .toMatchObject({ status: 422, code: "MEMO_OUT_REFERENCE_INVALID", fieldErrors: [{ path: "lines.0.memoStockId", code: "invalid_reference" }] });
    const paths = (lines: Record<string, unknown>[]) => createMemoOutSchema.safeParse({ ...outInput([manualLine()]), lines }).error?.issues.map((issue) => `${issue.path.join(".")}:${((issue as { params?: { code?: string } }).params?.code ?? "")}`);
    expect(paths([stockLine(item.id, 1, "0.5"), stockLine(item.id, 1, "0.5")])).toEqual(["lines.1.memoStockId:duplicate"]);
    expect(paths([stockLine(item.id, 1, "0.5", { unitPrice: "0" })])).toEqual(["lines.0.unitPrice:required"]);
    expect(paths([stockLine(item.id, 0, "0")])).toEqual(["lines.0.pcs:required"]);
  });

  it("IT-MO-03 approve moves pending into Reserve; the memo out is then read-only; manual rows cut nothing", async () => {
    const [item] = await approvedStock(vendorA, [receiveLine()]);
    const saved = await memoOut.create(ACTOR, outInput([stockLine(item.id, 4, "2"), manualLine()]));
    const updated = await memoOut.update(ACTOR, saved.id, 1, outInput([stockLine(item.id, 6, "3"), manualLine()]));
    expect(await failure(memoOut.approve(ACTOR, saved.id, 1))).toMatchObject({ status: 409, code: "MEMO_OUT_CHANGED" });
    await expect(memoOut.approve(ACTOR, saved.id, updated.version)).resolves.toEqual({ id: saved.id, version: 3, status: "APPROVED", stockLineCount: 1 });
    expect(await bucketsOf(item.id)).toEqual({ pending: [4, "2.000"], reserved: [6, "3.000"] });
    expect(await memoOut.get(saved.id)).toMatchObject({ status: "APPROVED", approvedBy: ACTOR, approvedAt: expect.any(String) });
    expect(await failure(memoOut.approve(ACTOR, saved.id, 3))).toMatchObject({ status: 409, code: "MEMO_OUT_STATUS_INVALID" });
    expect(await failure(memoOut.update(ACTOR, saved.id, 3, outInput([manualLine()])))).toMatchObject({ status: 409, code: "MEMO_OUT_STATUS_INVALID" });
    expect(await failure(memoOut.delete(ACTOR, saved.id, 3))).toMatchObject({ status: 409, code: "MEMO_OUT_STATUS_INVALID" });
    // A memo out with only manual rows approves and changes no stock.
    const manual = await memoOut.create(ACTOR, outInput([manualLine()]));
    await expect(memoOut.approve(ACTOR, manual.id, 1)).resolves.toMatchObject({ status: "APPROVED", stockLineCount: 0 });
    expect(await bucketsOf(item.id)).toEqual({ pending: [4, "2.000"], reserved: [6, "3.000"] });
    expect((await memoOut.list({ partyId: customer.id, status: "APPROVED", limit: 50 })).items.map((row) => row.id)).toEqual(expect.arrayContaining([saved.id, manual.id]));
  });

  it("IT-MO-04 over-pull guard: of two memo outs that together take more than pending, only the first approval passes", async () => {
    const [item] = await approvedStock(vendorA, [receiveLine({ pcs: 3, weightCt: "1.5" })]);
    const first = await memoOut.create(ACTOR, outInput([stockLine(item.id, 2, "1")]));
    const second = await memoOut.create(ACTOR, outInput([stockLine(item.id, 2, "1")]));
    await memoOut.approve(ACTOR, first.id, 1);
    expect(await failure(memoOut.approve(ACTOR, second.id, 1)))
      .toMatchObject({ status: 409, code: "MEMO_OUT_PENDING_SHORT", fieldErrors: [{ path: "lines.0.pcs", code: "exceeds_pending" }, { path: "lines.0.weightCt", code: "exceeds_pending" }] });
    expect(await bucketsOf(item.id)).toEqual({ pending: [1, "0.500"], reserved: [2, "1.000"] });
    expect(await memoOut.get(second.id)).toMatchObject({ status: "PENDING_APPROVAL", version: 1 });
    // Edited down to what is left, it passes; the item then leaves From Stock.
    await memoOut.update(ACTOR, second.id, 1, outInput([stockLine(item.id, 1, "0.5")]));
    await memoOut.approve(ACTOR, second.id, 2);
    expect(await bucketsOf(item.id)).toEqual({ pending: [0, "0.000"], reserved: [3, "1.500"] });
    expect((await stock.list({ limit: 50 })).items.map((row) => row.id)).not.toContain(item.id);
  });

  it("IT-MO-05 parallel approvals of the same item never take more than pending", async () => {
    const [item] = await approvedStock(vendorB, [receiveLine({ pcs: 2, weightCt: "1" })]);
    const outs = await Promise.all([1, 2, 3].map(() => memoOut.create(ACTOR, outInput([stockLine(item.id, 1, "0.6")]))));
    const results = await Promise.allSettled(outs.map((saved) => memoOut.approve(ACTOR, saved.id, 1)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await bucketsOf(item.id)).toEqual({ pending: [1, "0.400"], reserved: [1, "0.600"] });
  });
});
