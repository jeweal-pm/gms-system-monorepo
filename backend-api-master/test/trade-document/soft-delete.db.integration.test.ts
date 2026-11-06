import { randomUUID } from "node:crypto";
import { HttpException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * IT-SD-01…10 (transaction-soft-delete SA rev 1 / ADR-0045, owner 2026-11-06) against real PostgreSQL: the migration's
 * 8 CHECKs and partial indexes, soft delete / restore of Memo Receive (Stock IDs, photo links), Purchase Order, Memo
 * Out and Quotation, the Deleted list view with keyset paging, number non-reuse (D5), read-only refusals inside the
 * rolled-back transaction, unchanged readers (D11) and a delete-vs-approve race.
 *
 * Opt-in like the other DB integrations (INV-20261021-007): runs only with `PARTNER_TEST_DATABASE_URL` pointing at a
 * disposable `f1_system` database on 127.0.0.1 with an explicit port other than 5432, migrated with `prisma migrate
 * deploy`. Rows are scoped to the vendors / customer created here; all are removed in `afterAll`.
 */

const testUrl = process.env.PARTNER_TEST_DATABASE_URL;
const canRun = Boolean(testUrl && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(testUrl));
const ACTOR = `sd-it-${randomUUID().slice(0, 8)}`;
const DELETER = `${ACTOR}-del`;
const YEAR = 77;
const clock = () => new Date(`20${YEAR}-06-01T03:00:00Z`);

type Prisma = typeof import("../../src/database/prisma-client").prisma;
type Vendor = { id: string; addressId: string };
type Services = {
  receive: InstanceType<typeof import("../../src/trade-document/memo-receive.service").MemoReceiveService>;
  po: InstanceType<typeof import("../../src/purchase-order/purchase-order.service").PurchaseOrderService>;
  memoOut: InstanceType<typeof import("../../src/trade-document/memo-out.service").MemoOutService>;
  memoOutReturn: InstanceType<typeof import("../../src/trade-document/memo-out-return.service").MemoOutReturnService>;
  stock: InstanceType<typeof import("../../src/trade-document/memo-stock.service").MemoStockService>;
  purchase: InstanceType<typeof import("../../src/purchase/purchase.service").PurchaseService>;
  quotation: InstanceType<typeof import("../../src/quotation/quotation.service").QuotationService>;
  setup: InstanceType<typeof import("../../src/document-setup/document-setup.service").DocumentSetupService>;
};
type Schemas = typeof import("../../src/trade-document/memo-schemas");

let prisma: Prisma;
let s: Services;
let schemas: Schemas;
const vendors: Vendor[] = [];
const customer = { id: randomUUID(), shipping: randomUUID(), invoice: randomUUID() };
let customerCreated = false;
const created = { currency: false, poSetup: false };

const money = { discount: { type: "NONE" as const, value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [{ type: "SHIPPING" as const, amount: "50" }], labor: null };
const header = (docDate = "2026-11-06") => ({ docDate, dueDate: "2026-12-06", currency: "THB", exchangeRate: null, ref: "", documentNote: "", ...money });
const receiveLine = (patch: Record<string, unknown> = {}) => ({
  source: "MANUAL" as const, stoneCode: "", stone: "Ruby", shape: "Oval", size: "", color: "Red", clarity: "", cutting: "", quality: "",
  lot: "LOT-SD", cerType: "GIA", cerNo: "C-1", pcs: 4, weightCt: "2", priceUnit: "PER_CT" as const, unitPrice: "1000",
  discount: { type: "NONE" as const, value: "0" }, itemNote: "", photoIds: [] as string[], ...patch,
});
const poLine = () => ({
  source: "MANUAL" as const, stoneCodeId: null, stoneCode: "", stone: "Sapphire", shape: "Oval", size: "", color: "Blue", clarity: "", cutting: "", quality: "",
  lot: "LOT-PO", location: "Safe A", cerType: "", cerNo: "", pcs: 2, weightCt: "1.5", priceUnit: "PER_CT" as const, unitPrice: "1000",
  discount: { type: "NONE" as const, value: "0" }, itemNote: "", photoIds: [] as string[],
});
const quotationLine = () => ({ ...poLine(), stone: "Emerald", location: "" });

async function failure(promise: Promise<unknown>) {
  try { await promise; } catch (error) {
    if (error instanceof HttpException) return { status: error.getStatus(), code: (error.getResponse() as { error: { code: string } }).error.code };
    throw error;
  }
  throw new Error("expected a failure");
}

async function vendorFixture(name: string): Promise<Vendor> {
  const id = randomUUID();
  const addressId = randomUUID();
  const code = `SDIT${vendors.length}${ACTOR.slice(-4)}`;
  await prisma.vendor.create({ data: {
    id, name, nameKey: name.toLowerCase(), code: code.toUpperCase(), codeKey: code.toLowerCase(),
    currencyCode: "THB", firstName: "It", email: "sd-it@example.test", createdBy: ACTOR, updatedBy: ACTOR,
    addresses: { create: [{ id: addressId, position: 1, name: `${name} Co.`, address: "1 Test Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true }] },
  } });
  vendors.push({ id, addressId });
  return { id, addressId };
}

/** A ready Memo Receive photo row (disposable DB only; the bytes are not needed for the link checks). */
async function photoFixture() {
  const id = randomUUID();
  await prisma.storedFile.create({ data: {
    id, kind: "memo-receive-photo", bucket: "files", objectKey: `memo-receive-photo/${id}.png`, filename: "p.png", contentType: "image/png",
    sizeBytes: BigInt(10), sha256: "0".repeat(64), status: "ready", sourceType: "memo_receive.line-photo", sourceId: id, createdBy: ACTOR, readyAt: new Date(),
  } });
  return id;
}

const receiveInput = (vendor: Vendor, lines: ReturnType<typeof receiveLine>[]) => ({ ...header(), lines, vendorId: vendor.id, addressId: vendor.addressId });

describe.runIf(canRun)("IT-SD transaction soft delete on PostgreSQL", () => {
  let vendorA: Vendor;

  beforeAll(async () => {
    vi.stubEnv("PARTNER_DATABASE_URL", testUrl!);
    vi.stubEnv("DATABASE_URL", testUrl!);
    ({ prisma } = await import("../../src/database/prisma-client"));
    schemas = await import("../../src/trade-document/memo-schemas");
    const { MemoReceiveService } = await import("../../src/trade-document/memo-receive.service");
    const { PurchaseOrderService } = await import("../../src/purchase-order/purchase-order.service");
    const { MemoOutService } = await import("../../src/trade-document/memo-out.service");
    const { MemoOutReturnService } = await import("../../src/trade-document/memo-out-return.service");
    const { MemoStockService } = await import("../../src/trade-document/memo-stock.service");
    const { PurchaseService } = await import("../../src/purchase/purchase.service");
    const { QuotationService } = await import("../../src/quotation/quotation.service");
    const { DocumentSetupService } = await import("../../src/document-setup/document-setup.service");
    s = {
      receive: new MemoReceiveService(), po: new PurchaseOrderService(), memoOut: new MemoOutService(), memoOutReturn: new MemoOutReturnService(),
      stock: new MemoStockService(), purchase: new PurchaseService(), quotation: new QuotationService(), setup: new DocumentSetupService(),
    };
    s.receive.clock = clock;
    s.purchase.clock = clock;
    const createIfAbsent = async (create: () => Promise<unknown>) => {
      try { await create(); return true; } catch (error) {
        if ((error as { code?: string }).code === "P2002") return false;
        throw error;
      }
    };
    if (!(await prisma.currency.findUnique({ where: { code: "THB" } }))) {
      created.currency = await createIfAbsent(() => prisma.currency.create({ data: { code: "THB", name: "Thai Baht", createdBy: ACTOR, updatedBy: ACTOR } }));
    }
    if (!(await prisma.documentSetup.findUnique({ where: { transactionKey: "purchase-order" } }))) {
      created.poSetup = await createIfAbsent(() => prisma.documentSetup.create({ data: {
        transactionKey: "purchase-order", name: "Purchase Order", code: "PO", startFrom: 1, updatedBy: ACTOR,
        rows: { create: [{ id: randomUUID(), effectiveDate: new Date("2026-01-01T00:00:00Z"), prefix: "PO", separator: "-", startNo: 1 }] },
      } }));
    }
    await prisma.memoStockIdCounter.deleteMany({ where: { year: YEAR } });
    vendorA = await vendorFixture("SD IT Vendor A");
    const address = { position: 1, name: "SD IT Customer", address: "2 Test Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true };
    await prisma.customer.create({ data: {
      id: customer.id, name: "SD IT Customer", nameKey: "sd it customer", code: `SDITC${ACTOR.slice(-4)}`.toUpperCase(), codeKey: `sditc${ACTOR.slice(-4)}`.toLowerCase(),
      currencyCode: "THB", firstName: "It", email: "sd-it@example.test", createdBy: ACTOR, updatedBy: ACTOR,
      addresses: { create: [{ ...address, id: customer.shipping, type: "SHIPPING" }, { ...address, id: customer.invoice, type: "INVOICE" }] },
    } });
    customerCreated = true;
  });

  afterAll(async () => {
    if (!prisma) return;
    const ids = vendors.map((vendor) => vendor.id);
    if (customerCreated) {
      await prisma.memoOut.deleteMany({ where: { customerId: customer.id } });
      await prisma.quotation.deleteMany({ where: { customerId: customer.id } });
    }
    await prisma.purchase.deleteMany({ where: { vendorId: { in: ids } } });
    await prisma.purchaseOrder.deleteMany({ where: { vendorId: { in: ids } } });
    await prisma.memoStock.deleteMany({ where: { vendorId: { in: ids } } });
    await prisma.memoReceive.deleteMany({ where: { vendorId: { in: ids } } });
    if (customerCreated) await prisma.customer.deleteMany({ where: { id: customer.id } });
    await prisma.vendor.deleteMany({ where: { id: { in: ids } } });
    await prisma.memoStockIdCounter.deleteMany({ where: { year: YEAR } });
    // Disposable test database only: photo rows this run created (product code never deletes uploads, ADR-0030).
    await prisma.storedFile.deleteMany({ where: { createdBy: ACTOR } });
    if (created.poSetup && (await prisma.purchaseOrder.count()) === 0) await prisma.documentSetup.deleteMany({ where: { transactionKey: "purchase-order" } });
    if (created.currency && (await prisma.memoReceive.count()) + (await prisma.memoOut.count()) + (await prisma.purchaseOrder.count()) + (await prisma.quotation.count()) === 0) {
      await prisma.currency.deleteMany({ where: { code: "THB" } });
    }
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  it("IT-SD-01 the migration added 16 columns, the 8 CHECKs and the 8 partial indexes", async () => {
    const tables = ["quotation", "reserve", "memo_receive", "memo_return", "memo_out", "memo_out_return", "purchase_order", "purchase"];
    const columns = await prisma.$queryRaw<{ table_name: string; column_name: string; data_type: string }[]>`
      SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'partner' AND column_name IN ('deleted_at', 'deleted_by') AND table_name = ANY(${tables})`;
    expect(columns).toHaveLength(16);
    const checks = await prisma.$queryRaw<{ conname: string; def: string }[]>`
      SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = ANY(${tables.map((table) => `${table}_deleted_check`)})`;
    expect(checks.map((row) => row.conname).sort()).toEqual(tables.map((table) => `${table}_deleted_check`).sort());
    expect(checks.find((row) => row.conname === "quotation_deleted_check")?.def).toContain("DRAFT");
    const indexes = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'partner' AND indexname = ANY(${tables.map((table) => `${table}_deleted_list_idx`)})`;
    expect(indexes).toHaveLength(8);
    for (const index of indexes) expect(index.indexdef).toMatch(/WHERE \(deleted_at IS NOT NULL\)/);
  });

  it("IT-SD-02 CHECK: deleted columns on an APPROVED row, on a cancelled quotation, or only one of the two columns, are refused", async () => {
    const saved = await s.receive.create(ACTOR, receiveInput(vendorA, [receiveLine()]));
    await s.receive.approve(ACTOR, saved.id, saved.version);
    await expect(prisma.$executeRaw`UPDATE "partner"."memo_receive" SET deleted_at = now(), deleted_by = 'x' WHERE id = ${saved.id}::uuid`).rejects.toThrow();
    const pending = await s.receive.create(ACTOR, receiveInput(vendorA, [receiveLine()]));
    await expect(prisma.$executeRaw`UPDATE "partner"."memo_receive" SET deleted_at = now() WHERE id = ${pending.id}::uuid`).rejects.toThrow();
    await expect(prisma.$executeRaw`UPDATE "partner"."memo_receive" SET deleted_by = 'x' WHERE id = ${pending.id}::uuid`).rejects.toThrow();
    const quote = await s.quotation.create(ACTOR, { ...header(), lines: [quotationLine()], customerId: customer.id, shippingAddressId: customer.shipping, invoiceAddressId: customer.invoice } as never);
    await prisma.quotation.update({ where: { id: quote.id }, data: { status: "CANCELLED" } });
    await expect(prisma.$executeRaw`UPDATE "partner"."quotation" SET deleted_at = now(), deleted_by = 'x' WHERE id = ${quote.id}::uuid`).rejects.toThrow();
    await prisma.quotation.update({ where: { id: quote.id }, data: { status: "DRAFT" } });
    await expect(prisma.$executeRaw`UPDATE "partner"."quotation" SET deleted_at = now(), deleted_by = 'x' WHERE id = ${quote.id}::uuid`).resolves.toBe(1);
    await prisma.$executeRaw`UPDATE "partner"."quotation" SET deleted_at = NULL, deleted_by = NULL, status = 'CANCELLED' WHERE id = ${quote.id}::uuid`;
  });

  it("IT-SD-03/06/07/10 Memo Receive: delete keeps lines, charges, photos and Stock IDs; read-only while deleted; restore → save and approve work", async () => {
    const [p1, p2] = [await photoFixture(), await photoFixture()];
    const saved = await s.receive.create(ACTOR, receiveInput(vendorA, [receiveLine({ photoIds: [p1, p2] }), receiveLine({ lot: "LOT-SD2" })]));
    const before = await s.receive.get(saved.id);
    const stockBefore = await prisma.memoStock.count();

    await expect(s.receive.delete(DELETER, saved.id, 1)).resolves.toEqual({ ok: true, version: 2 });
    const deleted = await s.receive.get(saved.id);
    expect(deleted).toMatchObject({ status: "PENDING_APPROVAL", version: 2, deletedBy: DELETER, docNo: before.docNo });
    expect(deleted.deletedAt).toEqual(expect.any(String));
    expect(deleted.lines.map((line) => [line.stockId, line.photoIds])).toEqual(before.lines.map((line) => [line.stockId, line.photoIds]));
    expect(deleted.lines[0].photoIds).toEqual([p1, p2]);
    expect(deleted.serviceCharges).toEqual(before.serviceCharges);
    expect(await prisma.storedFile.count({ where: { id: { in: [p1, p2] }, status: "ready" } })).toBe(2);
    expect(await prisma.memoStock.count()).toBe(stockBefore);
    const row = await prisma.memoReceive.findUniqueOrThrow({ where: { id: saved.id }, select: { updatedBy: true } });
    expect(row.updatedBy).toBe(DELETER);

    // IT-SD-06: every write refuses it; the update transaction rolls back (lines untouched, version unchanged).
    const edit = { ...receiveInput(vendorA, [receiveLine({ id: before.lines[0].id, lot: "CHANGED" })]) };
    expect(await failure(s.receive.update(ACTOR, saved.id, 2, edit as never))).toEqual({ status: 409, code: "MEMO_RECEIVE_DELETED" });
    expect(await failure(s.receive.approve(ACTOR, saved.id, 2))).toEqual({ status: 409, code: "MEMO_RECEIVE_DELETED" });
    expect(await failure(s.receive.delete(ACTOR, saved.id, 2))).toEqual({ status: 409, code: "MEMO_RECEIVE_DELETED" });
    expect(await s.receive.get(saved.id)).toMatchObject({ version: 2, lines: [{ lot: "LOT-SD" }, { lot: "LOT-SD2" }] });
    // IT-SD-08: never in Memo Stock.
    expect(await prisma.memoStock.count({ where: { memoReceiveId: saved.id } })).toBe(0);

    // Restore misses, then restore.
    expect(await failure(s.receive.restore(ACTOR, saved.id, 1))).toEqual({ status: 409, code: "MEMO_RECEIVE_CHANGED" });
    await expect(s.receive.restore(ACTOR, saved.id, 2)).resolves.toEqual({ id: saved.id, version: 3, status: "PENDING_APPROVAL" });
    expect(await failure(s.receive.restore(ACTOR, saved.id, 3))).toEqual({ status: 409, code: "MEMO_RECEIVE_STATUS_INVALID" });
    const restored = await s.receive.get(saved.id);
    expect(restored).toMatchObject({ deletedAt: null, deletedBy: null, version: 3 });
    expect(restored.lines.map((line) => [line.stockId, line.photoIds])).toEqual(before.lines.map((line) => [line.stockId, line.photoIds]));

    // IT-SD-07: editable again; save keeps the Stock IDs; approve fills Memo Stock.
    const updated = await s.receive.update(ACTOR, saved.id, 3, receiveInput(vendorA, before.lines.map((line) => receiveLine({ id: line.id, lot: line.lot, photoIds: line.photoIds }))) as never);
    expect(updated.stockIds).toEqual(before.lines.map((line) => line.stockId));
    await expect(s.receive.approve(ACTOR, saved.id, 4)).resolves.toMatchObject({ status: "APPROVED", memoStockCount: 2 });
    expect((await prisma.memoStock.findMany({ where: { memoReceiveId: saved.id }, orderBy: { stockId: "asc" } })).map((item) => item.stockId)).toEqual(before.lines.map((line) => line.stockId).sort());
    expect(await failure(s.receive.delete(ACTOR, saved.id, 5))).toEqual({ status: 409, code: "MEMO_RECEIVE_STATUS_INVALID" });
  });

  it("IT-SD-04/05 Purchase Order: the Deleted view pages > 50 rows in order; the normal list and total drop; the number is never reused; Document Setup used", async () => {
    const vendor = await vendorFixture("SD IT Vendor PO");
    const input = (docDate: string) => ({ ...header(docDate), lines: [poLine()], vendorId: vendor.id, addressId: vendor.addressId });
    const docs: { id: string; docNo: string }[] = [];
    for (let index = 0; index < 53; index += 1) docs.push(await s.po.create(ACTOR, input(`2026-10-${String((index % 28) + 1).padStart(2, "0")}`)));
    const normal = () => s.po.list({ partyId: vendor.id, limit: 50, deleted: false });
    expect((await normal()).total).toBe(53);
    const latest = [...docs].sort((a, b) => a.docNo.localeCompare(b.docNo, "en", { numeric: true })).at(-1)!;
    for (const doc of docs.slice(0, 52)) await s.po.delete(DELETER, doc.id, 1);
    // Also the highest number: the next save must not reuse it (D5).
    if (!docs.slice(0, 52).some((doc) => doc.id === latest.id)) await s.po.delete(DELETER, latest.id, 1);
    const deletedCount = docs.slice(0, 52).some((doc) => doc.id === latest.id) ? 52 : 53;
    expect((await normal()).total).toBe(53 - deletedCount);
    expect((await normal()).items.every((item) => item.deletedAt === null)).toBe(true);

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: Awaited<ReturnType<Services["po"]["list"]>> = await s.po.list({ partyId: vendor.id, limit: 50, deleted: true, cursor });
      expect(page.total).toBe(deletedCount);
      for (const item of page.items) expect(item.deletedAt).toEqual(expect.any(String));
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor);
    expect(pages).toBe(2);
    expect(new Set(seen).size).toBe(deletedCount);
    const ordered = await prisma.purchaseOrder.findMany({ where: { vendorId: vendor.id, deletedAt: { not: null } }, orderBy: [{ docDate: "desc" }, { createdAt: "desc" }, { id: "desc" }], select: { id: true } });
    expect(seen).toEqual(ordered.map((row) => row.id));
    // Filters work in the deleted view.
    expect((await s.po.list({ partyId: vendor.id, limit: 50, deleted: true, q: latest.docNo })).items.map((item) => item.id)).toContain(latest.id);
    expect((await s.po.list({ partyId: vendor.id, limit: 50, deleted: true, from: "2026-10-01", to: "2026-10-01" })).items.length).toBeGreaterThan(0);

    const next = await s.po.nextNumber("2026-11-06");
    expect(next.docNo).not.toBe(latest.docNo);
    const fresh = await s.po.create(ACTOR, input("2026-11-06"));
    expect(fresh.docNo.localeCompare(latest.docNo, "en", { numeric: true })).toBe(1);
    const setup = await s.setup.get("purchase-order");
    expect(setup.setup?.rows.some((row) => row.used)).toBe(true);

    // IT-SD-08: a deleted PO draft is never offered to Purchase (approved POs only).
    const lines = await s.purchase.purchaseOrderLines({ vendorId: vendor.id, currency: "THB", status: "ALL", limit: 50 } as never);
    expect(lines.items).toEqual([]);
  });

  it("IT-SD-08 Memo Out: a deleted pending Memo Out holds nothing and is never in the Memo Out Return outstanding list; restore → approve moves stock", async () => {
    const vendor = await vendorFixture("SD IT Vendor MO");
    const saved = await s.receive.create(ACTOR, receiveInput(vendor, [receiveLine({ lot: "LOT-MO" })]));
    await s.receive.approve(ACTOR, saved.id, saved.version);
    const [item] = await prisma.memoStock.findMany({ where: { memoReceiveId: saved.id } });
    const out = await s.memoOut.create(ACTOR, schemas.createMemoOutSchema.parse({
      ...header(), customerId: customer.id, shippingAddressId: customer.shipping, invoiceAddressId: customer.invoice,
      lines: [{ ...poLine(), stone: "x", location: "", memoStockId: item.id, pcs: 1, weightCt: "0.5", unitPrice: "2000" }],
    }));
    await s.memoOut.delete(DELETER, out.id, 1);
    expect(await failure(s.memoOut.approve(ACTOR, out.id, 2))).toEqual({ status: 409, code: "MEMO_OUT_DELETED" });
    expect(await prisma.memoStock.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ pendingPcs: 4, reservedPcs: 0 });
    expect((await s.stock.list(schemas.memoStockListSchema.parse({ vendorId: vendor.id }))).items.map((row) => row.id)).toContain(item.id);
    const outstanding = await s.memoOutReturn.outstanding(schemas.memoOutOutstandingSchema.parse({ customerId: customer.id, currency: "THB" }));
    expect(JSON.stringify(outstanding)).not.toContain(out.id);
    expect((await s.memoOut.list(schemas.memoOutListSchema.parse({ partyId: customer.id }))).items.map((row) => row.id)).not.toContain(out.id);
    expect((await s.memoOut.list(schemas.memoOutListSchema.parse({ partyId: customer.id, deleted: true }))).items.map((row) => row.id)).toEqual([out.id]);

    await s.memoOut.restore(ACTOR, out.id, 2);
    await expect(s.memoOut.approve(ACTOR, out.id, 3)).resolves.toMatchObject({ status: "APPROVED", stockLineCount: 1 });
    expect(await prisma.memoStock.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ pendingPcs: 3, reservedPcs: 1 });
  });

  it("IT-SD-03/06 Quotation (OQ-1): created APPROVED can't be deleted; a DRAFT can; read-only while deleted; restore keeps its status", async () => {
    const body = { ...header(), lines: [quotationLine()], customerId: customer.id, shippingAddressId: customer.shipping, invoiceAddressId: customer.invoice } as never;
    const approved = await s.quotation.create(ACTOR, body);
    expect(await failure(s.quotation.delete(ACTOR, approved.id, 1))).toEqual({ status: 409, code: "QUOTATION_STATUS_INVALID" });
    const draft = await s.quotation.create(ACTOR, body);
    await prisma.quotation.update({ where: { id: draft.id }, data: { status: "DRAFT" } });
    await expect(s.quotation.delete(DELETER, draft.id, 1)).resolves.toEqual({ ok: true, version: 2 });
    expect(await s.quotation.get(draft.id)).toMatchObject({ status: "DRAFT", deletedBy: DELETER, lines: [{ stone: "Emerald" }] });
    expect(await failure(s.quotation.update(ACTOR, draft.id, 2, body))).toEqual({ status: 409, code: "QUOTATION_DELETED" });
    expect(await failure(s.quotation.submit(ACTOR, draft.id, 2))).toEqual({ status: 409, code: "QUOTATION_DELETED" });
    expect(await failure(s.quotation.cancel(ACTOR, draft.id, 2, "x"))).toEqual({ status: 409, code: "QUOTATION_DELETED" });
    const listed = await s.quotation.list({ customerId: customer.id, limit: 50, deleted: false });
    expect(listed.items.map((item) => item.id)).not.toContain(draft.id);
    expect((await s.quotation.list({ customerId: customer.id, limit: 50, deleted: true })).items.map((item) => item.id)).toEqual([draft.id]);
    await expect(s.quotation.restore(ACTOR, draft.id, 2)).resolves.toEqual({ id: draft.id, version: 3, status: "DRAFT" });
    await expect(s.quotation.submit(ACTOR, draft.id, 3)).resolves.toMatchObject({ status: "PENDING_APPROVAL" });
  });

  it("IT-SD-09 race: delete and approve with the same version → exactly one wins; the CHECK holds", async () => {
    const vendor = await vendorFixture("SD IT Vendor Race");
    for (let round = 0; round < 5; round += 1) {
      const doc = await s.po.create(ACTOR, { ...header(), lines: [poLine()], vendorId: vendor.id, addressId: vendor.addressId });
      const results = await Promise.allSettled([s.po.delete(DELETER, doc.id, 1), s.po.approve(ACTOR, doc.id, 1)]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const loser = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
      expect(["PURCHASE_ORDER_CHANGED", "PURCHASE_ORDER_DELETED", "PURCHASE_ORDER_STATUS_INVALID"]).toContain(((loser.reason as HttpException).getResponse() as { error: { code: string } }).error.code);
      const row = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: doc.id }, select: { status: true, deletedAt: true, version: true } });
      expect(row.version).toBe(2);
      expect(row.status === "APPROVED" ? row.deletedAt : "deleted-pending").toBe(row.status === "APPROVED" ? null : "deleted-pending");
      if (row.deletedAt) expect(row.status).toBe("PENDING_APPROVAL");
    }
  });
});
