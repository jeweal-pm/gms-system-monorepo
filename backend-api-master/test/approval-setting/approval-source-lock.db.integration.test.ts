import { randomInt, randomUUID } from "node:crypto";
import { HttpException } from "@nestjs/common";
import { Prisma } from "../../src/generated/prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sendAndApprove, setApproval } from "../partner-shared/approval";

/**
 * IT-AS-B15 (INV-20261111-002 F1): a dependent document that applies effects against a source document locks the source
 * header `FOR SHARE` and re-checks it live, so it serializes with the source's auto-approved soft delete (whose guarded
 * version bump locks the header first). Two real sessions with a controlled interleaving on PostgreSQL:
 * - Memo Out Return (auto-approve) vs `memoOut.delete` of its auto-approved Memo Out, with pooled Reserve on the item:
 *   the delete holds the Memo Out header and waits on the Memo Stock row (held by a third session); the return then
 *   starts. Before the fix the return released the quantity a second time (pending/reserved doubled back); after it the
 *   return waits for the Memo Out header and is refused (`MEMO_OUT_RETURN_REFERENCE_INVALID`), stock = serial result.
 * - Purchase (auto-approve) vs `purchaseOrder.delete` of its auto-approved PO: the purchase is held after its PO check
 *   (a test-only trigger on this PO's lines waits on an advisory lock); the delete then runs. Before the fix the delete
 *   committed and the purchase too (approved Purchase on a deleted PO); after it the delete waits for the purchase and
 *   is refused (`PURCHASE_ORDER_IN_USE`).
 * Opt-in (INV-20261021-007): only with `PARTNER_TEST_DATABASE_URL` on a disposable loopback non-5432 `f1_system`.
 */

const testUrl = process.env.PARTNER_TEST_DATABASE_URL;
const canRun = Boolean(testUrl && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(testUrl));
const ACTOR = `sl-it-${randomUUID().slice(0, 8)}`;
const YEAR = 69;
const TYPES = ["reserve", "memo-receive", "memo-out", "memo-out-return", "purchase-order", "purchase"] as const;

type PrismaClient = typeof import("../../src/database/prisma-client").prisma;
let prisma: PrismaClient;
let schemas: typeof import("../../src/trade-document/memo-schemas");
let s: {
  receive: InstanceType<typeof import("../../src/trade-document/memo-receive.service").MemoReceiveService>;
  memoOut: InstanceType<typeof import("../../src/trade-document/memo-out.service").MemoOutService>;
  reserve: InstanceType<typeof import("../../src/trade-document/reserve.service").ReserveService>;
  memoOutReturn: InstanceType<typeof import("../../src/trade-document/memo-out-return.service").MemoOutReturnService>;
  po: InstanceType<typeof import("../../src/purchase-order/purchase-order.service").PurchaseOrderService>;
  purchase: InstanceType<typeof import("../../src/purchase/purchase.service").PurchaseService>;
};

const vendor = { id: randomUUID(), addressId: randomUUID() };
const customer = { id: randomUUID(), shipping: randomUUID(), invoice: randomUUID() };
let fixtures = false;

