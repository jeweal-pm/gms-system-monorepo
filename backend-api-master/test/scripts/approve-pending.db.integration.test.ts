import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sendAndApprove, setApproval, submitted } from "../partner-shared/approval";

/**
 * IT-AS-B12 (approval-setup ADR-0048 D7, BE-AS-009): the go-live command on real PostgreSQL.
 * - Dry run changes nothing (documents, Memo Stock) and predicts each document alone against the pre-run state, one
 *   rolled-back transaction per document (INV-20261111-002 H2); competing documents may still be deleted by apply.
 * - Apply approves in dependency order through the normal approve (stock effects), oldest first, regardless of the
 *   current setting; a short-stock document is soft-deleted by the actor and listed with its code.
 * - A second run is a no-op for these documents.
 * Opt-in (INV-20261021-007): only with `PARTNER_TEST_DATABASE_URL` on a disposable loopback non-5432 `f1_system`.
 */

const testUrl = process.env.PARTNER_TEST_DATABASE_URL;
const canRun = Boolean(testUrl && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(testUrl));
const ACTOR = `gl-it-${randomUUID().slice(0, 8)}`;
const SYSTEM = `system:it-${randomUUID().slice(0, 6)}`;
const YEAR = 86;
const TYPES = ["quotation", "reserve", "memo-receive", "memo-return", "memo-out", "memo-out-return", "purchase-order", "purchase"] as const;

