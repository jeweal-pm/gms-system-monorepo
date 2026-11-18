import { describe, expect, it } from "vitest";
import { Prisma } from "../../src/generated/prisma/client";
import { numberingResolveSchema, saleConsumptionPutSchema, salePrepareSchema, saleReserveLineSearchSchema } from "../../src/inventory-internal/inventory-internal.schemas";
import { consumptionHash, packCaps, planConsumption, unpackCaps, type ConsumptionLine, type LockedItem, type LockedReserveLine } from "../../src/inventory-internal/sale-consumption";

/**
 * UT-SL-M01 (sale SA rev 1 testing.md): the consumption delta planner (increases / decreases per line, summed per item,
 * open / pending / in-use checks, caps) and the internal input schemas (BE-SL-002). Pure: no database.
 */
const D = (value: string | number) => new Prisma.Decimal(value);
const CUSTOMER = "11111111-1111-4111-8111-111111111111";
const ITEM_A = "a0000000-0000-4000-8000-000000000001";
const ITEM_B = "b0000000-0000-4000-8000-000000000002";
const RL_1 = "c0000000-0000-4000-8000-000000000001";
const RL_2 = "c0000000-0000-4000-8000-000000000002";
const LINE_1 = "d0000000-0000-4000-8000-000000000001";
const LINE_2 = "d0000000-0000-4000-8000-000000000002";
const sale = { customerId: CUSTOMER, currency: "USD" };

const item = (id: string, patch: Partial<LockedItem> = {}): LockedItem => ({
  id, stockId: id === ITEM_A ? "260001" : "260002", pendingPcs: 5, pendingWeightCt: D("2.5"), reservedPcs: 4, reservedWeightCt: D("2"),
  soldPcs: 0, soldWeightCt: D(0), purchasedPcs: 0, purchasedWeightCt: D(0), ...patch,
});
const reserveLine = (id: string, patch: Partial<LockedReserveLine> = {}): LockedReserveLine => ({
  id, reserveId: "e0000000-0000-4000-8000-000000000001", memoStockId: ITEM_A, pcs: 4, weightCt: D("2"), soldPcs: 0, soldWeightCt: D(0),
  live: true, customerId: CUSTOMER, currency: "USD", ...patch,
});
const reserveUse = (lineId: string, reserveLineId: string, pcs: number, weightCt: string, memoStockId = ITEM_A): ConsumptionLine => ({ lineId, source: "RESERVE", reserveLineId, memoStockId, pcs, weightCt });
const stockUse = (lineId: string, memoStockId: string, pcs: number, weightCt: string): ConsumptionLine => ({ lineId, source: "STOCK", memoStockId, pcs, weightCt });