const money = { discount: { type: "NONE" as const, value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null };
const dates = { docDate: "2026-11-12", dueDate: "2026-12-12", currency: "THB", exchangeRate: null, ref: "", documentNote: "" };
const vendorHeader = { ...dates, ...money, vendorId: vendor.id, addressId: vendor.addressId };
const customerHeader = () => ({ ...dates, ...money, customerId: customer.id, shippingAddressId: customer.shipping, invoiceAddressId: customer.invoice });
const blank = { stoneCodeId: null, stoneCode: "", stone: "typed", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "", lot: "", location: "", cerType: "", cerNo: "",
  discount: { type: "NONE" as const, value: "0" }, itemNote: "", photoIds: [] as string[] };
const receiveLine = (pcs: number, weightCt: string) => ({
  source: "MANUAL" as const, stoneCode: "", stone: "Ruby", shape: "Oval", size: "", color: "Red", clarity: "", cutting: "", quality: "", lot: "L", cerType: "", cerNo: "",
  pcs, weightCt, priceUnit: "PER_CT" as const, unitPrice: "1000", discount: { type: "NONE" as const, value: "0" }, itemNote: "", photoIds: [] as [],
});
const stockLine = (memoStockId: string, pcs: number, weightCt: string) => ({ ...blank, source: "MANUAL" as const, pcs, weightCt, priceUnit: "PER_CT" as const, unitPrice: "2000", memoStockId });
const outInput = (lines: ReturnType<typeof stockLine>[]) => schemas.createMemoOutSchema.parse({ ...customerHeader(), lines });
const backInput = (lines: { memoOutLineId: string; pcs: number; weightCt: string }[]) => schemas.createMemoOutReturnSchema.parse({
  ...customerHeader(), lines: lines.map((line) => ({ ...blank, source: "MANUAL", priceUnit: "PER_PCS", unitPrice: "1", outstandingPcs: 999, outstandingWeightCt: "999", ...line })),
});
const orderLine = (pcs: number, weightCt: string) => ({ ...blank, source: "MANUAL" as const, stone: "Sapphire", location: "Safe", pcs, weightCt, priceUnit: "PER_PCS" as const, unitPrice: "100" });
const poLineInput = (purchaseOrderLineId: string, pcs: number, weightCt: string) => ({ ...blank, source: "PURCHASE_ORDER", purchaseOrderLineId, pcs, weightCt, priceUnit: "PER_PCS", unitPrice: "90" });

type Settled = { ok: true; value: unknown } | { ok: false; code: string | null; error: unknown };
const settle = (promise: Promise<unknown>): Promise<Settled> => promise.then(
  (value) => ({ ok: true as const, value }),
  (error: unknown) => ({ ok: false as const, code: error instanceof HttpException ? (error.getResponse() as { error: { code: string } }).error.code : null, error }),
);

/**
 * A third session: one transaction that takes `lock` and holds it until `release()` (one pooled connection; the pool
 * has 5: holder, two sessions under test, observer).
 */
async function hold(lock: Prisma.Sql) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  let pidOf!: (pid: number) => void;
  const pid = new Promise<number>((resolve) => { pidOf = resolve; });
  const done = prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    await tx.$queryRaw(lock);
    pidOf(row.pid);
    await released;
  }, { timeout: 15_000, maxWait: 2_000 });
  return { pid: await Promise.race([pid, done.then(() => -1)]), release: async () => { release(); await done; } };
}

/**
 * Polls until a backend waits on a lock held by one of `holders` (and is not in `exclude`); returns its pid, or null
 * after `ms` (the caller's transaction then finished without waiting).
 */
