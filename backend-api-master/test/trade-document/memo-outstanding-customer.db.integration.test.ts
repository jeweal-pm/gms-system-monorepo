import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * IT-MOC-01…03 (memo-outstanding-customer SA rev 1 / ADR-0039, owner 2026-11-03) against real PostgreSQL: the read-only
 * report `memoOutstanding.customerSummary / customerList / customerItems / customerOptions` over Memo Out documents
 * created and approved through the services, with Memo Out Return approvals filling Return.
 *
 * Opt-in like the other DB integrations (INV-20261021-007): runs only with `PARTNER_TEST_DATABASE_URL` pointing at
 * a disposable `f1_system` database on 127.0.0.1 with an explicit port other than 5432, migrated with
 * `prisma migrate deploy`. Rows are scoped to the vendor and customers created here and Stock ID year 74; all are
 * removed in `afterAll`.
 */

const testUrl = process.env.PARTNER_TEST_DATABASE_URL;
const canRun = Boolean(testUrl && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(testUrl));
const ACTOR = `moc-it-${randomUUID().slice(0, 8)}`;
const YEAR = 74;

type Prisma = typeof import("../../src/database/prisma-client").prisma;
type Receive = InstanceType<typeof import("../../src/trade-document/memo-receive.service").MemoReceiveService>;
type Out = InstanceType<typeof import("../../src/trade-document/memo-out.service").MemoOutService>;
type OutReturn = InstanceType<typeof import("../../src/trade-document/memo-out-return.service").MemoOutReturnService>;
type Outstanding = InstanceType<typeof import("../../src/trade-document/memo-outstanding.service").MemoOutstandingService>;
type Customer = { id: string; shipping: string; invoice: string; name: string };

let prisma: Prisma;
let receive: Receive;
let memoOut: Out;
let memoOutReturn: OutReturn;
let outstanding: Outstanding;
let createMemoOutSchema: typeof import("../../src/trade-document/memo-schemas").createMemoOutSchema;
let createMemoOutReturnSchema: typeof import("../../src/trade-document/memo-schemas").createMemoOutReturnSchema;
let vendor: { id: string; addressId: string } | null = null;
const customers: Customer[] = [];

