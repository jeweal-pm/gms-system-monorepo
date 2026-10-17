import { getCountries } from "libphonenumber-js";
import { describe, expect, it } from "vitest";
import { DEFAULT_PHONE_COUNTRY, fromContractPhone, PHONE_COUNTRIES, phoneCountry, toContractPhone, toE164 } from "@/lib/phone";

/** UT-PH-01…08: phone country list from libphonenumber-js (owner 2026-10-17, option A) and the E.164 mapping. */

describe("PHONE_COUNTRIES", () => {
  it("UT-PH-01 contains every country libphonenumber-js supports, once", () => {
    const codes = PHONE_COUNTRIES.map((entry) => entry.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect([...codes].sort()).toEqual([...getCountries()].sort());
  });

  it("UT-PH-02 has correct calling codes (including the ones the gist got wrong)", () => {
    const dial = (code: string) => PHONE_COUNTRIES.find((entry) => entry.code === code)?.dial;
    expect(dial("TH")).toBe("+66");
    expect(dial("US")).toBe("+1");
    expect(dial("AS")).toBe("+1");
    expect(dial("KY")).toBe("+1");
    expect(dial("GB")).toBe("+44");
  });

  it("UT-PH-03 is sorted by English name and every entry has a name", () => {
    const names = PHONE_COUNTRIES.map((entry) => entry.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
    expect(PHONE_COUNTRIES.find((entry) => entry.code === "TH")?.name).toBe("Thailand");
    expect(names.every((name) => name.length > 0)).toBe(true);
  });
});

describe("phoneCountry", () => {
  it("UT-PH-04 finds a country and falls back to the US default", () => {
    expect(phoneCountry("SG")).toMatchObject({ code: "SG", dial: "+65" });
    expect(DEFAULT_PHONE_COUNTRY).toBe("US");
    expect(phoneCountry("ZZ")).toMatchObject({ code: "US", dial: "+1" });
  });
});

describe("E.164 mapping (behaviour unchanged)", () => {
  it("UT-PH-05 drops spaces and the trunk 0", () => {
    expect(toE164({ country: "TH", number: "081 234 5678" })).toBe("+66812345678");
    expect(toE164({ country: "SG", number: "6123 4567" })).toBe("+6561234567");
  });

  it("UT-PH-06 returns null for an empty or impossible number", () => {
    expect(toE164({ country: "TH", number: "" })).toBeNull();
    expect(toE164({ country: "TH", number: "12" })).toBeNull();
  });

  it("UT-PH-07 builds the contract phone with the country code", () => {
    expect(toContractPhone({ country: "JP", number: "090 1234 5678" })).toEqual({ country: "JP", e164: "+819012345678" });
  });

  it("UT-PH-08 maps a stored phone of any listed country back to the form", () => {
    expect(fromContractPhone({ country: "SG", e164: "+6561234567" })).toEqual({ country: "SG", number: "61234567" });
    expect(fromContractPhone(null)).toEqual({ country: "US", number: "" });
  });
});
