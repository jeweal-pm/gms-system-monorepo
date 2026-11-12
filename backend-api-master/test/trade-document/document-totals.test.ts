import { describe, expect, it } from "vitest";
import { Prisma } from "../../src/generated/prisma/client";
import { lineTotals } from "../../src/trade-document/document-totals";

/** UT-AP-B06 (part, ADR-0046 D17): header totals from the lines being stored, exact decimals. */
describe("lineTotals", () => {
  it("counts lines and sums pcs and weight exactly (3 dp)", () => {
    expect(lineTotals([])).toEqual({ lineCount: 0, totalPcs: 0, totalWeightCt: "0.000" });
    expect(lineTotals([{ pcs: 2, weightCt: "1.255" }, { pcs: 3, weightCt: "0.5" }])).toEqual({ lineCount: 2, totalPcs: 5, totalWeightCt: "1.755" });
    // 0.1 + 0.2 stays exact; Decimal inputs (stored rows) work too.
    expect(lineTotals([{ pcs: 0, weightCt: "0.1" }, { pcs: 0, weightCt: new Prisma.Decimal("0.2") }]).totalWeightCt).toBe("0.300");
    // The bounded maximum (200 lines × 999 999 pcs × 999 999 999.999 ct) fits the header columns.
    const max = lineTotals(Array.from({ length: 200 }, () => ({ pcs: 999_999, weightCt: "999999999.999" })));
    expect(max).toEqual({ lineCount: 200, totalPcs: 199_999_800, totalWeightCt: "199999999999.800" });
    expect(max.totalPcs).toBeLessThan(2_147_483_647);
  });
});
