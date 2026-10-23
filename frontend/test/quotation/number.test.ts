import { describe, expect, it } from "vitest";
import { sanitizeDecimal } from "@/features/quotation/lib/number";

describe("sanitizeDecimal", () => {
  it("drops letters and Thai text", () => {
    expect(sanitizeDecimal("ทดสอบ", 2)).toBe("");
    expect(sanitizeDecimal("12abc3", 2)).toBe("123");
  });
  it("keeps one decimal point and limits decimals", () => {
    expect(sanitizeDecimal("1.2.3", 2)).toBe("1.23");
    expect(sanitizeDecimal("48000.555", 2)).toBe("48000.55");
    expect(sanitizeDecimal("0.625", 3)).toBe("0.625");
    expect(sanitizeDecimal("5.", 2)).toBe("5.");
  });
  it("strips thousands separators and signs", () => {
    expect(sanitizeDecimal("1,234.50", 2)).toBe("1234.50");
    expect(sanitizeDecimal("-7", 2)).toBe("7");
  });
  it("allows integers only when decimals = 0", () => {
    expect(sanitizeDecimal("6.5", 0)).toBe("65");
  });
});
