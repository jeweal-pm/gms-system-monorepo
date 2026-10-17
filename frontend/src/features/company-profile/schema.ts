import { isValidPhoneNumber, type CountryCode } from "libphonenumber-js";
import { z } from "zod";
import { DEFAULT_PHONE_COUNTRY } from "@/lib/phone";

/**
 * Company Profile form (company-profile UI revision 3, SA revision 3, form-guidelines.md). Phone is
 * valid for the chosen country by libphonenumber-js (DEP-CP-02). Bank details are plain text
 * (SA-CP-13). The logo is not part of the Zod schema: it is checked when a file is picked (type and
 * the 10 MB limit) and held as a `LogoChange`.
 */

export const LOGO_MAX_BYTES = 10 * 1024 * 1024;
export const LOGO_TYPES = ["image/jpeg", "image/png"] as const;
export const BANK_DETAILS_MAX_CHARS = 5_000;

export type LogoChange = { kind: "unchanged" } | { kind: "new"; file: File; previewUrl: string } | { kind: "removed" };

const required = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Enter ${label}`)
    .max(max, `${label[0].toUpperCase()}${label.slice(1)} must be ${max} characters or fewer`);

const optional = (label: string, max: number) => z.string().trim().max(max, `${label} must be ${max} characters or fewer`);

/** Multi-line text as the server stores it (SA-CP-13): LF line breaks, no trailing whitespace. */
export function normalizePlainText(value: string): string {
  return value.replace(/\r\n?/g, "\n").trimEnd();
}

const plainText = (label: string, max: number) =>
  z.string().refine((value) => normalizePlainText(value).length <= max, `${label} must be ${max.toLocaleString("en-US")} characters or fewer`);

export const companyProfileSchema = z.object({
  name: required("the company name", 200),
  taxId: optional("Tax ID", 50),
  contactName: required("the contact person name", 200),
  phone: z
    .object({ country: z.string(), number: z.string() })
    .refine((phone) => phone.number.trim() !== "", "Enter a phone number")
    .refine((phone) => phone.number.trim() === "" || isValidPhoneNumber(phone.number, phone.country as CountryCode), "Enter a valid phone number for the selected country"),
  email: z.string().trim().min(1, "Enter an email address").max(254, "Email must be 254 characters or fewer").pipe(z.email("Enter a valid email address")),
  website: z
    .string()
    .trim()
    .max(300, "Website must be 300 characters or fewer")
    .refine((value) => value === "" || /^https?:\/\/[^\s/$.?#][^\s]*$/i.test(value), "Enter a web address starting with http:// or https://"),
  address: required("the address", 300),
  address2: optional("Address No.2", 300),
  roadStreet: optional("Road/Street", 300),
  countryCode: z.string().min(1, "Choose a country"),
  state: required("the state or province", 100),
  city: required("the city", 100),
  postcode: required("the postcode", 20),
  currencyCode: z.string().min(1, "Choose a currency"),
  bankDetails: plainText("Bank details", BANK_DETAILS_MAX_CHARS),
  showBankDetailsOnInvoice: z.boolean(),
});

export type CompanyProfileFormValues = z.input<typeof companyProfileSchema>;

export const emptyCompanyProfileForm: CompanyProfileFormValues = {
  name: "",
  taxId: "",
  contactName: "",
  phone: { country: DEFAULT_PHONE_COUNTRY, number: "" },
  email: "",
  website: "",
  address: "",
  address2: "",
  roadStreet: "",
  countryCode: "",
  state: "",
  city: "",
  postcode: "",
  currencyCode: "",
  bankDetails: "",
  showBankDetailsOnInvoice: false,
};

/** Field order on the page; Save focuses the first invalid one (form-guidelines). */
export const COMPANY_PROFILE_FIELD_ORDER = [
  "name",
  "taxId",
  "contactName",
  "phone",
  "email",
  "website",
  "address",
  "address2",
  "roadStreet",
  "countryCode",
  "city",
  "state",
  "postcode",
  "currencyCode",
  "bankDetails",
] as const satisfies readonly (keyof CompanyProfileFormValues)[];

/** A bare domain typed into Website gets `https://` on blur (form-guidelines). */
export function normalizeWebsite(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "" || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** Returns an error message for a picked logo file, or null when it is acceptable. */
export function logoFileError(file: File): string | null {
  if (!(LOGO_TYPES as readonly string[]).includes(file.type)) return "Choose a JPEG or PNG image";
  if (file.size > LOGO_MAX_BYTES) return "The image must be 10 MB or smaller";
  return null;
}
