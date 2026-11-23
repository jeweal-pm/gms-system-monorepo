import { z } from "zod";
import { CARD_KEY, CARD_MAX_PAGE, CARD_PAGE_SIZES } from "../../stock/card";

/**
 * Query schemas of the Stock Card (api-contract.md "Types"): strict (unknown keys are refused), enumerated sorts, numbered
 * paging (page 1..200, pageSize 10 | 25 | 50), dates `YYYY-MM-DD`, `from <= to` (422 `to` / `before_from`), `q` <= 100.
 * An empty `q`, `location`, `from` or `to` is treated as absent.
 */
const code = (value: string) => ({ params: { code: value } });
const blankToUndefined = (value: string | undefined) => (value ? value : undefined);
const text = (max: number) => z.string().trim().max(max).optional().transform(blankToUndefined);
const date = z.string().trim().optional().transform(blankToUndefined).pipe(z.iso.date().optional());
const dir = z.enum(["asc", "desc"]).default("asc");
const page = z.string().regex(/^\d{1,4}$/).transform(Number).pipe(z.number().int().min(1).refine((value) => value <= CARD_MAX_PAGE, code("too_large"))).default(1);
const pageSize = z.enum(CARD_PAGE_SIZES.map(String) as [string, ...string[]]).transform(Number).default(25);

const range = (value: { from?: string; to?: string }, ctx: z.RefinementCtx) => {
  if (value.from && value.to && value.from > value.to) ctx.addIssue({ code: "custom", path: ["to"], message: "before_from", ...code("before_from") });
};

export const cardsQuerySchema = z.object({
  q: text(100), location: text(40), from: date, to: date,
  sort: z.enum(["stoneCode", "location", "lot", "balancePcs", "balanceWeightCt"]).default("stoneCode"), dir, page, pageSize,
}).strict().superRefine(range);

export const transactionsQuerySchema = z.object({
  q: text(100), from: date, to: date, sort: z.enum(["date", "docNo", "stockId", "account"]).default("date"), dir, page, pageSize,
}).strict().superRefine(range);

export const cardKeyParam = (value: string) => CARD_KEY.test(value);

/** Optional document metadata of the internal hold API (ADR-0056 D7): `null` clears, absent leaves the stored value. */
export const holdMetadataFields = {
  docDate: z.iso.date().nullable().optional(),
  party: z.object({ id: z.uuid(), name: z.string().trim().min(1).max(200) }).strict().nullable().optional(),
};
export const holdMetadataSchema = z.object(holdMetadataFields).strict();
