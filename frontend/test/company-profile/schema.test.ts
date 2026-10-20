import { describe, expect, it } from "vitest";
import {
  companyProfileSchema,
  emptyCompanyProfileForm,
  LOGO_MAX_BYTES,
  logoFileError,
  normalizePlainText,
  normalizeWebsite,
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

describe("companyProfileSchema", () => {
  it("UT-CP-F01 accepts a complete form", () => {
    expect(errors(validForm())).toEqual({});
  });

  it("UT-CP-F02 starts empty with blank bank details, the invoice flag off and no terms fields", () => {
    expect(emptyCompanyProfileForm).toMatchObject({ roadStreet: "", bankDetails: "", showBankDetailsOnInvoice: false });
    expect(emptyCompanyProfileForm).not.toHaveProperty("terms");
    expect(emptyCompanyProfileForm).not.toHaveProperty("showTermsOnInvoice");
  });

  it("UT-CP-F03 requires every starred field", () => {
    const result = errors(emptyCompanyProfileForm);
    expect(Object.keys(result)).toEqual(expect.arrayContaining(["name", "contactName", "phone", "email", "address", "countryCode", "state", "postcode", "currencyCode"]));
    // City is optional (owner 2026-10-19).
    expect(result).not.toHaveProperty("city");
    expect(result).not.toHaveProperty("taxId");
    expect(result).not.toHaveProperty("website");
    expect(result).not.toHaveProperty("address2");
    expect(result).not.toHaveProperty("roadStreet");
    expect(result).not.toHaveProperty("bankDetails");
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

  it("UT-CP-F09 limits bank details to 5,000 characters as the server counts them", () => {
    expect(errors({ ...validForm(), bankDetails: "a".repeat(5_000) })).toEqual({});
    // Trailing whitespace is trimmed and CRLF counts as one character (SA-CP-13).
    expect(errors({ ...validForm(), bankDetails: `${"a".repeat(5_000)}  \r\n` })).toEqual({});
    expect(errors({ ...validForm(), bankDetails: "a".repeat(5_001) }).bankDetails).toBe("Bank details must be 5,000 characters or fewer");
  });

  it("UT-CP-F10 enforces the length limits of text fields", () => {
    expect(errors({ ...validForm(), postcode: "1".repeat(21) }).postcode).toBe("The postcode must be 20 characters or fewer");
    expect(errors({ ...validForm(), taxId: "1".repeat(51) }).taxId).toBe("Tax ID must be 50 characters or fewer");
    expect(errors({ ...validForm(), roadStreet: "1".repeat(301) }).roadStreet).toBe("Road/Street must be 300 characters or fewer");
  });
});

describe("normalizePlainText", () => {
  it("UT-CP-F11 converts CRLF/CR to LF and trims trailing whitespace only", () => {
    expect(normalizePlainText("  Bank\r\nAcc\r1  \n\n")).toBe("  Bank\nAcc\n1");
    expect(normalizePlainText("   ")).toBe("");
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
