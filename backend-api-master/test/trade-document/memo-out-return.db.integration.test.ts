import { randomUUID } from "node:crypto";
import { HttpException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * IT-MOR-01…06 (memo-out-return SA rev 2 / ADR-0033 rev 3, owner 2026-10-31) against real PostgreSQL:
 * - The Memo Outstanding dialog lists the customer's approved Memo Out From Stock lines not fully returned.
 * - Save copies the Memo Out line (net price, Outstanding) and moves nothing; it refuses a line that is not approved, of
 *   another customer or currency, or above outstanding.
 * - Approve adds to the Memo Out line's returned and moves the Memo Stock item from Reserve back to pending
 *   (CHECK memo_stock_balance), then the document is read-only.
 * - The over-return guard refuses a second return over the rest, and parallel approvals never exceed outstanding.
 *
 * Opt-in like the other DB integrations: runs only with `PARTNER_TEST_DATABASE_URL` pointing at a disposable
 * `f1_system` database on 127.0.0.1 with an explicit port other than 5432, migrated with `prisma migrate deploy`. Rows
 * are scoped to the vendor and customers created here and Stock ID year 72 (clock faked to 2072); all are removed in
 * `afterAll`.
 */

const testUrl = process.env.PARTNER_TEST_DATABASE_URL;
const canRun = Boolean(testUrl && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(testUrl));
const ACTOR = `mor-it-${randomUUID().slice(0, 8)}`;
const YEAR = 72;

type Prisma = typeof import("../../src/database/prisma-client").prisma;
type Receive = InstanceType<typeof import("../../src/trade-document/memo-receive.service").MemoReceiveService>;
type Out = InstanceType<typeof import("../../src/trade-document/memo-out.service").MemoOutService>;
type Back = InstanceType<typeof import("../../src/trade-document/memo-out-return.service").MemoOutReturnService>;
type Customer = { id: string; shipping: string; invoice: string };

let prisma: Prisma;
let receive: Receive;
let memoOut: Out;
let memoOutReturn: Back;
let schemas: typeof import("../../src/trade-document/memo-schemas");
const vendor = { id: randomUUID(), addressId: randomUUID() };
const customers: Customer[] = [];
let vendorCreated = false;

const money = { discount: { type: "NONE" as const, value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null };
const header = (customer: Customer) => ({
  docDate: "2026-10-31", dueDate: "2026-11-30", currency: "THB", exchangeRate: null, ref: "", documentNote: "", ...money,
  customerId: customer.id, shippingAddressId: customer.shipping, invoiceAddressId: customer.invoice,
});
const receiveLine = (pcs: number, weightCt: string) => ({
  source: "MANUAL" as const, stoneCode: "", stone: "Sapphire", shape: "Cushion", size: "", color: "Blue", clarity: "", cutting: "", quality: "",
  lot: "LOT-R", cerType: "GIA", cerNo: "C-9", pcs, weightCt, priceUnit: "PER_CT" as const, unitPrice: "1000",
  discount: { type: "NONE" as const, value: "0" }, itemNote: "", photoIds: [] as [],
});
const outLine = (memoStockId: string, pcs: number, weightCt: string) => ({
  source: "MANUAL" as const, stoneCodeId: null, stoneCode: "", stone: "", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "",
  lot: "", location: "", cerType: "", cerNo: "", pcs, weightCt, priceUnit: "PER_CT" as const, unitPrice: "3000",
  discount: { type: "PERCENT" as const, value: "10" }, itemNote: "", photoIds: [] as string[], memoStockId,
});
/** What the page sends for a Memo Outstanding row: item fields are placeholders the server replaces. */
const backLine = (memoOutLineId: string, pcs: number, weightCt: string) => ({
  source: "MANUAL" as const, stoneCodeId: null, stoneCode: "", stone: "typed by client", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "",
  lot: "", location: "", cerType: "", cerNo: "", pcs, weightCt, priceUnit: "PER_PCS" as const, unitPrice: "1", discount: { type: "NONE" as const, value: "0" },
  itemNote: "back from viewing", photoIds: [] as string[], memoOutLineId, outstandingPcs: 999, outstandingWeightCt: "999",
});
const backInput = (customer: Customer, lines: Record<string, unknown>[], patch: Record<string, unknown> = {}) =>
  schemas.createMemoOutReturnSchema.parse({ ...header(customer), lines, ...patch });

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

async function customerFixture(name: string): Promise<Customer> {
  const customer = { id: randomUUID(), shipping: randomUUID(), invoice: randomUUID() };
  const key = `MORIT${customers.length}${ACTOR.slice(-4)}`;
  const address = { position: 1, name, address: "3 Test Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true };
  await prisma.customer.create({ data: {
    id: customer.id, name, nameKey: name.toLowerCase(), code: key.toUpperCase(), codeKey: key.toLowerCase(),
    currencyCode: "THB", firstName: "It", email: "mor-it@example.test", createdBy: ACTOR, updatedBy: ACTOR,
    addresses: { create: [{ ...address, id: customer.shipping, type: "SHIPPING" }, { ...address, id: customer.invoice, type: "INVOICE" }] },
  } });
  customers.push(customer);
  return customer;
}

/** An approved memo receive (Memo Stock item) lent out on an approved memo out: returns the item and the out line. */
async function lentOut(customer: Customer, received: [number, string], out: [number, string]) {
  const saved = await receive.create(ACTOR, {
    docDate: "2026-10-29", dueDate: "2026-11-29", currency: "THB", exchangeRate: null, ref: "", documentNote: "", ...money,
    lines: [receiveLine(...received)], vendorId: vendor.id, addressId: vendor.addressId,
  });
  await receive.approve(ACTOR, saved.id, saved.version);
  const item = await prisma.memoStock.findFirstOrThrow({ where: { memoReceiveId: saved.id } });
  const memo = await memoOut.create(ACTOR, schemas.createMemoOutSchema.parse({ ...header(customer), lines: [outLine(item.id, ...out)] }));
  await memoOut.approve(ACTOR, memo.id, 1);
  const line = await prisma.memoOutLine.findFirstOrThrow({ where: { memoOutId: memo.id } });
  return { item, line, memoOutId: memo.id };
}

const bucketsOf = async (id: string) => {
  const item = await prisma.memoStock.findUniqueOrThrow({ where: { id } });
  return { pending: [item.pendingPcs, item.pendingWeightCt.toFixed(3)], reserved: [item.reservedPcs, item.reservedWeightCt.toFixed(3)] };
};
const returnedOf = async (id: string) => {
  const line = await prisma.memoOutLine.findUniqueOrThrow({ where: { id } });
  return [line.returnedPcs, line.returnedWeightCt.toFixed(3)];
};

describe.runIf(canRun)("IT-MOR memo out return on PostgreSQL", () => {
  let customerA: Customer;
  let customerB: Customer;

  beforeAll(async () => {
    vi.stubEnv("PARTNER_DATABASE_URL", testUrl!);
    vi.stubEnv("DATABASE_URL", testUrl!);
    ({ prisma } = await import("../../src/database/prisma-client"));
    const { MemoReceiveService } = await import("../../src/trade-document/memo-receive.service");
    const { MemoOutService } = await import("../../src/trade-document/memo-out.service");
    const { MemoOutReturnService } = await import("../../src/trade-document/memo-out-return.service");
    schemas = await import("../../src/trade-document/memo-schemas");
    receive = new MemoReceiveService();
    receive.clock = () => new Date(`20${YEAR}-06-01T03:00:00Z`);
    memoOut = new MemoOutService();
    memoOutReturn = new MemoOutReturnService();
    if (!(await prisma.currency.findUnique({ where: { code: "THB" } }))) {
      await prisma.currency.create({ data: { code: "THB", name: "THB", createdBy: ACTOR, updatedBy: ACTOR } });
    }
    await prisma.memoStockIdCounter.deleteMany({ where: { year: YEAR } });
    const name = "MOR IT Vendor";
    const code = `MORITV${ACTOR.slice(-4)}`;
    await prisma.vendor.create({ data: {
      id: vendor.id, name, nameKey: name.toLowerCase(), code: code.toUpperCase(), codeKey: code.toLowerCase(),
      currencyCode: "THB", firstName: "It", email: "mor-it@example.test", createdBy: ACTOR, updatedBy: ACTOR,
      addresses: { create: [{ id: vendor.addressId, position: 1, name: `${name} Co.`, address: "1 Test Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true }] },
    } });
    vendorCreated = true;
    customerA = await customerFixture("MOR IT Customer A");
    customerB = await customerFixture("MOR IT Customer B");
  });

  afterAll(async () => {
    if (!prisma) return;
    const ids = customers.map((customer) => customer.id);
    await prisma.memoOutReturn.deleteMany({ where: { customerId: { in: ids } } });
    await prisma.memoOut.deleteMany({ where: { customerId: { in: ids } } });
    if (vendorCreated) {
      await prisma.memoStock.deleteMany({ where: { vendorId: vendor.id } });
      await prisma.memoReceive.deleteMany({ where: { vendorId: vendor.id } });
    }
    await prisma.customer.deleteMany({ where: { id: { in: ids } } });
    if (vendorCreated) await prisma.vendor.deleteMany({ where: { id: vendor.id } });
    await prisma.memoStockIdCounter.deleteMany({ where: { year: YEAR } });
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  it("IT-MOR-01 Memo Outstanding lists the customer's approved From Stock lines with outstanding, net price and amount", async () => {
    const { item, line, memoOutId } = await lentOut(customerA, [10, "5"], [4, "2"]);
    const page = await memoOutReturn.outstanding(schemas.memoOutOutstandingSchema.parse({ customerId: customerA.id, currency: "THB" }));
    const row = page.items.find((entry) => entry.memoOutLineId === line.id);
    expect(row).toMatchObject({
      memoOut: { id: memoOutId }, memoStockId: item.id, stockId: item.stockId, stone: "Sapphire", lot: "LOT-R", location: "Memo",
      outPcs: 4, outWeightCt: "2.000", returnedPcs: 0, outstandingPcs: 4, outstandingWeightCt: "2.000",
      priceUnit: "PER_CT", unitPrice: "2700.00", amount: "5400.00", currency: "THB",
    });
    // Another customer or currency sees nothing of it; a pending memo out is not listed.
    expect((await memoOutReturn.outstanding(schemas.memoOutOutstandingSchema.parse({ customerId: customerB.id, currency: "THB" }))).items.map((entry) => entry.memoOutLineId)).not.toContain(line.id);
    expect((await memoOutReturn.outstanding(schemas.memoOutOutstandingSchema.parse({ customerId: customerA.id, currency: "USD" }))).items).toEqual([]);
    expect((await memoOutReturn.outstanding(schemas.memoOutOutstandingSchema.parse({ customerId: customerA.id, currency: "THB", q: item.stockId }))).items.map((entry) => entry.memoOutLineId)).toEqual([line.id]);
  });

  it("IT-MOR-02 save copies the Memo Out line and moves nothing; it refuses another customer, a pending memo out and more than outstanding", async () => {
    const { item, line, memoOutId } = await lentOut(customerA, [6, "3"], [4, "2"]);
    const saved = await memoOutReturn.create(ACTOR, backInput(customerA, [backLine(line.id, 3, "1.5")]));
    const detail = await memoOutReturn.get(saved.id);
    expect(detail).toMatchObject({ status: "PENDING_APPROVAL", customerId: customerA.id, approvedAt: null });
    expect(detail.lines[0]).toMatchObject({
      memoOutLineId: line.id, memoOut: { id: memoOutId }, memoStockId: item.id, stockId: item.stockId, source: "STOCK",
      stone: "Sapphire", priceUnit: "PER_CT", unitPrice: "2700.00", pcs: 3, weightCt: "1.500", outstandingPcs: 4, outstandingWeightCt: "2.000",
      itemNote: "back from viewing",
    });
    expect(await bucketsOf(item.id)).toEqual({ pending: [2, "1.000"], reserved: [4, "2.000"] });
    expect(await returnedOf(line.id)).toEqual([0, "0.000"]);
    expect(await failure(memoOutReturn.create(ACTOR, backInput(customerB, [backLine(line.id, 1, "0.5")]))))
      .toMatchObject({ status: 422, code: "MEMO_OUT_RETURN_REFERENCE_INVALID", fieldErrors: [{ path: "lines.0.memoOutLineId", code: "invalid_reference" }] });
    expect(await failure(memoOutReturn.create(ACTOR, backInput(customerA, [backLine(line.id, 5, "1")]))))
      .toMatchObject({ status: 400, code: "VALIDATION_ERROR", fieldErrors: [{ path: "lines.0.pcs", code: "exceeds_outstanding" }] });
    // A memo out still waiting for approval can't be returned.
    const pending = await memoOut.create(ACTOR, schemas.createMemoOutSchema.parse({ ...header(customerA), lines: [outLine(item.id, 1, "0.5")] }));
    const pendingLine = await prisma.memoOutLine.findFirstOrThrow({ where: { memoOutId: pending.id } });
    expect(await failure(memoOutReturn.create(ACTOR, backInput(customerA, [backLine(pendingLine.id, 1, "0.5")]))))
      .toMatchObject({ status: 422, code: "MEMO_OUT_RETURN_REFERENCE_INVALID" });
    await memoOut.delete(ACTOR, pending.id, 1);
  });

  it("IT-MOR-03 approve adds to the Memo Out line's returned and moves Reserve back to pending; then read-only", async () => {
    const { item, line } = await lentOut(customerA, [10, "5"], [4, "2"]);
    const saved = await memoOutReturn.create(ACTOR, backInput(customerA, [backLine(line.id, 3, "1.5")]));
    await expect(memoOutReturn.approve(ACTOR, saved.id, 1)).resolves.toEqual({ id: saved.id, version: 2, status: "APPROVED" });
    expect(await returnedOf(line.id)).toEqual([3, "1.500"]);
    expect(await bucketsOf(item.id)).toEqual({ pending: [9, "4.500"], reserved: [1, "0.500"] });
    expect(await memoOutReturn.get(saved.id)).toMatchObject({ status: "APPROVED", approvedBy: ACTOR });
    expect(await failure(memoOutReturn.approve(ACTOR, saved.id, 2))).toMatchObject({ status: 409, code: "MEMO_OUT_RETURN_STATUS_INVALID" });
    expect(await failure(memoOutReturn.delete(ACTOR, saved.id, 2))).toMatchObject({ status: 409, code: "MEMO_OUT_RETURN_STATUS_INVALID" });
    // The rest is still outstanding; after it comes back the line leaves the dialog.
    const rest = await memoOutReturn.create(ACTOR, backInput(customerA, [backLine(line.id, 1, "0.5")]));
    await memoOutReturn.approve(ACTOR, rest.id, 1);
    expect(await bucketsOf(item.id)).toEqual({ pending: [10, "5.000"], reserved: [0, "0.000"] });
    const listed = await memoOutReturn.outstanding(schemas.memoOutOutstandingSchema.parse({ customerId: customerA.id, currency: "THB" }));
    expect(listed.items.map((entry) => entry.memoOutLineId)).not.toContain(line.id);
  });

  it("IT-MOR-04 over-return guard: of two returns that together exceed outstanding, only the first approval passes", async () => {
    const { item, line } = await lentOut(customerB, [5, "2.5"], [2, "1"]);
    const first = await memoOutReturn.create(ACTOR, backInput(customerB, [backLine(line.id, 2, "1")]));
    const second = await memoOutReturn.create(ACTOR, backInput(customerB, [backLine(line.id, 1, "0.5")]));
    await memoOutReturn.approve(ACTOR, first.id, 1);
    expect(await failure(memoOutReturn.approve(ACTOR, second.id, 1)))
      .toMatchObject({ status: 409, code: "MEMO_OUT_RETURN_OUTSTANDING_SHORT", fieldErrors: [{ path: "lines.0.pcs", code: "exceeds_outstanding" }, { path: "lines.0.weightCt", code: "exceeds_outstanding" }] });
    expect(await memoOutReturn.get(second.id)).toMatchObject({ status: "PENDING_APPROVAL", version: 1 });
    expect(await bucketsOf(item.id)).toEqual({ pending: [5, "2.500"], reserved: [0, "0.000"] });
  });

  it("IT-MOR-05 parallel approvals of the same Memo Out line never return more than outstanding", async () => {
    const { item, line } = await lentOut(customerB, [4, "2"], [2, "1"]);
    const backs = await Promise.all([1, 2, 3].map(() => memoOutReturn.create(ACTOR, backInput(customerB, [backLine(line.id, 1, "0.6")]))));
    const results = await Promise.allSettled(backs.map((saved) => memoOutReturn.approve(ACTOR, saved.id, 1)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await returnedOf(line.id)).toEqual([1, "0.600"]);
    expect(await bucketsOf(item.id)).toEqual({ pending: [3, "1.600"], reserved: [1, "0.400"] });
  });

  it("IT-MOR-07 (INV-20261031-001) one return of two memo outs that took the same item releases both quantities", async () => {
    const { item, line: first } = await lentOut(customerA, [10, "5"], [2, "1"]);
    // A second approved memo out of the same customer takes more of the same Memo Stock item.
    const second = await memoOut.create(ACTOR, schemas.createMemoOutSchema.parse({ ...header(customerA), lines: [outLine(item.id, 3, "1.5")] }));
    await memoOut.approve(ACTOR, second.id, 1);
    const secondLine = await prisma.memoOutLine.findFirstOrThrow({ where: { memoOutId: second.id } });
    expect(await bucketsOf(item.id)).toEqual({ pending: [5, "2.500"], reserved: [5, "2.500"] });
    const saved = await memoOutReturn.create(ACTOR, backInput(customerA, [backLine(first.id, 2, "1"), backLine(secondLine.id, 3, "1.5")]));
    await memoOutReturn.approve(ACTOR, saved.id, 1);
    expect(await returnedOf(first.id)).toEqual([2, "1.000"]);
    expect(await returnedOf(secondLine.id)).toEqual([3, "1.500"]);
    expect(await bucketsOf(item.id)).toEqual({ pending: [10, "5.000"], reserved: [0, "0.000"] });
  });

  it("IT-MOR-06 Memo Out lines with returns can't be deleted (RESTRICT) and the report still balances", async () => {
    const { item, line, memoOutId } = await lentOut(customerA, [3, "1.5"], [3, "1.5"]);
    const saved = await memoOutReturn.create(ACTOR, backInput(customerA, [backLine(line.id, 3, "1.5")]));
    await memoOutReturn.approve(ACTOR, saved.id, 1);
    await expect(prisma.memoOutLine.delete({ where: { id: line.id } })).rejects.toThrow();
    const stored = await prisma.memoStock.findUniqueOrThrow({ where: { id: item.id } });
    expect(stored.receivedPcs - stored.returnedPcs - stored.soldPcs - stored.reservedPcs).toBe(stored.pendingPcs);
    expect(await prisma.memoOut.findUniqueOrThrow({ where: { id: memoOutId }, select: { status: true } })).toEqual({ status: "APPROVED" });
  });
});
