import { createHash } from "node:crypto";
import { AppError, validationError } from "../../platform/errors";
import { Decimal, Prisma, type Client, type Db } from "../../platform/db";
import type { MasterApi } from "../../platform/master-api";
import { canApprove, type Principal } from "../../platform/auth/principal";
import { sourceAmount } from "../load-to-stock/cost";
import { decodeStockCursor, encodeStockCursor } from "../stock/lots";
import { formatDocNo, LEAF, nextRunningNo, numberingOrDefault } from "./repository";
import type { StockQuery } from "./schemas";

/**
 * Merge/Split reads (api-contract "Public endpoints"; N+1 review in testing.md):
 * - detail: 2 statements for any line count (header + approval switch; ONE statement returning sources and results as JSON with
 *   their photos and live stock facts);
 * - daybook, From Stock picker, Approve Center pending: ONE keyset statement each (limit + 1), no per-row lookups;
 * - summary: one statement; next number: one master call + one local max; stock photos: one statement.
 */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (character) => `\\${character}`);
const w3 = (value: string | number) => new Decimal(value).toFixed(3);
const m2 = (value: string | number) => new Decimal(value).toFixed(2);
const u4 = (value: string | number) => new Decimal(value).toFixed(4);
const iso = (value: Date | null) => (value ? value.toISOString() : null);
const encode = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

type HeaderRow = {
  id: string; doc_no: string; doc_date: string; mode: "SPLIT" | "MERGE"; ref: string; note: string; status: string; auto_approved: boolean; version: number; revision_count: number;
  submitted_at: Date | null; submitted_by: string | null; submitted_by_name: string | null; review_action: string | null; review_note: string | null;
  reviewed_at: Date | null; reviewed_by: string | null; reviewed_by_name: string | null; deleted_at: Date | null; require_approval: boolean | null;
};
type SourceJson = {
  id: string; position: number; key: string; stock_uuid: string; stock_id: string; avail_pcs: number; avail_weight_ct: string; price_unit: "PER_CT" | "PER_PCS";
  unit_cost_base: string; take_cost_base: string; location: string | null; lot: string | null; ref_doc_no: string | null; ref_doc_date: string | null;
  stone_code_id: string | null; stone_code: string | null; stone: string | null; shape: string | null; size: string | null; color: string | null; clarity: string | null;
  cutting: string | null; quality: string | null; cer_type: string | null; cer_no: string | null;
};
type ResultJson = {
  id: string; position: number; source_key: string | null; stone_code_id: string | null; stone_code: string; stone: string; shape: string; size: string; color: string;
  clarity: string; cutting: string; quality: string; cer_type: string; cer_no: string; location: string; lot: string; parcel: string; price_unit: "PER_CT" | "PER_PCS";
  pcs: number; weight_ct: string; unit_cost_base: string; cost_amount_base: string; stock_price: string; sale_price: string; item_note: string; stock_uuid: string | null;
  stock_id: string | null; in_use: boolean; photo_ids: string[];
};

