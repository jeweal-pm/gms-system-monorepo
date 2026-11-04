import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { Tx } from "../../src/common/persistence";
import { Prisma } from "../../src/generated/prisma/client";
import { purchasePendingShort } from "../../src/purchase/purchase.errors";
import { takeForPurchase, totalsPerKey, type PurchaseTake } from "../../src/purchase/purchase-stock";

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

  it("locks memo_stock then purchase_order_line in id order and runs one UPDATE per table with bound values only", async () => {
    const { tx, queries, updates } = fakeTx([item(A), item(B)], [poLine()]);
    const moved = await takeForPurchase(tx, scope, [
      take({ memoStockId: B, pcs: 2, weightCt: D("2"), index: 0 }),
      take({ memoStockId: A, memoGroup: "SOLD", pcs: 3, weightCt: D("3"), index: 1 }),
      take({ memoStockId: A, pcs: 1, weightCt: D("0.5"), index: 2 }),
      take({ source: "PURCHASE_ORDER", memoStockId: null, memoGroup: null, purchaseOrderLineId: P, pcs: 8, weightCt: D("8"), index: 3 }),
    ], purchasePendingShort, now);
    expect(moved).toEqual({ memoStockKeys: 3, purchaseOrderKeys: 1 });
    expect(queries).toHaveLength(2);
    expect(queries[0].sql).toMatch(/FROM "partner"\."memo_stock"[\s\S]*ORDER BY id FOR UPDATE/);
    expect(queries[0].values).toEqual([[A, B]]);
    expect(queries[1].sql).toMatch(/purchase_order_line[\s\S]*ORDER BY l\.id FOR UPDATE OF l/);
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
    expect(await takeForPurchase(tx, scope, [take({ source: "MANUAL", memoStockId: null, memoGroup: null })], purchasePendingShort, now)).toEqual({ memoStockKeys: 0, purchaseOrderKeys: 0 });
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
