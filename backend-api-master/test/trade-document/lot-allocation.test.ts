import { describe, expect, it } from "vitest";
import { Prisma } from "../../src/generated/prisma/client";
import { allocateFifo, releaseNewestFirst, settleOldestFirst, splitPurchaseLot, type Candidate } from "../../src/trade-document/lot-allocation";
import { decodeLotCursor, encodeLotCursor, isLotKey, itemReferenceErrors, lotSource } from "../../src/trade-document/lot-key";
import { planMemoStockTakes, type LockedStock } from "../../src/trade-document/lot-apply";
import { decodeLotSectionCursor, ownFirstLotPage, type LotGroupRow } from "../../src/trade-document/lot-stock.service";
import { expandConsumption } from "../../src/inventory-internal/sale-consumption";

/**
 * lot-based-stock SA rev 1 testing.md UT-LOT-01…05 (BE-LOT-002/003/006): lot key + cursor, FIFO allocation (property
 * test, 1,000 random cases), release newest first, settle oldest first, Purchase lot split, the apply planner, the
 * own-first lot page and the Sale consumption expansion. Pure: no database.
 */
const D = (value: string | number) => new Prisma.Decimal(value);
const ML = `ML${"a".repeat(32)}`;
const MS = "MS0193f5c2-7a3e-7b6e-9a10-1234567890ab";
const OL = `OL${"b".repeat(32)}`;
const cand = (id: string, stockId: string, refDate: string, pcs: number, weight: string): Candidate => ({ id, stockId, refDate, pcs, weight: D(weight) });

describe("UT-LOT-01 lot key and cursor", () => {
  it("accepts only the four generated shapes and tells the source from the prefix", () => {
    expect([ML, MS, OL, `OS${MS.slice(2)}`].every(isLotKey)).toBe(true);
    expect(["", "ML123", `MX${"a".repeat(32)}`, `ML${"A".repeat(32)}`, `ML${"a".repeat(33)}`, "MS not-a-uuid", "260001"].some(isLotKey)).toBe(false);
    expect(lotSource(ML)).toBe("STOCK");
    expect(lotSource(OL)).toBe("OWN_STOCK");
  });
  it("cursor round trip; tampered or malformed → VALIDATION_ERROR cursor invalid", () => {
    const cursor = encodeLotCursor("2026-11-20", ML);
    expect(decodeLotCursor(cursor)).toEqual({ date: "2026-11-20", lotKey: ML });
    // INV-20261121-002 H3: impossible calendar dates are refused (400 VALIDATION_ERROR) like malformed cursors.
    for (const day of ["2026-02-31", "2026-04-31", "2026-02-29"]) expect(() => decodeLotCursor(encodeLotCursor(day, ML))).toThrow();
    expect(decodeLotCursor(encodeLotCursor("2028-02-29", ML)).date).toBe("2028-02-29");
    for (const bad of ["!!", Buffer.from("2026-13-40|x").toString("base64url"), Buffer.from(`2026-11-20|${"z".repeat(34)}`).toString("base64url"), "a".repeat(201)]) {
      expect(() => decodeLotCursor(bad)).toThrow();
    }
  });
  it("fromStock.lots section cursor: own first, then Memo Stock", () => {
    expect(decodeLotSectionCursor(null)).toEqual({ section: "own", cursor: undefined });
    expect(decodeLotSectionCursor("m:")).toEqual({ section: "memo", after: undefined });
    const c = encodeLotCursor("2026-11-01", ML);
    expect(decodeLotSectionCursor(`m:${c}`)).toEqual({ section: "memo", after: { date: "2026-11-01", lotKey: ML } });
    expect(decodeLotSectionCursor(`o:${c}`)).toEqual({ section: "own", cursor: c });
    expect(() => decodeLotSectionCursor("o:@@")).toThrow();
  });
  it("own-first page: more own rows than the limit → own only; else own then Memo Stock", () => {
    const row = (key: string, date: string, source: "OWN_STOCK" | "MEMO_STOCK") => ({ lotKey: key, source, ref: { type: "LOAD", id: "x", docNo: "x", docDate: date } }) as unknown as LotGroupRow;
    const own = [row(OL, "2026-11-03", "OWN_STOCK"), row(`OL${"c".repeat(32)}`, "2026-11-02", "OWN_STOCK"), row(`OL${"d".repeat(32)}`, "2026-11-01", "OWN_STOCK")];
    const first = ownFirstLotPage(own, null, 2);
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor?.startsWith("o:")).toBe(true);
    const mixed = ownFirstLotPage(own.slice(0, 1), { items: [row(ML, "2026-11-05", "MEMO_STOCK")], nextCursor: "abc" }, 2);
    expect(mixed.items.map((item) => item.source)).toEqual(["OWN_STOCK", "MEMO_STOCK"]);
    expect(mixed.nextCursor).toBe("m:abc");
    expect(ownFirstLotPage(own.slice(0, 2), { items: [row(ML, "2026-11-05", "MEMO_STOCK")], nextCursor: null }, 2).nextCursor).toBe("m:");
  });
  it("legacy rule: a new item reference → lot_required once item ids are switched off; a stored item stays", () => {
    const stored = { memoStockIds: new Set(["m1"]), ownStockIds: new Set<string>() };
    expect(itemReferenceErrors([{ memoStockId: "m1" }, { memoStockId: "m2" }, { lotKey: ML }], stored, false)).toEqual([{ path: "lines.1.reference", code: "lot_required" }]);
    expect(itemReferenceErrors([{ memoStockId: "m2" }], stored, true)).toEqual([]);
    expect(itemReferenceErrors([{ lotKey: ML, memoStockId: "m1" }], stored, true)).toEqual([{ path: "lines.0.reference", code: "invalid" }]);
  });
});

