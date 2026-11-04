import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { HttpException } from "@nestjs/common";
import type { Request } from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * IT-PO-01…03 (purchase-order SA rev 1 / ADR-0041, owner 2026-11-04) against real PostgreSQL: Document Setup / plain
 * numbers, PENDING_APPROVAL → APPROVED with the status guards, no stock written on approve (`purchased_*` = 0), keyed-in
 * lines with location, server totals and discount bounds, line photos on the real `@gms/storage` local driver, foreign
 * photo ids and Document Setup `used`.
 *
 * Opt-in like the other DB integrations (INV-20261021-007): runs only with `PARTNER_TEST_DATABASE_URL` pointing at a
 * disposable `f1_system` database on 127.0.0.1 with an explicit port other than 5432, migrated with `prisma migrate
 * deploy`. Rows are scoped to vendors created here; all are removed in `afterAll`.
 */

const testUrl = process.env.PARTNER_TEST_DATABASE_URL;
const canRun = Boolean(testUrl && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(testUrl));
const ACTOR = `po-it-${randomUUID().slice(0, 8)}`;

type Prisma = typeof import("../../src/database/prisma-client").prisma;
type Service = InstanceType<typeof import("../../src/purchase-order/purchase-order.service").PurchaseOrderService>;

let prisma: Prisma;
let service: Service;
let calculateTotals: typeof import("../../src/quotation/quotation.calculate").calculateTotals;
let setupService: InstanceType<typeof import("../../src/document-setup/document-setup.service").DocumentSetupService>;
let photos: typeof import("../../src/purchase-order/purchase-order-photo.public.controller");
let memoReceivePhotos: typeof import("../../src/trade-document/memo-receive-photo.public.controller");
let storageDir = "";
const vendors: { id: string; addressId: string }[] = [];
const created = { currency: false, setup: false };

