import { AppError } from "../../platform/errors";
import type { Tx } from "../../platform/db";
import type { PriceUnit } from "../../platform/master-api";
import type { ConversionMode, ConversionResult, ConversionSource, ResultAttrs } from "../stock/convert";

/**
 * Set-based writes of a Merge/Split document (SA-MS-02): sources, results and photos are one INSERT each (≤ 200 rows); a replace is
 * two DELETEs (results → cascade photos; sources) + the inserts, whatever the line count.
 */
export const LEAF = "merge-split";

export type NormalizedSource = {
  id: string; key: string; position: number; stockUuid: string; stockId: string; availPcs: number; availWeightCt: string;
  priceUnit: PriceUnit; unitCostBase: string; takeCostBase: string;
};
export type NormalizedResult = {
  id: string; position: number; sourceId: string | null; attrs: ResultAttrs; location: string; lot: string; parcel: string; priceUnit: PriceUnit;
  pcs: number; weightCt: string; unitCostBase: string; costAmountBase: string; stockPrice: string; salePrice: string; itemNote: string; photoIds: string[];
};
export type NormalizedDoc = {
  docDate: string; mode: ConversionMode; ref: string; note: string; sources: NormalizedSource[]; results: NormalizedResult[];
  totals: { pcs: number; weightCt: string };
};

export const toConversionSource = (source: NormalizedSource): ConversionSource => ({
  sourceId: source.id, key: source.key, stockUuid: source.stockUuid, availPcs: source.availPcs, availWeightCt: source.availWeightCt,
});
export const toConversionResult = (result: NormalizedResult): ConversionResult => ({
  resultId: result.id, position: result.position, sourceId: result.sourceId, attrs: result.attrs, location: result.location, lot: result.lot, parcel: result.parcel,
  pcs: result.pcs, weightCt: result.weightCt, stockPrice: result.stockPrice, salePrice: result.salePrice, itemNote: result.itemNote, photoIds: result.photoIds,
});

export async function insertLines(tx: Tx, docId: string, doc: NormalizedDoc) {
  await tx.merge_split_source.createMany({
    data: doc.sources.map((source) => ({
      id: source.id, merge_split_id: docId, position: source.position, client_key: source.key, stock_uuid: source.stockUuid, stock_id: source.stockId,
      avail_pcs: source.availPcs, avail_weight_ct: source.availWeightCt, price_unit: source.priceUnit, unit_cost_base: source.unitCostBase, take_cost_base: source.takeCostBase,
    })),
  });
  await tx.merge_split_result.createMany({
    data: doc.results.map((result) => ({
      id: result.id, merge_split_id: docId, position: result.position, source_id: result.sourceId, stone_code_id: result.attrs.stoneCodeId, stone_code: result.attrs.stoneCode,
      stone: result.attrs.stone, shape: result.attrs.shape, size: result.attrs.size, color: result.attrs.color, clarity: result.attrs.clarity, cutting: result.attrs.cutting,
      quality: result.attrs.quality, cer_type: result.attrs.cerType, cer_no: result.attrs.cerNo, location: result.location, lot: result.lot, parcel: result.parcel,
      price_unit: result.priceUnit, pcs: result.pcs, weight_ct: result.weightCt, unit_cost_base: result.unitCostBase, cost_amount_base: result.costAmountBase,
      stock_price: result.stockPrice, sale_price: result.salePrice, item_note: result.itemNote,
    })),
  });
  const photos = doc.results.flatMap((result) => result.photoIds.map((fileId, index) => ({ result_id: result.id, position: index + 1, file_id: fileId })));
  if (photos.length > 0) await tx.merge_split_result_photo.createMany({ data: photos });
}

/** Replaces every line (an applied document was reversed first, so no result holds a stock). */
export async function replaceLines(tx: Tx, docId: string, doc: NormalizedDoc) {
  await tx.$executeRaw`DELETE FROM "inventory"."merge_split_result" WHERE "merge_split_id" = ${docId}::uuid`;
  await tx.$executeRaw`DELETE FROM "inventory"."merge_split_source" WHERE "merge_split_id" = ${docId}::uuid`;
  await insertLines(tx, docId, doc);
}