export async function getDetail(db: Db, id: string) {
  const [header] = await db.$queryRaw<HeaderRow[]>`
    SELECT h."id", h."doc_no", to_char(h."doc_date", 'YYYY-MM-DD') AS "doc_date", h."mode", h."ref", h."note", h."status", h."auto_approved", h."version", h."revision_count",
      h."submitted_at", h."submitted_by", h."submitted_by_name", h."review_action", h."review_note", h."reviewed_at", h."reviewed_by", h."reviewed_by_name", h."deleted_at",
      (SELECT a."require_approval" FROM "inventory"."approval_setting" a WHERE a."type" = 'merge-split') AS "require_approval"
    FROM "inventory"."merge_split" h WHERE h."id" = ${id}::uuid`;
  if (!header) throw new AppError(404, "MERGE_SPLIT_NOT_FOUND");
  const [lines] = await db.$queryRaw<{ sources: SourceJson[]; results: ResultJson[] }[]>`
    SELECT
      (SELECT COALESCE(json_agg(x ORDER BY x."position"), '[]'::json) FROM (
        SELECT src."id", src."position", src."client_key" AS "key", src."stock_uuid", src."stock_id", src."avail_pcs", src."avail_weight_ct"::text AS "avail_weight_ct",
          src."price_unit", src."unit_cost_base"::text AS "unit_cost_base", src."take_cost_base"::text AS "take_cost_base", s."location", s."lot", s."ref_doc_no",
          to_char(s."ref_doc_date", 'YYYY-MM-DD') AS "ref_doc_date", s."stone_code_id", s."stone_code", s."stone", s."shape", s."size", s."color", s."clarity", s."cutting",
          s."quality", s."cer_type", s."cer_no"
        FROM "inventory"."merge_split_source" src LEFT JOIN "inventory"."stock" s ON s."id" = src."stock_uuid"
        WHERE src."merge_split_id" = ${id}::uuid) x) AS "sources",
      (SELECT COALESCE(json_agg(y ORDER BY y."position"), '[]'::json) FROM (
        SELECT r."id", r."position", src."client_key" AS "source_key", r."stone_code_id", r."stone_code", r."stone", r."shape", r."size", r."color", r."clarity", r."cutting",
          r."quality", r."cer_type", r."cer_no", r."location", r."lot", r."parcel", r."price_unit", r."pcs", r."weight_ct"::text AS "weight_ct",
          r."unit_cost_base"::text AS "unit_cost_base", r."cost_amount_base"::text AS "cost_amount_base", r."stock_price"::text AS "stock_price",
          r."sale_price"::text AS "sale_price", r."item_note", r."stock_uuid", r."stock_id",
          (r."stock_uuid" IS NOT NULL AND (s."status" IS DISTINCT FROM 'ACTIVE' OR s."version" IS DISTINCT FROM r."applied_version")) AS "in_use",
          COALESCE((SELECT json_agg(p."file_id" ORDER BY p."position") FROM "inventory"."merge_split_result_photo" p WHERE p."result_id" = r."id"), '[]'::json) AS "photo_ids"
        FROM "inventory"."merge_split_result" r
        LEFT JOIN "inventory"."merge_split_source" src ON src."id" = r."source_id"
        LEFT JOIN "inventory"."stock" s ON s."id" = r."stock_uuid"
        WHERE r."merge_split_id" = ${id}::uuid) y) AS "results"`;
  const sources = lines.sources.map((row) => ({
    id: row.id, position: row.position, key: row.key, stockUuid: row.stock_uuid, availPcs: row.avail_pcs, availWeightCt: w3(row.avail_weight_ct),
    stockId: row.stock_id, location: row.location ?? "", lot: row.lot ?? "", priceUnit: row.price_unit, unitCostBase: u4(row.unit_cost_base),
    takeCostBase: m2(row.take_cost_base), refDocNo: row.ref_doc_no ?? "", refDocDate: row.ref_doc_date ?? "",
    attrs: {
      stoneCodeId: row.stone_code_id, stoneCode: row.stone_code ?? "", stone: row.stone ?? "", shape: row.shape ?? "", size: row.size ?? "", color: row.color ?? "",
      clarity: row.clarity ?? "", cutting: row.cutting ?? "", quality: row.quality ?? "", cerType: row.cer_type ?? "", cerNo: row.cer_no ?? "",
    },
  }));
  const results = lines.results.map((row) => ({
    id: row.id, position: row.position, sourceKey: row.source_key,
    attrs: {
      stoneCodeId: row.stone_code_id, stoneCode: row.stone_code, stone: row.stone, shape: row.shape, size: row.size, color: row.color, clarity: row.clarity,
      cutting: row.cutting, quality: row.quality, cerType: row.cer_type, cerNo: row.cer_no,
    },
    location: row.location, lot: row.lot, parcel: row.parcel, pcs: row.pcs, weightCt: w3(row.weight_ct), stockPrice: m2(row.stock_price), salePrice: m2(row.sale_price),
    itemNote: row.item_note, photoIds: row.photo_ids, priceUnit: row.price_unit, unitCostBase: u4(row.unit_cost_base), costAmountBase: m2(row.cost_amount_base),
    stockUuid: row.stock_uuid, stockId: row.stock_id, inUse: row.in_use,
  }));
  const sum = <T>(rows: readonly T[], pcs: (row: T) => number, weight: (row: T) => string, cost: (row: T) => string) => ({
    pcs: rows.reduce((total, row) => total + pcs(row), 0),
    weightCt: rows.reduce((total, row) => total.plus(weight(row)), new Decimal(0)).toFixed(3),
    costBase: rows.reduce((total, row) => total.plus(cost(row)), new Decimal(0)).toFixed(2),
  });
  return {
    id: header.id, docNo: header.doc_no, docDate: header.doc_date, mode: header.mode, ref: header.ref, note: header.note, status: header.status,
    autoApproved: header.auto_approved, version: header.version, deleted: header.deleted_at !== null, sources, results,
    totals: {
      source: sum(sources, (row) => row.availPcs, (row) => row.availWeightCt, (row) => row.takeCostBase),
      result: sum(results, (row) => row.pcs, (row) => row.weightCt, (row) => row.costAmountBase),
    },
    approval: {
      requireApproval: header.require_approval ?? true, autoApproved: header.auto_approved, revisionCount: Math.min(header.revision_count, 1) as 0 | 1,
      submitted: header.submitted_at ? { at: header.submitted_at.toISOString(), by: header.submitted_by ?? "", byName: header.submitted_by_name } : null,
      review: header.review_action ? { action: header.review_action, note: header.review_note ?? "", at: iso(header.reviewed_at), by: header.reviewed_by ?? "", byName: header.reviewed_by_name } : null,
    },
  };
}

