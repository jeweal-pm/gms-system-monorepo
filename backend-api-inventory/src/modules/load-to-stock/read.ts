import { createHash } from "node:crypto";
import { AppError, validationError } from "../../platform/errors";
import { Prisma, type Db } from "../../platform/db";
import type { MasterApi } from "../../platform/master-api";
import { canApprove, type Principal } from "../../platform/auth/principal";
import { nextRunningNo, formatDocNo } from "./repository";

/**
 * Load to Stock reads (architecture.md "Read paths", N+1 review NP-LS-02/03):
 * - detail: 3 inventory statements (header with in-use + sync flags + approval switch; sources; rows with their source
 *   quantities and photo ids aggregated per row) + ONE master `purchase-lines/batch` call for live remaining;
 * - list / Daybook / Approve Center pending: one keyset statement (limit + 1), no per-row lookups.
 */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (character) => `\\${character}`);
const iso = (value: Date | null) => (value ? value.toISOString() : null);

type HeaderRow = {
  id: string; doc_no: string; status: string; version: number; doc_date: string; vendor_id: string; vendor_code_snapshot: string; vendor_name_snapshot: string;
  currency_code: string; ref: string; document_note: string; mode: string; row_count: number; total_pcs: number; total_weight_ct: string; total_cost_base: string;
  auto_approved: boolean; revision_count: number; submitted_at: Date | null; submitted_by: string | null; submitted_by_name: string | null;
  review_action: string | null; review_note: string | null; reviewed_at: Date | null; reviewed_by: string | null; reviewed_by_name: string | null;
  deleted_at: Date | null; deleted_by: string | null; created_at: Date; created_by: string; updated_at: Date; updated_by: string;
  sync_state: string; provisional: boolean; in_use: boolean; require_approval: boolean | null;
  holders: { documentType: "reserve" | "memo-out" | "memo-out-return"; documentNo: string | null }[];
};

