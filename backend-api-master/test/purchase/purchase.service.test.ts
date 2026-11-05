import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tx } from "../../src/common/persistence";
import { Prisma } from "../../src/generated/prisma/client";
import { isCheckViolation, purchaseErrors } from "../../src/purchase/purchase.errors";
import { prisma } from "../../src/database/prisma-client";
import { completeSourceLines } from "../../src/purchase/purchase-stock";
import { PurchaseService } from "../../src/purchase/purchase.service";
import type { PurchaseInput } from "../../src/purchase/purchase.schemas";

/**
 * UT-PU-B02 (purchase SA-PU-03/07/10/14/16, BE-PU-003) with Prisma mocked: the save completes source lines from the
 * database and overwrites the browser's values, refuses foreign / unapproved sources and quantities above the current
 * availability, issues Stock IDs for MANUAL / PO lines (kept by line id on update) and moves no stock. `get` gives
 * `limitPcs` only while pending. The SQL paths are covered by `purchase.db.integration.test.ts`.
 */

const D = (value: string) => new Prisma.Decimal(value);
const VENDOR = "00000000-0000-4000-8000-000000000001";
const ADDRESS = "00000000-0000-4000-8000-000000000002";
const ITEM = "00000000-0000-4000-8000-000000000005";
const PO_LINE = "00000000-0000-4000-8000-000000000007";
const PO_CODE = "00000000-0000-4000-8000-0000000000c0";
const SAVED_PO_LINE = "00000000-0000-4000-8000-0000000000a1";
const SAVED_MANUAL = "00000000-0000-4000-8000-0000000000a2";
const DOC = "00000000-0000-4000-8000-0000000000d0";

const memoItem = (patch: Record<string, unknown> = {}) => ({
  id: ITEM, stockId: "260042", vendorId: VENDOR, currencyCode: "THB", stone: "Sapphire", shape: "Oval", size: "6x4", color: "Blue", clarity: "VS",
  cutting: "Ex", quality: "AA", lot: "LOT-9", location: "Memo", cerType: "GIA", cerNo: "C-1", priceUnit: "PER_CT",
  pendingPcs: 3, pendingWeightCt: D("2.5"), soldPcs: 2, soldWeightCt: D("1.2"), purchasedPcs: 1, purchasedWeightCt: D("0.7"), ...patch,
});
const purchaseOrderLine = (patch: Record<string, unknown> = {}) => ({
  id: PO_LINE, stoneCodeId: PO_CODE, stoneCodeSnapshot: "RB-01", stone: "Ruby", shape: "Round", size: "5", color: "Red", clarity: "SI", cutting: "Good",
  quality: "A", lot: "PO-LOT", location: "Safe B", cerType: "AGL", cerNo: "P-7", priceUnit: "PER_PCS", pcs: 10, weightCt: D("4"),
  purchasedPcs: 4, purchasedWeightCt: D("1.5"), document: { status: "APPROVED", vendorId: VENDOR, currencyCode: "THB" }, ...patch,
});
// The browser sends other stone details, a price unit and location: the server must replace them.
const browser = { stoneCodeId: null, stoneCode: "FAKE", stone: "Fake", shape: "Fake", size: "Fake", color: "Fake", clarity: "Fake", cutting: "Fake", quality: "Fake",
  lot: "FAKE", location: "Fake", cerType: "FAKE", cerNo: "FAKE", priceUnit: "PER_PCS" as const, discount: { type: "NONE" as const, value: "0" }, photoIds: [] as [] };
