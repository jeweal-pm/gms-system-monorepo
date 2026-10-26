import { z } from "zod";
import { rateProblem } from "./rates";

/**
 * Currency form (currency UI rev 1). Rates are text so the field can show "0.0000" style values; the
 * base currency (Company Profile currency) has no rates, so they are validated only for other codes.
 */
export type CurrencyFormValues = {
  code: string;
  name: string;
  description: string;
  active: boolean;
  sellingRate: string;
  buyingRate: string;
};

export const CODE_PATTERN = /^[A-Za-z]{3}$/;
export const NAME_MAX = 100;
export const DESCRIPTION_MAX = 250;
export const CURRENCY_SEARCH_MAX = 100;

/** Focus order for the first invalid field. */
export const FIELD_ORDER = ["code", "name", "description", "sellingRate", "buyingRate"] as const satisfies readonly (keyof CurrencyFormValues)[];

export function emptyCurrencyForm(): CurrencyFormValues {
  return { code: "", name: "", description: "", active: true, sellingRate: "", buyingRate: "" };
}

/** True when `code` is the base currency (case-insensitive; no base before Company Profile is saved). */
export function isBaseCode(code: string, baseCode: string | null | undefined): boolean {
  return Boolean(baseCode) && code.trim().toUpperCase() === baseCode;
}

export function currencyFormSchema(baseCode: string | null) {
  return z
    .object({
      code: z.string().trim().regex(CODE_PATTERN, "Enter 3 letters, e.g. USD"),
      name: z.string().trim().min(1, "Name is required").max(NAME_MAX, `Use ${NAME_MAX} characters or fewer`),
      description: z.string().trim().min(1, "Description is required").max(DESCRIPTION_MAX, `Use ${DESCRIPTION_MAX} characters or fewer`),
      active: z.boolean(),
      sellingRate: z.string(),
      buyingRate: z.string(),
    })
    .superRefine((values, ctx) => {
      if (isBaseCode(values.code, baseCode)) return;
      for (const field of ["sellingRate", "buyingRate"] as const) {
        const problem = rateProblem(values[field]);
        if (problem) ctx.addIssue({ code: "custom", path: [field], message: problem });
      }
    });
}
