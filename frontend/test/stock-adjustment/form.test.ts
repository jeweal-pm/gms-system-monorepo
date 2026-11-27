import { describe, expect, it } from "vitest";
import { adjustmentSchema, adjustmentTotals, diff, emptyAdjustment, lineFromStock, nextStoneSort, sanitize, sortByStoneCode, toAdjustmentInput } from "@/features/stock-adjustment/form";

const stock = {
  stockUuid: "b9b3adcf-0805-45ee-b578-54d0fd4ddfbb", stockId: "SA-RBLDVGVS1AAA", lotKey: "OS-stock", refDocNo: "LS2611-001",
  priceUnit: "PER_CT" as const, onHandPcs: 3, onHandWeightCt: "1.120", stockPrice: "12.50",
  attrs: { stoneCode: "SA-RBLDVGVS1AAA", stone: "Sapphire", shape: "Oval", size: "5.0 × 7.0 mm", color: "Blue", clarity: "VS1", cutting: "Good", quality: "A", lot: "L-2611-001", location: "Safe A", cerType: "", cerNo: "" },
};

describe("UT-SAJ-01/02 adjustment form model", () => {
  it("computes decimal-safe physical minus stock and keeps diff blank until entered", () => {
    expect(diff("1.12", "0.10", 2)).toBe("1.02");
    expect(diff("0", "1.120", 3)).toBe("-1.120");
    expect(diff("", "1.120", 3)).toBeNull();
  });
  it("creates a picker row with snapshot values and stock price default", () => {
    expect(lineFromStock(stock)).toMatchObject({ stockUuid: stock.stockUuid, stockPcs: 3, stockWeightCt: "1.120", physicalPcs: "", physicalWeightCt: "", physicalPrice: "12.50" });
  });
  it("validates required header/line counts and permits zero physical values", () => {
    const empty = emptyAdjustment("2026-11-24");
    expect(adjustmentSchema.safeParse(empty).success).toBe(false);
    const line = lineFromStock(stock);
    const valid = { ...empty, location: "Safe A", lines: [{ ...line, physicalPcs: "0", physicalWeightCt: "0.000" }] };
    expect(adjustmentSchema.safeParse(valid).success).toBe(true);
    expect(adjustmentSchema.safeParse({ ...valid, lines: [{ ...valid.lines[0], physicalWeightCt: "1.1234" }] }).success).toBe(false);
  });
  it("sanitizes numeric paste and creates strict decimal-string payloads", () => {
    expect(sanitize("1,234.56789 ct", 3)).toBe("1234.567");
    expect(sanitize(".50", 2)).toBe("0.50");
    const line = { ...lineFromStock(stock), physicalPcs: "2", physicalWeightCt: "0.900", physicalPrice: "" };
    expect(toAdjustmentInput({ ...emptyAdjustment("2026-11-24"), location: " Safe A ", ref: " R-1 ", lines: [line] })).toEqual({
      docDate: "2026-11-24", location: "Safe A", ref: "R-1", note: "",
      lines: [{ stockUuid: stock.stockUuid, stockPcs: 3, stockWeightCt: "1.120", physicalPcs: 2, physicalWeightCt: "0.900", physicalPrice: null, remark: "" }],
    });
  });
});

describe("UT-SAJ-03 summary totals and Stone Code sort", () => {
  const a = { ...lineFromStock(stock), key: "a", physicalPcs: "2", physicalWeightCt: "0.900", attrs: { ...stock.attrs, stoneCode: "SC-10" } };
  const b = { ...lineFromStock(stock), key: "b", physicalPcs: "", physicalWeightCt: "", attrs: { ...stock.attrs, stoneCode: "SC-2" } };
  it("sums stock against physical with blanks counted as zero", () => {
    expect(adjustmentTotals([a, b])).toEqual({ rowCount: 2, stockPcs: 6, physicalPcs: 2, diffPcs: -4, stockWeightCt: "2.240", physicalWeightCt: "0.900", diffWeightCt: "-1.340" });
    expect(adjustmentTotals([])).toMatchObject({ rowCount: 0, stockPcs: 0, diffWeightCt: "0.000" });
  });
  it("cycles none → asc → desc → none and sorts numerically by stone code", () => {
    expect([nextStoneSort(null), nextStoneSort("asc"), nextStoneSort("desc")]).toEqual(["asc", "desc", null]);
    expect(sortByStoneCode([a, b], "asc").map((line) => line.key)).toEqual(["b", "a"]);
    expect(sortByStoneCode([a, b], "desc").map((line) => line.key)).toEqual(["a", "b"]);
    expect(sortByStoneCode([a, b], null).map((line) => line.key)).toEqual(["a", "b"]);
  });
});
