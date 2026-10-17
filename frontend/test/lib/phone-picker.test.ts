import { describe, expect, it } from "vitest";
import { matchCountries, ORDERED_COUNTRIES } from "@/components/ui/phone-field";
import { PHONE_COUNTRIES } from "@/lib/phone";

/** UT-PH-10…14: country picker order and search (owner design 2026-10-17). */

const codes = (list: readonly { code: string }[]) => list.map((entry) => entry.code);

describe("country picker", () => {
  it("UT-PH-10 lists US, UK, Canada, Australia first, then every other country once", () => {
    expect(codes(ORDERED_COUNTRIES).slice(0, 4)).toEqual(["US", "GB", "CA", "AU"]);
    expect(ORDERED_COUNTRIES).toHaveLength(PHONE_COUNTRIES.length);
    expect(new Set(codes(ORDERED_COUNTRIES)).size).toBe(PHONE_COUNTRIES.length);
  });

  it("UT-PH-11 shows the full list for an empty search", () => {
    expect(matchCountries("  ")).toBe(ORDERED_COUNTRIES);
  });

  it("UT-PH-12 finds by part of the name, any case", () => {
    expect(codes(matchCountries("thai"))).toEqual(["TH"]);
    expect(codes(matchCountries("UNITED")).slice(0, 2)).toEqual(["US", "GB"]);
  });

  it("UT-PH-13 finds by calling code with or without +", () => {
    expect(codes(matchCountries("+66"))).toContain("TH");
    expect(codes(matchCountries("66"))).toContain("TH");
    expect(codes(matchCountries("44"))).toContain("GB");
  });

  it("UT-PH-14 finds by ISO code and returns nothing for unknown text", () => {
    expect(codes(matchCountries("sg"))).toContain("SG");
    expect(matchCountries("zzzz")).toEqual([]);
  });
});
