import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { Tx } from "../../src/common/persistence";
import { Prisma } from "../../src/generated/prisma/client";
import { purchasePendingShort } from "../../src/purchase/purchase.errors";
import { memoLineRange, takeForPurchase, totalsPerKey, type PurchaseTake } from "../../src/purchase/purchase-stock";

/**
 * UT-PU-B03 (purchase SA-PU-09, BE-PU-004): `takeForPurchase` sums per key, locks in id order, reports every short
 * line, runs no UPDATE when anything is short, and keeps every input out of the SQL text (bound values only).
 * The real locking and CHECKs are covered by IT-PU-B02/B03 on PostgreSQL.
 */

vi.mock("../../src/database/prisma-client", () => ({ prisma: {} }));

const D = (value: string) => new Prisma.Decimal(value);
const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const P = "00000000-0000-4000-8000-0000000000f1";
const VENDOR = "00000000-0000-4000-8000-000000000001";
const PO = "00000000-0000-4000-8000-0000000000e1";
const take = (patch: Partial<PurchaseTake>): PurchaseTake => ({ source: "STOCK", memoStockId: A, memoGroup: "IN_STOCK", purchaseOrderLineId: null, pcs: 1, weightCt: D("1"), index: 0, ...patch });
const item = (id: string, patch: Record<string, unknown> = {}) => ({
  id, pending_pcs: 5, pending_weight_ct: "5.000", sold_pcs: 4, sold_weight_ct: "4.000", purchased_pcs: 1, purchased_weight_ct: "1.000", ...patch,
});
const poLine = (patch: Record<string, unknown> = {}) => ({
  id: P, pcs: 10, weight_ct: "10.000", purchased_pcs: 2, purchased_weight_ct: "2.000", status: "APPROVED", vendor_id: VENDOR, currency_code: "THB", ...patch,
});

function fakeTx(items: unknown[], poLines: unknown[] = []) {
  const queries: Prisma.Sql[] = [];
  const updates: Prisma.Sql[] = [];
  const tx = {
    $queryRaw: vi.fn(async (sql: Prisma.Sql) => {
      queries.push(sql);
      // INV-20261111-002 F1: PO line → PO header, then the PO headers FOR SHARE.
      if (sql.sql.includes("AS parent")) return poLines.map((line) => ({ id: (line as { id: string }).id, parent: PO }));
      if (sql.sql.includes("FOR SHARE")) return [{ id: PO, live: true }];
      return sql.sql.includes("purchase_order_line") ? poLines : items;
    }),
    $executeRaw: vi.fn(async (sql: Prisma.Sql) => {
      updates.push(sql);
      return 1;
    }),
  };
  return { tx: tx as unknown as Tx, queries, updates };
}

async function shortFields(promise: Promise<unknown>) {
  try { await promise; } catch (error) {
    if (error instanceof HttpException) return (error.getResponse() as { error: { code: string; fieldErrors: { path: string; code: string }[] } }).error;
    throw error;
  }
  throw new Error("expected PURCHASE_PENDING_SHORT");
}

const scope = { vendorId: VENDOR, currency: "THB" };
const now = new Date("2026-11-04T03:00:00Z");

