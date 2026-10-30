import { randomUUID } from "node:crypto";
import { HttpException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * IT-MRT-01…05 (memo-return SA rev 2, owner 2026-10-29) against real PostgreSQL: lines completed from approved Memo
 * Stock items, save rejections, approval reducing pending under a row lock, the over-pull guard (Q-MR-15) and the
 * `currency` filter of `memoStock.list`.
 *
 * Opt-in like the other DB integrations (INV-20261021-007): runs only with `PARTNER_TEST_DATABASE_URL` pointing at
 * a disposable `f1_system` database on 127.0.0.1 with an explicit port other than 5432, migrated with
 * `prisma migrate deploy`. Rows are scoped to vendors created here and Stock ID year 60 (clock faked to 2060); all
 * are removed in `afterAll`.
 */

const testUrl = process.env.PARTNER_TEST_DATABASE_URL;
const canRun = Boolean(testUrl && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(testUrl));
const ACTOR = `mrt-it-${randomUUID().slice(0, 8)}`;
const YEAR = 60;

type Prisma = typeof import("../../src/database/prisma-client").prisma;
type Receive = InstanceType<typeof import("../../src/trade-document/memo-receive.service").MemoReceiveService>;
type Return = InstanceType<typeof import("../../src/trade-document/memo-return.service").MemoReturnService>;
type Stock = InstanceType<typeof import("../../src/trade-document/memo-stock.service").MemoStockService>;
type Vendor = { id: string; addressId: string };

let prisma: Prisma;
let receive: Receive;
let memoReturn: Return;
let stock: Stock;
let createMemoReturnSchema: typeof import("../../src/trade-document/memo-schemas").createMemoReturnSchema;
const vendors: Vendor[] = [];
const created: string[] = [];

const header = (vendor: Vendor, patch: Record<string, unknown> = {}) => ({
  docDate: "2026-10-29", dueDate: "2026-11-29", currency: "THB", exchangeRate: null, ref: "", documentNote: "",
  discount: { type: "NONE" as const, value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null,
  vendorId: vendor.id, addressId: vendor.addressId, ...patch,
});
const receiveLine = (patch: Record<string, unknown> = {}) => ({
  source: "MANUAL" as const, stoneCode: "", stone: "Ruby", shape: "Oval", size: "", color: "Red", clarity: "", cutting: "", quality: "",
  lot: "LOT-A", cerType: "GIA", cerNo: "C-1", pcs: 3, weightCt: "1.5", priceUnit: "PER_CT" as "PER_CT" | "PER_PCS", unitPrice: "1000",
  discount: { type: "NONE" as "NONE" | "PERCENT" | "AMOUNT", value: "0" }, itemNote: "", photoIds: [] as [],
  ...patch,
});
/** What the page sends: the item fields are placeholders the server replaces from Memo Stock. */
const returnLine = (memoStockId: string, pcs: number, weightCt: string, patch: Record<string, unknown> = {}) => ({
  source: "MANUAL" as const, stoneCodeId: null, stoneCode: "", stone: "typed by client", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "",
  lot: "", location: "", cerType: "", cerNo: "", pcs, weightCt, priceUnit: "PER_PCS" as const, unitPrice: "1", discount: { type: "NONE" as const, value: "0" },
  itemNote: "back", photoIds: [] as string[], memoStockId, outstandingPcs: 999, outstandingWeightCt: "999", ...patch,
});
const returnInput = (vendor: Vendor, lines: ReturnType<typeof returnLine>[], patch: Record<string, unknown> = {}) =>
  createMemoReturnSchema.parse({ ...header(vendor, patch), lines });

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
  const code = `MRTIT${vendors.length}${ACTOR.slice(-4)}`;
  await prisma.vendor.create({ data: {
    id, name, nameKey: name.toLowerCase(), code: code.toUpperCase(), codeKey: code.toLowerCase(),
    currencyCode: "THB", firstName: "It", email: "mrt-it@example.test", createdBy: ACTOR, updatedBy: ACTOR,
    addresses: { create: [{ id: addressId, position: 1, name: `${name} Co.`, address: "1 Test Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true }] },
  } });
  vendors.push({ id, addressId });
  return { id, addressId };
}

/** An approved memo receive: its lines are now Memo Stock items (location Memo, pending = received). */
async function approvedStock(vendor: Vendor, lines: ReturnType<typeof receiveLine>[]) {
  const saved = await receive.create(ACTOR, { ...header(vendor), lines });
  await receive.approve(ACTOR, saved.id, saved.version);
  const items = await prisma.memoStock.findMany({ where: { memoReceiveId: saved.id }, orderBy: { stockId: "asc" } });
  return items;
}

const pendingOf = async (id: string) => {
  const item = await prisma.memoStock.findUniqueOrThrow({ where: { id }, select: { pendingPcs: true, pendingWeightCt: true } });
  return [item.pendingPcs, item.pendingWeightCt.toFixed(3)];
};

describe.runIf(canRun)("IT-MRT memo return on PostgreSQL", () => {
  let vendorA: Vendor;
  let vendorB: Vendor;

  beforeAll(async () => {
    vi.stubEnv("PARTNER_DATABASE_URL", testUrl!);
    vi.stubEnv("DATABASE_URL", testUrl!);
    ({ prisma } = await import("../../src/database/prisma-client"));
    const { MemoReceiveService } = await import("../../src/trade-document/memo-receive.service");
    const { MemoReturnService } = await import("../../src/trade-document/memo-return.service");
    const { MemoStockService } = await import("../../src/trade-document/memo-stock.service");
    ({ createMemoReturnSchema } = await import("../../src/trade-document/memo-schemas"));
    receive = new MemoReceiveService();
    receive.clock = () => new Date(`20${YEAR}-06-01T03:00:00Z`);
    memoReturn = new MemoReturnService();
    stock = new MemoStockService();
    for (const code of ["THB", "USD"]) {
      if (!(await prisma.currency.findUnique({ where: { code } }))) {
        await prisma.currency.create({ data: { code, name: code, createdBy: ACTOR, updatedBy: ACTOR } });
        created.push(code);
      }
    }
    await prisma.memoStockIdCounter.deleteMany({ where: { year: YEAR } });
    vendorA = await vendorFixture("MRT IT Vendor A");
    vendorB = await vendorFixture("MRT IT Vendor B");
  });

  afterAll(async () => {
    if (!prisma) return;
    const ids = vendors.map((vendor) => vendor.id);
    await prisma.memoReturn.deleteMany({ where: { vendorId: { in: ids } } });
    await prisma.memoStock.deleteMany({ where: { vendorId: { in: ids } } });
    await prisma.memoReceive.deleteMany({ where: { vendorId: { in: ids } } });
    await prisma.vendor.deleteMany({ where: { id: { in: ids } } });
    await prisma.memoStockIdCounter.deleteMany({ where: { year: YEAR } });
    if (created.length > 0) await prisma.currency.deleteMany({ where: { code: { in: created } } });
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  it("IT-MRT-01 save copies the item, net price and Outstanding from Memo Stock; PENDING_APPROVAL; pending unchanged", async () => {
    const [item] = await approvedStock(vendorA, [receiveLine({ discount: { type: "PERCENT", value: "10" } })]);
    expect(item).toMatchObject({ location: "Memo", pendingPcs: 3 });
    const saved = await memoReturn.create(ACTOR, returnInput(vendorA, [returnLine(item.id, 2, "1")]));
    expect(saved).toMatchObject({ docNo: expect.stringMatching(/^\d+$/), version: 1 });
    const detail = await memoReturn.get(saved.id) as unknown as Record<string, unknown> & { lines: Record<string, unknown>[] };
    expect(detail).toMatchObject({ status: "PENDING_APPROVAL", approvedAt: null, vendorId: vendorA.id });
    expect(detail.lines[0]).toMatchObject({
      memoStockId: item.id, stockId: item.stockId, stone: "Ruby", lot: "LOT-A", location: "Memo", cerNo: "C-1", itemNote: "back",
      pcs: 2, weightCt: "1.000", priceUnit: "PER_CT", unitPrice: "900.00", amount: "900.00", outstandingPcs: 3, outstandingWeightCt: "1.500",
    });
    expect(detail.lines[0]).not.toHaveProperty("stoneCodeId");
    expect(await pendingOf(item.id)).toEqual([3, "1.500"]);
    // The dialog still lists it (saving reserves nothing) and filters by currency.
    expect((await stock.list({ vendorId: vendorA.id, currency: "THB", limit: 50 })).items.map((row) => row.id)).toContain(item.id);
    expect((await stock.list({ vendorId: vendorA.id, currency: "USD", limit: 50 })).items).toEqual([]);
  });

  it("IT-MRT-02 save rejects Return above pending, another vendor's or currency's item and the same item twice", async () => {
    const [item] = await approvedStock(vendorA, [receiveLine()]);
    expect(await failure(memoReturn.create(ACTOR, returnInput(vendorA, [returnLine(item.id, 4, "1")]))))
      .toMatchObject({ status: 400, code: "VALIDATION_ERROR", fieldErrors: [{ path: "lines.0.pcs", code: "exceeds_outstanding" }] });
    expect(await failure(memoReturn.create(ACTOR, returnInput(vendorA, [returnLine(item.id, 1, "1.501")]))))
      .toMatchObject({ status: 400, fieldErrors: [{ path: "lines.0.weightCt", code: "exceeds_outstanding" }] });
    expect(await failure(memoReturn.create(ACTOR, returnInput(vendorB, [returnLine(item.id, 1, "0.5")]))))
      .toMatchObject({ status: 422, code: "MEMO_RETURN_REFERENCE_INVALID", fieldErrors: [{ path: "lines.0.memoStockId", code: "invalid_reference" }] });
    expect(await failure(memoReturn.create(ACTOR, returnInput(vendorA, [returnLine(item.id, 1, "0.5")], { currency: "USD", exchangeRate: "35" }))))
      .toMatchObject({ status: 422, code: "MEMO_RETURN_REFERENCE_INVALID" });
    expect(await failure(memoReturn.create(ACTOR, returnInput(vendorA, [returnLine(randomUUID(), 1, "0.5")]))))
      .toMatchObject({ status: 422, code: "MEMO_RETURN_REFERENCE_INVALID" });
    expect(await failure(memoReturn.create(ACTOR, returnInput(vendorA, [returnLine(item.id, 1, "0.5"), returnLine(item.id, 1, "0.5")]))))
      .toMatchObject({ status: 400, fieldErrors: [{ path: "lines.1.memoStockId", code: "duplicate" }] });
  });

  it("IT-MRT-03 approve reduces pending; then the return is read-only and a fully returned item leaves the dialog", async () => {
    const [part, whole] = await approvedStock(vendorA, [receiveLine(), receiveLine({ lot: "LOT-B", priceUnit: "PER_PCS", pcs: 2, weightCt: "0.8", unitPrice: "500" })]);
    const saved = await memoReturn.create(ACTOR, returnInput(vendorA, [returnLine(part.id, 1, "0.5"), returnLine(whole.id, 2, "0.8")]));
    const updated = await memoReturn.update(ACTOR, saved.id, 1, returnInput(vendorA, [returnLine(part.id, 2, "1"), returnLine(whole.id, 2, "0.8")]));
    expect(await failure(memoReturn.approve(ACTOR, saved.id, 1))).toMatchObject({ status: 409, code: "MEMO_RETURN_CHANGED" });
    await expect(memoReturn.approve(ACTOR, saved.id, updated.version)).resolves.toEqual({ id: saved.id, version: 3, status: "APPROVED" });
    expect(await pendingOf(part.id)).toEqual([1, "0.500"]);
    expect(await pendingOf(whole.id)).toEqual([0, "0.000"]);
    expect(await memoReturn.get(saved.id)).toMatchObject({ status: "APPROVED", approvedBy: ACTOR, approvedAt: expect.any(String) });
    expect(await failure(memoReturn.approve(ACTOR, saved.id, 3))).toMatchObject({ status: 409, code: "MEMO_RETURN_STATUS_INVALID" });
    expect(await failure(memoReturn.update(ACTOR, saved.id, 3, returnInput(vendorA, [returnLine(part.id, 1, "0.5")])))).toMatchObject({ status: 409, code: "MEMO_RETURN_STATUS_INVALID" });
    expect(await failure(memoReturn.delete(ACTOR, saved.id, 3))).toMatchObject({ status: 409, code: "MEMO_RETURN_STATUS_INVALID" });
    const listed = (await stock.list({ vendorId: vendorA.id, limit: 50 })).items;
    expect(listed.find((row) => row.id === part.id)).toMatchObject({ pendingPcs: 1, pendingWeightCt: "0.500" });
    expect(listed.map((row) => row.id)).not.toContain(whole.id);
    expect((await memoReturn.list({ partyId: vendorA.id, status: "APPROVED", limit: 50 })).items.map((row) => row.id)).toContain(saved.id);
  });

  it("IT-MRT-04 over-pull guard: of two returns that together take more than pending, only the first approval passes", async () => {
    const [item] = await approvedStock(vendorA, [receiveLine()]);
    const first = await memoReturn.create(ACTOR, returnInput(vendorA, [returnLine(item.id, 2, "1")]));
    const second = await memoReturn.create(ACTOR, returnInput(vendorA, [returnLine(item.id, 2, "1")]));
    await memoReturn.approve(ACTOR, first.id, 1);
    expect(await failure(memoReturn.approve(ACTOR, second.id, 1)))
      .toMatchObject({ status: 409, code: "MEMO_RETURN_PENDING_SHORT", fieldErrors: [{ path: "lines.0.pcs", code: "exceeds_pending" }, { path: "lines.0.weightCt", code: "exceeds_pending" }] });
    expect(await pendingOf(item.id)).toEqual([1, "0.500"]);
    expect(await memoReturn.get(second.id)).toMatchObject({ status: "PENDING_APPROVAL", version: 1 });
    // Edited down to what is left, it passes.
    await memoReturn.update(ACTOR, second.id, 1, returnInput(vendorA, [returnLine(item.id, 1, "0.5")]));
    await memoReturn.approve(ACTOR, second.id, 2);
    expect(await pendingOf(item.id)).toEqual([0, "0.000"]);
  });

  it("IT-MRT-05 parallel approvals of the same item never take more than pending", async () => {
    const [item] = await approvedStock(vendorB, [receiveLine({ pcs: 2, weightCt: "1" })]);
    const returns = await Promise.all([1, 2, 3].map(() => memoReturn.create(ACTOR, returnInput(vendorB, [returnLine(item.id, 1, "0.6")]))));
    const results = await Promise.allSettled(returns.map((saved) => memoReturn.approve(ACTOR, saved.id, 1)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await pendingOf(item.id)).toEqual([1, "0.400"]);
  });
});
