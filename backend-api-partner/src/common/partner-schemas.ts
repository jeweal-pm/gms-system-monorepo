import { z } from "zod";
import { MAX_CURSOR_LENGTH } from "./cursor";
import type { FieldError } from "./errors";
import { COUNTRY_CODES, CURRENCY_CODES } from "./reference-data";

/**
 * Partner Master building blocks shared by customer (SA rev 1) and vendor (SA rev 1, D-V09).
 * Bodies are the customer ones moved without change; identical rules to the gateway.
 */

export const MAX_ADDRESSES = 10;
export const LIST_LIMIT_MAX = 50;

/** Optional text: trimmed, bounded, empty after trimming becomes `null`. */
export const optText = (max: number) =>
  z.string().trim().max(max).transform((value) => (value === "" ? null : value)).nullable();

/**
 * ADR-0021: required Code Name — trimmed, 1–120 characters. Empty after trimming is
 * `{path:"code", code:"required"}`; a missing/`null` value is zod's `invalid_type`.
 */
export const CODE_MAX = 120;
export const requiredCodeSchema = z.string().trim().max(CODE_MAX).superRefine((value, ctx) => {
  if (value === "") ctx.addIssue({ code: "custom", message: "required", params: { code: "required" } });
});

export const phoneSchema = z.object({
  country: z.string().regex(/^[A-Z]{2}$/),
  e164: z.string().regex(/^\+[1-9]\d{6,14}$/),
}).strict();

export const addressBase = {
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().min(1).max(500),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  state: z.string().trim().min(1).max(100),
  city: z.string().trim().min(1).max(100),
  postcode: z.string().trim().min(1).max(20),
  isDefault: z.boolean(),
};

export const invoiceAddressInput = z.object({ ...addressBase, taxId: optText(32) }).strict();

/** Scalar fields common to every partner entity (name … email), in contract order. */
export const partnerScalarFields = {
  name: z.string().trim().min(1).max(200),
  code: requiredCodeSchema,
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  active: z.boolean(),
  firstName: z.string().trim().min(1).max(100),
  middleName: optText(100),
  lastName: optText(100),
  phone: phoneSchema.nullable(),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
};

/** At most one `isDefault: true` per array → `{path: <array>, code: "multiple_defaults"}`. Zero is allowed. */
export function atMostOneDefault(addresses: { isDefault: boolean }[], ctx: z.RefinementCtx) {
  if (addresses.filter((address) => address.isDefault).length > 1) {
    ctx.addIssue({ code: "custom", message: "multiple_defaults", params: { code: "multiple_defaults" } });
  }
}

/** `expectedUpdatedAt` of a full-replacement PUT (customer D-05). */
export const expectedUpdatedAtSchema = z.iso.datetime({ offset: false, precision: 3 });

export const entityIdSchema = z.uuid();

/** Query parameters are strings; repeated parameters (arrays) fail validation. */
export const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  active: z.enum(["true", "false"]).optional(),
  cursor: z.string().max(MAX_CURSOR_LENGTH).optional(),
  limit: z.string().regex(/^\d{1,3}$/).transform(Number).pipe(z.number().int().min(1).max(LIST_LIMIT_MAX)).optional(),
}).strict();

export type ListQuery = z.output<typeof listQuerySchema>;
export type PartnerScalarInput = z.output<z.ZodObject<typeof partnerScalarFields>>;

/**
 * D-09: currency/country must be in the runtime lists, or equal to a value already stored on this
 * record (update). Address lists are checked in the order given (field paths `<field>.<index>.countryCode`).
 */
export function membershipErrors(
  currencyCode: string,
  addressLists: ReadonlyArray<readonly [field: string, addresses: ReadonlyArray<{ countryCode: string }>]>,
  stored?: { currencyCode: string; countryCodes: Set<string> },
): FieldError[] {
  const errors: FieldError[] = [];
  if (!CURRENCY_CODES.has(currencyCode) && currencyCode !== stored?.currencyCode) errors.push({ path: "currencyCode", code: "unknown" });
  for (const [field, addresses] of addressLists) {
    addresses.forEach((address, index) => {
      if (!COUNTRY_CODES.has(address.countryCode) && !stored?.countryCodes.has(address.countryCode)) errors.push({ path: `${field}.${index}.countryCode`, code: "unknown" });
    });
  }
  return errors;
}
