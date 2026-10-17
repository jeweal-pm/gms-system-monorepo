import { describe, expect, it } from "vitest";
import { companyProfileGetOutputSchema, removeLogoInputSchema, saveCompanyProfileInputSchema } from "../../src/trpc/company-profile-schemas";

/** UT-CP-G10…G15: gateway input/output shapes for `companyProfile.*` (api-contract.md). */

const validInput = () => ({
  name: "Test Co., Ltd.",
  taxId: "",
  contactName: "Contact",
  phone: { country: "TH", e164: "+66812345678" },
  email: "Admin@Example.com",
  website: "",
  address: "1 Road",
  address2: "",
  roadStreet: "Sukhumvit Rd.",
  countryCode: "TH",
  state: "Bangkok",
  city: "Bangkok",
  postcode: "10110",
  currencyCode: "THB",
  bankDetails: "Bank: KBank\r\nAccount: 1  ",
  showBankDetailsOnInvoice: false,
  expectedVersion: 3,
});

const savedProfile = {
  ...validInput(),
  email: "admin@example.com",
  bankDetails: "Bank: KBank\nAccount: 1",
  version: 3,
  logo: { version: "0123456789abcdef", contentType: "image/png", sizeBytes: 2048 },
  updatedAt: "2026-10-16T04:00:00.000Z",
  updatedBy: "user-1",
};

describe("saveCompanyProfileInputSchema", () => {
  it("UT-CP-G10 accepts a valid input, lowers the email and normalizes the bank details text", () => {
    const parsed = saveCompanyProfileInputSchema.parse(validInput());
    expect(parsed.email).toBe("admin@example.com");
    expect(parsed.roadStreet).toBe("Sukhumvit Rd.");
    expect(parsed.bankDetails).toBe("Bank: KBank\nAccount: 1");
    expect(parsed.expectedVersion).toBe(3);
  });

  it("UT-CP-G11 rejects unknown keys and invalid fields before partner is called", () => {
    expect(saveCompanyProfileInputSchema.safeParse({ ...validInput(), role: "admin" }).success).toBe(false);
    const result = saveCompanyProfileInputSchema.safeParse({ ...validInput(), phone: { country: "TH", e164: "081" }, website: "ftp://x" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(expect.arrayContaining(["phone.e164", "website"]));
  });

  it("UT-CP-G12 limits bank details to 5,000 characters, rejects non-text and the removed terms fields", () => {
    expect(saveCompanyProfileInputSchema.safeParse({ ...validInput(), bankDetails: "a".repeat(5_000) }).success).toBe(true);
    const tooLong = saveCompanyProfileInputSchema.safeParse({ ...validInput(), bankDetails: "a".repeat(5_001) });
    expect(tooLong.success).toBe(false);
    if (!tooLong.success) expect(tooLong.error.issues[0]).toMatchObject({ path: ["bankDetails"], message: "too_long" });
    expect(saveCompanyProfileInputSchema.safeParse({ ...validInput(), bankDetails: { type: "doc" } }).success).toBe(false);
    expect(saveCompanyProfileInputSchema.safeParse({ ...validInput(), terms: null, showTermsOnInvoice: false }).success).toBe(false);
    expect(saveCompanyProfileInputSchema.safeParse({ ...validInput(), roadStreet: "a".repeat(301) }).success).toBe(false);
  });
});

describe("removeLogoInputSchema", () => {
  it("UT-CP-G13 needs a positive integer version", () => {
    expect(removeLogoInputSchema.safeParse({ expectedVersion: 2 }).success).toBe(true);
    expect(removeLogoInputSchema.safeParse({ expectedVersion: 0 }).success).toBe(false);
    expect(removeLogoInputSchema.safeParse({}).success).toBe(false);
  });
});

describe("companyProfileGetOutputSchema", () => {
  it("UT-CP-G14 accepts a saved profile and a missing one", () => {
    expect(companyProfileGetOutputSchema.parse({ profile: savedProfile }).profile?.logo?.contentType).toBe("image/png");
    expect(companyProfileGetOutputSchema.parse({ profile: null })).toEqual({ profile: null });
  });

  it("UT-CP-G15 rejects a malformed upstream logo", () => {
    expect(companyProfileGetOutputSchema.safeParse({ profile: { ...savedProfile, logo: { ...savedProfile.logo, contentType: "image/svg+xml" } } }).success).toBe(false);
    expect(companyProfileGetOutputSchema.safeParse({ profile: { ...savedProfile, logo: { ...savedProfile.logo, version: "../../etc" } } }).success).toBe(false);
  });
});