async function waitBlocked(holders: number[], exclude: number[] = [], ms = 2_000, done: () => boolean = () => false): Promise<number | null> {
  const until = Date.now() + ms;
  while (Date.now() < until && !done()) {
    const rows = await prisma.$queryRaw<{ pid: number }[]>`
      SELECT pid FROM pg_stat_activity WHERE pg_blocking_pids(pid) && ${holders}::int[] AND NOT (pid = ANY(${exclude}::int[])) LIMIT 1`;
    if (rows[0]) return rows[0].pid;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return null;
}

async function buckets(id: string) {
  const item = await prisma.memoStock.findUniqueOrThrow({ where: { id } });
  return { pending: [item.pendingPcs, item.pendingWeightCt.toFixed(3)], reserved: [item.reservedPcs, item.reservedWeightCt.toFixed(3)] };
}

describe.runIf(canRun)("IT-AS-B15 source header lock vs auto-approved delete (INV-20261111-002 F1) on PostgreSQL", () => {
  beforeAll(async () => {
    vi.stubEnv("PARTNER_DATABASE_URL", testUrl!);
    vi.stubEnv("DATABASE_URL", testUrl!);
    ({ prisma } = await import("../../src/database/prisma-client"));
    schemas = await import("../../src/trade-document/memo-schemas");
    const { MemoReceiveService } = await import("../../src/trade-document/memo-receive.service");
    const { MemoOutService } = await import("../../src/trade-document/memo-out.service");
    const { ReserveService } = await import("../../src/trade-document/reserve.service");
    const { MemoOutReturnService } = await import("../../src/trade-document/memo-out-return.service");
    const { PurchaseOrderService } = await import("../../src/purchase-order/purchase-order.service");
    const { PurchaseService } = await import("../../src/purchase/purchase.service");
    const receive = new MemoReceiveService();
    receive.clock = () => new Date(`20${YEAR}-06-01T03:00:00Z`);
    const purchase = new PurchaseService();
    purchase.clock = receive.clock;
    s = { receive, memoOut: new MemoOutService(), reserve: new ReserveService(), memoOutReturn: new MemoOutReturnService(), po: new PurchaseOrderService(), purchase };
    if (!(await prisma.currency.findUnique({ where: { code: "THB" } }))) await prisma.currency.create({ data: { code: "THB", name: "THB", createdBy: ACTOR, updatedBy: ACTOR } });
    await prisma.memoStockIdCounter.deleteMany({ where: { year: YEAR } });
    const code = `SLIT${ACTOR.slice(-4)}`.toUpperCase();
    const address = { position: 1, name: "SL IT", address: "1 Test Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true };
    await prisma.vendor.create({ data: {
      id: vendor.id, name: "SL IT Vendor", nameKey: "sl it vendor", code, codeKey: code.toLowerCase(), currencyCode: "THB", firstName: "It", email: "sl-it@example.test",
      createdBy: ACTOR, updatedBy: ACTOR, addresses: { create: [{ ...address, id: vendor.addressId }] },
    } });
    await prisma.customer.create({ data: {
      id: customer.id, name: "SL IT Customer", nameKey: "sl it customer", code: `${code}C`, codeKey: `${code.toLowerCase()}c`, currencyCode: "THB", firstName: "It", email: "sl-it@example.test",
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
      await prisma.memoStock.deleteMany({ where: { vendorId: vendor.id } });
      await prisma.memoReceive.deleteMany({ where: { vendorId: vendor.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.vendor.deleteMany({ where: { id: vendor.id } });
    }
    await prisma.memoStockIdCounter.deleteMany({ where: { year: YEAR } });
    for (const type of TYPES) await setApproval(prisma, type, true);
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  it("Memo Out Return auto-approve waits for the Memo Out header held by its soft delete and is refused; pooled Reserve is released once", async () => {
    await setApproval(prisma, "memo-receive", true);
    const received = await s.receive.create(ACTOR, { ...vendorHeader, lines: [receiveLine(10, "5")] } as never);
    await sendAndApprove(s.receive, ACTOR, received.id, received.version);
    const item = await prisma.memoStock.findFirstOrThrow({ where: { memoReceiveId: received.id } });
    for (const type of ["memo-out", "reserve", "memo-out-return"] as const) await setApproval(prisma, type, false);
    const out = await s.memoOut.create(ACTOR, outInput([stockLine(item.id, 3, "1.5")]));
    // Pooled Reserve on the same item (INV-20261031-001): the bucket still holds 3 after the Memo Out leaves.
    await s.reserve.create(ACTOR, outInput([stockLine(item.id, 3, "1.5")]));
    expect(await buckets(item.id)).toEqual({ pending: [4, "2.000"], reserved: [6, "3.000"] });
    const outLine = await prisma.memoOutLine.findFirstOrThrow({ where: { memoOutId: out.id } });

    const blocker = await hold(Prisma.sql`SELECT 1 FROM "partner"."memo_stock" WHERE id = ${item.id}::uuid FOR UPDATE`);
    let deletion: Promise<Settled> | null = null;
    let giveBack: Promise<Settled> | null = null;
    try {
      // Session 1: the soft delete locks the Memo Out header, then waits on the Memo Stock row inside its reversal.
      deletion = settle(s.memoOut.delete(ACTOR, out.id, 1));
      const deleter = await waitBlocked([blocker.pid]);
      expect(deleter).not.toBeNull();
      // Session 2: an auto-approving Memo Out Return of the same line starts while the delete is uncommitted.
      giveBack = settle(s.memoOutReturn.create(ACTOR, backInput([{ memoOutLineId: outLine.id, pcs: 3, weightCt: "1.5" }])));
      expect(await waitBlocked([blocker.pid, deleter!], [deleter!])).not.toBeNull();
    } finally {
      await blocker.release();
    }
    const [deleted, returned] = await Promise.all([deletion!, giveBack!]);
    expect(deleted.ok).toBe(true);
    expect(returned).toMatchObject({ ok: false, code: "MEMO_OUT_RETURN_REFERENCE_INVALID" });
    // Serial result: the Memo Out's 3 back to pending once; the Reserve keeps its 3; no return, line not returned.
    expect(await buckets(item.id)).toEqual({ pending: [7, "3.500"], reserved: [3, "1.500"] });
    expect(await prisma.memoOutReturn.count({ where: { customerId: customer.id } })).toBe(0);
    expect((await prisma.memoOutLine.findUniqueOrThrow({ where: { id: outLine.id } })).returnedPcs).toBe(0);
  });

  it("Purchase auto-approve holds the PO header: a concurrent PO soft delete waits and is refused as used; no approved Purchase names a deleted PO", async () => {
    await setApproval(prisma, "purchase-order", false);
    await setApproval(prisma, "purchase", false);
    const po = await s.po.create(ACTOR, { ...vendorHeader, lines: [orderLine(5, "2")] } as never);
    const poLine = await prisma.purchaseOrderLine.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
    const key = randomInt(1, 2 ** 31);
    const fn = `it_hold_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    // Test-only pause point after the purchase's PO check: an update of this PO's lines waits on an advisory lock.
    await prisma.$executeRawUnsafe(`CREATE FUNCTION "partner"."${fn}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock_shared(${key}); RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "${fn}" BEFORE UPDATE ON "partner"."purchase_order_line" FOR EACH ROW WHEN (OLD.purchase_order_id = '${po.id}'::uuid) EXECUTE FUNCTION "partner"."${fn}"()`);
    const blocker = await hold(Prisma.sql`SELECT pg_advisory_xact_lock(${key}::bigint)::text`);
    let buying: Promise<Settled> | null = null;
    let deletion: Promise<Settled> | null = null;
    try {
      // Session 2: the auto-approving purchase checks the PO, cuts its line and waits in the trigger (uncommitted).
      buying = settle(s.purchase.create(ACTOR, { ...vendorHeader, lines: [poLineInput(poLine.id, 2, "1")] } as never));
      const buyer = await waitBlocked([blocker.pid]);
      expect(buyer).not.toBeNull();
      // Session 1: the PO soft delete starts while the purchase is uncommitted; it either finishes or waits on the buyer.
      let finished = false;
      deletion = settle(s.po.delete(ACTOR, po.id, 1)).then((result) => {
        finished = true;
        return result;
      });
      await waitBlocked([buyer!], [], 1_500, () => finished);
    } finally {
      await blocker.release();
    }
    try {
      const [bought, deleted] = await Promise.all([buying!, deletion!]);
      const header = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, select: { deletedAt: true } });
      const approvedOnDeleted = await prisma.purchaseLine.count({
        where: { purchaseOrderLineId: poLine.id, document: { status: "APPROVED", deletedAt: null } },
      });
      // Never both: an approved Purchase on a deleted PO.
      expect(header.deletedAt !== null && approvedOnDeleted > 0).toBe(false);
      expect(bought.ok).toBe(true);
      expect(deleted).toMatchObject({ ok: false, code: "PURCHASE_ORDER_IN_USE" });
      expect(header.deletedAt).toBeNull();
      expect((await prisma.purchaseOrderLine.findUniqueOrThrow({ where: { id: poLine.id } })).purchasedPcs).toBe(2);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${fn}" ON "partner"."purchase_order_line"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "partner"."${fn}"()`);
    }
  });
});

describe("IT-AS-B15 guard", () => {
  it("runs only against an explicit loopback, non-5432 f1_system URL", () => {
    expect(typeof canRun).toBe("boolean");
  });
});