describe("UT-LOT-02 allocateFifo", () => {
  it("owner example: rows 2 / 3 / 4 pcs, request 5 → the two oldest (2 + 3); order (date, Stock ID)", () => {
    const rows = [cand("c", "260003", "2026-11-03", 4, "2"), cand("b", "260002", "2026-11-01", 3, "1.5"), cand("a", "260001", "2026-11-01", 2, "1")];
    const result = allocateFifo(rows, { pcs: 5, weight: D("2.5") });
    expect(result).toEqual({ ok: true, rows: [{ id: "a", stockId: "260001", pcs: 2, weight: D(1) }, { id: "b", stockId: "260002", pcs: 3, weight: D("1.5") }] });
  });
  it("pcs-only and weight-only requests; short returns the group's available", () => {
    const rows = [cand("a", "1", "2026-01-01", 2, "1"), cand("b", "2", "2026-01-02", 3, "0")];
    expect(allocateFifo(rows, { pcs: 4, weight: D(0) })).toEqual({ ok: true, rows: [{ id: "a", stockId: "1", pcs: 2, weight: D(0) }, { id: "b", stockId: "2", pcs: 2, weight: D(0) }] });
    expect(allocateFifo(rows, { pcs: 0, weight: D("0.5") })).toEqual({ ok: true, rows: [{ id: "a", stockId: "1", pcs: 0, weight: D("0.5") }] });
    const short = allocateFifo(rows, { pcs: 6, weight: D(0) });
    expect(short.ok).toBe(false);
    if (!short.ok) expect([short.available.pcs, short.available.weight.toFixed(3)]).toEqual([5, "1.000"]);
  });
  it("property (1,000 random cases): Σ = request, each ≤ its available, deterministic, FIFO prefix", () => {
    let seed = 7;
    const rand = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
    for (let run = 0; run < 1000; run += 1) {
      const rows = Array.from({ length: 1 + rand(8) }, (_, i) => cand(`r${i}`, `26${String(1000 + rand(9000))}${i}`, `2026-0${1 + rand(9)}-1${rand(9)}`, rand(6), (rand(5000) / 1000).toFixed(3)));
      const totalPcs = rows.reduce((sum, row) => sum + row.pcs, 0);
      const totalWeight = rows.reduce((sum, row) => sum.plus(row.weight), D(0));
      const want = { pcs: rand(totalPcs + 2), weight: D((rand(Math.round(totalWeight.toNumber() * 1000) + 2) / 1000).toFixed(3)) };
      const a = allocateFifo(rows, want);
      const b = allocateFifo([...rows].reverse(), want);
      expect(a).toEqual(b);
      if (want.pcs > totalPcs || want.weight.gt(totalWeight)) {
        expect(a.ok).toBe(false);
        continue;
      }
      expect(a.ok).toBe(true);
      if (!a.ok) continue;
      expect(a.rows.reduce((sum, row) => sum + row.pcs, 0)).toBe(want.pcs);
      expect(a.rows.reduce((sum, row) => sum.plus(row.weight), D(0)).equals(want.weight)).toBe(true);
      const byId = new Map(rows.map((row) => [row.id, row]));
      for (const row of a.rows) {
        expect(row.pcs).toBeLessThanOrEqual(byId.get(row.id)!.pcs);
        expect(row.weight.lte(byId.get(row.id)!.weight)).toBe(true);
      }
    }
  });
});