describe("UT-SL-M01 consumption planner", () => {
  it("first apply: RESERVE moves reserved → sold on its item and sold on the line; STOCK moves pending → sold; caps = open / pending + own", () => {
    const plan = planConsumption(sale, [reserveUse(LINE_1, RL_1, 3, "1.5"), stockUse(LINE_2, ITEM_B, 2, "1")], [], [reserveLine(RL_1)], [item(ITEM_A), item(ITEM_B)]);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.reserveDeltas).toEqual([{ reserveLineId: RL_1, pcs: 3, weightCt: D("1.5") }]);
    expect(plan.itemDeltas).toEqual([
      { memoStockId: ITEM_A, pendingPcs: -0, pendingWeight: D(0).negated(), reservedPcs: -3, reservedWeight: D("-1.5"), soldPcs: 3, soldWeight: D("1.5") },
      { memoStockId: ITEM_B, pendingPcs: -2, pendingWeight: D("-1"), reservedPcs: -0, reservedWeight: D(0).negated(), soldPcs: 2, soldWeight: D(1) },
    ]);
    expect(plan.caps).toEqual([{ lineId: LINE_1, capPcs: 4, capWeightCt: "2.000" }, { lineId: LINE_2, capPcs: 5, capWeightCt: "2.500" }]);
  });

  it("partial re-apply: only the delta moves (3 → 1 releases 2 to the Reserve line and back into reserved); unchanged lines move nothing", () => {
    const applied = [reserveUse(LINE_1, RL_1, 3, "1.5"), stockUse(LINE_2, ITEM_B, 2, "1")];
    const locked = [reserveLine(RL_1, { soldPcs: 3, soldWeightCt: D("1.5") })];
    const plan = planConsumption(sale, [reserveUse(LINE_1, RL_1, 1, "0.5"), stockUse(LINE_2, ITEM_B, 2, "1")], applied, locked, [item(ITEM_A, { reservedPcs: 1, reservedWeightCt: D("0.5"), soldPcs: 3, soldWeightCt: D("1.5") }), item(ITEM_B, { pendingPcs: 3, soldPcs: 2, soldWeightCt: D(1) })]);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.reserveDeltas).toEqual([{ reserveLineId: RL_1, pcs: -2, weightCt: D("-1") }]);
    expect(plan.itemDeltas).toHaveLength(1);
    expect(plan.itemDeltas[0]).toMatchObject({ memoStockId: ITEM_A, reservedPcs: 2, soldPcs: -2 });
    expect(plan.caps[0]).toEqual({ lineId: LINE_1, capPcs: 4, capWeightCt: "2.000" }); // open 1 + own 3
  });

  it("empty set releases everything; a release below purchased → IN_USE with the Stock IDs", () => {
    const applied = [stockUse(LINE_2, ITEM_B, 2, "1")];
    const ok = planConsumption(sale, [], applied, [], [item(ITEM_B, { soldPcs: 2, soldWeightCt: D(1) })]);
    expect(ok.ok && ok.itemDeltas[0]).toMatchObject({ pendingPcs: 2, soldPcs: -2 });
    const used = planConsumption(sale, [], applied, [], [item(ITEM_B, { soldPcs: 2, soldWeightCt: D(1), purchasedPcs: 1, purchasedWeightCt: D("0.5") })]);
    expect(used).toEqual({ ok: false, status: 409, code: "SALE_CONSUMPTION_IN_USE", stockIds: ["260002"] });
  });

  it("short: RESERVE above open → exceeds_open; STOCK above pending → exceeds_pending (per field, with what is available)", () => {
    const plan = planConsumption(sale, [reserveUse(LINE_1, RL_1, 5, "1"), stockUse(LINE_2, ITEM_B, 1, "9")], [], [reserveLine(RL_1, { soldPcs: 2, soldWeightCt: D(1) })], [item(ITEM_A), item(ITEM_B)]);
    expect(plan).toEqual({
      ok: false, status: 409, code: "SALE_CONSUMPTION_EXCEEDS_AVAILABLE", lines: [
        { lineId: LINE_1, field: "pcs", code: "exceeds_open", availablePcs: 2, availableWeightCt: "1.000" },
        { lineId: LINE_2, field: "weightCt", code: "exceeds_pending", availablePcs: 5, availableWeightCt: "2.500" },
      ],
    });
  });

  it("a Memo Out hold on the same item is never consumed: the Reserve line's open bounds the request even when `reserved` is larger", () => {
    // reserved 3 = Memo Out 2 + this Reserve line's open 1; asking 2 on the Reserve line is refused.
    const plan = planConsumption(sale, [reserveUse(LINE_1, RL_1, 2, "0")], [], [reserveLine(RL_1, { pcs: 1, weightCt: D(0) })], [item(ITEM_A, { reservedPcs: 3, reservedWeightCt: D(0) })]);
    expect(plan).toMatchObject({ ok: false, code: "SALE_CONSUMPTION_EXCEEDS_AVAILABLE", lines: [{ lineId: LINE_1, code: "exceeds_open", availablePcs: 1 }] });
  });

  it("unavailable: Reserve not live / other customer / other currency / other item / manual line / unknown item → LINE_UNAVAILABLE (released lines are always allowed)", () => {
    const cases: [Partial<LockedReserveLine>, string][] = [[{ live: false }, "dead"], [{ customerId: "22222222-2222-4222-8222-222222222222" }, "customer"], [{ currency: "THB" }, "currency"], [{ memoStockId: ITEM_B }, "item"], [{ memoStockId: null }, "manual"]];
    for (const [patch] of cases) {
      expect(planConsumption(sale, [reserveUse(LINE_1, RL_1, 1, "0")], [], [reserveLine(RL_1, patch)], [item(ITEM_A), item(ITEM_B)])).toEqual({ ok: false, status: 422, code: "SALE_CONSUMPTION_LINE_UNAVAILABLE", lineIds: [LINE_1] });
    }
    expect(planConsumption(sale, [stockUse(LINE_2, ITEM_B, 1, "0")], [], [], [item(ITEM_A)])).toMatchObject({ ok: false, code: "SALE_CONSUMPTION_LINE_UNAVAILABLE", lineIds: [LINE_2] });
    // A dead Reserve's line can still be released (empty desired set).
    const release = planConsumption(sale, [], [reserveUse(LINE_1, RL_1, 1, "0")], [reserveLine(RL_1, { live: false, soldPcs: 1 })], [item(ITEM_A, { soldPcs: 1 })]);
    expect(release.ok).toBe(true);
  });

  it("two lines on one item (RESERVE + STOCK) sum into one item delta; RL_2 independent", () => {
    const plan = planConsumption(sale, [reserveUse(LINE_1, RL_1, 1, "0.5"), stockUse(LINE_2, ITEM_A, 2, "1"), reserveUse("d0000000-0000-4000-8000-000000000003", RL_2, 1, "0.5")], [], [reserveLine(RL_1), reserveLine(RL_2)], [item(ITEM_A)]);
    expect(plan.ok && plan.itemDeltas).toEqual([{ memoStockId: ITEM_A, pendingPcs: -2, pendingWeight: D("-1"), reservedPcs: -2, reservedWeight: D("-1"), soldPcs: 4, soldWeight: D(2) }]);
  });

  it("hash: order-independent, sensitive to quantities and doc no; caps pack / unpack round trip", () => {
    const base = { saleDocNo: "SL-1", customerId: CUSTOMER, currency: "USD" };
    const a = consumptionHash({ ...base, lines: [reserveUse(LINE_1, RL_1, 1, "0.5"), stockUse(LINE_2, ITEM_B, 2, "1")] });
    expect(consumptionHash({ ...base, lines: [stockUse(LINE_2, ITEM_B, 2, "1.000"), reserveUse(LINE_1, RL_1, 1, "0.50")] })).toBe(a);
    expect(consumptionHash({ ...base, lines: [reserveUse(LINE_1, RL_1, 2, "0.5"), stockUse(LINE_2, ITEM_B, 2, "1")] })).not.toBe(a);
    expect(consumptionHash({ ...base, saleDocNo: "SL-2", lines: [reserveUse(LINE_1, RL_1, 1, "0.5"), stockUse(LINE_2, ITEM_B, 2, "1")] })).not.toBe(a);
    const caps = [{ lineId: LINE_1, capPcs: 4, capWeightCt: "2.000" }];
    expect(unpackCaps(packCaps(caps))).toEqual(caps);
    expect(unpackCaps(null)).toEqual([]);
  });
});