export const headerFields = (doc: NormalizedDoc) => ({
  doc_date: new Date(`${doc.docDate}T00:00:00Z`), mode: doc.mode, ref: doc.ref.slice(0, 100), note: doc.note.slice(0, 250),
  source_count: doc.sources.length, result_count: doc.results.length, total_pcs: doc.totals.pcs, total_weight_ct: doc.totals.weightCt,
});

/** Running number per Document Setup row: max + 1 under a transaction advisory lock (ADR-0052 D10 pattern). */
export async function nextRunningNo(tx: { $queryRaw: Tx["$queryRaw"] }, numbering: { id: string | null; startNo: number }, lock: boolean): Promise<number> {
  const key = `inventory.merge_split.numbering:${numbering.id ?? "default"}`;
  if (lock) await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${key}))) AS l`;
  const rows = numbering.id
    ? await tx.$queryRaw<{ max: number | null }[]>`SELECT max("running_no") AS "max" FROM "inventory"."merge_split" WHERE "numbering_id" = ${numbering.id}::uuid`
    : await tx.$queryRaw<{ max: number | null }[]>`SELECT max("running_no") AS "max" FROM "inventory"."merge_split" WHERE "numbering_id" IS NULL`;
  const max = rows[0]?.max ?? null;
  return max === null ? numbering.startNo : Math.max(max + 1, numbering.startNo);
}

export const formatDocNo = (numbering: { prefix: string; separator: string }, runningNo: number) => `${numbering.prefix}${numbering.separator}${runningNo}`;

/**
 * Owner 2026-11-27: with no Document Setup row for `merge-split`, use the Document Setup default
 * (code "MS", master `DOCUMENT_TRANSACTIONS`) with the usual "-" separator, starting at 1, instead of
 * refusing with NUMBERING_NOT_CONFIGURED. Default-numbered documents store `numbering_id` NULL.
 */
export const DEFAULT_NUMBERING = { id: null, prefix: "MS", separator: "-", startNo: 1 } as const;

export const numberingOrDefault = <T extends { id: string; prefix: string; separator: string; startNo: number }>(numbering: T | null) =>
  numbering ?? DEFAULT_NUMBERING;

/** In an allowed list: an APPROVED document whose effect may be reversed (`APPROVED_AUTO` = auto-approved only, `APPROVED_ANY` = any). */
export const APPROVED_AUTO = "APPROVED_AUTO";
export const APPROVED_ANY = "APPROVED_ANY";

/**
 * Explains a guarded-update miss: not found → 404; deleted (or, for restore, not deleted) / status outside `allowed` → 409
 * MERGE_SPLIT_STATUS {status}; otherwise the version moved → 409 VERSION_CONFLICT {currentVersion}.
 */
export async function explainMiss(tx: { $queryRaw: Tx["$queryRaw"] }, id: string, allowed: readonly string[], options: { deleted?: boolean } = {}): Promise<never> {
  const [row] = await tx.$queryRaw<{ status: string; version: number; deleted_at: Date | null; auto_approved: boolean }[]>`
    SELECT "status", "version", "deleted_at", "auto_approved" FROM "inventory"."merge_split" WHERE "id" = ${id}::uuid`;
  if (!row) throw new AppError(404, "MERGE_SPLIT_NOT_FOUND");
  if (options.deleted && !row.deleted_at) throw new AppError(409, "MERGE_SPLIT_STATUS", { status: row.status });
  if (!options.deleted && row.deleted_at) throw new AppError(409, "MERGE_SPLIT_STATUS", { status: "DELETED" });
  const permitted = options.deleted || allowed.includes(row.status)
    || (row.status === "APPROVED" && (allowed.includes(APPROVED_ANY) || (row.auto_approved && allowed.includes(APPROVED_AUTO))));
  if (!permitted) throw new AppError(409, "MERGE_SPLIT_STATUS", { status: row.status });
  throw new AppError(409, "VERSION_CONFLICT", { currentVersion: row.version });
}
