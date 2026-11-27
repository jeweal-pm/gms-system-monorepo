import { z } from "zod";
import { Decimal } from "../../platform/db";
import { isoDate } from "../load-to-stock/schemas";

/**
 * Merge/Split inputs (merge-split api-contract "Shared types", SA-MS-03, UT-MS-B01): strict objects, decimals as strings (weight
 * 3 dp, money 2 dp). SPLIT: 1–200 sources, every result names a source, each source ≥ 2 results whose Σ pcs / weight equal its
 * available (whole) quantity. MERGE: 2–200 sources, exactly one result (sourceKey null) = Σ of the sources. Result pcs ≥ 1; result
 * weight > 0 unless the taken weight is 0. ≤ 200 results, ≤ 5 distinct photos per result, distinct source keys and stocks.
 */
export const SOURCES_MAX = 200;
export const RESULTS_MAX = 200;
export const PHOTOS_MAX = 5;
export const PAGE_MAX = 50;
export const EXCLUDE_MAX = 200;
export const STATUSES = ["DRAFT", "PENDING_APPROVAL", "REVISION_REQUESTED", "APPROVED", "REJECTED"] as const;
export const MODES = ["SPLIT", "MERGE"] as const;

const weight = z.string().trim().regex(/^\d{1,9}(\.\d{1,3})?$/, { error: "invalid_decimal" });
const money = z.string().trim().regex(/^\d{1,16}(\.\d{1,2})?$/, { error: "invalid_decimal" });
const text = (max: number) => z.string().trim().max(max);
const uuid = z.uuid();

export const attrsSchema = z.object({
  stoneCodeId: uuid.nullable(), stoneCode: text(60), stone: text(60), shape: text(60), size: text(60), color: text(60),
  clarity: text(60), cutting: text(60), quality: text(60), cerType: text(20), cerNo: text(60),
}).strict();

export const sourceSchema = z.object({
  key: z.string().trim().min(1).max(40),
  stockUuid: uuid,
  availPcs: z.number().int().min(1).max(1_000_000_000),
  availWeightCt: weight,
}).strict();

export const resultSchema = z.object({
  id: uuid.optional(),
  sourceKey: z.string().trim().min(1).max(40).nullable(),
  attrs: attrsSchema,
  location: z.string().trim().min(1).max(40),
  lot: text(40),
  parcel: text(50),
  pcs: z.number().int().min(1).max(1_000_000_000),
  weightCt: weight,
  stockPrice: money,
  salePrice: money,
  itemNote: text(500),
  photoIds: z.array(uuid).max(PHOTOS_MAX),
}).strict();

const fields = {
  docDate: isoDate,
  mode: z.enum(MODES),
  ref: text(100).default(""),
  note: text(250).default(""),
  sources: z.array(sourceSchema).min(1).max(SOURCES_MAX),
  results: z.array(resultSchema).min(1).max(RESULTS_MAX),
};
type Shape = z.output<z.ZodObject<typeof fields>>;

export function mergeSplitRules(value: Shape, ctx: z.RefinementCtx) {
  const issue = (path: (string | number)[], code: string) => ctx.addIssue({ code: "custom", path, params: { code }, message: code });
  const keys = new Map<string, number>();
  const stocks = new Set<string>();
  value.sources.forEach((source, index) => {
    if (keys.has(source.key)) issue(["sources", index, "key"], "duplicate");
    else keys.set(source.key, index);
    if (stocks.has(source.stockUuid)) issue(["sources", index, "stockUuid"], "duplicate");
    stocks.add(source.stockUuid);
  });
  const ids = new Set<string>();
  value.results.forEach((result, index) => {
    if (result.id) {
      if (ids.has(result.id)) issue(["results", index, "id"], "duplicate");
      ids.add(result.id);
    }
    if (new Set(result.photoIds).size !== result.photoIds.length) issue(["results", index, "photoIds"], "duplicate");
  });
  if (value.mode === "MERGE") {
    if (value.sources.length < 2) issue(["sources"], "too_small");
    if (value.results.length !== 1) { issue(["results"], value.results.length < 1 ? "too_small" : "too_big"); return; }
    const result = value.results[0];
    if (result.sourceKey !== null) issue(["results", 0, "sourceKey"], "invalid");
    const pcs = value.sources.reduce((sum, source) => sum + source.availPcs, 0);
    const total = value.sources.reduce((sum, source) => sum.plus(source.availWeightCt), new Decimal(0));
    if (result.pcs !== pcs) issue(["results", 0, "pcs"], "sum_mismatch");
    if (!new Decimal(result.weightCt).equals(total)) issue(["results", 0, "weightCt"], "sum_mismatch");
    else if (total.greaterThan(0) && new Decimal(result.weightCt).lte(0)) issue(["results", 0, "weightCt"], "too_small");
    return;
  }
  // SPLIT
  const groups = new Map<string, number[]>();
  value.results.forEach((result, index) => {
    if (result.sourceKey === null || !keys.has(result.sourceKey)) { issue(["results", index, "sourceKey"], "invalid"); return; }
    groups.set(result.sourceKey, [...(groups.get(result.sourceKey) ?? []), index]);
  });
  value.sources.forEach((source, sourceIndex) => {
    const members = groups.get(source.key) ?? [];
    if (members.length < 2) { issue(["sources", sourceIndex, "key"], "split_needs_two"); return; }
    const pcs = members.reduce((sum, index) => sum + value.results[index].pcs, 0);
    const total = members.reduce((sum, index) => sum.plus(value.results[index].weightCt), new Decimal(0));
    if (pcs !== source.availPcs) issue(["sources", sourceIndex, "availPcs"], "sum_mismatch");
    if (!total.equals(source.availWeightCt)) issue(["sources", sourceIndex, "availWeightCt"], "sum_mismatch");
    if (new Decimal(source.availWeightCt).greaterThan(0)) {
      for (const index of members) if (new Decimal(value.results[index].weightCt).lte(0)) issue(["results", index, "weightCt"], "too_small");
    }
  });
}

export const mergeSplitInputSchema = z.object(fields).strict().superRefine(mergeSplitRules);
export const mergeSplitUpdateSchema = z.object({ ...fields, expectedVersion: z.number().int().min(1) }).strict().superRefine(mergeSplitRules);
export type MergeSplitInput = z.output<typeof mergeSplitInputSchema>;

export const versionSchema = z.object({ expectedVersion: z.number().int().min(1) }).strict();
export const reviseSchema = z.object({ expectedVersion: z.number().int().min(1), note: z.string().trim().min(1).max(500) }).strict();
export const rejectSchema = z.object({ expectedVersion: z.number().int().min(1), reason: z.string().trim().min(1).max(500) }).strict();

export const listQuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  mode: z.enum(MODES).optional(),
  deleted: z.enum(["true", "false"]).optional(),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).optional(),
}).strict();

export const nextNumberSchema = z.object({ docDate: isoDate }).strict();

export const stockQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  location: z.string().trim().min(1).max(40).optional(),
  exclude: z.array(uuid).max(EXCLUDE_MAX).default([]),
  excludeDocId: uuid.optional(),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).default(PAGE_MAX),
}).strict();
export type StockQuery = z.output<typeof stockQuerySchema>;

export const pendingQuerySchema = z.object({
  type: z.literal("merge-split"),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(["submittedAt", "docNo", "party", "qty", "value"]).default("submittedAt"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).default(PAGE_MAX),
}).strict();
