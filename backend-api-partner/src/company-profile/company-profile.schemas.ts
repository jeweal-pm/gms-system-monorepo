import { z } from "zod";
import { phoneSchema } from "../common/partner-schemas";

/** company-profile SA revision 3 contract (document/apps/backend/partner/company-profile/api-contract.md). */

export const LOGO_MAX_BYTES = 10 * 1024 * 1024;
export const LOGO_TYPES = ["image/jpeg", "image/png"] as const;
export type LogoContentType = (typeof LOGO_TYPES)[number];
export const BANK_DETAILS_MAX_CHARS = 5_000;

const text = (max: number) => z.string().trim().max(max);
const required = (max: number) => z.string().trim().min(1).max(max);

/** Multi-line plain text (SA-CP-13): line breaks normalized to LF, trailing whitespace trimmed, `""` when empty. */
export const plainText = (maxChars: number) =>
  z.string().transform((value, ctx) => {
    const normalized = value.replace(/\r\n?/g, "\n").trimEnd();
    if (normalized.length > maxChars) {
      ctx.addIssue({ code: "custom", message: "too_long", params: { code: "too_long" } });
      return z.NEVER;
    }
    return normalized;
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
  roadStreet: text(300),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  state: required(100),
  // Optional (owner 2026-10-19): some places have no city; stored as "".
  city: z.string().trim().max(100),
  postcode: required(20),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  bankDetails: plainText(BANK_DETAILS_MAX_CHARS),
  showBankDetailsOnInvoice: z.boolean(),
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