// ---------- daybook ----------

type ListCursor = { d: string; c: string; i: string };
function decodeListCursor(value: string): ListCursor {
  const invalid = () => validationError([{ path: "cursor", code: "invalid" }]);
  if (!/^[A-Za-z0-9_-]{1,300}$/.test(value)) throw invalid();
  let body: Partial<ListCursor>;
  try { body = JSON.parse(Buffer.from(value, "base64url").toString("utf8")); } catch { throw invalid(); }
  if (!body || typeof body.d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.d) || typeof body.c !== "string" || Number.isNaN(Date.parse(body.c)) || typeof body.i !== "string" || !/^[0-9a-f-]{36}$/.test(body.i)) throw invalid();
  return { d: body.d, c: body.c, i: body.i };
}

export async function listDocuments(db: Db, query: { status?: string; mode?: string; deleted?: "true" | "false"; q?: string; cursor?: string; limit?: number }) {
  const limit = query.limit ?? 50;
  const where: Prisma.Sql[] = [query.deleted === "true" ? Prisma.sql`h."deleted_at" IS NOT NULL` : Prisma.sql`h."deleted_at" IS NULL`];
  if (query.status) where.push(Prisma.sql`h."status" = ${query.status}`);
  if (query.mode) where.push(Prisma.sql`h."mode" = ${query.mode}`);
  if (query.q) {
    const pattern = `%${escapeLike(query.q)}%`;
    where.push(Prisma.sql`(h."doc_no" ILIKE ${pattern} OR h."ref" ILIKE ${pattern}
      OR EXISTS (SELECT 1 FROM "inventory"."merge_split_source" src WHERE src."merge_split_id" = h."id" AND src."stock_id" ILIKE ${pattern})
      OR EXISTS (SELECT 1 FROM "inventory"."merge_split_result" r WHERE r."merge_split_id" = h."id" AND r."stock_id" ILIKE ${pattern}))`);
  }
  if (query.cursor) {
    const after = decodeListCursor(query.cursor);
    where.push(Prisma.sql`(h."doc_date", h."created_at", h."id") < (${after.d}::date, ${after.c}::timestamptz, ${after.i}::uuid)`);
  }
  const rows = await db.$queryRaw<{ id: string; doc_no: string; doc_date: string; mode: string; status: string; source_count: number; result_count: number; auto_approved: boolean; deleted: boolean; created_at: Date }[]>`
    SELECT h."id", h."doc_no", to_char(h."doc_date", 'YYYY-MM-DD') AS "doc_date", h."mode", h."status", h."source_count", h."result_count", h."auto_approved",
      (h."deleted_at" IS NOT NULL) AS "deleted", h."created_at"
    FROM "inventory"."merge_split" h
    WHERE ${Prisma.join(where, " AND ")}
    ORDER BY h."doc_date" DESC, h."created_at" DESC, h."id" DESC
    LIMIT ${limit + 1}`;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map((row) => ({ id: row.id, docNo: row.doc_no, docDate: row.doc_date, mode: row.mode, status: row.status, sourceCount: row.source_count, resultCount: row.result_count, autoApproved: row.auto_approved, deleted: row.deleted })),
    nextCursor: rows.length > limit && last ? encode({ d: last.doc_date, c: last.created_at.toISOString(), i: last.id }) : null,
  };
}