export async function getDetail(db: Db, master: MasterApi, id: string, requestId: string) {
  const [header] = await db.$queryRaw<HeaderRow[]>`
    SELECT h."id", h."doc_no", h."status", h."version", to_char(h."doc_date", 'YYYY-MM-DD') AS "doc_date", h."vendor_id", h."vendor_code_snapshot", h."vendor_name_snapshot",
      h."currency_code", h."ref", h."document_note", h."mode", h."row_count", h."total_pcs", h."total_weight_ct"::text AS "total_weight_ct", h."total_cost_base"::text AS "total_cost_base",
      h."auto_approved", h."revision_count", h."submitted_at", h."submitted_by", h."submitted_by_name", h."review_action", h."review_note", h."reviewed_at", h."reviewed_by",
      h."reviewed_by_name", h."deleted_at", h."deleted_by", h."created_at", h."created_by", h."updated_at", h."updated_by", h."sync_state", h."provisional",
      EXISTS (SELECT 1 FROM "inventory"."stock" s WHERE s."load_id" = h."id" AND (s."on_hand_pcs" <> s."pcs" OR s."on_hand_weight_ct" <> s."weight_ct")) AS "in_use",
      (SELECT a."require_approval" FROM "inventory"."approval_setting" a WHERE a."type" = 'load-to-stock') AS "require_approval",
      COALESCE((SELECT json_agg(json_build_object('documentType', x."document_type", 'documentNo', x."document_no") ORDER BY x."document_type", x."document_no")
        FROM (SELECT DISTINCT k."document_type", k."document_no" FROM "inventory"."stock_hold" k JOIN "inventory"."stock" s2 ON s2."id" = k."stock_uuid"
              WHERE s2."load_id" = h."id" ORDER BY 1, 2 LIMIT 5) x), '[]'::json) AS "holders"
    FROM "inventory"."load_to_stock" h WHERE h."id" = ${id}::uuid`;
  if (!header) throw new AppError(404, "LOAD_TO_STOCK_NOT_FOUND");
  const [sources, rows] = await Promise.all([
    db.$queryRaw<{ id: string; purchase_line_id: string }[]>`
      SELECT "id", "purchase_line_id" FROM "inventory"."load_to_stock_source" WHERE "load_id" = ${id}::uuid ORDER BY "position"`,
    db.$queryRaw<{
      id: string; position: number; location: string; parcel: string; stone_code_id: string | null; stone_code: string; stone: string; shape: string; size: string;
      color: string; clarity: string; cutting: string; quality: string; lot: string; cer_type: string; cer_no: string; price_unit: string; pcs: number; weight_ct: string;
      unit_cost_base: string; cost_amount_base: string; stock_price: string; sale_price: string; item_note: string; stock_id: string | null;
      sources: { purchaseLineId: string; pcs: number; weightCt: string; costAmountBase: string }[]; photo_ids: string[];
    }[]>`
      SELECT r."id", r."position", r."location", r."parcel", r."stone_code_id", r."stone_code", r."stone", r."shape", r."size", r."color", r."clarity", r."cutting",
        r."quality", r."lot", r."cer_type", r."cer_no", r."price_unit", r."pcs", r."weight_ct"::text AS "weight_ct", r."unit_cost_base"::text AS "unit_cost_base",
        r."cost_amount_base"::text AS "cost_amount_base", r."stock_price"::text AS "stock_price", r."sale_price"::text AS "sale_price", r."item_note", r."stock_id",
        COALESCE((SELECT json_agg(json_build_object('purchaseLineId', s."purchase_line_id", 'pcs', rs."pcs", 'weightCt', rs."weight_ct"::numeric(12,3)::text,
            'costAmountBase', rs."cost_amount_base"::numeric(18,2)::text) ORDER BY s."position")
          FROM "inventory"."load_to_stock_row_source" rs JOIN "inventory"."load_to_stock_source" s ON s."id" = rs."source_id" WHERE rs."row_id" = r."id"), '[]'::json) AS "sources",
        COALESCE((SELECT array_agg(p."file_id"::text ORDER BY p."position") FROM "inventory"."load_to_stock_row_photo" p WHERE p."row_id" = r."id"), ARRAY[]::text[]) AS "photo_ids"
      FROM "inventory"."load_to_stock_row" r WHERE r."load_id" = ${id}::uuid ORDER BY r."position"`,
  ]);
  const lineIds = sources.map((source) => source.purchase_line_id);
  const live = lineIds.length > 0 ? (await master.batch(lineIds, id, { requestId })).items : [];
  const byLine = new Map(live.map((line) => [line.purchaseLineId, line]));
  return {
    id: header.id, docNo: header.doc_no, status: header.status, version: header.version, docDate: header.doc_date,
    vendor: { id: header.vendor_id, code: header.vendor_code_snapshot, name: header.vendor_name_snapshot },
    currency: header.currency_code, ref: header.ref, documentNote: header.document_note, mode: header.mode,
    sources: lineIds.flatMap((lineId) => {
      const line = byLine.get(lineId);
      if (!line) return [];
      const { status: _status, vendorId: _vendor, ...ref } = line as typeof line & { vendorCode?: string; vendorName?: string };
      delete (ref as { vendorCode?: string }).vendorCode;
      delete (ref as { vendorName?: string }).vendorName;
      return [ref];
    }),
    rows: rows.map((row) => ({
      id: row.id, position: row.position, stockId: row.stock_id, location: row.location, parcel: row.parcel,
      attrs: { stoneCodeId: row.stone_code_id, stoneCode: row.stone_code, stone: row.stone, shape: row.shape, size: row.size, color: row.color, clarity: row.clarity, cutting: row.cutting, quality: row.quality, lot: row.lot, cerType: row.cer_type, cerNo: row.cer_no },
      sources: row.sources, priceUnit: row.price_unit, pcs: row.pcs, weightCt: row.weight_ct, unitCostBase: row.unit_cost_base, costAmountBase: row.cost_amount_base,
      stockPrice: row.stock_price, salePrice: row.sale_price, itemNote: row.item_note, photoIds: row.photo_ids,
    })),
    totals: { rowCount: header.row_count, pcs: header.total_pcs, weightCt: header.total_weight_ct, costAmountBase: header.total_cost_base },
    approval: {
      requireApproval: header.require_approval ?? true, autoApproved: header.auto_approved, revisionCount: Math.min(header.revision_count, 1),
      submitted: header.submitted_at ? { at: header.submitted_at.toISOString(), by: header.submitted_by ?? "", byName: header.submitted_by_name } : null,
      review: header.review_action ? { action: header.review_action, note: header.review_note ?? "", at: iso(header.reviewed_at), by: header.reviewed_by ?? "", byName: header.reviewed_by_name } : null,
    },
    inUse: header.in_use,
    holders: header.holders,
    syncing: header.sync_state === "SYNCING",
    deleted: header.deleted_at ? { at: header.deleted_at.toISOString(), by: header.deleted_by ?? "" } : null,
    created: { at: header.created_at.toISOString(), by: header.created_by },
    updated: { at: header.updated_at.toISOString(), by: header.updated_by },
  };
}

