import { describe, expect, it } from "vitest";
import { expectedVersionQuerySchema, saveCompanyProfileBodySchema } from "../../src/company-profile/company-profile.schemas";

/** UT-CP-P20…P28: partner save body and logo query validation (api-contract.md). */

const validBody = () => ({
  name: "  Test Co., Ltd.  ",
  taxId: "",
  contactName: "Contact",
  phone: { country: "TH", e164: "+66812345678" },
  email: "Admin@Example.COM",
  website: "https://example.com",
  address: "1 Road",
  address2: "",
  roadStreet: "  Sukhumvit Rd.  ",
  countryCode: "TH",
  state: "Bangkok",
  city: "Bangkok",
  postcode: "10110",
  currencyCode: "THB",
  bankDetails: "Bank: KBank\r\nAccount: 123-4-56789-0  \n",
  showBankDetailsOnInvoice: true,
  expectedVersion: null,
});

function issues(value: unknown) {
  const result = saveCompanyProfileBodySchema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code === "custom" ? (issue.params as { code: string }).code : issue.code }));
}

describe("saveCompanyProfileBodySchema", () => {
  it("UT-CP-P20 accepts a valid body, trims text and lowers the email", () => {
    const parsed = saveCompanyProfileBodySchema.parse(validBody());
    expect(parsed.name).toBe("Test Co., Ltd.");
    expect(parsed.email).toBe("admin@example.com");
    expect(parsed.expectedVersion).toBeNull();
    expect(parsed.roadStreet).toBe("Sukhumvit Rd.");
    // SA-CP-13: CRLF → LF, trailing whitespace trimmed, inner line breaks kept.
    expect(parsed.bankDetails).toBe("Bank: KBank\nAccount: 123-4-56789-0");
  });

  it("UT-CP-P28 rejects the removed terms fields (SA-CP-15) and a non-string bank details", () => {
    expect(issues({ ...validBody(), terms: null, showTermsOnInvoice: false })).toEqual([{ path: "", code: "unrecognized_keys" }]);
    expect(issues({ ...validBody(), bankDetails: { type: "doc" } }).map((issue) => issue.path)).toEqual(["bankDetails"]);
  });

  it("UT-CP-P29 limits Road/Street to 300 characters and allows it empty", () => {
    expect(issues({ ...validBody(), roadStreet: "" })).toEqual([]);
    expect(issues({ ...validBody(), roadStreet: "a".repeat(301) }).map((issue) => issue.path)).toEqual(["roadStreet"]);
  });

  it("UT-CP-P30 allows an empty City (owner 2026-10-19) and limits it to 100 characters", () => {
    expect(issues({ ...validBody(), city: "  " })).toEqual([]);
    expect(saveCompanyProfileBodySchema.parse({ ...validBody(), city: "  " }).city).toBe("");
    expect(issues({ ...validBody(), city: "a".repeat(101) }).map((issue) => issue.path)).toEqual(["city"]);
    expect(issues({ ...validBody(), state: "" }).map((issue) => issue.path)).toEqual(["state"]);
  });

  it("UT-CP-P21 rejects unknown keys (strict)", () => {
    expect(issues({ ...validBody(), extra: 1 })).toEqual([{ path: "", code: "unrecognized_keys" }]);
  });

  it.each([
    ["name", { name: "   " }],
    ["phone.e164", { phone: { country: "TH", e164: "0812345678" } }],
    ["email", { email: "not-an-email" }],
    ["website", { website: "example.com" }],
    ["countryCode", { countryCode: "tha" }],
    ["currencyCode", { currencyCode: "BAHT" }],
    ["postcode", { postcode: "1".repeat(21) }],
  ])("UT-CP-P22 rejects an invalid %s", (path, change) => {
    expect(issues({ ...validBody(), ...change }).map((issue) => issue.path)).toContain(path);
  });

  it("UT-CP-P23 stores markup-looking bank details as literal text", () => {
    expect(saveCompanyProfileBodySchema.parse({ ...validBody(), bankDetails: "<script>x</script>" }).bankDetails).toBe("<script>x</script>");
  });

  it("UT-CP-P24 limits bank details to 5,000 characters after normalizing", () => {
    expect(issues({ ...validBody(), bankDetails: "a".repeat(5_000) })).toEqual([]);
    expect(issues({ ...validBody(), bankDetails: `${"a".repeat(5_000)}   \n` })).toEqual([]);
    expect(issues({ ...validBody(), bankDetails: "a".repeat(5_001) })).toEqual([{ path: "bankDetails", code: "too_long" }]);
  });

  it("UT-CP-P25 accepts a positive version and rejects zero", () => {
    expect(issues({ ...validBody(), expectedVersion: 4 })).toEqual([]);
    expect(issues({ ...validBody(), expectedVersion: 0 }).map((issue) => issue.path)).toEqual(["expectedVersion"]);
  });
});

describe("expectedVersionQuerySchema", () => {
  it("UT-CP-P26 parses the version from the query string", () => {
    expect(expectedVersionQuerySchema.parse({ expectedVersion: "12" })).toEqual({ expectedVersion: 12 });
  });

  it.each([[{}], [{ expectedVersion: "0" }], [{ expectedVersion: "abc" }], [{ expectedVersion: "1", other: "x" }], [{ expectedVersion: ["1", "2"] }]])(
    "UT-CP-P27 rejects %j",
    (query) => {
      expect(expectedVersionQuerySchema.safeParse(query).success).toBe(false);
    },
  );
});