/** `GET /next-number`: preview, nothing reserved (master resolve with markUsed false + local max + 1). */
export async function nextNumber(db: Db, master: MasterApi, docDate: string, requestId: string) {
  const numbering = numberingOrDefault((await master.numbering(docDate, false, { requestId }, LEAF)).numbering);
  return { docNo: formatDocNo(numbering, await nextRunningNo(db, numbering, false)) };
}

// ---------- From Stock picker (SA-MS-14) ----------

type StockRow = {
  id: string; stock_id: string; lot_key: string; location: string; lot: string; price_unit: "PER_CT" | "PER_PCS"; unit_cost_base: string; on_hand_pcs: number;
  on_hand_weight_ct: string; stock_price: string; sale_price: string; currency_code: string; photo_count: number; ref_doc_no: string; ref_doc_date: string; syncing: boolean;
  stone_code_id: string | null; stone_code: string; stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string;
  cer_type: string; cer_no: string;
};

/**
 * One page of our own open stocks (ACTIVE, on hand pcs > 0) not on ANOTHER Pending Merge/Split: oldest ref first (ref date,
 * Stock ID), keyset ≤ 50, ONE statement on `stock_picker_idx` + `merge_split_source_stock_idx`. `q` matches Stock ID, stone code,
 * lot or cer no; `exclude` drops stocks already on the document.
 */
