import { z } from "zod";
import { isoDate } from "../load-to-stock/schemas";

/**
 * Stock Transfer Location inputs (stock-transfer-location api-contract "Types", ADR-0060 D2/D12/D13): strict objects, decimals as
 * strings (weight ≤ 3 dp), 1–200 lines, one source stock per line (one lot per row), pcs > 0 or weight > 0, pcs / weight not above
 * the on-hand snapshot of the pick, a non-empty New Location that differs from the snapshot location.
 */
export const LINES_MAX = 200;
export const PAGE_MAX = 50;
export const EXCLUDE_MAX = 200;
export const STATUSES = ["DRAFT", "PENDING_APPROVAL", "REVISION_REQUESTED", "APPROVED", "REJECTED"] as const;
export type TransferStatus = (typeof STATUSES)[number];

const weight = z.string().trim().regex(/^\d{1,9}(\.\d{1,3})?$/, { error: "invalid_decimal" });
const text = (max: number) => z.string().trim().max(max);
const uuid = z.uuid();
const location = z.string().trim().min(1).max(40);

export const lineSchema = z.object({
  id: uuid.optional(),
  fromStockUuid: uuid,
  onHandPcs: z.number().int().min(0).max(1_000_000_000),
  onHandWeightCt: weight,
  toLocation: location,
  pcs: z.number().int().min(0).max(1_000_000_000),
  weightCt: weight,
  remark: text(250).optional(),
}).strict();
export type LineInput = z.output<typeof lineSchema>;

const fields = {
  docDate: isoDate,
  ref: text(100).default(""),
  note: text(250).optional(),
  lines: z.array(lineSchema).min(1).max(LINES_MAX),
};
type Shape = z.output<z.ZodObject<typeof fields>>;

export function transferRules(value: Shape, ctx: z.RefinementCtx) {
  const issue = (path: (string | number)[], code: string) => ctx.addIssue({ code: "custom", path, params: { code }, message: code });
  const ids = new Set<string>();
  const stocks = new Set<string>();
  value.lines.forEach((line, index) => {
    if (line.id) {
      if (ids.has(line.id)) issue(["lines", index, "id"], "duplicate");
      ids.add(line.id);
    }
    if (stocks.has(line.fromStockUuid)) issue(["lines", index, "fromStockUuid"], "duplicate");
    stocks.add(line.fromStockUuid);
    if (line.pcs <= 0 && Number(line.weightCt) <= 0) issue(["lines", index, "pcs"], "required");
    if (line.pcs > line.onHandPcs) issue(["lines", index, "pcs"], "too_big");
    if (Number(line.weightCt) > Number(line.onHandWeightCt)) issue(["lines", index, "weightCt"], "too_big");
  });
}

export const transferInputSchema = z.object(fields).strict().superRefine(transferRules);
export const transferUpdateSchema = z.object({ ...fields, expectedVersion: z.number().int().min(1) }).strict().superRefine(transferRules);
export type TransferInput = z.output<typeof transferInputSchema>;

export const versionSchema = z.object({ expectedVersion: z.number().int().min(1) }).strict();
export const reviseSchema = z.object({ expectedVersion: z.number().int().min(1), note: z.string().trim().min(1).max(500) }).strict();
export const rejectSchema = z.object({ expectedVersion: z.number().int().min(1), reason: z.string().trim().min(1).max(500) }).strict();

export const listQuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  deleted: z.enum(["true", "false"]).optional(),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).optional(),
}).strict();

export const nextNumberSchema = z.object({ docDate: isoDate }).strict();

/** `GET /stock-transfer-location/stock`: `exclude` as a comma list or repeated (≤ 200 stock uuids). */
export const stockQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  location: z.string().trim().min(1).max(40).optional(),
  exclude: z.array(uuid).max(EXCLUDE_MAX).default([]),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).default(PAGE_MAX),
}).strict();
export type StockQuery = z.output<typeof stockQuerySchema>;

export const pendingQuerySchema = z.object({
  type: z.literal("stock-transfer-location"),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(["submittedAt", "docNo", "party", "qty", "value"]).default("submittedAt"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).default(PAGE_MAX),
}).strict();
