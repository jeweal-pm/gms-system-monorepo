import { randomUUID } from "node:crypto";
import { HttpException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * IT-RS-01…04 (reserve SA rev 1 / ADR-0036, owner 2026-11-02) against real PostgreSQL:
 * - From Stock lines are completed from Memo Stock and saving holds nothing; a row keyed in by hand is refused (every
 *   row comes From Stock, owner 2026-11-02 — the Memo Out rev 3 rule).
 * - Approval moves pending into Reserve (CHECK memo_stock_balance) and the reserve becomes read-only.
 * - Memo Out and Reserve share the bucket and the lock: of a Memo Out and a Reserve over the same item, only the first
 *   approval passes, and parallel approvals never exceed pending.
 * - Document Setup `used` counts reserves.
 *
 * Opt-in like the other DB integrations (INV-20261021-007): runs only with `PARTNER_TEST_DATABASE_URL` pointing at
 * a disposable `f1_system` database on 127.0.0.1 with an explicit port other than 5432, migrated with
 * `prisma migrate deploy`. Rows are scoped to the vendors and customer created here and Stock ID year 72 (50–59 memo
 * receive, 60–69 memo outstanding, 70 memo return, 71 memo out); all are removed in `afterAll`.
 */

const testUrl = process.env.PARTNER_TEST_DATABASE_URL;
const canRun = Boolean(testUrl && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(testUrl));
const ACTOR = `rs-it-${randomUUID().slice(0, 8)}`;
const YEAR = 72;

type Prisma = typeof import("../../src/database/prisma-client").prisma;
type Receive = InstanceType<typeof import("../../src/trade-document/memo-receive.service").MemoReceiveService>;
type Out = InstanceType<typeof import("../../src/trade-document/memo-out.service").MemoOutService>;
type Res = InstanceType<typeof import("../../src/trade-document/reserve.service").ReserveService>;
type Stock = InstanceType<typeof import("../../src/trade-document/memo-stock.service").MemoStockService>;
type Vendor = { id: string; addressId: string };

let prisma: Prisma;
let receive: Receive;
let memoOut: Out;
let reserve: Res;
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

const issuesOf = (lines: Record<string, unknown>[]) => createMemoOutSchema.safeParse({
  docDate: "2026-10-31", dueDate: "2026-11-30", currency: "THB", exchangeRate: null, ref: "", documentNote: "", ...money, lines,
  customerId: customer.id, shippingAddressId: customer.shipping, invoiceAddressId: customer.invoice,
}).error?.issues.map((issue) => `${issue.path.join(".")}:${((issue as { params?: { code?: string } }).params?.code ?? "")}`);

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
  const code = `RSIT${vendors.length}${ACTOR.slice(-4)}`;
  await prisma.vendor.create({ data: {
    id, name, nameKey: name.toLowerCase(), code: code.toUpperCase(), codeKey: code.toLowerCase(),
    currencyCode: "THB", firstName: "It", email: "rs-it@example.test", createdBy: ACTOR, updatedBy: ACTOR,
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

describe.runIf(canRun)("IT-RS reserve From Stock on PostgreSQL", () => {
  let vendorA: Vendor;

  beforeAll(async () => {
    vi.stubEnv("PARTNER_DATABASE_URL", testUrl!);
    vi.stubEnv("DATABASE_URL", testUrl!);
    ({ prisma } = await import("../../src/database/prisma-client"));
    const { MemoReceiveService } = await import("../../src/trade-document/memo-receive.service");
    const { MemoOutService } = await import("../../src/trade-document/memo-out.service");
    const { ReserveService } = await import("../../src/trade-document/reserve.service");
    const { MemoStockService } = await import("../../src/trade-document/memo-stock.service");
    ({ createMemoOutSchema } = await import("../../src/trade-document/memo-schemas"));
    receive = new MemoReceiveService();
    receive.clock = () => new Date(`20${YEAR}-06-01T03:00:00Z`);
    memoOut = new MemoOutService();
    reserve = new ReserveService();
    stock = new MemoStockService();
    if (!(await prisma.currency.findUnique({ where: { code: "THB" } }))) {
      await prisma.currency.create({ data: { code: "THB", name: "THB", createdBy: ACTOR, updatedBy: ACTOR } });
    }
    await prisma.memoStockIdCounter.deleteMany({ where: { year: YEAR } });
    vendorA = await vendorFixture("RS IT Vendor A");
    const address = { position: 1, name: "RS IT Customer", address: "2 Test Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true };
    await prisma.customer.create({ data: {
      id: customer.id, name: "RS IT Customer", nameKey: "rs it customer", code: `RSITC${ACTOR.slice(-4)}`.toUpperCase(), codeKey: `rsitc${ACTOR.slice(-4)}`.toLowerCase(),
      currencyCode: "THB", firstName: "It", email: "rs-it@example.test", createdBy: ACTOR, updatedBy: ACTOR,
      addresses: { create: [{ ...address, id: customer.shipping, type: "SHIPPING" }, { ...address, id: customer.invoice, type: "INVOICE" }] },
    } });
    customerCreated = true;
  });

  afterAll(async () => {
    if (!prisma) return;
    const ids = vendors.map((vendor) => vendor.id);
    if (customerCreated) {
      await prisma.reserve.deleteMany({ where: { customerId: customer.id } });
      await prisma.memoOut.deleteMany({ where: { customerId: customer.id } });
    }
    await prisma.memoStock.deleteMany({ where: { vendorId: { in: ids } } });
    await prisma.memoReceive.deleteMany({ where: { vendorId: { in: ids } } });
    if (customerCreated) await prisma.customer.deleteMany({ where: { id: customer.id } });
    await prisma.vendor.deleteMany({ where: { id: { in: ids } } });
    await prisma.memoStockIdCounter.deleteMany({ where: { year: YEAR } });
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  it("IT-RS-01 save copies a From Stock row, keeps the Sale Price, holds nothing; a typed row is refused; numbers are plain without Document Setup", async () => {
    const [item] = await approvedStock(vendorA, [receiveLine()]);
    expect(issuesOf([stockLine(item.id, 4, "2"), manualLine()])).toEqual(["lines.1.memoStockId:required"]);
    const saved = await reserve.create(ACTOR, outInput([stockLine(item.id, 4, "2")]));
    expect(saved).toMatchObject({ docNo: expect.any(String), version: 1 });
    const detail = await reserve.get(saved.id);
    expect(detail).toMatchObject({ status: "PENDING_APPROVAL", approvedAt: null, customerId: customer.id });
    expect(detail.lines[0]).toMatchObject({
      source: "STOCK", memoStockId: item.id, stockId: item.stockId, stoneCode: "", stone: "Ruby", lot: "LOT-A", location: "Memo",
      pcs: 4, weightCt: "2.000", unitPrice: "2500.00", amount: "5000.00", stockPendingPcs: 10, stockPendingWeightCt: "5.000",
    });
    expect(await bucketsOf(item.id)).toEqual({ pending: [10, "5.000"], reserved: [0, "0.000"] });
    // Saving holds nothing, so From Stock still offers the item.
    expect((await stock.list({ limit: 50 })).items.map((row) => row.id)).toContain(item.id);
    expect((await reserve.nextNumber("2026-11-02")).docNo).toEqual(expect.any(String));
    expect((await reserve.list({ partyId: customer.id, status: "PENDING_APPROVAL", limit: 50 })).items.map((row) => row.id)).toContain(saved.id);
  });

  it("IT-RS-02 save rejects a missing item and more than pending with RESERVE_* / field errors", async () => {
    const [item] = await approvedStock(vendorA, [receiveLine({ pcs: 3, weightCt: "1.5" })]);
    expect(await failure(reserve.create(ACTOR, outInput([stockLine(item.id, 4, "1")]))))
      .toMatchObject({ status: 400, code: "VALIDATION_ERROR", fieldErrors: [{ path: "lines.0.pcs", code: "exceeds_pending" }] });
    expect(await failure(reserve.create(ACTOR, outInput([stockLine(randomUUID(), 1, "0.5")]))))
      .toMatchObject({ status: 422, code: "RESERVE_REFERENCE_INVALID", fieldErrors: [{ path: "lines.0.memoStockId", code: "invalid_reference" }] });
    expect(await failure(reserve.create(ACTOR, outInput([stockLine(item.id, 1, "0.5")], { customerId: randomUUID() }))))
      .toMatchObject({ status: 422, code: "RESERVE_REFERENCE_INVALID", fieldErrors: [{ path: "customerId" }] });
  });

  it("IT-RS-03 approve moves pending into Reserve; the reserve is then read-only; a pending reserve can be deleted", async () => {
    const [item] = await approvedStock(vendorA, [receiveLine()]);
    const saved = await reserve.create(ACTOR, outInput([stockLine(item.id, 6, "3")]));
    expect(await failure(reserve.approve(ACTOR, saved.id, 2))).toMatchObject({ status: 409, code: "RESERVE_CHANGED" });
    await expect(reserve.approve(ACTOR, saved.id, 1)).resolves.toEqual({ id: saved.id, version: 2, status: "APPROVED", stockLineCount: 1 });
    expect(await bucketsOf(item.id)).toEqual({ pending: [4, "2.000"], reserved: [6, "3.000"] });
    expect(await reserve.get(saved.id)).toMatchObject({ status: "APPROVED", approvedBy: ACTOR, approvedAt: expect.any(String) });
    expect(await failure(reserve.approve(ACTOR, saved.id, 2))).toMatchObject({ status: 409, code: "RESERVE_STATUS_INVALID" });
    expect(await failure(reserve.update(ACTOR, saved.id, 2, outInput([stockLine(item.id, 1, "0.5")])))).toMatchObject({ status: 409, code: "RESERVE_STATUS_INVALID" });
    expect(await failure(reserve.delete(ACTOR, saved.id, 2))).toMatchObject({ status: 409, code: "RESERVE_STATUS_INVALID" });
    // A pending reserve can still be deleted.
    const draft = await reserve.create(ACTOR, outInput([stockLine(item.id, 1, "0.5")]));
    await expect(reserve.delete(ACTOR, draft.id, 1)).resolves.toEqual({ ok: true });
    expect(await bucketsOf(item.id)).toEqual({ pending: [4, "2.000"], reserved: [6, "3.000"] });
  });

  it("IT-RS-04 Memo Out and Reserve share the bucket and the lock: the second document over the rest is short; parallel approvals never exceed pending", async () => {
    const [item] = await approvedStock(vendorA, [receiveLine({ pcs: 3, weightCt: "1.5" })]);
    const out = await memoOut.create(ACTOR, outInput([stockLine(item.id, 2, "1")]));
    const held = await reserve.create(ACTOR, outInput([stockLine(item.id, 2, "1")]));
    await memoOut.approve(ACTOR, out.id, 1);
    expect(await failure(reserve.approve(ACTOR, held.id, 1)))
      .toMatchObject({ status: 409, code: "RESERVE_PENDING_SHORT", fieldErrors: [{ path: "lines.0.pcs", code: "exceeds_pending" }, { path: "lines.0.weightCt", code: "exceeds_pending" }] });
    expect(await bucketsOf(item.id)).toEqual({ pending: [1, "0.500"], reserved: [2, "1.000"] });
    expect(await reserve.get(held.id)).toMatchObject({ status: "PENDING_APPROVAL", version: 1 });

    const [other] = await approvedStock(vendorA, [receiveLine({ pcs: 2, weightCt: "1" })]);
    const docs = await Promise.all([
      memoOut.create(ACTOR, outInput([stockLine(other.id, 1, "0.6")])),
      reserve.create(ACTOR, outInput([stockLine(other.id, 1, "0.6")])),
      reserve.create(ACTOR, outInput([stockLine(other.id, 1, "0.6")])),
    ]);
    const results = await Promise.allSettled([memoOut.approve(ACTOR, docs[0].id, 1), reserve.approve(ACTOR, docs[1].id, 1), reserve.approve(ACTOR, docs[2].id, 1)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await bucketsOf(other.id)).toEqual({ pending: [1, "0.400"], reserved: [1, "0.600"] });
  });
});
