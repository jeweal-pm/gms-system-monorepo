import { createHash } from "node:crypto";
import { AppError, validationError } from "../../platform/errors";
import { Decimal, Prisma, type Db } from "../../platform/db";
import type { MasterApi } from "../../platform/master-api";
import { canApprove, type Principal } from "../../platform/auth/principal";
import { formatDocNo, nextRunningNo } from "./repository";

/**
 * Stock Transfer Location reads (api-contract "Public endpoints", N+1 review in testing.md):
 * - detail: 2 statements (header with the approval switch; lines joined to their source stock and new Stock ID), any line count;
 * - daybook / Approve Center pending: ONE keyset statement (limit + 1), no per-row lookups;
 * - summary: one statement; next number: one master call + one local max.
 */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (character) => `\\${character}`);
const w3 = (value: string | number) => new Decimal(value).toFixed(3);
const iso = (value: Date | null) => (value ? value.toISOString() : null);

type HeaderRow = {
  id: string; doc_no: string; doc_date: string; ref: string; note: string; status: string; auto_approved: boolean; version: number; revision_count: number;
  submitted_at: Date | null; submitted_by: string | null; submitted_by_name: string | null; review_action: string | null; review_note: string | null;
  reviewed_at: Date | null; reviewed_by: string | null; reviewed_by_name: string | null; deleted_at: Date | null; require_approval: boolean | null;
};
type LineRow = {
  id: string; position: number; from_stock_uuid: string; from_location: string; on_hand_pcs: number; on_hand_weight_ct: string; to_location: string;
  pcs: number; weight_ct: string; remark: string; stock_id: string | null; new_stock_id: string | null; lot_key: string | null; ref_doc_no: string | null;
  price_unit: string | null; stock_price: string | null; currency_code: string | null; stone_code: string | null; stone: string | null; shape: string | null;
  size: string | null; color: string | null; clarity: string | null; cutting: string | null; quality: string | null; lot: string | null; location: string | null;
  cer_type: string | null; cer_no: string | null;
};

export async function getDetail(db: Db, id: string) {
  const [header] = await db.$queryRaw<HeaderRow[]>`
    SELECT h."id", h."doc_no", to_char(h."doc_date", 'YYYY-MM-DD') AS "doc_date", h."ref", h."note", h."status", h."auto_approved", h."version", h."revision_count",
      h."submitted_at", h."submitted_by", h."submitted_by_name", h."review_action", h."review_note", h."reviewed_at", h."reviewed_by", h."reviewed_by_name", h."deleted_at",
      (SELECT a."require_approval" FROM "inventory"."approval_setting" a WHERE a."type" = 'stock-transfer-location') AS "require_approval"
    FROM "inventory"."stock_transfer" h WHERE h."id" = ${id}::uuid`;
  if (!header) throw new AppError(404, "STOCK_TRANSFER_NOT_FOUND");
  const lines = await db.$queryRaw<LineRow[]>`
    SELECT l."id", l."position", l."from_stock_uuid", l."from_location", l."on_hand_pcs", l."on_hand_weight_ct"::text AS "on_hand_weight_ct", l."to_location",
      l."pcs", l."weight_ct"::text AS "weight_ct", l."remark", s."stock_id", n."stock_id" AS "new_stock_id", s."lot_key", s."ref_doc_no", s."price_unit",
      s."stock_price"::text AS "stock_price", s."currency_code", s."stone_code", s."stone", s."shape", s."size", s."color", s."clarity", s."cutting", s."quality",
      s."lot", s."location", s."cer_type", s."cer_no"
    FROM "inventory"."stock_transfer_line" l
    LEFT JOIN "inventory"."stock" s ON s."id" = l."from_stock_uuid"
    LEFT JOIN "inventory"."stock" n ON n."id" = l."new_stock_uuid"
    WHERE l."transfer_id" = ${id}::uuid ORDER BY l."position"`;
  return {
    id: header.id, docNo: header.doc_no, docDate: header.doc_date, ref: header.ref, note: header.note, status: header.status,
    autoApproved: header.auto_approved, version: header.version, deleted: header.deleted_at !== null,
    approval: {
      requireApproval: header.require_approval ?? true, autoApproved: header.auto_approved, revisionCount: Math.min(header.revision_count, 1) as 0 | 1,
      submitted: header.submitted_at ? { at: header.submitted_at.toISOString(), by: header.submitted_by ?? "", byName: header.submitted_by_name } : null,
      review: header.review_action ? { action: header.review_action, note: header.review_note ?? "", at: iso(header.reviewed_at), by: header.reviewed_by ?? "", byName: header.reviewed_by_name } : null,
    },
    lines: lines.map((line) => ({
      id: line.id, position: line.position, fromStockUuid: line.from_stock_uuid, onHandPcs: line.on_hand_pcs, onHandWeightCt: w3(line.on_hand_weight_ct),
      toLocation: line.to_location, pcs: line.pcs, weightCt: w3(line.weight_ct), remark: line.remark,
      stockId: line.stock_id ?? "", newStockId: line.new_stock_id, lotKey: line.lot_key ?? "", refDocNo: line.ref_doc_no ?? "", fromLocation: line.from_location,
      priceUnit: (line.price_unit ?? "PER_CT") as "PER_CT" | "PER_PCS", stockPrice: new Decimal(line.stock_price ?? 0).toFixed(2), currency: line.currency_code ?? "",
      attrs: {
        stoneCode: line.stone_code ?? "", stone: line.stone ?? "", shape: line.shape ?? "", size: line.size ?? "", color: line.color ?? "", clarity: line.clarity ?? "",
        cutting: line.cutting ?? "", quality: line.quality ?? "", lot: line.lot ?? "", location: line.location ?? line.from_location, cerType: line.cer_type ?? "", cerNo: line.cer_no ?? "",
      },
    })),
  };
}