describe("UT-LOT-03/04 release newest first, settle oldest first", () => {
  const allocs = [
    { id: "x1", seq: 1, pcs: 2, weight: D(1), settledPcs: 1, settledWeight: D("0.5") },
    { id: "x2", seq: 2, pcs: 3, weight: D("1.5"), settledPcs: 0, settledWeight: D(0) },
  ];
  it("release gives back unsettled only, newest seq first; never below settled", () => {
    expect(releaseNewestFirst(allocs, { pcs: 4, weight: D(2) })).toEqual([{ id: "x2", pcs: 3, weight: D("1.5") }, { id: "x1", pcs: 1, weight: D("0.5") }]);
    expect(releaseNewestFirst(allocs, { pcs: 5, weight: D(0) })).toBeNull();
  });
  it("settle takes oldest seq first; never above qty − settled", () => {
    expect(settleOldestFirst(allocs, { pcs: 2, weight: D(1) })).toEqual([{ id: "x1", pcs: 1, weight: D("0.5") }, { id: "x2", pcs: 1, weight: D("0.5") }]);
    expect(settleOldestFirst(allocs, { pcs: 0, weight: D(3) })).toBeNull();
  });
});

describe("UT-LOT-05 Purchase lot split (ADR-0043 per lot)", () => {
  const rows = [
    { id: "a", stockId: "1", refDate: "2026-01-01", soldOpen: { pcs: 1, weight: D("0.5") }, pending: { pcs: 2, weight: D(1) } },
    { id: "b", stockId: "2", refDate: "2026-01-02", soldOpen: { pcs: 2, weight: D(1) }, pending: { pcs: 3, weight: D("1.5") } },
  ];
  it("SOLD takes exactly the lot's sold-open total FIFO; anything else → must_equal_sold", () => {
    const sold = splitPurchaseLot(rows, "SOLD", { pcs: 3, weight: D("1.5") });
    expect(sold.ok && sold.rows.map((row) => [row.id, row.part, row.pcs])).toEqual([["a", "SOLD", 1], ["b", "SOLD", 2]]);
    expect(splitPurchaseLot(rows, "SOLD", { pcs: 2, weight: D("1.5") })).toMatchObject({ ok: false, code: "must_equal_sold" });
  });
  it("MERGED takes the sold part first, then pending FIFO; below the sold part → below_sold", () => {
    const merged = splitPurchaseLot(rows, "MERGED", { pcs: 5, weight: D("2.5") });
    expect(merged.ok && merged.rows.map((row) => [row.id, row.part, row.pcs])).toEqual([["a", "SOLD", 1], ["b", "SOLD", 2], ["a", "IN_STOCK", 2]]);
    expect(merged.ok && merged.soldPart.pcs).toBe(3);
    expect(splitPurchaseLot(rows, "MERGED", { pcs: 2, weight: D(2) })).toMatchObject({ ok: false, code: "below_sold" });
  });
  it("IN_STOCK takes pending only; above → exceeds_available", () => {
    const taken = splitPurchaseLot(rows, "IN_STOCK", { pcs: 4, weight: D(2) });
    expect(taken.ok && taken.rows.map((row) => [row.id, row.part, row.pcs, row.weight.toFixed(1)])).toEqual([["a", "IN_STOCK", 2, "1.0"], ["b", "IN_STOCK", 2, "1.0"]]);
    expect(splitPurchaseLot(rows, "IN_STOCK", { pcs: 6, weight: D(0) })).toMatchObject({ ok: false, code: "exceeds_available" });
  });
});