export async function stockPage(client: Client, input: StockQuery) {
  const where: Prisma.Sql[] = [Prisma.sql`s."status" = 'ACTIVE' AND (s."on_hand_pcs" > 0 OR s."on_hand_weight_ct" > 0) AND s."on_hand_pcs" > 0`];
  where.push(Prisma.sql`NOT EXISTS (SELECT 1 FROM "inventory"."merge_split_source" ps JOIN "inventory"."merge_split" m ON m."id" = ps."merge_split_id"
    WHERE ps."stock_uuid" = s."id" AND m."status" = 'PENDING_APPROVAL' AND m."deleted_at" IS NULL AND m."id" IS DISTINCT FROM ${input.excludeDocId ?? null}::uuid)`);
  if (input.location) where.push(Prisma.sql`upper(btrim(s."location")) = upper(btrim(${input.location}))`);
  if (input.exclude.length > 0) where.push(Prisma.sql`s."id" <> ALL(${[...input.exclude]}::uuid[])`);
  if (input.q) {
    const pattern = `%${escapeLike(input.q)}%`;
    where.push(Prisma.sql`(s."stock_id" ILIKE ${pattern} OR s."stone_code" ILIKE ${pattern} OR s."lot" ILIKE ${pattern} OR s."cer_no" ILIKE ${pattern})`);
  }
  if (input.cursor) {
    const after = decodeStockCursor(input.cursor);
    where.push(Prisma.sql`(s."ref_doc_date", s."stock_id") > (${after.date}::date, ${after.stockId}::varchar)`);
  }
  const rows = await client.$queryRaw<StockRow[]>(Prisma.sql`
    SELECT s."id", s."stock_id", s."lot_key", s."location", s."lot", s."price_unit", s."unit_cost_base"::text AS "unit_cost_base", s."on_hand_pcs",
      s."on_hand_weight_ct"::text AS "on_hand_weight_ct", s."stock_price"::text AS "stock_price", s."sale_price"::text AS "sale_price", s."currency_code",
      (SELECT count(*)::int FROM "inventory"."stock_photo" p WHERE p."stock_uuid" = s."id") AS "photo_count", s."ref_doc_no",
      to_char(s."ref_doc_date", 'YYYY-MM-DD') AS "ref_doc_date",
      COALESCE((SELECT l."sync_state" = 'SYNCING' FROM "inventory"."load_to_stock" l WHERE l."id" = s."load_id"), false) AS "syncing",
      s."stone_code_id", s."stone_code", s."stone", s."shape", s."size", s."color", s."clarity", s."cutting", s."quality", s."cer_type", s."cer_no"
    FROM "inventory"."stock" s
    WHERE ${Prisma.join(where, " AND ")}
    ORDER BY s."ref_doc_date", s."stock_id"
    LIMIT ${input.limit + 1}`);
  const page = rows.slice(0, input.limit);
  const last = page[page.length - 1];
  return {
    items: page.map((row) => ({
      stockUuid: row.id, stockId: row.stock_id, lotKey: row.lot_key, location: row.location, lot: row.lot, priceUnit: row.price_unit, unitCostBase: u4(row.unit_cost_base),
      availPcs: Number(row.on_hand_pcs), availWeightCt: w3(row.on_hand_weight_ct),
      costAmountBase: sourceAmount(row.price_unit, Number(row.on_hand_pcs), row.on_hand_weight_ct, row.unit_cost_base).toFixed(2),
      stockPrice: m2(row.stock_price), salePrice: m2(row.sale_price), currency: row.currency_code, photoCount: row.photo_count,
      loadedFrom: { docNo: row.ref_doc_no, docDate: row.ref_doc_date }, syncing: row.syncing,
      attrs: {
        stoneCodeId: row.stone_code_id, stoneCode: row.stone_code, stone: row.stone, shape: row.shape, size: row.size, color: row.color, clarity: row.clarity,
        cutting: row.cutting, quality: row.quality, cerType: row.cer_type, cerNo: row.cer_no,
      },
    })),
    nextCursor: rows.length > input.limit && last ? encodeStockCursor(last.ref_doc_date, last.stock_id) : null,
  };
}

/** `GET /merge-split/stock/{stockUuid}/photos`: the stock's photo file ids (≤ 5, position order), one statement. */
export async function stockPhotos(db: Db, stockUuid: string) {
  const rows = await db.$queryRaw<{ file_id: string }[]>`
    SELECT p."file_id" FROM "inventory"."stock_photo" p JOIN "inventory"."stock" s ON s."id" = p."stock_uuid"
    WHERE p."stock_uuid" = ${stockUuid}::uuid ORDER BY p."position" LIMIT 5`;
  return { fileIds: rows.map((row) => row.file_id) };
}

// ---------- Approve Center (SA-MS-12) ----------

export const SUMMARY_COUNT_CAP = 100;

export async function approvalSummary(db: Db, principal: Principal) {
  if (!canApprove(principal, LEAF)) return [];
  const [row] = await db.$queryRaw<{ require_approval: boolean | null; count: number }[]>`
    SELECT (SELECT "require_approval" FROM "inventory"."approval_setting" WHERE "type" = 'merge-split') AS "require_approval",
      (SELECT count(*) FROM (SELECT 1 FROM "inventory"."merge_split" WHERE "status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL LIMIT ${SUMMARY_COUNT_CAP}) c)::int AS "count"`;
  if (row.require_approval === false) return [];
  return [{ type: LEAF, count: Number(row.count) }];
}