// ---------- daybook ----------

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
  const where: Prisma.Sql[] = [query.deleted === "true" ? Prisma.sql`h."deleted_at" IS NOT NULL` : Prisma.sql`h."deleted_at" IS NULL`];
  if (query.status) where.push(Prisma.sql`h."status" = ${query.status}`);
  if (query.q) {
    const pattern = `%${escapeLike(query.q)}%`;
    where.push(Prisma.sql`(h."doc_no" ILIKE ${pattern} OR h."ref" ILIKE ${pattern})`);
  }
  if (query.cursor) {
    const after = decodeListCursor(query.cursor);
    where.push(Prisma.sql`(h."doc_date", h."created_at", h."id") < (${after.d}::date, ${after.c}::timestamptz, ${after.i}::uuid)`);
  }
  const rows = await db.$queryRaw<{ id: string; doc_no: string; doc_date: string; ref: string; status: string; line_count: number; total_pcs: number; total_weight_ct: string; auto_approved: boolean; deleted: boolean; created_at: Date }[]>`
    SELECT h."id", h."doc_no", to_char(h."doc_date", 'YYYY-MM-DD') AS "doc_date", h."ref", h."status", h."line_count", h."total_pcs", h."total_weight_ct"::text AS "total_weight_ct",
      h."auto_approved", (h."deleted_at" IS NOT NULL) AS "deleted", h."created_at"
    FROM "inventory"."stock_transfer" h
    WHERE ${Prisma.join(where, " AND ")}
    ORDER BY h."doc_date" DESC, h."created_at" DESC, h."id" DESC
    LIMIT ${limit + 1}`;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map((row) => ({ id: row.id, docNo: row.doc_no, docDate: row.doc_date, ref: row.ref, status: row.status, lineCount: row.line_count, totalPcs: row.total_pcs, totalWeightCt: w3(row.total_weight_ct), autoApproved: row.auto_approved, deleted: row.deleted })),
    nextCursor: rows.length > limit && last ? encode({ d: last.doc_date, c: last.created_at.toISOString(), i: last.id }) : null,
  };
}

/** `GET /next-number`: preview, nothing reserved (master resolve with markUsed false + local max + 1). */
export async function nextNumber(db: Db, master: MasterApi, docDate: string, requestId: string) {
  const numbering = (await master.numbering(docDate, false, { requestId }, "stock-transfer-location")).numbering;
  return { docNo: formatDocNo(numbering, await nextRunningNo(db, numbering, false)) };
}

// ---------- Approve Center (ADR-0060 D8, sale shapes) ----------

export const SUMMARY_COUNT_CAP = 100;

export async function approvalSummary(db: Db, principal: Principal) {
  if (!canApprove(principal, "stock-transfer-location")) return [];
  const [row] = await db.$queryRaw<{ require_approval: boolean | null; count: number }[]>`
    SELECT (SELECT "require_approval" FROM "inventory"."approval_setting" WHERE "type" = 'stock-transfer-location') AS "require_approval",
      (SELECT count(*) FROM (SELECT 1 FROM "inventory"."stock_transfer" WHERE "status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL LIMIT ${SUMMARY_COUNT_CAP}) c)::int AS "count"`;
  if (row.require_approval === false) return [];
  return [{ type: "stock-transfer-location" as const, count: Number(row.count) }];
}

type Sort = "submittedAt" | "docNo" | "party" | "qty" | "value";
/** party = Ref (a transfer has no account), qty = weight, value = pieces (a transfer moves cost, it has no value of its own). */
const SORT_COLUMN: Record<Sort, string> = { submittedAt: "submitted_at", docNo: "doc_no", party: "ref", qty: "total_weight_ct", value: "total_pcs" };
const queryHash = (q: string | undefined) => createHash("sha256").update(q ?? "").digest("hex").slice(0, 16);

/** `GET /approval/pending?type=stock-transfer-location`: one keyset statement on stock_transfer_pending_idx. */
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
    where.push(Prisma.sql`(${column}, h."id") ${op} ((SELECT ${Prisma.raw(`k."${SORT_COLUMN[input.sort]}"`)} FROM "inventory"."stock_transfer" k WHERE k."id" = ${body.i}::uuid AND k."status" = 'PENDING_APPROVAL'), ${body.i}::uuid)`);
  }
  const rows = await db.$queryRaw<{ id: string; doc_no: string; doc_date: string; ref: string; submitted_at: Date; submitted_by_name: string | null; total_pcs: number; total_weight_ct: string; line_count: number; revision_count: number }[]>`
    SELECT h."id", h."doc_no", to_char(h."doc_date", 'YYYY-MM-DD') AS "doc_date", h."ref", h."submitted_at", h."submitted_by_name", h."total_pcs",
      h."total_weight_ct"::text AS "total_weight_ct", h."line_count", h."revision_count"
    FROM "inventory"."stock_transfer" h
    WHERE ${Prisma.join(where, " AND ")}
    ORDER BY ${column} ${direction}, h."id" ${direction}
    LIMIT ${input.limit + 1}`;
  const page = rows.slice(0, input.limit);
  const last = page[page.length - 1];
  return {
    items: page.map((row) => ({ id: row.id, docNo: row.doc_no, docDate: row.doc_date, partyName: row.ref, submittedAt: row.submitted_at.toISOString(), submittedByName: row.submitted_by_name, totalPcs: row.total_pcs, totalWeightCt: w3(row.total_weight_ct), lineCount: row.line_count, revisionCount: Math.min(row.revision_count, 1) })),
    nextCursor: rows.length > input.limit && last ? encode({ s: input.sort, d: input.dir, q: queryHash(input.q), i: last.id }) : null,
  };
}