describe("BE-SL-002 internal schemas", () => {
  const line = { lineId: LINE_1, source: "RESERVE", reserveLineId: RL_1, memoStockId: ITEM_A, pcs: 1, weightCt: "0.5" };
  const put = { revision: 1, saleDocNo: "SL-1", customerId: CUSTOMER, currency: "USD", lines: [line] };
  it("PUT consumption: strict; distinct line ids, Reserve lines and STOCK items; RESERVE needs reserveLineId, STOCK must not have one; empty line refused; empty set allowed", () => {
    expect(saleConsumptionPutSchema.safeParse(put).success).toBe(true);
    expect(saleConsumptionPutSchema.safeParse({ ...put, lines: [] }).success).toBe(true);
    const codes = (body: unknown) => (saleConsumptionPutSchema.safeParse(body).error?.issues ?? []).map((issue) => (issue as { params?: { code?: string } }).params?.code ?? issue.code);
    expect(codes({ ...put, lines: [line, { ...line, lineId: LINE_2 }] })).toContain("duplicate");
    expect(codes({ ...put, lines: [line, line] })).toContain("duplicate");
    expect(codes({ ...put, lines: [{ ...line, reserveLineId: null }] })).toContain("required");
    expect(codes({ ...put, lines: [{ ...line, source: "STOCK" }] })).toContain("invalid");
    expect(codes({ ...put, lines: [{ ...line, source: "STOCK", reserveLineId: undefined }, { ...line, lineId: LINE_2, source: "STOCK", reserveLineId: undefined }] })).toContain("duplicate");
    expect(codes({ ...put, lines: [{ ...line, pcs: 0, weightCt: "0" }] })).toContain("too_small");
    expect(saleConsumptionPutSchema.safeParse({ ...put, extra: 1 }).success).toBe(false);
    expect(saleConsumptionPutSchema.safeParse({ ...put, lines: Array.from({ length: 201 }, () => line) }).success).toBe(false);
    expect(saleConsumptionPutSchema.safeParse({ ...put, revision: 0 }).success).toBe(false);
  });
  it("search / prepare / numbering: bounded inputs; numbering allow-list load-to-stock | sale", () => {
    expect(saleReserveLineSearchSchema.parse({ customerId: CUSTOMER, currency: "USD" })).toMatchObject({ exclude: [], limit: 50 });
    expect(saleReserveLineSearchSchema.safeParse({ customerId: CUSTOMER, currency: "USD", limit: 51 }).success).toBe(false);
    expect(saleReserveLineSearchSchema.safeParse({ customerId: CUSTOMER, currency: "USD", from: "2026-11-02", to: "2026-11-01" }).success).toBe(false);
    expect(saleReserveLineSearchSchema.safeParse({ customerId: CUSTOMER, currency: "usd" }).success).toBe(false);
    expect(salePrepareSchema.safeParse({ currency: "USD", reserveLineIds: [], memoStockIds: [] }).success).toBe(true);
    expect(salePrepareSchema.safeParse({ currency: "USD", reserveLineIds: Array.from({ length: 201 }, () => RL_1), memoStockIds: [] }).success).toBe(false);
    expect(numberingResolveSchema.safeParse({ transactionKey: "sale", docDate: "2026-11-18", markUsed: true }).success).toBe(true);
    expect(numberingResolveSchema.safeParse({ transactionKey: "reserve", docDate: "2026-11-18", markUsed: true }).success).toBe(false);
  });
});