const stockLine = (patch: Record<string, unknown> = {}) => ({ ...browser, source: "STOCK" as const, memoStockId: ITEM, memoGroup: "IN_STOCK" as const, pcs: 2, weightCt: "1.5", unitPrice: "900", itemNote: "keep", ...patch });
const poLine = (patch: Record<string, unknown> = {}) => ({ ...browser, source: "PURCHASE_ORDER" as const, purchaseOrderLineId: PO_LINE, pcs: 6, weightCt: "2.5", unitPrice: "50", itemNote: "", ...patch });
const manualLine = (patch: Record<string, unknown> = {}) => ({ ...browser, stoneCode: "", stone: "Emerald", lot: "M", location: "Shelf 1", cerType: "", cerNo: "", source: "MANUAL" as const, pcs: 1, weightCt: "0.5", unitPrice: "10", itemNote: "", ...patch });
const input = (lines: unknown[]) => ({
  docDate: "2026-11-04", dueDate: "2026-12-04", currency: "THB", exchangeRate: null, ref: "", documentNote: "", lines,
  discount: { type: "NONE", value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null,
  vendorId: VENDOR, addressId: ADDRESS,
}) as unknown as PurchaseInput;

const db = vi.hoisted(() => ({
  items: [] as unknown[],
  poLines: [] as unknown[],
  counter: 0,
  stored: null as unknown,
  getRow: null as unknown,
  calls: [] as string[],
  lines: [] as Record<string, unknown>[],
}));

vi.mock("../../src/database/prisma-client", () => {
  const track = <T>(name: string, value: T) => vi.fn(async (...args: unknown[]) => {
    db.calls.push(name);
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown)(...args) : value;
  });
  const tx = {
    memoStock: { findMany: track("memoStock.findMany", () => db.items) },
    purchaseOrderLine: { findMany: track("purchaseOrderLine.findMany", () => db.poLines) },
    vendor: { findUnique: track("vendor.findUnique", () => ({ code: "V01", name: "Gem Vendor", active: true, addresses: [{ id: ADDRESS, name: "Gem Co.", taxId: null, address: "1 Road", city: "Bangkok", state: "Bangkok", postcode: "10500", countryCode: "TH" }] })) },
    currency: { findUnique: track("currency.findUnique", { active: true }) },
    stoneCode: { findMany: track("stoneCode.findMany", []) },
    companyProfile: { findUnique: track("companyProfile.findUnique", { currencyCode: "THB" }) },
    $queryRaw: vi.fn(async (sql: { sql: string }) => {
      if (sql.sql.includes("memo_stock_id_counter")) {
        const count = Number((sql as unknown as { values: unknown[] }).values[1]);
        db.calls.push(`counter:${count}`);
        db.counter += count;
        return [{ last_no: db.counter }];
      }
      db.calls.push("queryRaw");
      return [];
    }),
    $executeRaw: track("$executeRaw", 1),
    purchase: {
      aggregate: track("purchase.aggregate", { _max: { runningNo: null } }),
      create: track("purchase.create", {}),
      findUnique: vi.fn(async (args: { include?: unknown }) => (args.include ? db.getRow : db.stored)),
      updateMany: track("purchase.updateMany", { count: 1 }),
    },
    purchaseLine: {
      createMany: vi.fn(async ({ data }: { data: Record<string, unknown>[] }) => { db.calls.push("purchaseLine.createMany"); db.lines = data; return { count: data.length }; }),
      deleteMany: track("purchaseLine.deleteMany", { count: 1 }),
    },
    purchaseCharge: { createMany: track("purchaseCharge.createMany", {}), deleteMany: track("purchaseCharge.deleteMany", {}) },
  };
  return { prisma: { ...tx, $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)) } };
});




async function failure(promise: Promise<unknown>) {
  try { await promise; } catch (error) {
    if (error instanceof HttpException) return (error.getResponse() as { error: { code: string; fieldErrors?: unknown } }).error;
    throw error;
  }
  throw new Error("expected a failure");
}

beforeEach(() => {
  db.items = [memoItem()];
  db.poLines = [purchaseOrderLine()];
  db.counter = 0;
  db.calls = [];
  db.lines = [];
});

