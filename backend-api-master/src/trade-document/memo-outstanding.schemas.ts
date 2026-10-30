import { z } from "zod";

/**
 * memoOutstanding.* inputs (memo-outstanding-vendor SA revision 1, api-contract.md). All bounded: q ≤ 100 chars,
 * vendorIds ≤ 50, doc-date range ≤ 366 days with from ≤ to, pageSize 10 | 25 | 50, memoReceiveIds 1–25.
 */
const DAY_MS = 86_400_000;
export const MEMO_OUTSTANDING_VENDOR_IDS_MAX = 50;
export const MEMO_OUTSTANDING_ITEM_DOCS_MAX = 25;
export const MEMO_OUTSTANDING_PAGE_MAX = 10_000;
export const MEMO_OUTSTANDING_SORT_KEYS = [
  "docNo", "dueDate", "vendorName", "memoPcs", "returnPcs", "soldPcs", "reservePcs", "outstandingPcs", "openValue",
] as const;
export type MemoOutstandingSortKey = (typeof MEMO_OUTSTANDING_SORT_KEYS)[number];

const filterFields = {
  q: z.string().trim().max(100).optional(),
  vendorIds: z.array(z.uuid()).max(MEMO_OUTSTANDING_VENDOR_IDS_MAX).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
};

function dateRange(value: { from?: string; to?: string }, ctx: z.RefinementCtx) {
  if (!value.from || !value.to) return;
  const days = (Date.parse(value.to) - Date.parse(value.from)) / DAY_MS;
  if (days < 0) ctx.addIssue({ code: "custom", path: ["to"], params: { code: "before_from" }, message: "before_from" });
  else if (days > 366) ctx.addIssue({ code: "custom", path: ["to"], params: { code: "range_too_long" }, message: "range_too_long" });
}

export const memoOutstandingFiltersSchema = z.object(filterFields).strict().superRefine(dateRange);
export type MemoOutstandingFilters = z.output<typeof memoOutstandingFiltersSchema>;

export const memoOutstandingListSchema = z.object({
  ...filterFields,
  page: z.number().int().min(1).max(MEMO_OUTSTANDING_PAGE_MAX).default(1),
  pageSize: z.union([z.literal(10), z.literal(25), z.literal(50)]).default(10),
  sort: z.enum(MEMO_OUTSTANDING_SORT_KEYS).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
}).strict().superRefine(dateRange);
export type MemoOutstandingListInput = z.output<typeof memoOutstandingListSchema>;

export const memoOutstandingItemsSchema = z.object({
  memoReceiveIds: z.array(z.uuid()).min(1).max(MEMO_OUTSTANDING_ITEM_DOCS_MAX),
}).strict();
export type MemoOutstandingItemsInput = z.output<typeof memoOutstandingItemsSchema>;

export const memoOutstandingOptionsSchema = z.object({}).strict().optional();
