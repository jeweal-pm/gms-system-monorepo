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
  countryCode: "TH",
  state: "Bangkok",
  city: "Bangkok",
  postcode: "10110",
  currencyCode: "THB",
  bankDetails: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Bank" }] }] },
  showBankDetailsOnInvoice: true,
  terms: null,
  showTermsOnInvoice: false,
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
    expect(parsed.bankDetails).toEqual(validBody().bankDetails);
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

  it("UT-CP-P23 reports rich-text problems with their code", () => {
    const link = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:x" } }] }] }] };
    expect(issues({ ...validBody(), bankDetails: link })).toEqual([{ path: "bankDetails", code: "unsafe_link" }]);
  });

  it("UT-CP-P24 limits bank details to 5,000 and terms to 10,000 characters", () => {
    const docOf = (length: number) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "a".repeat(length) }] }] });
    expect(issues({ ...validBody(), bankDetails: docOf(5_000) })).toEqual([]);
    expect(issues({ ...validBody(), bankDetails: docOf(5_001) })).toEqual([{ path: "bankDetails", code: "too_long" }]);
    expect(issues({ ...validBody(), terms: docOf(10_000) })).toEqual([]);
    // 10,001 characters must be split over two text nodes (one node is capped at 10,000).
    const terms = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "a".repeat(10_000) }] }, { type: "paragraph", content: [{ type: "text", text: "b" }] }] };
    expect(issues({ ...validBody(), terms })).toEqual([{ path: "terms", code: "too_long" }]);
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