describe("completeSourceLines (UT-PU-B02)", () => {
  const tx = prisma as unknown as Tx;

  it("copies the source fields over the browser's; keeps pcs, weight, price and note; PO stone code travels separately", async () => {
    const prepared = await completeSourceLines(tx, input([stockLine(), poLine(), manualLine()]));
    expect(prepared.lines[0]).toMatchObject({
      source: "STOCK", stoneCodeId: null, stoneCode: "", stone: "Sapphire", shape: "Oval", size: "6x4", color: "Blue", lot: "LOT-9", location: "Memo",
      cerType: "GIA", cerNo: "C-1", priceUnit: "PER_CT", pcs: 2, weightCt: "1.5", unitPrice: "900", itemNote: "keep", sourceStockId: "260042",
    });
    expect(prepared.lines[1]).toMatchObject({
      source: "PURCHASE_ORDER", stoneCodeId: null, copiedStoneCodeId: PO_CODE, stoneCode: "RB-01", stone: "Ruby", location: "Safe B", priceUnit: "PER_PCS", pcs: 6, unitPrice: "50",
    });
    expect(prepared.lines[2]).toEqual(manualLine());
    // Two primary-key reads, no lock and no write.
    expect(db.calls).toEqual(["memoStock.findMany", "purchaseOrderLine.findMany"]);
  });

  it("refuses a foreign vendor / currency item, a missing item, and a PO that is not approved or of another vendor / currency", async () => {
    db.items = [memoItem({ vendorId: ADDRESS })];
    db.poLines = [purchaseOrderLine({ document: { status: "PENDING_APPROVAL", vendorId: VENDOR, currencyCode: "THB" } })];
    expect(await failure(completeSourceLines(tx, input([manualLine(), stockLine(), poLine()])))).toMatchObject({
      code: "PURCHASE_REFERENCE_INVALID",
      fieldErrors: [{ path: "lines.1.memoStockId", code: "invalid_reference" }, { path: "lines.2.purchaseOrderLineId", code: "invalid_reference" }],
    });
    db.items = [memoItem({ currencyCode: "USD" })];
    db.poLines = [purchaseOrderLine({ document: { status: "APPROVED", vendorId: ADDRESS, currencyCode: "THB" } })];
    expect((await failure(completeSourceLines(tx, input([stockLine(), poLine()])))).fieldErrors).toHaveLength(2);
    db.items = [];
    db.poLines = [purchaseOrderLine({ document: { status: "APPROVED", vendorId: VENDOR, currencyCode: "USD" } })];
    expect((await failure(completeSourceLines(tx, input([stockLine(), poLine()])))).code).toBe("PURCHASE_REFERENCE_INVALID");
  });

  it("checks the quantity against current availability: IN_STOCK = pending, SOLD = sold − purchased, PO = ordered − purchased", async () => {
    // pending 3 / 2.5; sold − purchased = 1 / 0.5; PO ordered − purchased = 6 / 2.5.
    expect(await failure(completeSourceLines(tx, input([stockLine({ pcs: 4, weightCt: "2.5" }), stockLine({ memoGroup: "SOLD", pcs: 1, weightCt: "0.501" }), poLine({ pcs: 7, weightCt: "2.501" })])))).toMatchObject({
      code: "VALIDATION_ERROR",
      fieldErrors: [
        { path: "lines.0.pcs", code: "exceeds_available" },
        { path: "lines.1.weightCt", code: "exceeds_available" },
        { path: "lines.2.pcs", code: "exceeds_available" },
        { path: "lines.2.weightCt", code: "exceeds_available" },
      ],
    });
    await expect(completeSourceLines(tx, input([stockLine({ pcs: 3, weightCt: "2.5" }), stockLine({ memoGroup: "SOLD", pcs: 1, weightCt: "0.5" }), poLine({ pcs: 6, weightCt: "2.5" })]))).resolves.toBeTruthy();
  });

  it("a document with manual lines only reads nothing", async () => {
    await completeSourceLines(tx, input([manualLine()]));
    expect(db.calls).toEqual([]);
  });
});

