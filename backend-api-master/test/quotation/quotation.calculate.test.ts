import { describe, expect, it } from "vitest";
import { calculateTotals, lineAmount, lineDiscount } from "../../src/quotation/quotation.calculate";
import type { LineInput, QuotationInput } from "../../src/quotation/quotation.schemas";

/**
 * UT-QT-B05…B08: server totals (SA-QT-08) on the same fixtures as the browser preview
 * (frontend/test/quotation/calculate.test.ts) so both sides agree to the cent.
 */

const line = (patch: Partial<LineInput>): LineInput => ({
  source: "MANUAL", stoneCodeId: null, stoneCode: "", stone: "Ruby", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "",
  lot: "", location: "", cerType: "", cerNo: "", pcs: 1, weightCt: "0", priceUnit: "PER_CT", unitPrice: "0", discount: { type: "NONE" as const, value: "0" }, itemNote: "", photoIds: [], ...patch,
});

type Calc = Pick<QuotationInput, "lines" | "discount" | "tax" | "serviceCharges" | "labor">;
const base = (patch: Partial<Calc> = {}): Calc => ({
  lines: [line({ weightCt: "0.62", unitPrice: "48000" }), line({ weightCt: "1.12", unitPrice: "65000" }), line({ weightCt: "2.94", unitPrice: "9800" })],
  discount: { type: "NONE", value: "0" },
  tax: { enabled: false, rate: "7", includeInPrice: false },
  serviceCharges: [],
  labor: null,
  ...patch,
});
const fixed = (totals: ReturnType<typeof calculateTotals>) => Object.fromEntries(
  Object.entries(totals).filter(([key]) => key !== "lineAmounts" && key !== "lineDiscounts").map(([key, value]) => [key, (value as { toFixed(n: number): string }).toFixed(2)]),
);

describe("quotation totals", () => {
  it("UT-QT-B05 line amount per carat or per piece, half-up to 2 dp", () => {
    expect(lineAmount(line({ weightCt: "0.62", unitPrice: "48000" })).toFixed(2)).toBe("29760.00");
    expect(lineAmount(line({ priceUnit: "PER_PCS", pcs: 6, unitPrice: "1250.5" })).toFixed(2)).toBe("7503.00");
    expect(lineAmount(line({ weightCt: "0.005", unitPrice: "1" })).toFixed(2)).toBe("0.01");
  });

  it("UT-QT-B05b a line discount is a percent of the line or an amount, capped at the line (owner 2026-10-26)", () => {
    expect(lineAmount(line({ weightCt: "1", unitPrice: "1000", discount: { type: "PERCENT", value: "10" } })).toFixed(2)).toBe("900.00");
    expect(lineDiscount(line({ weightCt: "1", unitPrice: "1000", discount: { type: "AMOUNT", value: "150.50" } })).toFixed(2)).toBe("150.50");
    expect(lineAmount(line({ weightCt: "1", unitPrice: "100", discount: { type: "AMOUNT", value: "500" } })).toFixed(2)).toBe("0.00");
    const totals = calculateTotals(base({ lines: [line({ weightCt: "1", unitPrice: "1000", discount: { type: "PERCENT", value: "10" } }), line({ weightCt: "1", unitPrice: "500" })] }));
    expect(totals.lineDiscounts.map((d) => d.toFixed(2))).toEqual(["100.00", "0.00"]);
    expect(totals.subtotal.toFixed(2)).toBe("1400.00");
  });

  it("UT-QT-B06 mockup subtotal 131,372.00; percent discount then added VAT", () => {
    expect(fixed(calculateTotals(base()))).toMatchObject({ subtotal: "131372.00", grandTotal: "131372.00" });
    const totals = fixed(calculateTotals(base({ discount: { type: "PERCENT", value: "10" }, tax: { enabled: true, rate: "7", includeInPrice: false } })));
    expect(totals).toMatchObject({ discountAmount: "13137.20", priceBeforeTax: "118234.80", taxAmount: "8276.44", grandTotal: "126511.24" });
  });

  it("UT-QT-B07 VAT included in price is extracted; amount discount is capped at the subtotal", () => {
    expect(fixed(calculateTotals(base({ lines: [line({ weightCt: "1", unitPrice: "107" })], tax: { enabled: true, rate: "7", includeInPrice: true } }))))
      .toMatchObject({ priceBeforeTax: "100.00", taxAmount: "7.00", grandTotal: "107.00" });
    expect(fixed(calculateTotals(base({ lines: [line({ weightCt: "1", unitPrice: "50" })], discount: { type: "AMOUNT", value: "80" } }))))
      .toMatchObject({ discountAmount: "50.00", grandTotal: "0.00" });
  });

  it("UT-QT-B08 service charges and labor are added after tax (VAT excludes them, Q-QT-04)", () => {
    const totals = fixed(calculateTotals(base({
      lines: [line({ weightCt: "1", unitPrice: "1000" })],
      tax: { enabled: true, rate: "7", includeInPrice: false },
      serviceCharges: [{ type: "SHIPPING", amount: "150" }, { type: "INSURANCE", amount: "25.50" }],
      labor: { work: "Setting", basis: "PCS", qty: "3", rate: "120.25" },
    })));
    expect(totals).toMatchObject({ taxAmount: "70.00", chargesAmount: "175.50", laborAmount: "360.75", grandTotal: "1606.25" });
  });
});
