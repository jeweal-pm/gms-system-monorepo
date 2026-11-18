import { z } from "zod";

/**
 * Load to Stock inputs (api-contract "Documents", SA-LS-09): strict objects, decimals as strings with scale limits,
 * 1–200 rows, ≤ 200 source picks in total, mode shape rules (NONE 1:1, SPLIT one source per row, MERGE one row with
 * ≥ 2 sources), ≤ 5 distinct photos per row, required location / stock price / sale price.
 */
export const ROWS_MAX = 200;
export const SOURCES_MAX = 200;
export const PAGE_MAX = 50;
export const MODES = ["NONE", "SPLIT", "MERGE"] as const;
export const STATUSES = ["DRAFT", "PENDING_APPROVAL", "REVISION_REQUESTED", "APPROVED", "REJECTED"] as const;
export type Mode = (typeof MODES)[number];
export type Status = (typeof STATUSES)[number];

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, { params: { code: "invalid_date" } });

/** ≥ 0, at most `scale` decimals, as a string. */
const decimal = (integer: number, scale: number) => z.string().regex(new RegExp(`^\\d{1,${integer}}(\\.\\d{1,${scale}})?$`), { error: "invalid_decimal" });
export const weightDec = decimal(9, 3);
export const moneyDec = decimal(16, 2);

const text = (max: number) => z.string().trim().max(max);
const uuid = z.uuid();

export const stoneAttrsSchema = z.object({
  stoneCodeId: uuid.nullable(),
  stoneCode: text(60), stone: text(60), shape: text(60), size: text(60), color: text(60), clarity: text(60), cutting: text(60), quality: text(60),
  lot: text(40), cerType: text(20), cerNo: text(60),
}).strict();
export type StoneAttrsInput = z.output<typeof stoneAttrsSchema>;

export const rowSourceSchema = z.object({
  purchaseLineId: uuid,
  pcs: z.number().int().min(0).max(1_000_000_000),
  weightCt: weightDec,
}).strict();

export const rowSchema = z.object({
  id: uuid.optional(),
  sources: z.array(rowSourceSchema).min(1).max(SOURCES_MAX),
  location: z.string().trim().min(1).max(40),
  parcel: text(50).optional(),
  attrs: stoneAttrsSchema,
  stockPrice: moneyDec,
  salePrice: moneyDec,
  itemNote: text(500).optional(),
  photoIds: z.array(uuid).max(5).refine((ids) => new Set(ids).size === ids.length, { params: { code: "duplicate" } }),
}).strict();
export type RowInput = z.output<typeof rowSchema>;

const loadFields = {
  docDate: isoDate,
  vendorId: uuid,
  ref: text(100).optional(),
  documentNote: text(250).optional(),
  mode: z.enum(MODES),
  rows: z.array(rowSchema).min(1).max(ROWS_MAX),
};

type LoadShape = { mode: Mode; rows: RowInput[] };

/** SA-LS-09 shape rules; every refusal is a field error `{path, code}` (`mode_shape`, `duplicate`, `too_big`). */
function shapeRules(value: LoadShape, ctx: z.RefinementCtx) {
  const issue = (path: (string | number)[], code: string) => ctx.addIssue({ code: "custom", path, params: { code }, message: code });
  const total = value.rows.reduce((sum, row) => sum + row.sources.length, 0);
  if (total > SOURCES_MAX) issue(["rows"], "too_big");
  const rowIds = new Set<string>();
  const usedByRow = new Map<string, number>();
  value.rows.forEach((row, index) => {
    if (row.id) {
      if (rowIds.has(row.id)) issue(["rows", index, "id"], "duplicate");
      rowIds.add(row.id);
    }
    const seen = new Set<string>();
    row.sources.forEach((source, sourceIndex) => {
      if (seen.has(source.purchaseLineId)) issue(["rows", index, "sources", sourceIndex, "purchaseLineId"], "duplicate");
      seen.add(source.purchaseLineId);
    });
    if (value.mode !== "MERGE" && row.sources.length !== 1) issue(["rows", index, "sources"], "mode_shape");
    if (value.mode === "NONE") {
      const line = row.sources[0]?.purchaseLineId;
      if (line && usedByRow.has(line)) issue(["rows", index, "sources", 0, "purchaseLineId"], "mode_shape");
      if (line) usedByRow.set(line, index);
    }
  });
  if (value.mode === "MERGE" && (value.rows.length !== 1 || value.rows[0].sources.length < 2)) issue(["rows"], "mode_shape");
}

export const loadInputSchema = z.object(loadFields).strict().superRefine(shapeRules);
export const loadUpdateSchema = z.object({ ...loadFields, expectedVersion: z.number().int().min(1) }).strict().superRefine(shapeRules);
export type LoadInput = z.output<typeof loadInputSchema>;

export const versionSchema = z.object({ expectedVersion: z.number().int().min(1) }).strict();
export const reviseSchema = z.object({ expectedVersion: z.number().int().min(1), note: z.string().trim().min(1).max(500) }).strict();
export const rejectSchema = z.object({ expectedVersion: z.number().int().min(1), reason: z.string().trim().min(1).max(500) }).strict();

export const searchSchema = z.object({
  vendorId: uuid.optional(),
  q: z.string().trim().max(100).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  excludeLineIds: z.array(uuid).max(200).optional(),
  excludeAllocationOf: uuid.optional(),
  cursor: z.string().max(300).nullish(),
  limit: z.number().int().min(1).max(PAGE_MAX).optional(),
}).strict();

export const listQuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  deleted: z.enum(["true", "false"]).optional(),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).optional(),
}).strict();

export const vendorsQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).optional(),
}).strict();

export const nextNumberSchema = z.object({ docDate: isoDate }).strict();

export const pendingQuerySchema = z.object({
  type: z.literal("load-to-stock"),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(["submittedAt", "docNo", "party", "qty", "value"]).default("submittedAt"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).default(PAGE_MAX),
}).strict();