describe("apply planner and Sale consumption expansion", () => {
  const locked = (id: string, stockId: string, lotKey: string, refDate: string, pcs: number): LockedStock => ({
    id, stockId, lotKey, refDate, vendorId: "v", currency: "THB", pendingPcs: pcs, pendingWeight: D(pcs), reservedPcs: 0, reservedWeight: D(0), soldPcs: 0, soldWeight: D(0), purchasedPcs: 0, purchasedWeight: D(0),
  });
  it("legacy lines take their item first; a lot line then gets what is left FIFO; short lines list the lot's available", () => {
    const rows = [locked("s1", "1", ML, "2026-01-01", 2), locked("s2", "2", ML, "2026-01-02", 3)];
    const plan = planMemoStockTakes([
      { lineId: "L0", index: 0, memoStockId: "s1", lotKey: null, pcs: 1, weight: D(1) },
      { lineId: "L1", index: 1, memoStockId: null, lotKey: ML, pcs: 3, weight: D(3) },
    ], rows, (row) => ({ pcs: row.pendingPcs, weight: row.pendingWeight }));
    expect(plan.ok && plan.rows.map((row) => [row.lineId, row.memoStockId, row.pcs, row.seq])).toEqual([["L0", "s1", 1, 1], ["L1", "s1", 1, 1], ["L1", "s2", 2, 2]]);
    const short = planMemoStockTakes([{ lineId: "L1", index: 4, memoStockId: null, lotKey: ML, pcs: 9, weight: D(0) }], rows, (row) => ({ pcs: row.pendingPcs, weight: row.pendingWeight }));
    expect(short).toEqual({ ok: false, short: [{ index: 4, lotKey: ML, availablePcs: 5, availableWeightCt: "5.000" }] });
  });
  it("Sale v2: a lot line is allocated FIFO; an unchanged applied line keeps its rows; a lot Reserve line settles oldest first", () => {
    const candidates = [{ id: "s1", stockId: "1", lotKey: ML, refDate: "2026-01-01", pendingPcs: 2, pendingWeight: D(1) }, { id: "s2", stockId: "2", lotKey: ML, refDate: "2026-01-02", pendingPcs: 3, pendingWeight: D("1.5") }];
    const first = expandConsumption({ lines: [{ lineId: "l1", source: "STOCK", lotKey: ML, pcs: 3, weightCt: "1.5" }], applied: [], appliedLot: new Map(), candidates, reserveAllocs: new Map(), reserveItem: new Map() });
    expect(first.rows.map((row) => [row.memoStockId, row.pcs, row.weightCt])).toEqual([["s1", 2, "1.000"], ["s2", 1, "0.500"]]);
    const replay = expandConsumption({ lines: [{ lineId: "l1", source: "STOCK", lotKey: ML, pcs: 3, weightCt: "1.5" }], applied: first.rows, appliedLot: new Map([["l1", ML]]), candidates: [], reserveAllocs: new Map(), reserveItem: new Map() });
    expect(replay.rows).toEqual(first.rows);
    const reserve = expandConsumption({
      lines: [{ lineId: "l2", source: "RESERVE", reserveLineId: "rl", pcs: 2, weightCt: "0" }], applied: [], appliedLot: new Map(), candidates: [],
      reserveAllocs: new Map([["rl", [{ id: "a1", seq: 1, pcs: 1, weight: D(0), settledPcs: 0, settledWeight: D(0), memoStockId: "s1" }, { id: "a2", seq: 2, pcs: 4, weight: D(0), settledPcs: 0, settledWeight: D(0), memoStockId: "s2" }]]]),
      reserveItem: new Map([["rl", null]]),
    });
    expect(reserve.rows.map((row) => [row.memoStockId, row.pcs])).toEqual([["s1", 1], ["s2", 1]]);
    const short = expandConsumption({ lines: [{ lineId: "l1", source: "STOCK", lotKey: ML, pcs: 9, weightCt: "0" }], applied: [], appliedLot: new Map(), candidates, reserveAllocs: new Map(), reserveItem: new Map() });
    expect(short.short).toEqual([{ lineId: "l1", field: "pcs", code: "exceeds_pending", availablePcs: 5, availableWeightCt: "2.500" }]);
  });
});
