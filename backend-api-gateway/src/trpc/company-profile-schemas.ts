import { z } from "zod";
import { optionsOutputSchema, timestamp } from "./partner-schemas";
import { parseRichText } from "./rich-text";
import { phoneSchema } from "./user-admin-schemas";

/**
 * company-profile SA revision 2 contract shapes (document/apps/backend/partner/company-profile/api-contract.md).
 * Same rules as partner; partner validates again (defence in depth).
 */

export const LOGO_MAX_BYTES = 10 * 1024 * 1024;
export const LOGO_TYPES = ["image/jpeg", "image/png"] as const;
const BANK_DETAILS_MAX_CHARS = 5_000;
const TERMS_MAX_CHARS = 10_000;

const text = (max: number) => z.string().trim().max(max);
const required = (max: number) => z.string().trim().min(1).max(max);

/** Rich text (SA-CP-03): allow-listed Tiptap/ProseMirror JSON, normalized, or null. */
const richText = (maxChars: number) =>
  z.unknown().transform((value, ctx) => {
    const parsed = parseRichText(value === undefined ? null : value);
    if (!parsed.ok) {
      ctx.addIssue({ code: "custom", message: parsed.code, params: { code: parsed.code } });
      return z.NEVER;
    }
    if (parsed.textLength > maxChars) {
      ctx.addIssue({ code: "custom", message: "too_long", params: { code: "too_long" } });
      return z.NEVER;
    }
    return parsed.value;
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
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  state: required(100),
  city: required(100),
  postcode: required(20),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  bankDetails: richText(BANK_DETAILS_MAX_CHARS),
  showBankDetailsOnInvoice: z.boolean(),
  terms: richText(TERMS_MAX_CHARS),
  showTermsOnInvoice: z.boolean(),
  expectedVersion: z.number().int().min(1).nullable(),
}).strict();

export const removeLogoInputSchema = z.object({ expectedVersion: z.number().int().min(1) }).strict();

// ---- outputs (validated; unknown upstream fields stripped) ----

const richTextOutput = z.object({ type: z.literal("doc"), content: z.array(z.unknown()).max(2_000) }).passthrough().nullable();

export const companyProfileOutputSchema = z.object({
  name: z.string(),
  taxId: z.string(),
  contactName: z.string(),
  phone: z.object({ country: z.string(), e164: z.string() }),
  email: z.string(),
  website: z.string(),
  address: z.string(),
  address2: z.string(),
  countryCode: z.string(),
  state: z.string(),
  city: z.string(),
  postcode: z.string(),
  currencyCode: z.string(),
  bankDetails: richTextOutput,
  showBankDetailsOnInvoice: z.boolean(),
  terms: richTextOutput,
  showTermsOnInvoice: z.boolean(),
  version: z.number().int().min(1),
  logo: z.object({ version: z.string().regex(/^[0-9a-f]{16}$/), contentType: z.enum(LOGO_TYPES), sizeBytes: z.number().int().min(1).max(LOGO_MAX_BYTES) }).nullable(),
  updatedAt: timestamp,
  updatedBy: z.string().nullable(),
});

export const companyProfileGetOutputSchema = z.object({ profile: companyProfileOutputSchema.nullable() });
export const companyProfileMutationOutputSchema = z.object({ profile: companyProfileOutputSchema });
export const companyProfileOptionsOutputSchema = optionsOutputSchema;
