import { randomUUID } from "node:crypto";
import { HttpException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sendAndApprove, setApproval } from "../partner-shared/approval";

/**
 * IT-QT-01…03 (quotation SA rev 2 / ADR-0038, owner 2026-11-03) against real PostgreSQL:
 * - From Stock lines are completed from Memo Stock (fields, Stock ID, pending snapshot) and mixed with typed lines;
 *   create, update and delete never change Memo Stock (nothing held, no approval).
 * - A missing item, a duplicate item and a new or raised row above pending are refused; CHECK / unique hold.
 * - A saved row that was not raised keeps its snapshot, so a later Memo Out approval doesn't block editing it.
 *
 * Opt-in like the other DB integrations (INV-20261021-007): runs only with `PARTNER_TEST_DATABASE_URL` pointing at
 * a disposable `f1_system` database on 127.0.0.1 with an explicit port other than 5432, migrated with
 * `prisma migrate deploy`. Rows are scoped to the vendor and customer created here and Stock ID year 73; all are
 * removed in `afterAll`.
 */

const testUrl = process.env.PARTNER_TEST_DATABASE_URL;
const canRun = Boolean(testUrl && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(testUrl));
const ACTOR = `qt-it-${randomUUID().slice(0, 8)}`;
const YEAR = 73;

type Prisma = typeof import("../../src/database/prisma-client").prisma;
type Receive = InstanceType<typeof import("../../src/trade-document/memo-receive.service").MemoReceiveService>;
type Out = InstanceType<typeof import("../../src/trade-document/memo-out.service").MemoOutService>;
type Quote = InstanceType<typeof import("../../src/quotation/quotation.service").QuotationService>;
type Vendor = { id: string; addressId: string };

let prisma: Prisma;
let receive: Receive;
let memoOut: Out;
let quotation: Quote;
let createQuotationSchema: typeof import("../../src/quotation/quotation.schemas").createQuotationSchema;
let createMemoOutSchema: typeof import("../../src/trade-document/memo-schemas").createMemoOutSchema;
let vendor: Vendor | null = null;
const customer = { id: randomUUID(), shipping: randomUUID(), invoice: randomUUID() };
let customerCreated = false;