// ---------- list / Daybook ----------

type ListCursor = { d: string; c: string; i: string };
const encode = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
function decodeListCursor(value: string): ListCursor {
  const invalid = () => validationError([{ path: "cursor", code: "invalid" }]);
  if (!/^[A-Za-z0-9_-]{1,300}$/.test(value)) throw invalid();
  let body: Partial<ListCursor>;
  try { body = JSON.parse(Buffer.from(value, "base64url").toString("utf8")); } catch { throw invalid(); }
  if (!body || typeof body.d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.d) || typeof body.c !== "string" || Number.isNaN(Date.parse(body.c)) || typeof body.i !== "string" || !/^[0-9a-f-]{36}$/.test(body.i)) throw invalid();
  return { d: body.d, c: body.c, i: body.i };
}

export async function listDocuments(db: Db, query: { status?: string; deleted?: "true" | "false"; q?: string; cursor?: string; limit?: number }) {
  const limit = query.limit ?? 50;
  const where: Prisma.Sql[] = [Prisma.sql`NOT h."provisional"`, query.deleted === "true" ? Prisma.sql`h."deleted_at" IS NOT NULL` : Prisma.sql`h."deleted_at" IS NULL`];
  if (query.status) where.push(Prisma.sql`h."status" = ${query.status}`);
  if (query.q) {
    const pattern = `%${escapeLike(query.q)}%`;
    where.push(Prisma.sql`(h."doc_no" ILIKE ${pattern} ESCAPE '\\' OR h."vendor_name_snapshot" ILIKE ${pattern} ESCAPE '\\')`);
  }
  if (query.cursor) {
    const after = decodeListCursor(query.cursor);
    where.push(Prisma.sql`(h."doc_date", h."created_at", h."id") < (${after.d}::date, ${after.c}::timestamptz, ${after.i}::uuid)`);
  }
  const rows = await db.$queryRaw<{ id: string; doc_no: string; doc_date: string; status: string; review_note: string | null; vendor_name_snapshot: string; row_count: number; total_pcs: number; total_weight_ct: string; auto_approved: boolean; deleted: boolean; created_at: Date }[]>`
    SELECT h."id", h."doc_no", to_char(h."doc_date", 'YYYY-MM-DD') AS "doc_date", h."status", h."review_note", h."vendor_name_snapshot", h."row_count", h."total_pcs",
      h."total_weight_ct"::text AS "total_weight_ct", h."auto_approved", (h."deleted_at" IS NOT NULL) AS "deleted", h."created_at"
    FROM "inventory"."load_to_stock" h
    WHERE ${Prisma.join(where, " AND ")}
    ORDER BY h."doc_date" DESC, h."created_at" DESC, h."id" DESC
    LIMIT ${limit + 1}`;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map((row) => ({ id: row.id, docNo: row.doc_no, docDate: row.doc_date, status: row.status, reviewNote: row.review_note, vendorName: row.vendor_name_snapshot, rowCount: row.row_count, totalPcs: row.total_pcs, totalWeightCt: row.total_weight_ct, autoApproved: row.auto_approved, deleted: row.deleted })),
    nextCursor: rows.length > limit && last ? encode({ d: last.doc_date, c: last.created_at.toISOString(), i: last.id }) : null,
  };
}

/** `GET /next-number`: preview, nothing reserved (master `resolve` with markUsed false + local max + 1). */
export async function nextNumber(db: Db, master: MasterApi, docDate: string, requestId: string) {
  const numbering = (await master.numbering(docDate, false, { requestId })).numbering;
  return { docNo: formatDocNo(numbering, await nextRunningNo(db, numbering, false)) };
}

// ---------- Approve Center (ADR-0052 D12, master shapes) ----------

export const SUMMARY_COUNT_CAP = 100;

export async function approvalSummary(db: Db, principal: Principal) {
  if (!canApprove(principal, "load-to-stock")) return { items: [], countCap: SUMMARY_COUNT_CAP };
  const [row] = await db.$queryRaw<{ require_approval: boolean | null; count: number }[]>`
    SELECT (SELECT "require_approval" FROM "inventory"."approval_setting" WHERE "type" = 'load-to-stock') AS "require_approval",
      (SELECT count(*) FROM (SELECT 1 FROM "inventory"."load_to_stock" WHERE "status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL LIMIT ${SUMMARY_COUNT_CAP}) c)::int AS "count"`;
  if (row.require_approval === false) return { items: [], countCap: SUMMARY_COUNT_CAP };
  return { items: [{ type: "load-to-stock" as const, count: Number(row.count) }], countCap: SUMMARY_COUNT_CAP };
}