const money = { discount: { type: "NONE" as const, value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null };
const receiveLine = (patch: Record<string, unknown> = {}) => ({
  source: "MANUAL" as const, stoneCode: "", stone: "Ruby", shape: "Oval", size: "", color: "Red", clarity: "", cutting: "", quality: "",
  lot: "LOT-C", cerType: "GIA", cerNo: "C-7", pcs: 10, weightCt: "5", priceUnit: "PER_CT" as "PER_CT" | "PER_PCS", unitPrice: "1000",
  discount: { type: "NONE" as "NONE" | "PERCENT" | "AMOUNT", value: "0" }, itemNote: "", photoIds: [] as [],
  ...patch,
});
const stockLine = (memoStockId: string, pcs: number, weightCt: string, unitPrice = "2000") => ({
  source: "MANUAL", stoneCodeId: null, stoneCode: "", stone: "x", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "",
  lot: "", location: "", cerType: "", cerNo: "", pcs, weightCt, priceUnit: "PER_CT", unitPrice, discount: { type: "NONE", value: "0" },
  itemNote: "lent", photoIds: [] as string[], memoStockId,
});
const header = (customer: Customer, patch: Record<string, unknown> = {}) => ({
  docDate: "2026-10-20", dueDate: "2026-11-05", currency: "THB", exchangeRate: null, ref: "", documentNote: "", ...money,
  customerId: customer.id, shippingAddressId: customer.shipping, invoiceAddressId: customer.invoice, ...patch,
});
/** Bangkok 2026-11-03 10:00. */
const NOV3 = () => new Date("2026-11-03T03:00:00Z");

async function customerFixture(name: string): Promise<Customer> {
  const id = randomUUID();
  const shipping = randomUUID();
  const invoice = randomUUID();
  const code = `MOCIT${customers.length}${ACTOR.slice(-4)}`.toUpperCase();
  const address = { position: 1, name, address: "2 Test Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true };
  await prisma.customer.create({ data: {
    id, name, nameKey: name.toLowerCase(), code, codeKey: code.toLowerCase(), currencyCode: "THB", firstName: "It", email: "moc-it@example.test", createdBy: ACTOR, updatedBy: ACTOR,
    addresses: { create: [{ ...address, id: shipping, type: "SHIPPING" }, { ...address, id: invoice, type: "INVOICE" }] },
  } });
  const customer = { id, shipping, invoice, name };
  customers.push(customer);
  return customer;
}

async function approvedStock(lines: ReturnType<typeof receiveLine>[]) {
  const saved = await receive.create(ACTOR, {
    docDate: "2026-10-15", dueDate: "2026-12-15", currency: "THB", exchangeRate: null, ref: "", documentNote: "", ...money, lines, vendorId: vendor!.id, addressId: vendor!.addressId,
  });
  await receive.approve(ACTOR, saved.id, saved.version);
  return prisma.memoStock.findMany({ where: { memoReceiveId: saved.id }, orderBy: { stockId: "asc" } });
}

async function approvedMemoOut(customer: Customer, lines: ReturnType<typeof stockLine>[], patch: Record<string, unknown> = {}) {
  const saved = await memoOut.create(ACTOR, createMemoOutSchema.parse({ ...header(customer, patch), lines }));
  await memoOut.approve(ACTOR, saved.id, saved.version);
  return saved;
}

/** Brings back part of a Memo Out line through an approved Memo Out Return. */
async function approvedReturn(customer: Customer, memoOutId: string, pcs: number, weightCt: string) {
  const [line] = await prisma.memoOutLine.findMany({ where: { memoOutId }, orderBy: { position: "asc" } });
  const saved = await memoOutReturn.create(ACTOR, createMemoOutReturnSchema.parse({
    ...header(customer, { docDate: "2026-10-25" }),
    lines: [{
      source: "MANUAL", stoneCodeId: null, stoneCode: "", stone: "x", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "",
      lot: "", location: "", cerType: "", cerNo: "", pcs, weightCt, priceUnit: "PER_CT", unitPrice: "0", discount: { type: "NONE", value: "0" },
      itemNote: "", photoIds: [], memoOutLineId: line.id,
      outstandingPcs: line.pcs - line.returnedPcs, outstandingWeightCt: line.weightCt.minus(line.returnedWeightCt).toFixed(3),
    }],
  }));
  await memoOutReturn.approve(ACTOR, saved.id, saved.version);
}

const ids = (rows: { memoOutId: string }[]) => rows.map((row) => row.memoOutId);

describe.runIf(canRun)("IT-MOC memo outstanding from customer on PostgreSQL", () => {
  let alpha: Customer;
  let beta: Customer;

  beforeAll(async () => {
    vi.stubEnv("PARTNER_DATABASE_URL", testUrl!);
    vi.stubEnv("DATABASE_URL", testUrl!);
    ({ prisma } = await import("../../src/database/prisma-client"));
    const { MemoReceiveService } = await import("../../src/trade-document/memo-receive.service");
    const { MemoOutService } = await import("../../src/trade-document/memo-out.service");
    const { MemoOutReturnService } = await import("../../src/trade-document/memo-out-return.service");
    const { MemoOutstandingService } = await import("../../src/trade-document/memo-outstanding.service");
    ({ createMemoOutSchema, createMemoOutReturnSchema } = await import("../../src/trade-document/memo-schemas"));
    receive = new MemoReceiveService();
    receive.clock = () => new Date(`20${YEAR}-06-01T03:00:00Z`);
    memoOut = new MemoOutService();
    memoOutReturn = new MemoOutReturnService();
    outstanding = new MemoOutstandingService();
    outstanding.clock = NOV3;
    if (!(await prisma.currency.findUnique({ where: { code: "THB" } }))) {
      await prisma.currency.create({ data: { code: "THB", name: "THB", createdBy: ACTOR, updatedBy: ACTOR } });
    }
    await prisma.memoStockIdCounter.deleteMany({ where: { year: YEAR } });
    const id = randomUUID();
    const addressId = randomUUID();
    const code = `MOCV${ACTOR.slice(-4)}`.toUpperCase();
    await prisma.vendor.create({ data: {
      id, name: "MOC IT Vendor", nameKey: "moc it vendor", code, codeKey: code.toLowerCase(), currencyCode: "THB", firstName: "It", email: "moc-it@example.test", createdBy: ACTOR, updatedBy: ACTOR,
      addresses: { create: [{ id: addressId, position: 1, name: "MOC IT Vendor Co.", address: "1 Test Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true }] },
    } });
    vendor = { id, addressId };
    alpha = await customerFixture(`Alpha MOC ${ACTOR.slice(-4)}`);
    beta = await customerFixture(`Beta MOC ${ACTOR.slice(-4)}`);
  });

  afterAll(async () => {
    if (!prisma) return;
    const customerIds = customers.map((customer) => customer.id);
    await prisma.memoOutReturn.deleteMany({ where: { customerId: { in: customerIds } } });
    await prisma.memoOut.deleteMany({ where: { customerId: { in: customerIds } } });
    if (vendor) {
      await prisma.memoStock.deleteMany({ where: { vendorId: vendor.id } });
      await prisma.memoReceive.deleteMany({ where: { vendorId: vendor.id } });
    }
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
    if (vendor) await prisma.vendor.deleteMany({ where: { id: vendor.id } });
    await prisma.memoStockIdCounter.deleteMany({ where: { year: YEAR } });
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  it("IT-MOC-01 an approved Memo Out is listed with Memo = Outstanding; a pending one is not", async () => {
    const [item] = await approvedStock([receiveLine()]);
    const approved = await approvedMemoOut(alpha, [stockLine(item.id, 4, "2")]);
    await memoOut.create(ACTOR, createMemoOutSchema.parse({ ...header(alpha), lines: [stockLine(item.id, 1, "0.5")] }));
    const list = await outstanding.customerList({ customerIds: [alpha.id], page: 1, pageSize: 10 });
    expect(ids(list.items)).toEqual([approved.id]);
    expect(list.items[0]).toMatchObject({
      docNo: approved.docNo, dueDate: "2026-11-05", dueInDays: 2, customer: { id: alpha.id, name: alpha.name }, currency: "THB",
      memo: { pcs: 4, weightCt: "2.000" }, return: { pcs: 0, weightCt: "0.000" }, sold: { pcs: 0, weightCt: "0.000" }, outstanding: { pcs: 4, weightCt: "2.000" },
      openValue: "4000.00",
    });
    expect(list.items[0]).not.toHaveProperty("reserve");
    const items = await outstanding.customerItems({ memoOutIds: [approved.id, randomUUID()] });
    expect(items.items).toEqual([expect.objectContaining({
      memoOutId: approved.id, stockId: item.stockId, lot: "LOT-C", location: "Memo", stone: "Ruby", priceUnit: "CTS", netUnitPrice: "2000.0000",
      memo: { pcs: 4, weightCt: "2.000" }, outstanding: { pcs: 4, weightCt: "2.000" }, openValue: "4000.00", itemNote: "lent",
    })]);
  });

  it("IT-MOC-02 a Memo Out Return moves quantity into Return; a fully returned Memo Out leaves the list and the summary", async () => {
    const [item] = await approvedStock([receiveLine()]);
    const out = await approvedMemoOut(beta, [stockLine(item.id, 4, "2")]);
    await approvedReturn(beta, out.id, 1, "0.5");
    let [row] = (await outstanding.customerList({ customerIds: [beta.id], page: 1, pageSize: 10 })).items;
    expect(row).toMatchObject({ memoOutId: out.id, return: { pcs: 1, weightCt: "0.500" }, outstanding: { pcs: 3, weightCt: "1.500" }, openValue: "3000.00" });
    expect(await outstanding.customerSummary({ customerIds: [beta.id] })).toMatchObject({ documents: 1, grandTotal: "3000.00" });

    await approvedReturn(beta, out.id, 3, "1.5");
    expect((await outstanding.customerList({ customerIds: [beta.id], page: 1, pageSize: 10 })).items).toEqual([]);
    expect((await outstanding.customerItems({ memoOutIds: [out.id] })).items).toEqual([]);
    expect(await outstanding.customerSummary({ customerIds: [beta.id] })).toMatchObject({ documents: 0, grandTotal: "0.00" });
    [row] = (await outstanding.customerList({ q: out.docNo, page: 1, pageSize: 10 })).items;
    expect(row).toBeUndefined();
  });

  it("IT-MOC-03 KPIs, filters, sort, paging and options", async () => {
    const [a, b] = await approvedStock([receiveLine(), receiveLine({ pcs: 6, weightCt: "3", priceUnit: "PER_PCS" })]);
    const overdue = await approvedMemoOut(alpha, [stockLine(a.id, 2, "1")], { docDate: "2026-10-01", dueDate: "2026-10-30" });
    const later = await approvedMemoOut(alpha, [stockLine(b.id, 3, "1.5", "500")], { docDate: "2026-10-02", dueDate: "2026-12-30" });
    const scope = { customerIds: [alpha.id], from: "2026-10-01", to: "2026-10-02" };
    expect(await outstanding.customerSummary(scope)).toMatchObject({ documents: 2, overdue: 1, dueIn7Days: 0, grandTotal: "3500.00", companyCurrency: expect.any(String) });
    const byDue = await outstanding.customerList({ ...scope, page: 1, pageSize: 10 });
    expect(ids(byDue.items)).toEqual([overdue.id, later.id]);
    expect(byDue.items[0].dueInDays).toBe(-4);
    expect(ids((await outstanding.customerList({ ...scope, page: 1, pageSize: 10, sort: "openValue", dir: "desc" })).items)).toEqual([overdue.id, later.id]);
    expect(ids((await outstanding.customerList({ ...scope, page: 1, pageSize: 10, sort: "outstandingPcs", dir: "desc" })).items)).toEqual([later.id, overdue.id]);
    const page2 = await outstanding.customerList({ ...scope, page: 2, pageSize: 10 });
    expect(page2).toMatchObject({ items: [], total: 2, page: 2 });
    expect(ids((await outstanding.customerList({ ...scope, q: later.docNo, page: 1, pageSize: 10 })).items)).toContain(later.id);
    const items = await outstanding.customerItems({ memoOutIds: [later.id] });
    expect(items.items[0]).toMatchObject({ priceUnit: "PCS", netUnitPrice: "500.0000", openValue: "1500.00" });
    const { customers: options } = await outstanding.customerOptions();
    expect(options.map((option) => option.id)).toEqual(expect.arrayContaining([alpha.id, beta.id]));
  });
});
