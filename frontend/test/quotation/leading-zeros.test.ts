import { describe, expect, it } from "vitest";
import { sanitizeRate } from "@/features/currency/rates";
import { sanitizeDecimal, sanitizeQuantity } from "@/features/quotation/lib/number";

describe("UT-NUM-Z1 number fields drop leading zeros (owner 2026-11-02)", () => {
  it("weight, sale price, discount, pcs", () => {
    expect(sanitizeDecimal("022", 2)).toBe("22");
    expect(sanitizeDecimal("0222", 2)).toBe("222");
    expect(sanitizeDecimal("00", 2)).toBe("0");
    expect(sanitizeDecimal("0", 2)).toBe("0");
    expect(sanitizeDecimal("0.5", 3)).toBe("0.5");
    expect(sanitizeDecimal("00.5", 3)).toBe("0.5");
    expect(sanitizeDecimal("0.", 2)).toBe("0.");
    expect(sanitizeDecimal("010", 0)).toBe("10");
    expect(sanitizeDecimal("1,005.50", 2)).toBe("1005.50");
  });

  it("return cells and exchange rate", () => {
    expect(sanitizeQuantity("007", 6, 0)).toBe("7");
    expect(sanitizeQuantity("00.25", 5, 3)).toBe("0.25");
    expect(sanitizeRate("035.5")).toBe("35.5");
    expect(sanitizeRate("0.0275")).toBe("0.0275");
  });
});
