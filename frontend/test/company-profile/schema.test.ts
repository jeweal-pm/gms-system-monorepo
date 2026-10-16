import { describe, expect, it } from "vitest";
import {
  companyProfileSchema,
  emptyCompanyProfileForm,
  LOGO_MAX_BYTES,
  logoFileError,
  normalizeWebsite,
  richTextLength,
  type CompanyProfileFormValues,
} from "@/features/company-profile/schema";

/** UT-CP-F01…F14: company profile form rules (form-guidelines.md, UI revision 2). */

const validForm = (): CompanyProfileFormValues => ({
  ...emptyCompanyProfileForm,
  name: "Test Co., Ltd.",
  contactName: "Contact",
  phone: { country: "TH", number: "081 234 5678" },
  email: "admin@example.com",
  address: "1 Road",
  countryCode: "TH",
  state: "Bangkok",
  city: "Bangkok",
  postcode: "10110",
  currencyCode: "THB",
});

/** First error message per field path. */
function errors(values: CompanyProfileFormValues): Record<string, string> {
  const result = companyProfileSchema.safeParse(values);
  if (result.success) return {};
  const byPath: Record<string, string> = {};
  for (const issue of result.error.issues) byPath[issue.path.join(".")] ??= issue.message;
  return byPath;
}

const docWithText = (...texts: string[]) => ({ type: "doc", content: texts.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })) });

describe("companyProfileSchema", () => {
  it("UT-CP-F01 accepts a complete form", () => {
    expect(errors(validForm())).toEqual({});
  });

  it("UT-CP-F02 starts empty with rich text null and invoice flags off", () => {
    expect(emptyCompanyProfileForm).toMatchObject({ bankDetails: null, terms: null, showBankDetailsOnInvoice: false, showTermsOnInvoice: false });
  });

  it("UT-CP-F03 requires every starred field", () => {
    const result = errors(emptyCompanyProfileForm);
    expect(Object.keys(result)).toEqual(expect.arrayContaining(["name", "contactName", "phone", "email", "address", "countryCode", "state", "city", "postcode", "currencyCode"]));
    expect(result).not.toHaveProperty("taxId");
    expect(result).not.toHaveProperty("website");
    expect(result).not.toHaveProperty("address2");
    expect(result.phone).toBe("Enter a phone number");
  });

  it("UT-CP-F04 treats spaces as empty", () => {
    expect(errors({ ...validForm(), name: "   " }).name).toBe("Enter the company name");
  });

  it("UT-CP-F05 checks the phone number for the chosen country (libphonenumber-js)", () => {
    expect(errors({ ...validForm(), phone: { country: "TH", number: "12" } }).phone).toBe("Enter a valid phone number for the selected country");
    expect(errors({ ...validForm(), phone: { country: "US", number: "201 555 0123" } })).toEqual({});
  });

  it("UT-CP-F06 checks the email address", () => {
    expect(errors({ ...validForm(), email: "admin@" }).email).toBe("Enter a valid email address");
  });

  it.each([["example.com"], ["ftp://example.com"], ["https://"]])("UT-CP-F07 rejects the website %j", (website) => {
    expect(errors({ ...validForm(), website }).website).toBe("Enter a web address starting with http:// or https://");
  });

  it("UT-CP-F08 accepts an http(s) website or an empty one", () => {
    expect(errors({ ...validForm(), website: "https://example.com/about" })).toEqual({});
    expect(errors({ ...validForm(), website: "" })).toEqual({});
  });

  it("UT-CP-F09 limits bank details to 5,000 and terms to 10,000 characters", () => {
    expect(errors({ ...validForm(), bankDetails: docWithText("a".repeat(5_000)) })).toEqual({});
    expect(errors({ ...validForm(), bankDetails: docWithText("a".repeat(4_000), "b".repeat(1_001)) }).bankDetails).toBe("Bank details must be 5,000 characters or fewer");
    expect(errors({ ...validForm(), terms: docWithText("a".repeat(10_001)) }).terms).toBe("Terms and conditions must be 10,000 characters or fewer");
  });

  it("UT-CP-F10 enforces the length limits of text fields", () => {
    expect(errors({ ...validForm(), postcode: "1".repeat(21) }).postcode).toBe("The postcode must be 20 characters or fewer");
    expect(errors({ ...validForm(), taxId: "1".repeat(51) }).taxId).toBe("Tax ID must be 50 characters or fewer");
  });
});

describe("richTextLength", () => {
  it("UT-CP-F11 counts the text of nested nodes and is 0 for null", () => {
    expect(richTextLength(null)).toBe(0);
    const nested = { type: "doc", content: [{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "abc" }, { type: "hardBreak" }, { type: "text", text: "de" }] }] }] }] };
    expect(richTextLength(nested)).toBe(5);
  });
});

describe("normalizeWebsite", () => {
  it.each([
    ["example.com", "https://example.com"],
    ["  www.example.com  ", "https://www.example.com"],
    ["http://example.com", "http://example.com"],
    ["", ""],
    ["mailto:a@example.com", "mailto:a@example.com"],
  ])("UT-CP-F12 normalizes %j to %j", (input, expected) => {
    expect(normalizeWebsite(input)).toBe(expected);
  });
});

describe("logoFileError", () => {
  it("UT-CP-F13 accepts JPEG and PNG up to 10 MB", () => {
    expect(logoFileError(new File([new Uint8Array(10)], "logo.png", { type: "image/png" }))).toBeNull();
    expect(logoFileError(new File([new Uint8Array(LOGO_MAX_BYTES)], "logo.jpg", { type: "image/jpeg" }))).toBeNull();
  });

  it("UT-CP-F14 rejects other types and files over 10 MB", () => {
    expect(logoFileError(new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" }))).toBe("Choose a JPEG or PNG image");
    expect(logoFileError(new File([new Uint8Array(LOGO_MAX_BYTES + 1)], "logo.png", { type: "image/png" }))).toBe("The image must be 10 MB or smaller");
  });
});