type Sort = "submittedAt" | "docNo" | "party" | "qty" | "value";
/** party = Ref (no account on this document), qty = weight, value = pieces. */
const SORT_COLUMN: Record<Sort, string> = { submittedAt: "submitted_at", docNo: "doc_no", party: "ref", qty: "total_weight_ct", value: "total_pcs" };
const queryHash = (q: string | undefined) => createHash("sha256").update(q ?? "").digest("hex").slice(0, 16);

/** `GET /approval/pending?type=merge-split`: one keyset statement on merge_split_pending_idx. */
export async function approvalPending(db: Db, input: { q?: string; sort: Sort; dir: "asc" | "desc"; cursor?: string; limit: number }) {
  const column = Prisma.raw(`h."${SORT_COLUMN[input.sort]}"`);
  const direction = Prisma.raw(input.dir === "asc" ? "ASC" : "DESC");
  const where: Prisma.Sql[] = [Prisma.sql`h."status" = 'PENDING_APPROVAL'`, Prisma.sql`h."deleted_at" IS NULL`];
  if (input.q) {
    const pattern = `%${escapeLike(input.q)}%`;
    where.push(Prisma.sql`(h."doc_no" ILIKE ${pattern} OR h."ref" ILIKE ${pattern})`);
  }
  if (input.cursor) {
    const invalid = () => validationError([{ path: "cursor", code: "invalid" }]);
    let body: { s?: string; d?: string; q?: string; i?: string };
    try { body = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")); } catch { throw invalid(); }
    if (!body || body.s !== input.sort || body.d !== input.dir || body.q !== queryHash(input.q) || typeof body.i !== "string" || !/^[0-9a-f-]{36}$/.test(body.i)) throw invalid();
    const op = Prisma.raw(input.dir === "asc" ? ">" : "<");
    where.push(Prisma.sql`(${column}, h."id") ${op} ((SELECT ${Prisma.raw(`k."${SORT_COLUMN[input.sort]}"`)} FROM "inventory"."merge_split" k WHERE k."id" = ${body.i}::uuid AND k."status" = 'PENDING_APPROVAL'), ${body.i}::uuid)`);
  }
  const rows = await db.$queryRaw<{ id: string; doc_no: string; doc_date: string; mode: string; submitted_at: Date; submitted_by_name: string | null; revision_count: number; source_count: number; result_count: number; total_pcs: number; total_weight_ct: string }[]>`
    SELECT h."id", h."doc_no", to_char(h."doc_date", 'YYYY-MM-DD') AS "doc_date", h."mode", h."submitted_at", h."submitted_by_name", h."revision_count",
      h."source_count", h."result_count", h."total_pcs", h."total_weight_ct"::text AS "total_weight_ct"
    FROM "inventory"."merge_split" h
    WHERE ${Prisma.join(where, " AND ")}
    ORDER BY ${column} ${direction}, h."id" ${direction}
    LIMIT ${input.limit + 1}`;
  const page = rows.slice(0, input.limit);
  const last = page[page.length - 1];
  return {
    items: page.map((row) => ({
      id: row.id, docNo: row.doc_no, docDate: row.doc_date, partyName: "", mode: row.mode, submittedAt: row.submitted_at.toISOString(), submittedByName: row.submitted_by_name,
      revisionCount: Math.min(row.revision_count, 1), sourceCount: row.source_count, resultCount: row.result_count, totalPcs: row.total_pcs, totalWeightCt: w3(row.total_weight_ct),
    })),
    nextCursor: rows.length > input.limit && last ? encode({ s: input.sort, d: input.dir, q: queryHash(input.q), i: last.id }) : null,
  };
}
