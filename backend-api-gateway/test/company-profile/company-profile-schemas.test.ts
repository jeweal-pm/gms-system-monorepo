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
  countryCode: "TH",
  state: "Bangkok",
  city: "Bangkok",
  postcode: "10110",
  currencyCode: "THB",
  bankDetails: { type: "doc", content: [{ type: "paragraph" }] },
  showBankDetailsOnInvoice: false,
  terms: null,
  showTermsOnInvoice: false,
  expectedVersion: 3,
});

const savedProfile = {
  ...validInput(),
  email: "admin@example.com",
  bankDetails: null,
  version: 3,
  logo: { version: "0123456789abcdef", contentType: "image/png", sizeBytes: 2048 },
  updatedAt: "2026-10-16T04:00:00.000Z",
  updatedBy: "user-1",
};

describe("saveCompanyProfileInputSchema", () => {
  it("UT-CP-G10 accepts a valid input, lowers the email and turns an empty document into null", () => {
    const parsed = saveCompanyProfileInputSchema.parse(validInput());
    expect(parsed.email).toBe("admin@example.com");
    expect(parsed.bankDetails).toBeNull();
    expect(parsed.expectedVersion).toBe(3);
  });

  it("UT-CP-G11 rejects unknown keys and invalid fields before partner is called", () => {
    expect(saveCompanyProfileInputSchema.safeParse({ ...validInput(), role: "admin" }).success).toBe(false);
    const result = saveCompanyProfileInputSchema.safeParse({ ...validInput(), phone: { country: "TH", e164: "081" }, website: "ftp://x" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(expect.arrayContaining(["phone.e164", "website"]));
  });

  it("UT-CP-G12 rejects unsafe rich text with its code", () => {
    const bankDetails = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:x" } }] }] }] };
    const result = saveCompanyProfileInputSchema.safeParse({ ...validInput(), bankDetails });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]).toMatchObject({ path: ["bankDetails"], message: "unsafe_link" });
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
