import { describe, expect, it } from "vitest";
import {
  DEFAULT_DECIMAL_PLACES,
  formatMoney,
  formatNumber,
  formatUnitPrice,
  formatWeight,
  normalizePlaces,
  priceInputDecimals,
  roundDecimalText,
  weightInputDecimals,
} from "@/lib/number-format";

/** UT-DEC-13 (formatter) and UT-DEC-17 (input caps): decimal-setup TODO rev 2, FE-DEC-102 / FE-DEC-105. */

describe("UT-DEC-13 website-wide formatter", () => {
  it("rounds half up to 0–4 places and pads with zeros", () => {
    expect(formatWeight("1.23456", 0)).toBe("1");
    expect(formatWeight("1.23456", 1)).toBe("1.2");
    expect(formatWeight("1.23456", 2)).toBe("1.23");
    expect(formatWeight("1.235", 2)).toBe("1.24");
    expect(formatWeight("1.235", 3)).toBe("1.235");
    expect(formatWeight("1.235", 4)).toBe("1.2350");
    expect(formatMoney("12345.6789", 0)).toBe("12,346");
    expect(formatMoney("12345.6789", 2)).toBe("12,345.68");
    expect(formatMoney("48000.5", 0)).toBe("48,001");
    expect(formatMoney("12000", 4)).toBe("12,000.0000");
    expect(formatMoney("0.995", 2)).toBe("1.00");
    expect(formatMoney(".5", 0)).toBe("1");
  });

  it("handles negatives half up on the magnitude, and a rounded zero has no minus sign", () => {
    expect(formatMoney("-1234.565", 2)).toBe("-1,234.57");
    expect(formatMoney("-0.004", 2)).toBe("0.00");
    expect(formatWeight("-0.5", 0)).toBe("-1");
  });

  it("groups thousands exactly for amounts beyond floating point and ignores input commas", () => {
    expect(formatMoney("1234567890123456789.125", 2)).toBe("1,234,567,890,123,456,789.13");
    expect(formatMoney("1,234.5", 2)).toBe("1,234.50");
    expect(formatNumber(1234.5, 1)).toBe("1,234.5");
    expect(roundDecimalText("999.995", 2)).toBe("1000.00");
  });

  it("returns non-numeric text unchanged and falls back to 2 for invalid places", () => {
    expect(formatMoney("n/a", 2)).toBe("n/a");
    expect(formatNumber("", 2)).toBe("");
    expect(formatNumber(Number.NaN, 2)).toBe("NaN");
    expect(roundDecimalText("1e5", 2)).toBeNull();
    expect(formatMoney("1.005", 9)).toBe("1.01");
    expect(formatWeight("1.005", -1)).toBe("1.01");
    expect(normalizePlaces(4, 2)).toBe(4);
    expect(normalizePlaces(5, 2)).toBe(2);
    expect(normalizePlaces(1.5, 2)).toBe(2);
    expect(normalizePlaces("3", 2)).toBe(2);
    expect(DEFAULT_DECIMAL_PLACES).toEqual({ weightPlaces: 2, pricePlaces: 2 });
  });

  it("shows a stored net unit price as typed (2 dp), then with the price places", () => {
    expect(formatUnitPrice("1234.4995", 2)).toBe("1,234.50");
    expect(formatUnitPrice("760.1250", 4)).toBe("760.1300");
    expect(formatUnitPrice("760.1250", 0)).toBe("760");
    expect(formatUnitPrice("bad", 2)).toBe("bad");
  });
});

describe("UT-DEC-17 input caps never exceed storage (owner Q-DEC-08)", () => {
  it("weight typing is min(places, 3) and price typing is min(places, 2)", () => {
    expect([0, 1, 2, 3, 4].map(weightInputDecimals)).toEqual([0, 1, 2, 3, 3]);
    expect([0, 1, 2, 3, 4].map(priceInputDecimals)).toEqual([0, 1, 2, 2, 2]);
    expect(weightInputDecimals(7)).toBe(2);
    expect(priceInputDecimals(-1)).toBe(2);
  });
});
