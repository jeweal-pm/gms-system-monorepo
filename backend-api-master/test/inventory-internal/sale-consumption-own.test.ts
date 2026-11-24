import { describe, expect, it } from "vitest";
import { Prisma } from "../../src/generated/prisma/client";
import { expandOwnReserve, ownDeltas, type OwnAllocRow, type OwnUse } from "../../src/inventory-internal/sale-consumption-own";
import { packCaps, unpackAllocations } from "../../src/inventory-internal/sale-consumption";

/** UT-SO-M01 (ADR-0058 phase B): a Sale line over an own-stock Reserve line settles the Reserve allocation oldest seq first. Pure. */
const D = (value: string | number) => new Prisma.Decimal(value);
const RL = "c0000000-0000-4000-8000-000000000001";
const S1 = "a0000000-0000-4000-8000-000000000001";
const S2 = "a0000000-0000-4000-8000-000000000002";
const LINE = "d0000000-0000-4000-8000-000000000001";
const alloc = (id: string, seq: number, stock: string, pcs: number, weight: string, settledPcs = 0, settledWeight = "0"): OwnAllocRow =>
  ({ id, lineId: RL, seq, ownStockId: stock, stockId: stock === S1 ? "T0000001" : "T0000002", pcs, weight: D(weight), settledPcs, settledWeight: D(settledWeight) });
const allocs = new Map([[RL, [alloc("x1", 1, S1, 3, "1.5"), alloc("x2", 2, S2, 4, "2")]]]);
const request = (pcs: number, weightCt: string) => ({ lineId: LINE, reserveLineId: RL, pcs, weightCt });

describe("UT-SO-M01 own-stock Reserve settlement", () => {
  it("settles oldest seq first across two own stocks", () => {
    const { rows, short } = expandOwnReserve([request(5, "2.5")], [], allocs);
    expect(short).toEqual([]);
    expect(rows.map((row) => [row.ownStockId, row.pcs, row.weightCt])).toEqual([[S1, 3, "1.500"], [S2, 2, "1.000"]]);
  });

  it("an edit counts this line's own applied quantity as open again; an unchanged line keeps its rows", () => {
    const applied: OwnUse[] = [{ lineId: LINE, reserveLineId: RL, ownStockId: S1, stockId: "T0000001", pcs: 3, weightCt: "1.500" }];
    const settled = new Map([[RL, [alloc("x1", 1, S1, 3, "1.5", 3, "1.5"), alloc("x2", 2, S2, 4, "2")]]]);
    expect(expandOwnReserve([request(3, "1.500")], applied, settled).rows).toEqual(applied);
    const more = expandOwnReserve([request(5, "2.5")], applied, settled);
    expect(more.rows.map((row) => [row.ownStockId, row.pcs])).toEqual([[S1, 3], [S2, 2]]);
  });

  it("over the open quantity is short (exceeds_open) with what is open", () => {
    const { rows, short } = expandOwnReserve([request(8, "4")], [], allocs);
    expect(rows).toEqual([]);
    expect(short).toEqual([{ lineId: LINE, field: "pcs", code: "exceeds_open", availablePcs: 7, availableWeightCt: "3.500" }]);
  });

  it("deltas: desired minus applied per Reserve line and per own stock; a release is negative", () => {
    const row = (stock: string, pcs: number, weight: string): OwnUse => ({ lineId: LINE, reserveLineId: RL, ownStockId: stock, stockId: "T", pcs, weightCt: weight });
    const up = ownDeltas([row(S1, 3, "1.500"), row(S2, 2, "1.000")], [row(S1, 3, "1.500")]);
    expect(up.reserve.map((d) => [d.reserveLineId, d.pcs, d.weight.toFixed(3)])).toEqual([[RL, 2, "1.000"]]);
    expect(up.settle.map((d) => [d.stock, d.pcs])).toEqual([[S2, 2]]);
    const release = ownDeltas([], [row(S1, 3, "1.500")]);
    expect(release.reserve.map((d) => [d.pcs, d.weight.toFixed(3)])).toEqual([[-3, "-1.500"]]);
  });

  it("stored result keeps the own marker of an allocation row", () => {
    const stored = packCaps([], [{ lineId: LINE, rows: [{ seq: 1, source: "OWN_STOCK", stockUuid: S1, stockId: "T0000001", pcs: 3, weightCt: "1.500", settledPcs: 0, settledWeightCt: "0.000" }] }]);
    expect(unpackAllocations(stored)[0].rows[0]).toMatchObject({ source: "OWN_STOCK", stockUuid: S1, pcs: 3 });
  });
});
