import { describe, expect, it } from "vitest";
import type { QuotationLine } from "@/features/quotation/schema";
import { calculateTotals, lineAmount } from "@/features/quotation/lib/calculate";
import { emptyLine, emptyQuotation } from "@/features/quotation/lib/defaults";
import { formatMoney } from "@/features/quotation/lib/format";

const line = (patch: Partial<QuotationLine>): QuotationLine => ({ ...emptyLine(), stockId: "STK", ...patch });

// ตัวอย่างจาก mockup: 29,760 + 72,800 + 28,812 = 131,372.00
const mockupLines = [
  line({ weightCt: "0.62", unitPrice: "48000" }),
  line({ weightCt: "1.12", unitPrice: "65000" }),
  line({ weightCt: "2.94", unitPrice: "9800" }),
];

const base = () => ({ ...emptyQuotation(), lines: [...mockupLines, emptyLine(), emptyLine()] });

describe("lineAmount", () => {
  it("prices per carat by weight", () => {
    expect(formatMoney(lineAmount(mockupLines[0]))).toBe("29,760.00");
  });
  it("prices per piece by pcs", () => {
    expect(formatMoney(lineAmount(line({ priceUnit: "PER_PCS", pcs: "6", unitPrice: "1250.5" })))).toBe("7,503.00");
  });
});

describe("calculateTotals", () => {
  it("sums filled lines and ignores empty rows", () => {
    const totals = calculateTotals(base());
    expect(formatMoney(totals.subtotal)).toBe("131,372.00");
    expect(formatMoney(totals.totalWeight)).toBe("4.68");
    expect(formatMoney(totals.grandTotal)).toBe("131,372.00");
  });

  it("applies percent discount then exclusive VAT", () => {
    const totals = calculateTotals(
      { ...base(), discount: { enabled: true, type: "PERCENT", value: "10" }, tax: { enabled: true, rate: "7", includeInPrice: false } },
    );
    expect(formatMoney(totals.discountAmount)).toBe("13,137.20");
    expect(formatMoney(totals.totalAfterDiscount)).toBe("118,234.80");
    expect(formatMoney(totals.taxAmount)).toBe("8,276.44");
    expect(formatMoney(totals.grandTotal)).toBe("126,511.24");
  });

  it("matches the tax mockup (148,372.00 + 7% = 158,758.04)", () => {
    const totals = calculateTotals(
      { ...emptyQuotation(), lines: [line({ weightCt: "1", unitPrice: "148372" })], tax: { enabled: true, rate: "7", includeInPrice: false } },
    );
    expect(formatMoney(totals.taxAmount)).toBe("10,386.04");
    expect(formatMoney(totals.grandTotal)).toBe("158,758.04");
  });

  it("extracts VAT when tax is included in price", () => {
    const totals = calculateTotals(
      { ...emptyQuotation(), lines: [line({ weightCt: "1", unitPrice: "107" })], tax: { enabled: true, rate: "7", includeInPrice: true } },
    );
    expect(formatMoney(totals.priceBeforeTax)).toBe("100.00");
    expect(formatMoney(totals.taxAmount)).toBe("7.00");
    expect(formatMoney(totals.grandTotal)).toBe("107.00");
  });

  it("caps amount discount at subtotal and adds charges + labor", () => {
    const totals = calculateTotals(
      {
        ...emptyQuotation(),
        lines: [line({ weightCt: "1", unitPrice: "100" })],
        discount: { enabled: true, type: "AMOUNT", value: "500" },
        serviceCharges: [{ chargeId: "SHIPPING", amount: "25" }, { chargeId: "HANDLING", amount: "10.5" }],
        labor: { enabled: true, work: "Re-cutting", basis: "WEIGHT", qty: "2.5", rate: "40" },
      },
    );
    expect(formatMoney(totals.discountAmount)).toBe("100.00");
    expect(formatMoney(totals.serviceChargeTotal)).toBe("35.50");
    expect(formatMoney(totals.laborAmount)).toBe("100.00");
    expect(formatMoney(totals.grandTotal)).toBe("135.50");
  });
});