describe("PurchaseService save (UT-PU-B02)", () => {
  it("create: issues Stock IDs for MANUAL / PO lines only, writes source columns and the PO stone code, moves no stock", async () => {
    const service = new PurchaseService();
    service.clock = () => new Date("2026-11-04T03:00:00Z");
    const result = await service.create("user-1", input([stockLine(), poLine(), manualLine()]));
    expect(result).toMatchObject({ docNo: "1", version: 1, stockIds: ["260042", "260001", "260002"] });
    expect(db.lines.map((line) => [line.source, line.memoStockId, line.memoGroup, line.purchaseOrderLineId, line.stockId, line.stoneCodeId])).toEqual([
      ["STOCK", ITEM, "IN_STOCK", null, "260042", null],
      ["PURCHASE_ORDER", null, null, PO_LINE, "260001", PO_CODE],
      ["MANUAL", null, null, null, "260002", null],
    ]);
    expect(db.lines[0]).toMatchObject({ stone: "Sapphire", priceUnit: "PER_CT" });
    expect(Number(db.lines[0].amount)).toBe(1350);
    expect(db.lines[1]).toMatchObject({ stone: "Ruby", location: "Safe B", priceUnit: "PER_PCS" });
    expect(Number(db.lines[1].amount)).toBe(300);
    // One counter call for 2 ids; nothing written to memo_stock or purchase_order_line (D2).
    expect(db.calls.filter((call) => call.startsWith("counter"))).toEqual(["counter:2"]);
    expect(db.calls).not.toContain("$executeRaw");
  });

  it("update: a saved MANUAL / PO line keeps its id and Stock ID; a STOCK line takes the item's; unknown line ids are refused", async () => {
    const service = new PurchaseService();
    db.stored = {
      status: "PENDING_APPROVAL", version: 2, currencyCode: "THB", vendorId: VENDOR,
      lines: [{ id: SAVED_PO_LINE, stockId: "260010", source: "PURCHASE_ORDER", stoneCodeId: PO_CODE }, { id: SAVED_MANUAL, stockId: "260011", source: "MANUAL", stoneCodeId: null }],
    };
    const result = await service.update("user-1", DOC, 2, input([poLine({ id: SAVED_PO_LINE }), manualLine({ id: SAVED_MANUAL }), stockLine(), manualLine()]));
    expect(result).toEqual({ id: DOC, version: 3, stockIds: ["260010", "260011", "260042", "260001"] });
    expect(db.lines.slice(0, 2).map((line) => line.id)).toEqual([SAVED_PO_LINE, SAVED_MANUAL]);
    expect(db.calls).not.toContain("$executeRaw");

    expect(await failure(service.update("user-1", DOC, 2, input([manualLine({ id: "00000000-0000-4000-8000-0000000000ff" })])))).toMatchObject({
      code: "VALIDATION_ERROR", fieldErrors: [{ path: "lines.0.id", code: "unknown_line" }],
    });
    db.stored = { status: "APPROVED", version: 2, currencyCode: "THB", vendorId: VENDOR, lines: [] };
    expect((await failure(service.update("user-1", DOC, 2, input([manualLine()])))).code).toBe("PURCHASE_STATUS_INVALID");
  });

  it("get: limitPcs / limitWeightCt from the source while pending; null for manual lines and once approved", async () => {
    const service = new PurchaseService();
    const line = (patch: Record<string, unknown>) => ({
      id: SAVED_MANUAL, source: "MANUAL", stoneCodeId: null, stoneCodeSnapshot: "", stone: "", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "",
      lot: "", location: "", cerType: "", cerNo: "", pcs: 1, weightCt: D("1"), priceUnit: "PER_CT", unitPrice: D("10"), discountType: "NONE", discountValue: D("0"),
      discountAmount: D("0"), amount: D("10"), itemNote: "", stockId: "260011", memoStockId: null, memoGroup: null, purchaseOrderLineId: null, memoStock: null, purchaseOrderLine: null, ...patch,
    });
    const row = (status: string) => ({
      id: DOC, docNo: "PU-1", status, version: 1, docDate: new Date("2026-11-04T00:00:00Z"), dueDate: new Date("2026-12-04T00:00:00Z"),
      vendorId: VENDOR, vendorCodeSnapshot: "V01", vendorNameSnapshot: "Gem Vendor", addressId: ADDRESS, addressSnapshot: "x", currencyCode: "THB", exchangeRate: null,
      ref: "", documentNote: "", discountType: "NONE", discountValue: D("0"), taxEnabled: false, taxRate: D("7"), taxIncluded: false,
      laborWork: null, laborBasis: null, laborQty: null, laborRate: null, subtotal: D("10"), discountAmount: D("0"), priceBeforeTax: D("10"), taxAmount: D("0"),
      chargesAmount: D("0"), laborAmount: D("0"), grandTotal: D("10"), approvedAt: status === "APPROVED" ? new Date() : null, approvedBy: status === "APPROVED" ? "user-1" : null,
      createdAt: new Date(), createdBy: "user-1", updatedAt: new Date(), charges: [],
      lines: [
        line({ source: "STOCK", memoStockId: ITEM, memoGroup: "SOLD", stockId: "260042", memoStock: { receivedDocNo: "MR-3", ...memoItem() } }),
        line({ source: "PURCHASE_ORDER", purchaseOrderLineId: PO_LINE, memoStock: null, purchaseOrderLine: { position: 2, pcs: 10, weightCt: D("4"), purchasedPcs: 4, purchasedWeightCt: D("1.5"), document: { id: "po-1", docNo: "PO-9" } } }),
        line({}),
      ],
    });
    db.getRow = row("PENDING_APPROVAL");
    const pending = await service.get(DOC);
    expect(pending.lines.map((l) => [l.source, l.stockId, l.limitPcs, l.limitWeightCt, l.memoReceive, l.purchaseOrder])).toEqual([
      ["STOCK", "260042", 1, "0.500", { docNo: "MR-3" }, null],
      ["PURCHASE_ORDER", "260011", 6, "2.500", null, { id: "po-1", docNo: "PO-9", position: 2 }],
      ["MANUAL", "260011", null, null, null, null],
    ]);
    expect(pending.lines[0]).toMatchObject({ memoStockId: ITEM, memoGroup: "SOLD", photoIds: [] });
    expect(pending.lines[0]).not.toHaveProperty("outstandingPcs");
    db.getRow = row("APPROVED");
    const approved = await service.get(DOC);
    expect(approved.lines.map((l) => [l.limitPcs, l.limitWeightCt])).toEqual([[null, null], [null, null], [null, null]]);
    expect(approved).toMatchObject({ status: "APPROVED", approvedBy: "user-1" });
  });
});

describe("purchase errors", () => {
  it("a CHECK violation (23514), however Prisma wraps it, becomes PURCHASE_CHANGED; other errors keep the shared mapping", () => {
    const wrapped = { code: "P2010", meta: { driverAdapterError: { cause: { originalCode: "23514", kind: "postgres" } } } };
    expect(isCheckViolation(wrapped)).toBe(true);
    expect(isCheckViolation({ cause: { code: "23514" } })).toBe(true);
    expect(isCheckViolation({ code: "P2002" })).toBe(false);
    const mapped = purchaseErrors.map(wrapped, "approve") as HttpException;
    expect((mapped.getResponse() as { error: { code: string } }).error.code).toBe("PURCHASE_CHANGED");
    expect(((purchaseErrors.map({ code: "P2003" }, "create") as HttpException).getResponse() as { error: { code: string } }).error.code).toBe("PURCHASE_REFERENCE_INVALID");
    const domain = new Error("domain");
    expect(purchaseErrors.map(domain, "create")).toBe(domain);
  });
});