type Sort = "submittedAt" | "docNo" | "party" | "qty" | "value";
const SORT_COLUMN: Record<Sort, Prisma.Sql> = {
  submittedAt: Prisma.sql`h."submitted_at"`, docNo: Prisma.sql`h."doc_no"`, party: Prisma.sql`h."vendor_name_snapshot"`, qty: Prisma.sql`h."total_weight_ct"`, value: Prisma.sql`h."total_cost_base"`,
};
const queryHash = (q: string | undefined) => createHash("sha256").update(q ?? "").digest("hex").slice(0, 16);

export async function approvalPending(db: Db, input: { q?: string; sort: Sort; dir: "asc" | "desc"; cursor?: string; limit: number }) {
  const column = SORT_COLUMN[input.sort];
  const direction = Prisma.raw(input.dir === "asc" ? "ASC" : "DESC");
  const where: Prisma.Sql[] = [Prisma.sql`h."status" = 'PENDING_APPROVAL'`, Prisma.sql`h."deleted_at" IS NULL`];
  if (input.q) {
    const pattern = `%${escapeLike(input.q)}%`;
    where.push(Prisma.sql`(h."doc_no" ILIKE ${pattern} ESCAPE '\\' OR h."vendor_name_snapshot" ILIKE ${pattern} ESCAPE '\\' OR h."ref" ILIKE ${pattern} ESCAPE '\\')`);
  }
  if (input.cursor) {
    const invalid = () => validationError([{ path: "cursor", code: "invalid" }]);
    let body: { s?: string; d?: string; q?: string; i?: string };
    try { body = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")); } catch { throw invalid(); }
    if (!body || body.s !== input.sort || body.d !== input.dir || body.q !== queryHash(input.q) || typeof body.i !== "string" || !/^[0-9a-f-]{36}$/.test(body.i)) throw invalid();
    const op = Prisma.raw(input.dir === "asc" ? ">" : "<");
    // The cursor row's sort value is read back by id (a Thai vendor name could exceed the 300-character cursor).
    where.push(Prisma.sql`(${column}, h."id") ${op} ((SELECT ${Prisma.raw(`k."${{ submittedAt: "submitted_at", docNo: "doc_no", party: "vendor_name_snapshot", qty: "total_weight_ct", value: "total_cost_base" }[input.sort]}"`)} FROM "inventory"."load_to_stock" k WHERE k."id" = ${body.i}::uuid AND k."status" = 'PENDING_APPROVAL'), ${body.i}::uuid)`);
  }
  const rows = await db.$queryRaw<{ id: string; doc_no: string; doc_date: string; vendor_name_snapshot: string; submitted_at: Date; submitted_by_name: string | null; total_pcs: number; total_weight_ct: string; total_cost_base: string; revision_count: number }[]>`
    SELECT h."id", h."doc_no", to_char(h."doc_date", 'YYYY-MM-DD') AS "doc_date", h."vendor_name_snapshot", h."submitted_at", h."submitted_by_name", h."total_pcs",
      h."total_weight_ct"::text AS "total_weight_ct", h."total_cost_base"::text AS "total_cost_base", h."revision_count"
    FROM "inventory"."load_to_stock" h
    WHERE ${Prisma.join(where, " AND ")}
    ORDER BY ${column} ${direction}, h."id" ${direction}
    LIMIT ${input.limit + 1}`;
  const page = rows.slice(0, input.limit);
  const last = page[page.length - 1];
  return {
    items: page.map((row) => ({ id: row.id, docNo: row.doc_no, docDate: row.doc_date, partyName: row.vendor_name_snapshot, submittedAt: row.submitted_at.toISOString(), submittedByName: row.submitted_by_name, totalPcs: row.total_pcs, totalWeightCt: row.total_weight_ct, valueBase: row.total_cost_base, revisionCount: Math.min(row.revision_count, 1) })),
    nextCursor: rows.length > input.limit && last ? encode({ s: input.sort, d: input.dir, q: queryHash(input.q), i: last.id }) : null,
  };
}
