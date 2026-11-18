import { HttpException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { Prisma } from "../../src/generated/prisma/client";
import { allocationException, allocationHash, packResult, planAllocation, unpackResult, type LockedLine } from "../../src/inventory-internal/allocation";
import { allocationPutSchema } from "../../src/inventory-internal/inventory-internal.schemas";

/** UT-LS-B08 (BE-LS-004, ADR-0052 D4): delta planning, remaining checks and the replay hash. */
const D = (value: string | number) => new Prisma.Decimal(value);
const V = "0193a000-0000-7000-8000-000000000001";
const L1 = "0193a000-0000-7000-8000-0000000000a1";
const L2 = "0193a000-0000-7000-8000-0000000000a2";
const line = (id: string, patch: Partial<LockedLine> = {}): LockedLine => ({
  id, purchaseId: "p", source: "MANUAL", pcs: 10, weightCt: D("5"), loadedPcs: 0, loadedWeightCt: D(0), ownPcs: 0, ownWeightCt: D(0),
  purchaseStatus: "APPROVED", purchaseDeleted: false, vendorId: V, ...patch,
});

describe("planAllocation", () => {
  it("new allocation: delta = wanted; remaining after = qty − loaded (owner example: 7 of 10 leaves 3)", () => {
    const plan = planAllocation(V, [{ purchaseLineId: L1, pcs: 7, weightCt: "3.5" }], [line(L1)]);
    expect(plan).toEqual({ ok: true, deltas: [{ purchaseLineId: L1, pcs: 7, weightCt: D("3.5") }], after: [{ purchaseLineId: L1, remainingPcs: 3, remainingWeightCt: "1.500" }] });
  });

  it("edit: delta old → new per line; a removed line is released; an unchanged line has no delta", () => {
    const locked = [line(L1, { loadedPcs: 7, loadedWeightCt: D("3.5"), ownPcs: 7, ownWeightCt: D("3.5") }), line(L2, { loadedPcs: 2, loadedWeightCt: D(1), ownPcs: 2, ownWeightCt: D(1) })];
    const plan = planAllocation(V, [{ purchaseLineId: L1, pcs: 5, weightCt: "2.5" }], locked);
    expect(plan.ok && plan.deltas).toEqual([{ purchaseLineId: L1, pcs: -2, weightCt: D(-1) }, { purchaseLineId: L2, pcs: -2, weightCt: D(-1) }]);
    expect(plan.ok && plan.after).toEqual([{ purchaseLineId: L1, remainingPcs: 5, remainingWeightCt: "2.500" }, { purchaseLineId: L2, remainingPcs: 10, remainingWeightCt: "5.000" }]);
    const same = planAllocation(V, [{ purchaseLineId: L1, pcs: 7, weightCt: "3.500" }], [locked[0]]);
    expect(same.ok && same.deltas).toEqual([]);
  });

  it("over remaining (pcs or weight) → 409 with the remaining this load may take (own counted back)", () => {
    const locked = [line(L1, { loadedPcs: 9, loadedWeightCt: D("4"), ownPcs: 2, ownWeightCt: D("1") })];
    expect(planAllocation(V, [{ purchaseLineId: L1, pcs: 4, weightCt: "1" }], locked)).toEqual({
      ok: false, status: 409, code: "LOAD_ALLOCATION_EXCEEDS_REMAINING", lines: [{ purchaseLineId: L1, remainingPcs: 3, remainingWeightCt: "2.000" }],
    });
    expect(planAllocation(V, [{ purchaseLineId: L1, pcs: 3, weightCt: "2.001" }], locked)).toMatchObject({ ok: false, code: "LOAD_ALLOCATION_EXCEEDS_REMAINING" });
    expect(planAllocation(V, [{ purchaseLineId: L1, pcs: 3, weightCt: "2" }], locked)).toMatchObject({ ok: true });
  });

  it("a new line that is missing, not approved, deleted, STOCK or of another vendor → 422 LINE_UNAVAILABLE; releasing such a line is allowed", () => {
    for (const patch of [{ purchaseStatus: "DRAFT" }, { purchaseDeleted: true }, { source: "STOCK" }, { vendorId: "other" }]) {
      expect(planAllocation(V, [{ purchaseLineId: L1, pcs: 1, weightCt: "0" }], [line(L1, patch)])).toEqual({ ok: false, status: 422, code: "LOAD_ALLOCATION_LINE_UNAVAILABLE", purchaseLineIds: [L1] });
    }
    expect(planAllocation(V, [{ purchaseLineId: L2, pcs: 1, weightCt: "0" }], [])).toMatchObject({ ok: false, purchaseLineIds: [L2] });
    const release = planAllocation(V, [], [line(L1, { purchaseDeleted: true, loadedPcs: 1, loadedWeightCt: D(1), ownPcs: 1, ownWeightCt: D(1) })]);
    expect(release).toMatchObject({ ok: true, deltas: [{ purchaseLineId: L1, pcs: -1 }] });
  });

  it("a ledger out of balance (own > loaded) is a bug, never a silent negative", () => {
    expect(() => planAllocation(V, [], [line(L1, { loadedPcs: 0, ownPcs: 1, ownWeightCt: D(0) })])).toThrow(/out of balance/);
  });
});

describe("allocationHash / result packing", () => {
  it("is order-insensitive and normalizes weights; any change of vendor, count or quantity changes it", () => {
    const base = { vendorId: V, newStockIdCount: 2, lines: [{ purchaseLineId: L1, pcs: 1, weightCt: "1.5" }, { purchaseLineId: L2, pcs: 2, weightCt: "2" }] };
    const hash = allocationHash(base);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(allocationHash({ ...base, lines: [{ purchaseLineId: L2, pcs: 2, weightCt: "2.000" }, { purchaseLineId: L1, pcs: 1, weightCt: "1.50" }] })).toBe(hash);
    expect(allocationHash({ ...base, newStockIdCount: 3 })).not.toBe(hash);
    expect(allocationHash({ ...base, vendorId: L1 })).not.toBe(hash);
    expect(allocationHash({ ...base, lines: [{ purchaseLineId: L1, pcs: 1, weightCt: "1.501" }, base.lines[1]] })).not.toBe(hash);
  });

  it("packs ≤ 16 KiB for 200 lines and unpacks the same values", () => {
    const lines = Array.from({ length: 200 }, (_, index) => ({ purchaseLineId: `0193a000-0000-7000-8000-${String(index).padStart(12, "0")}`, remainingPcs: 999_999, remainingWeightCt: "999999.999" }));
    const ids = Array.from({ length: 200 }, (_, index) => String(2_700_000 + index));
    const packed = packResult(ids, lines);
    expect(Buffer.byteLength(JSON.stringify(packed))).toBeLessThan(16_384);
    expect(unpackResult(packed)).toEqual({ stockIds: ids, lines });
    expect(unpackResult(null)).toEqual({ stockIds: [], lines: [] });
  });

  it("errors carry ids / quantities only", () => {
    const error = allocationException("LOAD_ALLOCATION_EXCEEDS_REMAINING", 409, { lines: [{ purchaseLineId: L1, remainingPcs: 3, remainingWeightCt: "1.000" }] });
    expect(error).toBeInstanceOf(HttpException);
    expect(error.getResponse()).toEqual({ error: { code: "LOAD_ALLOCATION_EXCEEDS_REMAINING", message: expect.any(String), details: { lines: [{ purchaseLineId: L1, remainingPcs: 3, remainingWeightCt: "1.000" }] } } });
  });

  it("input schema: strict, ≤ 200 distinct lines, no empty line, revision ≥ 1, Stock ID count 0–200", () => {
    const ok = { revision: 1, vendorId: V, lines: [{ purchaseLineId: L1, pcs: 1, weightCt: "0" }], newStockIdCount: 1 };
    expect(allocationPutSchema.safeParse(ok).success).toBe(true);
    expect(allocationPutSchema.safeParse({ ...ok, lines: [] }).success).toBe(true);
    expect(allocationPutSchema.safeParse({ ...ok, revision: 0 }).success).toBe(false);
    expect(allocationPutSchema.safeParse({ ...ok, newStockIdCount: 201 }).success).toBe(false);
    expect(allocationPutSchema.safeParse({ ...ok, lines: [ok.lines[0], ok.lines[0]] }).success).toBe(false);
    expect(allocationPutSchema.safeParse({ ...ok, lines: [{ purchaseLineId: L1, pcs: 0, weightCt: "0" }] }).success).toBe(false);
    expect(allocationPutSchema.safeParse({ ...ok, lines: [{ purchaseLineId: L1, pcs: 1, weightCt: 1.5 }] }).success).toBe(false);
    expect(allocationPutSchema.safeParse({ ...ok, actor: "x" }).success).toBe(false);
  });
});