const money = { discount: { type: "NONE" as const, value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null };
const receiveLine = (patch: Record<string, unknown> = {}) => ({
  source: "MANUAL" as const, stoneCode: "", stone: "Ruby", shape: "Oval", size: "", color: "Red", clarity: "", cutting: "", quality: "",
  lot: "LOT-Q", cerType: "GIA", cerNo: "C-9", pcs: 10, weightCt: "5", priceUnit: "PER_CT" as "PER_CT" | "PER_PCS", unitPrice: "1000",
  discount: { type: "NONE" as "NONE" | "PERCENT" | "AMOUNT", value: "0" }, itemNote: "", photoIds: [] as [],
  ...patch,
});
/** What the page sends for a From Stock row: item fields are placeholders the server replaces from Memo Stock. */
const stockLine = (memoStockId: string, pcs: number, weightCt: string, patch: Record<string, unknown> = {}) => ({
  source: "STOCK", stoneCodeId: null, stoneCode: "", stone: "typed by client", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "",
  lot: "", location: "", cerType: "", cerNo: "", pcs, weightCt, priceUnit: "PER_PCS", unitPrice: "2500", discount: { type: "NONE", value: "0" },
  itemNote: "quoted", photoIds: [] as string[], memoStockId, ...patch,
});
const typedLine = () => ({
  source: "MANUAL", stoneCodeId: null, stoneCode: "", stone: "Topaz", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "",
  lot: "", location: "Shelf 1", cerType: "", cerNo: "", pcs: 1, weightCt: "0.5", priceUnit: "PER_PCS", unitPrice: "100", discount: { type: "NONE", value: "0" },
  itemNote: "", photoIds: [] as string[],
});
const quoteInput = (lines: Record<string, unknown>[]) => createQuotationSchema.parse({
  docDate: "2026-11-03", dueDate: "2026-12-03", currency: "THB", exchangeRate: null, ref: "", documentNote: "", ...money, lines,
  customerId: customer.id, shippingAddressId: customer.shipping, invoiceAddressId: customer.invoice,
});
const outInput = (lines: Record<string, unknown>[]) => createMemoOutSchema.parse({
  docDate: "2026-11-03", dueDate: "2026-12-03", currency: "THB", exchangeRate: null, ref: "", documentNote: "", ...money, lines,
  customerId: customer.id, shippingAddressId: customer.shipping, invoiceAddressId: customer.invoice,
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

async function approvedStock(lines: ReturnType<typeof receiveLine>[]) {
  const saved = await receive.create(ACTOR, {
    docDate: "2026-10-29", dueDate: "2026-11-29", currency: "THB", exchangeRate: null, ref: "", documentNote: "", ...money, lines, vendorId: vendor!.id, addressId: vendor!.addressId,
  });
  await sendAndApprove(receive, ACTOR, saved.id, saved.version);
  return prisma.memoStock.findMany({ where: { memoReceiveId: saved.id }, orderBy: { stockId: "asc" } });
}

const bucketsOf = async (id: string) => {
  const item = await prisma.memoStock.findUniqueOrThrow({ where: { id } });
  return { pending: [item.pendingPcs, item.pendingWeightCt.toFixed(3)], reserved: [item.reservedPcs, item.reservedWeightCt.toFixed(3)] };
};

describe.runIf(canRun)("IT-QT quotation From Stock on PostgreSQL", () => {
  beforeAll(async () => {
    vi.stubEnv("PARTNER_DATABASE_URL", testUrl!);
    vi.stubEnv("DATABASE_URL", testUrl!);
    ({ prisma } = await import("../../src/database/prisma-client"));
    const { MemoReceiveService } = await import("../../src/trade-document/memo-receive.service");
    const { MemoOutService } = await import("../../src/trade-document/memo-out.service");
    const { QuotationService } = await import("../../src/quotation/quotation.service");
    ({ createQuotationSchema } = await import("../../src/quotation/quotation.schemas"));
    ({ createMemoOutSchema } = await import("../../src/trade-document/memo-schemas"));
    receive = new MemoReceiveService();
    receive.clock = () => new Date(`20${YEAR}-06-01T03:00:00Z`);
    memoOut = new MemoOutService();
    quotation = new QuotationService();
    if (!(await prisma.currency.findUnique({ where: { code: "THB" } }))) {
      await prisma.currency.create({ data: { code: "THB", name: "THB", createdBy: ACTOR, updatedBy: ACTOR } });
    }
    await prisma.memoStockIdCounter.deleteMany({ where: { year: YEAR } });
    const id = randomUUID();
    const addressId = randomUUID();
    const code = `QTIT${ACTOR.slice(-4)}`;
    await prisma.vendor.create({ data: {
      id, name: "QT IT Vendor", nameKey: "qt it vendor", code: code.toUpperCase(), codeKey: code.toLowerCase(),
      currencyCode: "THB", firstName: "It", email: "qt-it@example.test", createdBy: ACTOR, updatedBy: ACTOR,
      addresses: { create: [{ id: addressId, position: 1, name: "QT IT Vendor Co.", address: "1 Test Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true }] },
    } });
    vendor = { id, addressId };
    const address = { position: 1, name: "QT IT Customer", address: "2 Test Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true };
    await prisma.customer.create({ data: {
      id: customer.id, name: "QT IT Customer", nameKey: "qt it customer", code: `QTITC${ACTOR.slice(-4)}`.toUpperCase(), codeKey: `qtitc${ACTOR.slice(-4)}`.toLowerCase(),
      currencyCode: "THB", firstName: "It", email: "qt-it@example.test", createdBy: ACTOR, updatedBy: ACTOR,
      addresses: { create: [{ ...address, id: customer.shipping, type: "SHIPPING" }, { ...address, id: customer.invoice, type: "INVOICE" }] },
    } });
    customerCreated = true;
    await setApproval(prisma, "memo-receive", true);
    await setApproval(prisma, "memo-out", true);
    // Quotation approval OFF (seed default): Save approves it (auto-approved, editable / deletable until used).
    await setApproval(prisma, "quotation", false);
  });

  afterAll(async () => {
    if (!prisma) return;
    if (customerCreated) {
      await prisma.quotation.deleteMany({ where: { customerId: customer.id } });
      await prisma.memoOut.deleteMany({ where: { customerId: customer.id } });
    }
    if (vendor) {
      await prisma.memoStock.deleteMany({ where: { vendorId: vendor.id } });
      await prisma.memoReceive.deleteMany({ where: { vendorId: vendor.id } });
    }
    if (customerCreated) await prisma.customer.deleteMany({ where: { id: customer.id } });
    if (vendor) await prisma.vendor.deleteMany({ where: { id: vendor.id } });
    await prisma.memoStockIdCounter.deleteMany({ where: { year: YEAR } });
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  it("IT-QT-01 a stock row is copied from Memo Stock beside a typed row; create, update and delete hold nothing", async () => {
    const [item] = await approvedStock([receiveLine()]);
    const saved = await quotation.create(ACTOR, quoteInput([stockLine(item.id, 4, "2"), typedLine()]));
    const detail = await quotation.get(saved.id);
    expect(detail.lines[0]).toMatchObject({
      source: "STOCK", memoStockId: item.id, stockId: item.stockId, stoneCodeId: null, stoneCode: "", stone: "Ruby", shape: "Oval",
      lot: "LOT-Q", location: "Memo", cerNo: "C-9", priceUnit: "PER_CT", pcs: 4, weightCt: "2.000", unitPrice: "2500.00", amount: "5000.00",
      stockPendingPcs: 10, stockPendingWeightCt: "5.000", itemNote: "quoted",
    });
    expect(detail.lines[1]).toMatchObject({ source: "MANUAL", memoStockId: null, stockId: null, stockPendingPcs: null, stockPendingWeightCt: null, stone: "Topaz", location: "Shelf 1" });
    expect(await bucketsOf(item.id)).toEqual({ pending: [10, "5.000"], reserved: [0, "0.000"] });

    const updated = await quotation.update(ACTOR, saved.id, 1, quoteInput([stockLine(item.id, 10, "5")]));
    expect((await quotation.get(saved.id)).lines).toMatchObject([{ source: "STOCK", pcs: 10, weightCt: "5.000" }]);
    expect(await bucketsOf(item.id)).toEqual({ pending: [10, "5.000"], reserved: [0, "0.000"] });
    // ADR-0048 D4: an auto-approved quotation (approval OFF) is soft deleted while unused (no document uses a quotation yet).
    expect(updated).toMatchObject({ status: "APPROVED", autoApproved: true, canEdit: false });
    await expect(quotation.delete(ACTOR, saved.id, updated.version)).resolves.toEqual({ ok: true, version: updated.version + 1 });
    expect(await bucketsOf(item.id)).toEqual({ pending: [10, "5.000"], reserved: [0, "0.000"] });
  });

  it("IT-QT-02 refuses a missing item, a duplicate and more than pending; the CHECK and unique key hold", async () => {
    const [item] = await approvedStock([receiveLine({ pcs: 3, weightCt: "1.5" })]);
    expect(await failure(quotation.create(ACTOR, quoteInput([stockLine(item.id, 4, "1")]))))
      .toMatchObject({ status: 400, code: "VALIDATION_ERROR", fieldErrors: [{ path: "lines.0.pcs", code: "exceeds_pending" }] });
    expect(await failure(quotation.create(ACTOR, quoteInput([stockLine(randomUUID(), 1, "0.5")]))))
      .toMatchObject({ status: 422, code: "QUOTATION_REFERENCE_INVALID", fieldErrors: [{ path: "lines.0.memoStockId", code: "invalid_reference" }] });
    expect(() => quoteInput([stockLine(item.id, 1, "0.5"), stockLine(item.id, 1, "0.5")])).toThrow();

    const saved = await quotation.create(ACTOR, quoteInput([stockLine(item.id, 1, "0.5")]));
    const [line] = await prisma.quotationLine.findMany({ where: { quotationId: saved.id } });
    // A stock line must keep all four stock columns (quotation_line_stock_check).
    await expect(prisma.quotationLine.update({ where: { id: line.id }, data: { stockId: null } })).rejects.toThrow();
    // …and quote at most the pending it saw.
    await expect(prisma.quotationLine.update({ where: { id: line.id }, data: { pcs: 4 } })).rejects.toThrow();
    // One item once per quotation (quotation_line_memo_stock_key).
    await expect(prisma.quotationLine.create({ data: { ...line, id: randomUUID(), position: 2 } })).rejects.toThrow();
  });

  it("IT-QT-03 after a Memo Out takes the stock, an unchanged or lowered row still saves; a raised row is checked against the new pending", async () => {
    const [item] = await approvedStock([receiveLine({ pcs: 4, weightCt: "2" })]);
    const saved = await quotation.create(ACTOR, quoteInput([stockLine(item.id, 3, "1.5")]));
    const out = await memoOut.create(ACTOR, outInput([stockLine(item.id, 3, "1.5", { source: "MANUAL" })]));
    await sendAndApprove(memoOut, ACTOR, out.id, 1);
    expect(await bucketsOf(item.id)).toEqual({ pending: [1, "0.500"], reserved: [3, "1.500"] });

    // Unchanged quantity (a note edit) and a lowered one keep the stored snapshot.
    const noteEdit = await quotation.update(ACTOR, saved.id, 1, quoteInput([stockLine(item.id, 3, "1.5", { itemNote: "edited" })]));
    const lowered = await quotation.update(ACTOR, saved.id, noteEdit.version, quoteInput([stockLine(item.id, 2, "1")]));
    expect((await quotation.get(saved.id)).lines[0]).toMatchObject({ pcs: 2, weightCt: "1.000", stockPendingPcs: 4, stockPendingWeightCt: "2.000" });
    // Raising it again is checked against today's pending (1 pcs / 0.5 ct).
    expect(await failure(quotation.update(ACTOR, saved.id, lowered.version, quoteInput([stockLine(item.id, 3, "1.5")]))))
      .toMatchObject({ status: 400, code: "VALIDATION_ERROR", fieldErrors: [{ path: "lines.0.pcs", code: "exceeds_pending" }, { path: "lines.0.weightCt", code: "exceeds_pending" }] });
    expect(await bucketsOf(item.id)).toEqual({ pending: [1, "0.500"], reserved: [3, "1.500"] });
  });
});
