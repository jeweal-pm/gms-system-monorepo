import { z } from "zod";
import { phoneSchema } from "../common/partner-schemas";
import { parseRichText } from "./rich-text";

/** company-profile SA revision 2 contract (document/apps/backend/partner/company-profile/api-contract.md). */

export const LOGO_MAX_BYTES = 10 * 1024 * 1024;
export const LOGO_TYPES = ["image/jpeg", "image/png"] as const;
export type LogoContentType = (typeof LOGO_TYPES)[number];
export const BANK_DETAILS_MAX_CHARS = 5_000;
export const TERMS_MAX_CHARS = 10_000;

const text = (max: number) => z.string().trim().max(max);
const required = (max: number) => z.string().trim().min(1).max(max);

/** Rich text (SA-CP-03): validated and normalized JSON, or null when empty. */
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

export const companyProfileFields = {
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
};

export const saveCompanyProfileBodySchema = z.object({
  ...companyProfileFields,
  expectedVersion: z.number().int().min(1).nullable(),
}).strict();

export type SaveCompanyProfileInput = z.output<typeof saveCompanyProfileBodySchema>;

/** `?expectedVersion=<n>` on the logo routes. */
export const expectedVersionQuerySchema = z.object({
  expectedVersion: z.string().regex(/^\d{1,9}$/).transform(Number).pipe(z.number().int().min(1)),
}).strict();