describe("takeForPurchase (UT-PU-B03)", () => {
  it("sums lines per key: two lines of one item and group, IN_STOCK + SOLD of one item kept apart, PO lines by id; MANUAL ignored", () => {
    const totals = totalsPerKey([
      take({ pcs: 2, weightCt: D("1.5"), index: 0 }),
      take({ memoGroup: "SOLD", pcs: 1, weightCt: D("0.5"), index: 1 }),
      take({ pcs: 1, weightCt: D("0.25"), index: 2 }),
      take({ source: "PURCHASE_ORDER", memoStockId: null, memoGroup: null, purchaseOrderLineId: P, pcs: 3, weightCt: D("3"), index: 3 }),
      take({ source: "MANUAL", memoStockId: null, memoGroup: null, index: 4 }),
    ]);
    expect([...totals.inStock.values()].map((t) => [t.id, t.pcs, t.weightCt.toFixed(3), t.indexes])).toEqual([[A, 3, "1.750", [0, 2]]]);
    expect([...totals.sold.values()].map((t) => [t.id, t.pcs, t.weightCt.toFixed(3), t.indexes])).toEqual([[A, 1, "0.500", [1]]]);
    expect([...totals.po.values()].map((t) => [t.id, t.pcs, t.indexes])).toEqual([[P, 3, [3]]]);
  });

  it("locks the source PO headers FOR SHARE, then memo_stock, then purchase_order_line in id order and runs one UPDATE per table with bound values only", async () => {
    const { tx, queries, updates } = fakeTx([item(A), item(B)], [poLine()]);
    const moved = await takeForPurchase(tx, scope, [
      take({ memoStockId: B, pcs: 2, weightCt: D("2"), index: 0 }),
      take({ memoStockId: A, memoGroup: "SOLD", pcs: 3, weightCt: D("3"), index: 1 }),
      take({ memoStockId: A, pcs: 1, weightCt: D("0.5"), index: 2 }),
      take({ source: "PURCHASE_ORDER", memoStockId: null, memoGroup: null, purchaseOrderLineId: P, pcs: 8, weightCt: D("8"), index: 3 }),
    ], purchasePendingShort, now);
    expect(moved).toEqual({ memoStockKeys: 3, purchaseOrderKeys: 1, soldParts: [] });
    expect(queries).toHaveLength(4);
    expect(queries[0].sql).toMatch(/SELECT id::text AS id, "purchase_order_id"::text AS parent FROM "partner"\."purchase_order_line" WHERE id = ANY/);
    expect(queries[0].values).toEqual([[P]]);
    expect(queries[1].sql).toMatch(/FROM "partner"\."purchase_order"\s+WHERE id = ANY\(\$?\??[^)]*\) ORDER BY id FOR SHARE/);
    expect(queries[1].values).toEqual([[PO]]);
    expect(queries[2].sql).toMatch(/FROM "partner"\."memo_stock"[\s\S]*ORDER BY id FOR NO KEY UPDATE/);
    expect(queries[2].values).toEqual([[A, B]]);
    expect(queries[3].sql).toMatch(/purchase_order_line[\s\S]*ORDER BY l\.id FOR NO KEY UPDATE OF l/);
    expect(updates).toHaveLength(2);
    expect(updates[0].sql).toMatch(/UPDATE "partner"\."memo_stock"[\s\S]*pending_pcs = s\.pending_pcs - r\.in_pcs[\s\S]*sold_pcs = s\.sold_pcs \+ r\.in_pcs[\s\S]*purchased_pcs = s\.purchased_pcs \+ r\.in_pcs \+ r\.sold_pcs/);
    // A: IN_STOCK 1 / 0.5 and SOLD 3 / 3 in one VALUES row; B: IN_STOCK 2 / 2.
    expect(updates[0].values).toEqual([now, A, 1, "0.500", 3, "3.000", B, 2, "2.000", 0, "0.000"]);
    expect(updates[1].sql).toMatch(/UPDATE "partner"\."purchase_order_line"[\s\S]*purchased_pcs = o\.purchased_pcs \+ r\.pcs/);
    expect(updates[1].values).toEqual([P, 8, "8.000"]);
    for (const sql of [...queries, ...updates]) {
      for (const value of [A, B, P, VENDOR]) expect(sql.sql).not.toContain(value);
    }
  });

  it("reports every short line (IN_STOCK > pending, SOLD > sold − purchased, PO > ordered − purchased) and updates nothing", async () => {
    const { tx, updates } = fakeTx([item(A, { pending_pcs: 2, pending_weight_ct: "1.000" })], [poLine()]);
    const error = await shortFields(takeForPurchase(tx, scope, [
      take({ pcs: 1, weightCt: D("0.6"), index: 0 }),
      take({ pcs: 2, weightCt: D("0.6"), index: 3 }), // with line 0: 3 pcs > 2 pending, 1.2 ct > 1 ct
      take({ memoGroup: "SOLD", pcs: 4, weightCt: D("3"), index: 1 }), // sold − purchased = 3 pcs / 3 ct
      take({ source: "PURCHASE_ORDER", memoStockId: null, memoGroup: null, purchaseOrderLineId: P, pcs: 8, weightCt: D("8.001"), index: 2 }),
    ], purchasePendingShort, now));
    expect(error.code).toBe("PURCHASE_PENDING_SHORT");
    expect(error.fieldErrors).toEqual([
      { path: "lines.0.pcs", code: "exceeds_available" },
      { path: "lines.0.weightCt", code: "exceeds_available" },
      { path: "lines.1.pcs", code: "exceeds_available" },
      { path: "lines.2.weightCt", code: "exceeds_available" },
      { path: "lines.3.pcs", code: "exceeds_available" },
      { path: "lines.3.weightCt", code: "exceeds_available" },
    ]);
    expect(updates).toHaveLength(0);
  });

  it("a missing item, or a PO that is no longer approved / of another vendor or currency, is short too", async () => {
    const missing = fakeTx([]);
    expect((await shortFields(takeForPurchase(missing.tx, scope, [take({ index: 0 })], purchasePendingShort, now))).fieldErrors)
      .toEqual([{ path: "lines.0.pcs", code: "exceeds_available" }, { path: "lines.0.weightCt", code: "exceeds_available" }]);
    for (const patch of [{ status: "PENDING_APPROVAL" }, { vendor_id: "00000000-0000-4000-8000-000000000002" }, { currency_code: "USD" }]) {
      const po = fakeTx([], [poLine(patch)]);
      const result = await shortFields(takeForPurchase(po.tx, scope, [take({ source: "PURCHASE_ORDER", memoStockId: null, memoGroup: null, purchaseOrderLineId: P, index: 0 })], purchasePendingShort, now));
      expect(result.fieldErrors).toEqual([{ path: "lines.0.purchaseOrderLineId", code: "invalid_reference" }]);
      expect(po.updates).toHaveLength(0);
    }
  });

  it("a purchase with only manual lines locks and moves nothing", async () => {
    const { tx, queries, updates } = fakeTx([]);
    expect(await takeForPurchase(tx, scope, [take({ source: "MANUAL", memoStockId: null, memoGroup: null })], purchasePendingShort, now)).toEqual({ memoStockKeys: 0, purchaseOrderKeys: 0, soldParts: [] });
    expect(queries).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("exactly the available quantity passes (boundary)", async () => {
    const { tx, updates } = fakeTx([item(A)], [poLine()]);
    await takeForPurchase(tx, scope, [
      take({ pcs: 5, weightCt: D("5"), index: 0 }),
      take({ memoGroup: "SOLD", pcs: 3, weightCt: D("3"), index: 1 }),
      take({ source: "PURCHASE_ORDER", memoStockId: null, memoGroup: null, purchaseOrderLineId: P, pcs: 8, weightCt: D("8"), index: 2 }),
    ], purchasePendingShort, now);
    expect(updates).toHaveLength(2);
  });
});

describe("merged Memo Stock lines (UT-PU-B06, SA-PU-22/23, ADR-0043)", () => {
  const stored = { pendingPcs: 1, pendingWeightCt: D("0.76"), soldPcs: 1, soldWeightCt: D("0.76"), purchasedPcs: 0, purchasedWeightCt: D("0") };

  it("line ranges: IN_STOCK 0…pending, SOLD exactly the Sold part, MERGED Sold part…Sold + pending", () => {
    expect(memoLineRange(stored, "IN_STOCK")).toEqual({ min: null, max: { pcs: 1, weightCt: D("0.76") } });
    expect(memoLineRange(stored, "SOLD")).toEqual({ min: { pcs: 1, weightCt: D("0.76") }, max: { pcs: 1, weightCt: D("0.76") } });
    expect(memoLineRange(stored, "MERGED")).toEqual({ min: { pcs: 1, weightCt: D("0.76") }, max: { pcs: 2, weightCt: D("1.52") } });
  });

  it("approve takes the Sold part first and the rest from pending, in the one bulk UPDATE; returns the Sold part per line", async () => {
    // A: sold − purchased = 3 pcs / 3 ct, pending 5 / 5. The merged line buys 4 / 3.5 → Sold 3 / 3 + In stock 1 / 0.5.
    const { tx, updates } = fakeTx([item(A)]);
    const result = await takeForPurchase(tx, scope, [take({ memoGroup: "MERGED", pcs: 4, weightCt: D("3.5"), index: 2 })], purchasePendingShort, now);
    expect(result.soldParts).toEqual([{ index: 2, pcs: 3, weightCt: D("3") }]);
    expect(result.memoStockKeys).toBe(2);
    expect(updates).toHaveLength(1);
    expect(updates[0].values).toEqual(expect.arrayContaining([A, 1, "0.500", 3, "3.000"]));
  });

  it("exactly the Sold part buys nothing from stock (owner example: keep 1 of Sold 1 + In stock 1)", async () => {
    const { tx, updates } = fakeTx([item(A, { sold_pcs: 1, sold_weight_ct: "0.760", purchased_pcs: 0, purchased_weight_ct: "0.000", pending_pcs: 1, pending_weight_ct: "0.760" })]);
    const result = await takeForPurchase(tx, scope, [take({ memoGroup: "MERGED", pcs: 1, weightCt: D("0.76") })], purchasePendingShort, now);
    expect(result.soldParts).toEqual([{ index: 0, pcs: 1, weightCt: D("0.76") }]);
    expect(updates[0].values).toEqual(expect.arrayContaining([A, 0, "0.000", 1, "0.760"]));
  });

  it("below the current Sold part or above Sold + pending is short and updates nothing (Q-PU-33)", async () => {
    const below = fakeTx([item(A)]);
    expect(await shortFields(takeForPurchase(below.tx, scope, [take({ memoGroup: "MERGED", pcs: 2, weightCt: D("4") })], purchasePendingShort, now))).toMatchObject({
      code: "PURCHASE_PENDING_SHORT", fieldErrors: [{ path: "lines.0.pcs", code: "below_sold" }],
    });
    expect(below.updates).toHaveLength(0);
    const above = fakeTx([item(A)]);
    expect(await shortFields(takeForPurchase(above.tx, scope, [take({ memoGroup: "MERGED", pcs: 9, weightCt: D("8.001") })], purchasePendingShort, now))).toMatchObject({
      fieldErrors: [{ path: "lines.0.pcs", code: "exceeds_available" }, { path: "lines.0.weightCt", code: "exceeds_available" }],
    });
    expect(above.updates).toHaveLength(0);
    const missing = fakeTx([]);
    expect((await shortFields(takeForPurchase(missing.tx, scope, [take({ memoGroup: "MERGED" })], purchasePendingShort, now))).fieldErrors).toHaveLength(2);
  });

  it("totalsPerKey keeps MERGED apart from SOLD and IN_STOCK", () => {
    const totals = totalsPerKey([take({ memoGroup: "MERGED", index: 0 }), take({ memoStockId: B, memoGroup: "SOLD", index: 1 })]);
    expect([...totals.merged.keys()]).toEqual([A]);
    expect([...totals.sold.keys()]).toEqual([B]);
    expect(totals.inStock.size).toBe(0);
  });
});
