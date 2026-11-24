import { describe, expect, it } from "vitest";
import { adjustmentSchema, diff, emptyAdjustment, lineFromStock, sanitize, toAdjustmentInput } from "@/features/stock-adjustment/form";

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
