import { describe, expect, it } from "vitest";
import { adjustmentDelta, type AdjustmentStockLine } from "../../src/modules/stock/adjust";
import { inputSchema, listQuerySchema, stockQuerySchema } from "../../src/modules/stock-adjustment/schemas";

const STOCK = "0193a6c0-0000-7000-8000-000000000001";
const line = (patch: Partial<AdjustmentStockLine> = {}): AdjustmentStockLine => ({ stockUuid: STOCK, stockId: "STOCK-1", position: 1, lineId: "0193a6c0-0000-7000-8000-000000000002", stockPcs: 4, stockWeightCt: "1.250", stockPrice: "100.00", physicalPcs: 3, physicalWeightCt: "1.100", physicalPrice: null, ...patch });
const doc = (lines: unknown[], patch: Record<string, unknown> = {}) => ({ docDate: "2026-11-24", location: "Main", ref: "", note: "", lines, ...patch });
const inputLine = (patch: Partial<AdjustmentStockLine> = {}) => { const value = line(patch); return { stockUuid: value.stockUuid, stockPcs: value.stockPcs, stockWeightCt: value.stockWeightCt, physicalPcs: value.physicalPcs, physicalWeightCt: value.physicalWeightCt, physicalPrice: value.physicalPrice, remark: "" }; };

describe("Stock Adjustment backend domain", () => {
  it("UT-SAJ-B01 validates strict bounded inputs and distinct stock UUIDs", () => {
    expect(inputSchema.safeParse(doc([inputLine()])).success).toBe(true);
    expect(inputSchema.safeParse(doc([inputLine(), inputLine()])).success).toBe(false);
    expect(inputSchema.safeParse(doc([inputLine({ physicalPcs: -1 })])).success).toBe(false);
    expect(inputSchema.safeParse(doc([inputLine({ stockWeightCt: "1.0001" })])).success).toBe(false);
    expect(inputSchema.safeParse(doc([inputLine()], { extra: true })).success).toBe(false);
    expect(inputSchema.safeParse(doc(Array.from({ length: 201 }, (_, i) => inputLine({ stockUuid: `0193a6c0-0000-7000-8000-${String(i).padStart(12, "0")}` })))).success).toBe(false);
  });

  it("UT-SAJ-B02 computes signed deltas and base cost by price unit, with null price preserving current value", () => {
    const stock = { price_unit: "PER_CT", unit_cost_base: "10.0000" };
    expect(adjustmentDelta(line(), stock)).toMatchObject({ dPcs: -1, nextPrice: "100.00" });
    const ct = adjustmentDelta(line(), stock);
    expect(ct.dWeight.toFixed(3)).toBe("-0.150");
    expect(ct.dCost.toFixed(2)).toBe("-1.50");
    const pcs = adjustmentDelta(line(), { price_unit: "PER_PCS", unit_cost_base: "2.5000" });
    expect(pcs.dCost.toFixed(2)).toBe("-2.50");
    const priceOnly = adjustmentDelta(line({ physicalPcs: 4, physicalWeightCt: "1.250", physicalPrice: "120.00" }), stock);
    expect(priceOnly.changed).toBe(true);
    expect(adjustmentDelta(line({ physicalPcs: 4, physicalWeightCt: "1.250" }), stock).changed).toBe(false);
  });

  it("accepts bounded daybook and own-stock picker filters", () => {
    expect(listQuerySchema.safeParse({}).data?.limit).toBe(50);
    expect(stockQuerySchema.safeParse({ location: "Main" }).data?.limit).toBe(50);
    expect(stockQuerySchema.safeParse({ location: "Main", exclude: Array.from({ length: 201 }, () => STOCK) }).success).toBe(false);
  });
});
