import { z } from "zod";
import { optionsOutputSchema, timestamp } from "./partner-schemas";
import { phoneSchema } from "./user-admin-schemas";

/**
 * company-profile SA revision 3 contract shapes (document/apps/backend/partner/company-profile/api-contract.md).
 * Same rules as partner; partner validates again (defence in depth).
 */

export const LOGO_MAX_BYTES = 10 * 1024 * 1024;
export const LOGO_TYPES = ["image/jpeg", "image/png"] as const;
const BANK_DETAILS_MAX_CHARS = 5_000;

const text = (max: number) => z.string().trim().max(max);
const required = (max: number) => z.string().trim().min(1).max(max);

/** Multi-line plain text (SA-CP-13): line breaks normalized to LF, trailing whitespace trimmed, `""` when empty. */
const plainText = (maxChars: number) =>
  z.string().transform((value, ctx) => {
    const normalized = value.replace(/\r\n?/g, "\n").trimEnd();
    if (normalized.length > maxChars) {
      ctx.addIssue({ code: "custom", message: "too_long", params: { code: "too_long" } });
      return z.NEVER;
    }
    return normalized;
  });

// ---- inputs ----

export const saveCompanyProfileInputSchema = z.object({
  name: required(200),
  taxId: text(50),
  contactName: required(200),
  phone: phoneSchema,
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  website: z.union([z.literal(""), z.string().trim().max(300).regex(/^https?:\/\/\S+$/i)]),
  address: required(300),
  address2: text(300),
  roadStreet: text(300),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  state: required(100),
  // Optional (owner 2026-10-19): some places have no city; stored as "".
  city: z.string().trim().max(100),
  postcode: required(20),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  bankDetails: plainText(BANK_DETAILS_MAX_CHARS),
  showBankDetailsOnInvoice: z.boolean(),
  expectedVersion: z.number().int().min(1).nullable(),
}).strict();

export const removeLogoInputSchema = z.object({ expectedVersion: z.number().int().min(1) }).strict();

// ---- outputs (validated; unknown upstream fields stripped) ----

export const companyProfileOutputSchema = z.object({
  name: z.string(),
  taxId: z.string(),
  contactName: z.string(),
  phone: z.object({ country: z.string(), e164: z.string() }),
  email: z.string(),
  website: z.string(),
  address: z.string(),
  address2: z.string(),
  roadStreet: z.string(),
  countryCode: z.string(),
  state: z.string(),
  city: z.string(),
  postcode: z.string(),
  currencyCode: z.string(),
  bankDetails: z.string().max(BANK_DETAILS_MAX_CHARS),
  showBankDetailsOnInvoice: z.boolean(),
  version: z.number().int().min(1),
  logo: z.object({ version: z.string().regex(/^[0-9a-f]{16}$/), contentType: z.enum(LOGO_TYPES), sizeBytes: z.number().int().min(1).max(LOGO_MAX_BYTES) }).nullable(),
  updatedAt: timestamp,
  updatedBy: z.string().nullable(),
});

export const companyProfileGetOutputSchema = z.object({ profile: companyProfileOutputSchema.nullable() });
export const companyProfileMutationOutputSchema = z.object({ profile: companyProfileOutputSchema });
export const companyProfileOptionsOutputSchema = optionsOutputSchema;