type Prisma = typeof import("../../src/database/prisma-client").prisma;
let prisma: Prisma;
let command: typeof import("../../src/scripts/approve-pending");
let schemas: typeof import("../../src/trade-document/memo-schemas");
let s: {
  receive: InstanceType<typeof import("../../src/trade-document/memo-receive.service").MemoReceiveService>;
  memoReturn: InstanceType<typeof import("../../src/trade-document/memo-return.service").MemoReturnService>;
  memoOut: InstanceType<typeof import("../../src/trade-document/memo-out.service").MemoOutService>;
  reserve: InstanceType<typeof import("../../src/trade-document/reserve.service").ReserveService>;
  po: InstanceType<typeof import("../../src/purchase-order/purchase-order.service").PurchaseOrderService>;
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
const receiveLine = (pcs: number, weightCt: string) => ({
  source: "MANUAL" as const, stoneCode: "", stone: "Ruby", shape: "Oval", size: "", color: "Red", clarity: "", cutting: "", quality: "", lot: "L", cerType: "", cerNo: "",
  pcs, weightCt, priceUnit: "PER_CT" as const, unitPrice: "1000", discount: { type: "NONE" as const, value: "0" }, itemNote: "", photoIds: [] as [],
});
const receiveInput = (lines: ReturnType<typeof receiveLine>[]) => ({ ...vendorHeader, lines }) as never;
const stockLine = (memoStockId: string, pcs: number, weightCt: string) => ({ ...blank, source: "MANUAL" as const, pcs, weightCt, priceUnit: "PER_CT" as const, unitPrice: "2000", memoStockId });
const outInput = (memoStockId: string, pcs: number) => schemas.createMemoOutSchema.parse({ ...customerHeader(), lines: [stockLine(memoStockId, pcs, (pcs / 2).toFixed(3))] });
const returnInput = (memoStockId: string, pcs: number) => schemas.createMemoReturnSchema.parse({
  ...vendorHeader, lines: [{ ...blank, source: "MANUAL", priceUnit: "PER_PCS", unitPrice: "1", outstandingPcs: 999, outstandingWeightCt: "999", memoStockId, pcs, weightCt: (pcs / 2).toFixed(3) }],
});
const poInput = () => ({ ...vendorHeader, lines: [{ ...blank, source: "MANUAL" as const, stone: "Sapphire", location: "Safe", pcs: 2, weightCt: "1", priceUnit: "PER_PCS" as const, unitPrice: "100" }] }) as never;
const quoteInput = () => ({ ...customerHeader(), lines: [{ ...blank, source: "MANUAL", stone: "Emerald", pcs: 1, weightCt: "1", priceUnit: "PER_CT", unitPrice: "100" }] }) as never;

const TABLE = { "memo-receive": "memo_receive", "memo-return": "memo_return", "memo-out": "memo_out", reserve: "reserve", "purchase-order": "purchase_order", quotation: "quotation" } as const;

/** Status, version, deletion and approval columns of one document, read with SQL (any table). */
async function state(type: keyof typeof TABLE, id: string) {
  const [row] = await prisma.$queryRawUnsafe<{ status: string; version: number; deleted_by: string | null; approved_by: string | null; auto_approved: boolean }[]>(
    `SELECT status, version, deleted_by, approved_by, auto_approved FROM "partner"."${TABLE[type]}" WHERE id = $1::uuid`, id);
  return row;
}

async function buckets(id: string) {
  const item = await prisma.memoStock.findUniqueOrThrow({ where: { id } });
  return { pending: item.pendingPcs, returned: item.returnedPcs, reserved: item.reservedPcs };
}

describe.runIf(canRun)("go-live approve-pending command on PostgreSQL (IT-AS-B12)", () => {
  beforeAll(async () => {
    vi.stubEnv("PARTNER_DATABASE_URL", testUrl!);
    vi.stubEnv("DATABASE_URL", testUrl!);
    ({ prisma } = await import("../../src/database/prisma-client"));
    command = await import("../../src/scripts/approve-pending");
    schemas = await import("../../src/trade-document/memo-schemas");
    const { MemoReceiveService } = await import("../../src/trade-document/memo-receive.service");
    const { MemoReturnService } = await import("../../src/trade-document/memo-return.service");
    const { MemoOutService } = await import("../../src/trade-document/memo-out.service");
    const { ReserveService } = await import("../../src/trade-document/reserve.service");
    const { PurchaseOrderService } = await import("../../src/purchase-order/purchase-order.service");
    const { QuotationService } = await import("../../src/quotation/quotation.service");
    const receive = new MemoReceiveService();
    receive.clock = () => new Date(`20${YEAR}-06-01T03:00:00Z`);
    s = { receive, memoReturn: new MemoReturnService(), memoOut: new MemoOutService(), reserve: new ReserveService(), po: new PurchaseOrderService(), quotation: new QuotationService() };
    if (!(await prisma.currency.findUnique({ where: { code: "THB" } }))) await prisma.currency.create({ data: { code: "THB", name: "THB", createdBy: ACTOR, updatedBy: ACTOR } });
    await prisma.memoStockIdCounter.deleteMany({ where: { year: YEAR } });
    const code = `GLIT${ACTOR.slice(-4)}`.toUpperCase();
    const address = { position: 1, name: "GL IT", address: "1 Test Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true };
    await prisma.vendor.create({ data: {
      id: vendor.id, name: "GL IT Vendor", nameKey: "gl it vendor", code, codeKey: code.toLowerCase(), currencyCode: "THB", firstName: "It", email: "gl-it@example.test",
      createdBy: ACTOR, updatedBy: ACTOR, addresses: { create: [{ ...address, id: vendor.addressId }] },
    } });
    await prisma.customer.create({ data: {
      id: customer.id, name: "GL IT Customer", nameKey: "gl it customer", code: `${code}C`, codeKey: `${code.toLowerCase()}c`, currencyCode: "THB", firstName: "It", email: "gl-it@example.test",
      createdBy: ACTOR, updatedBy: ACTOR, addresses: { create: [{ ...address, id: customer.shipping, type: "SHIPPING" }, { ...address, id: customer.invoice, type: "INVOICE" }] },
    } });
    fixtures = true;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (fixtures) {
      await prisma.memoOut.deleteMany({ where: { customerId: customer.id } });
      await prisma.reserve.deleteMany({ where: { customerId: customer.id } });
      await prisma.quotation.deleteMany({ where: { customerId: customer.id } });
      await prisma.purchaseOrder.deleteMany({ where: { vendorId: vendor.id } });
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

  it("dry run changes nothing; apply approves in dependency order, soft-deletes the short one, ignores the setting; a second run is a no-op", async () => {
    for (const type of TYPES) await setApproval(prisma, type, true);
    // An approved Memo Receive gives item X (10 pcs). Pending: a Memo Receive, a Memo Return of 4, a Memo Out of 5 and a
    // Reserve of 3 on X (each fits alone, not all together), a Purchase Order and a Quotation.
    const source = await s.receive.create(ACTOR, receiveInput([receiveLine(10, "5")]));
    await sendAndApprove(s.receive, ACTOR, source.id, source.version);
    const item = await prisma.memoStock.findFirstOrThrow({ where: { memoReceiveId: source.id } });
    const reserve = await submitted(s.reserve, ACTOR, await s.reserve.create(ACTOR, outInput(item.id, 3)));
    const memoOut = await submitted(s.memoOut, ACTOR, await s.memoOut.create(ACTOR, outInput(item.id, 5)));
    const memoReturn = await submitted(s.memoReturn, ACTOR, await s.memoReturn.create(ACTOR, returnInput(item.id, 4)));
    const receive = await submitted(s.receive, ACTOR, await s.receive.create(ACTOR, receiveInput([receiveLine(2, "1")])));
    const po = await submitted(s.po, ACTOR, await s.po.create(ACTOR, poInput()));
    const quote = await submitted(s.quotation, ACTOR, await s.quotation.create(ACTOR, quoteInput(), null));
    const draft = await s.reserve.create(ACTOR, outInput(item.id, 1));
    // The setting is ignored: Purchase Order is OFF at go-live, its pending document is still approved.
    await setApproval(prisma, "purchase-order", false);
    const mine = new Set([reserve.id, memoOut.id, memoReturn.id, receive.id, po.id, quote.id, draft.id]);
    const snapshot = async () => ({
      docs: {
        reserve: await state("reserve", reserve.id), memoOut: await state("memo-out", memoOut.id), memoReturn: await state("memo-return", memoReturn.id),
        receive: await state("memo-receive", receive.id), po: await state("purchase-order", po.id), quote: await state("quotation", quote.id), draft: await state("reserve", draft.id),
      },
      item: await buckets(item.id),
      receiveRows: await prisma.memoStock.count({ where: { memoReceiveId: receive.id } }),
    });
    const before = await snapshot();
    expect(before.item).toEqual({ pending: 10, returned: 0, reserved: 0 });

    const dry = await command.approvePending({ apply: false, actorId: SYSTEM });
    expect(dry.aborted).toBeNull();
    expect(await snapshot()).toEqual(before);
    const ours = (report: typeof dry) => report.outcomes.filter((outcome) => mine.has(outcome.id)).map((outcome) => [outcome.type, outcome.id, outcome.result, outcome.code]);
    expect(ours(dry)).toEqual([
      ["memo-receive", receive.id, "WOULD_APPROVE", null],
      ["memo-return", memoReturn.id, "WOULD_APPROVE", null],
      ["memo-out", memoOut.id, "WOULD_APPROVE", null],
      // INV-20261111-002 H2: each document is predicted alone against the pre-run stock (10 pending), so the Reserve of 3
      // fits here; --apply then finds it short after the Memo Return and Memo Out took 9 and deletes it.
      ["reserve", reserve.id, "WOULD_APPROVE", null],
      ["purchase-order", po.id, "WOULD_APPROVE", null],
      ["quotation", quote.id, "WOULD_APPROVE", null],
    ]);
    // Types appear in dependency order across the whole run.
    const order = dry.outcomes.map((outcome) => command.GO_LIVE_ORDER.indexOf(outcome.type));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(command.formatReport(dry)).toContain("nothing was changed");

    const applied = await command.approvePending({ apply: true, actorId: SYSTEM });
    expect(applied.aborted).toBeNull();
    expect(ours(applied)).toEqual(ours(dry).map(([type, id, result, code]) => (id === reserve.id
      ? [type, id, "DELETED", "RESERVE_PENDING_SHORT"]
      : [type, id, result === "WOULD_DELETE" ? "DELETED" : "APPROVED", code])));
    const after = await snapshot();
    for (const key of ["memoOut", "memoReturn", "receive", "po", "quote"] as const) {
      expect(after.docs[key], key).toMatchObject({ status: "APPROVED", approved_by: SYSTEM, auto_approved: false, deleted_by: null, version: before.docs[key].version + 1 });
    }
    expect(after.docs.reserve).toMatchObject({ status: "PENDING_APPROVAL", deleted_by: SYSTEM, approved_by: null, version: before.docs.reserve.version + 1 });
    expect(after.docs.draft).toEqual(before.docs.draft);
    // Effects: the return took 4, the Memo Out reserved 5, the deleted Reserve nothing; the Memo Receive created its rows.
    expect(after.item).toEqual({ pending: 1, returned: 4, reserved: 5 });
    expect(after.receiveRows).toBe(1);
    expect(command.formatReport(applied)).toMatch(/Reserve +\| \S+ +\| \S+ +\| DELETED +\| RESERVE_PENDING_SHORT/);

    const again = await command.approvePending({ apply: true, actorId: SYSTEM });
    expect(again.aborted).toBeNull();
    expect(ours(again)).toEqual([]);
    expect(again.outcomes.filter((outcome) => outcome.result !== "SKIPPED")).toEqual([]);
    expect(await snapshot()).toEqual(after);
  });
});