const line = (patch: Record<string, unknown> = {}) => ({
  source: "MANUAL" as const, stoneCodeId: null, stoneCode: "", stone: "Sapphire", shape: "Oval", size: "", color: "Blue", clarity: "", cutting: "", quality: "",
  lot: "LOT-P", location: "Safe A", cerType: "GIA", cerNo: "C-9", pcs: 2, weightCt: "1.5", priceUnit: "PER_CT" as "PER_CT" | "PER_PCS", unitPrice: "1000",
  discount: { type: "NONE" as "NONE" | "PERCENT" | "AMOUNT", value: "0" }, itemNote: "", photoIds: [] as string[],
  ...patch,
});
const input = (vendor: { id: string; addressId: string }, lines: ReturnType<typeof line>[], patch: Record<string, unknown> = {}) => ({
  docDate: "2026-11-04", dueDate: "2026-12-04", currency: "THB", exchangeRate: null, ref: "", documentNote: "", lines,
  discount: { type: "NONE" as const, value: "0" }, tax: { enabled: true, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null,
  vendorId: vendor.id, addressId: vendor.addressId, ...patch,
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

async function vendorFixture(name: string) {
  const id = randomUUID();
  const addressId = randomUUID();
  const code = `POIT${vendors.length}${ACTOR.slice(-4)}`;
  await prisma.vendor.create({ data: {
    id, name, nameKey: name.toLowerCase(), code: code.toUpperCase(), codeKey: code.toLowerCase(),
    currencyCode: "THB", firstName: "It", email: "po-it@example.test", createdBy: ACTOR, updatedBy: ACTOR,
    addresses: { create: [{ id: addressId, position: 1, name: `${name} Co.`, address: "9 Test Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true }] },
  } });
  const vendor = { id, addressId };
  vendors.push(vendor);
  return vendor;
}

describe.runIf(canRun)("IT-PO purchase order on PostgreSQL", () => {
  let vendor: { id: string; addressId: string };

  beforeAll(async () => {
    vi.stubEnv("PARTNER_DATABASE_URL", testUrl!);
    vi.stubEnv("DATABASE_URL", testUrl!);
    storageDir = await mkdtemp(path.join(tmpdir(), "po-it-photos-"));
    vi.stubEnv("GMS_STORAGE_ROOT", storageDir);
    photos = await import("../../src/purchase-order/purchase-order-photo.public.controller");
    memoReceivePhotos = await import("../../src/trade-document/memo-receive-photo.public.controller");
    ({ prisma } = await import("../../src/database/prisma-client"));
    const { PurchaseOrderService } = await import("../../src/purchase-order/purchase-order.service");
    const { DocumentSetupService } = await import("../../src/document-setup/document-setup.service");
    ({ calculateTotals } = await import("../../src/quotation/quotation.calculate"));
    service = new PurchaseOrderService();
    setupService = new DocumentSetupService();

    // A concurrent DB integration file may create the same shared fixture first (P2002): keep its row.
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
      created.setup = await createIfAbsent(() => prisma.documentSetup.create({ data: {
        transactionKey: "purchase-order", name: "Purchase Order", code: "PO", startFrom: 1, updatedBy: ACTOR,
        rows: { create: [{ id: randomUUID(), effectiveDate: new Date("2026-01-01T00:00:00Z"), prefix: "PO", separator: "-", startNo: 1 }] },
      } }));
    }
    vendor = await vendorFixture("PO IT Vendor");
  });

  afterAll(async () => {
    if (!prisma) return;
    const ids = vendors.map((entry) => entry.id);
    await prisma.purchaseOrder.deleteMany({ where: { vendorId: { in: ids } } });
    await prisma.vendor.deleteMany({ where: { id: { in: ids } } });
    // Disposable test database only: photo rows this run created (product code never deletes uploads, ADR-0030).
    await prisma.storedFile.deleteMany({ where: { createdBy: ACTOR } });
    if (created.setup && (await prisma.purchaseOrder.count()) === 0) await prisma.documentSetup.deleteMany({ where: { transactionKey: "purchase-order" } });
    if (created.currency && (await prisma.memoReceive.count()) + (await prisma.memoOut.count()) + (await prisma.purchaseOrder.count()) === 0) {
      await prisma.currency.deleteMany({ where: { code: "THB" } });
    }
    await prisma.$disconnect();
    if (storageDir) await rm(storageDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("IT-PO-01 create → PENDING_APPROVAL with a Document Setup / plain number; update and delete only while pending; version conflict", async () => {
    const result = await service.create(ACTOR, input(vendor, [line()]));
    expect(result).toMatchObject({ docNo: expect.stringMatching(/^PO-\d+$/), version: 1 });
    const detail = await service.get(result.id);
    expect(detail).toMatchObject({ status: "PENDING_APPROVAL", approvedAt: null, approvedBy: null, vendorId: vendor.id, vendor: { name: "PO IT Vendor" } });
    expect(detail.lines[0]).toMatchObject({ source: "MANUAL", location: "Safe A", stoneCodeId: null, purchasedPcs: 0, purchasedWeightCt: "0.000", photoIds: [] });
    expect(detail.lines[0]).not.toHaveProperty("stockId");
    expect(detail.lines[0]).not.toHaveProperty("outstandingPcs");

    const plain = await service.create(ACTOR, input(vendor, [line()], { docDate: "2025-06-01", dueDate: "2025-06-30" }));
    expect(plain.docNo).toMatch(/^\d+$/);
    expect((await service.nextNumber("2026-11-04")).docNo).toMatch(/^PO-\d+$/);
    const listed = await service.list({ partyId: vendor.id, status: "PENDING_APPROVAL", limit: 50 });
    expect(listed.items.map((item) => item.id)).toEqual(expect.arrayContaining([result.id, plain.id]));
    expect(listed.items[0]).toMatchObject({ status: "PENDING_APPROVAL", vendorName: "PO IT Vendor" });

    const updated = await service.update(ACTOR, result.id, 1, input(vendor, [line({ location: "Safe B", pcs: 3 }), line()]));
    expect(updated.version).toBe(2);
    expect((await service.get(result.id)).lines.map((entry) => [entry.location, entry.pcs])).toEqual([["Safe B", 3], ["Safe A", 2]]);
    expect(await failure(service.update(ACTOR, result.id, 1, input(vendor, [line()])))).toMatchObject({ status: 409, code: "PURCHASE_ORDER_CHANGED" });
    expect(await failure(service.delete(ACTOR, plain.id, 9))).toMatchObject({ status: 409, code: "PURCHASE_ORDER_CHANGED" });
    await service.delete(ACTOR, plain.id, 1);
    expect(await failure(service.get(plain.id))).toMatchObject({ status: 404, code: "PURCHASE_ORDER_NOT_FOUND" });
    expect(await failure(service.create(ACTOR, input(vendor, [line()], { vendorId: randomUUID() })))).toMatchObject({ status: 422, code: "PURCHASE_ORDER_REFERENCE_INVALID" });
  });

  it("IT-PO-02 approve → APPROVED, read-only, no stock written, every line outstanding in full; Document Setup row used", async () => {
    const result = await service.create(ACTOR, input(vendor, [line(), line({ priceUnit: "PER_PCS", pcs: 4, weightCt: "2" })]));
    const memoStockBefore = await prisma.memoStock.count();
    expect(await failure(service.approve(ACTOR, result.id, 7))).toMatchObject({ status: 409, code: "PURCHASE_ORDER_CHANGED" });
    expect(await service.approve(ACTOR, result.id, 1)).toEqual({ id: result.id, version: 2, status: "APPROVED", lineCount: 2 });
    const detail = await service.get(result.id);
    expect(detail).toMatchObject({ status: "APPROVED", approvedBy: ACTOR, approvedAt: expect.any(String), version: 2 });
    expect(detail.lines.map((entry) => [entry.purchasedPcs, entry.purchasedWeightCt])).toEqual([[0, "0.000"], [0, "0.000"]]);
    expect(await prisma.memoStock.count()).toBe(memoStockBefore);

    expect(await failure(service.approve(ACTOR, result.id, 2))).toMatchObject({ status: 409, code: "PURCHASE_ORDER_STATUS_INVALID" });
    expect(await failure(service.update(ACTOR, result.id, 2, input(vendor, [line()])))).toMatchObject({ status: 409, code: "PURCHASE_ORDER_STATUS_INVALID" });
    expect(await failure(service.delete(ACTOR, result.id, 2))).toMatchObject({ status: 409, code: "PURCHASE_ORDER_STATUS_INVALID" });
    expect(await failure(service.approve(ACTOR, randomUUID(), 1))).toMatchObject({ status: 404, code: "PURCHASE_ORDER_NOT_FOUND" });
    expect((await service.list({ partyId: vendor.id, status: "APPROVED", limit: 50 })).items.map((item) => item.id)).toContain(result.id);

    // The purchased CHECK keeps purchased ≤ ordered for the future Purchase writer.
    const lineId = (await prisma.purchaseOrderLine.findFirstOrThrow({ where: { purchaseOrderId: result.id }, select: { id: true } })).id;
    await expect(prisma.purchaseOrderLine.update({ where: { id: lineId }, data: { purchasedPcs: 3 } })).rejects.toThrow();

    const { setup } = await setupService.get("purchase-order");
    expect(setup?.rows.find((row) => row.effectiveDate === "2026-01-01")?.used).toBe(true);
  });

  it("IT-PO-03 server totals with line / document discounts, tax, charges and labor; photos linked in order and replaced; foreign photo ids refused", async () => {
    const lines = [line({ discount: { type: "PERCENT", value: "10" } }), line({ priceUnit: "PER_PCS", pcs: 3, unitPrice: "250", discount: { type: "AMOUNT", value: "50" } })];
    const body = input(vendor, lines, {
      discount: { type: "PERCENT", value: "5" }, serviceCharges: [{ type: "SHIPPING", amount: "120" }], labor: { work: "Setting", basis: "PCS", qty: "2", rate: "30" },
    });
    const result = await service.create(ACTOR, body);
    const detail = await service.get(result.id);
    const totals = calculateTotals(body as unknown as Parameters<typeof calculateTotals>[0]);
    expect(detail.totals).toEqual({
      subtotal: totals.subtotal.toFixed(2), discountAmount: totals.discountAmount.toFixed(2), priceBeforeTax: totals.priceBeforeTax.toFixed(2),
      taxAmount: totals.taxAmount.toFixed(2), chargesAmount: totals.chargesAmount.toFixed(2), laborAmount: totals.laborAmount.toFixed(2), grandTotal: totals.grandTotal.toFixed(2),
    });
    expect(detail.lines.map((entry) => [entry.discountAmount, entry.amount])).toEqual([["150.00", "1350.00"], ["50.00", "700.00"]]);

    const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("png-body")]);
    const ctx = (grants: string[]) => ({ principal: { userId: ACTOR, sessionId: "s-1", isSuperAdmin: false, grants }, authorization: "CURRENT" as const, license: "ELIGIBLE" as const, csrfVerified: true });
    const upload = (grants: string[]) => new photos.PurchaseOrderPhotoPublicController({ createContext: async () => ctx(grants) } as never)
      .upload({ headers: { "content-type": "image/png" }, body: PNG } as unknown as Request);
    const [first, second] = [(await upload(["purchase-order:ADD"])).photoId, (await upload(["purchase-order:EDIT"])).photoId];
    expect(await prisma.storedFile.findUnique({ where: { id: first } })).toMatchObject({ kind: "purchase-order-photo", sourceType: "purchase_order.line-photo", status: "ready" });
    await expect(upload(["purchase-order:VIEW"])).rejects.toMatchObject({ message: "PERMISSION_DENIED" });
    const foreign = (await new memoReceivePhotos.MemoReceivePhotoPublicController({ createContext: async () => ctx(["memo-receive:ADD"]) } as never)
      .upload({ headers: { "content-type": "image/png" }, body: PNG } as unknown as Request)).photoId;

    const withPhotos = await service.update(ACTOR, result.id, 1, { ...body, lines: [line({ photoIds: [second, first] }), line()] });
    expect((await service.get(result.id)).lines.map((entry) => entry.photoIds)).toEqual([[second, first], []]);
    await service.update(ACTOR, result.id, withPhotos.version, { ...body, lines: [line({ photoIds: [first] })] });
    expect((await service.get(result.id)).lines.map((entry) => entry.photoIds)).toEqual([[first]]);
    expect(await failure(service.update(ACTOR, result.id, withPhotos.version + 1, { ...body, lines: [line({ photoIds: [first, foreign] })] })))
      .toMatchObject({ status: 422, code: "PURCHASE_ORDER_PHOTO_INVALID", fieldErrors: [{ path: "lines.0.photoIds.1" }] });
    expect(await failure(service.create(ACTOR, input(vendor, [line({ photoIds: [randomUUID()] })])))).toMatchObject({ status: 422, code: "PURCHASE_ORDER_PHOTO_INVALID" });
  });
});
