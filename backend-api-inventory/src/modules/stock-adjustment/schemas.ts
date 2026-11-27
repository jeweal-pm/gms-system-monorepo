import { z } from "zod";
import { isoDate } from "../load-to-stock/schemas";

export const PAGE_MAX = 50;
export const LINES_MAX = 200;
const uuid = z.uuid();
const text = (max: number) => z.string().trim().max(max);
const decimal = (whole: number, scale: number) => z.string().trim().regex(new RegExp(`^\\d{1,${whole}}(\\.\\d{1,${scale}})?$`), { error: "invalid_decimal" });

export const lineSchema = z.object({
  id: uuid.optional(), stockUuid: uuid, stockPcs: z.number().int().min(0).max(999_999),
  stockWeightCt: decimal(9, 3), physicalPcs: z.number().int().min(0).max(999_999),
  physicalWeightCt: decimal(9, 3), physicalPrice: decimal(16, 2).nullable(), remark: text(250).default(""),
}).strict();

const documentFields = {
  docDate: isoDate, location: z.string().trim().min(1).max(40), ref: text(100).default(""), note: text(250).default(""),
  lines: z.array(lineSchema).min(1).max(LINES_MAX),
};
function uniqueStocks(value: { lines: { stockUuid: string }[] }, ctx: z.RefinementCtx) {
  const seen = new Set<string>();
  value.lines.forEach((line, index) => {
    if (seen.has(line.stockUuid)) ctx.addIssue({ code: "custom", path: ["lines", index, "stockUuid"], message: "duplicate" });
    seen.add(line.stockUuid);
  });
}
export const inputSchema = z.object(documentFields).strict().superRefine(uniqueStocks);
export const updateSchema = z.object({ ...documentFields, expectedVersion: z.number().int().min(1) }).strict().superRefine(uniqueStocks);
export const versionSchema = z.object({ expectedVersion: z.number().int().min(1) }).strict();
export const reviseSchema = z.object({ expectedVersion: z.number().int().min(1), note: z.string().trim().min(1).max(500) }).strict();
export const rejectSchema = z.object({ expectedVersion: z.number().int().min(1), reason: z.string().trim().min(1).max(500) }).strict();
export const listQuerySchema = z.object({ status: z.enum(["DRAFT", "PENDING_APPROVAL", "REVISION_REQUESTED", "APPROVED", "REJECTED"]).optional(), deleted: z.enum(["true", "false"]).optional(), q: z.string().trim().max(100).optional(), cursor: z.string().max(300).optional(), limit: z.coerce.number().int().min(1).max(PAGE_MAX).default(PAGE_MAX) }).strict();
export const nextNumberSchema = z.object({ docDate: isoDate }).strict();
export const stockQuerySchema = z.object({ location: z.string().trim().min(1).max(40), q: z.string().trim().max(100).optional(), exclude: z.array(uuid).max(LINES_MAX).default([]), cursor: z.string().max(300).optional(), limit: z.coerce.number().int().min(1).max(PAGE_MAX).default(PAGE_MAX) }).strict();
export const pendingQuerySchema = z.object({ type: z.literal("stock-adjustment"), q: z.string().trim().max(100).optional(), cursor: z.string().max(300).optional(), limit: z.coerce.number().int().min(1).max(PAGE_MAX).default(PAGE_MAX) }).strict();
export type AdjustmentInput = z.output<typeof inputSchema>;
