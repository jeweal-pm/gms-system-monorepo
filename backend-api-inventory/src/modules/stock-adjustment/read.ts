import { AppError, validationError } from "../../platform/errors";
import { Prisma, type Db } from "../../platform/db";
import type { MasterApi } from "../../platform/master-api";
import { canApprove, hasGrant, type Principal } from "../../platform/auth/principal";
import { formatDocNo } from "../sale/repository";
import { stockAdjustmentPage } from "../stock/lots";

const esc = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);
const encode = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
type Cursor = { d: string; i: string };
type DetailHeader = { id: string; doc_no: string; doc_date: string; location: string; ref: string; note: string; status: string; auto_approved: boolean; version: number; revision_count: number;
  submitted_at: Date | null; submitted_by: string | null; submitted_by_name: string | null; review_action: string | null; review_note: string | null; reviewed_at: Date | null;
  reviewed_by: string | null; reviewed_by_name: string | null; approved_at: Date | null; approved_by: string | null; deleted_at: Date | null; deleted_by: string | null;
  created_at: Date; created_by: string; updated_at: Date; require_approval: boolean | null };
type DetailLine = { id: string; position: number; stock_uuid: string; stock_id: string; lot_key: string; stock_pcs: number; stock_weight_ct: string; stock_price: string; physical_pcs: number;
  physical_weight_ct: string; physical_price: string | null; remark: string; price_unit: string; ref_doc_no: string; stone_code: string; stone: string; shape: string; size: string; color: string;
  clarity: string; cutting: string; quality: string; lot: string; location: string; cer_type: string; cer_no: string };
type PendingRow = { id: string; doc_no: string; doc_date: string; location: string; submitted_at: Date; submitted_by_name: string | null; revision_count: number; line_count: number; diff_pcs: number; diff_weight: string };
function decodeCursor(value: string): Cursor {
  const invalid = () => validationError([{ path: "cursor", code: "invalid" }]);
  if (!/^[A-Za-z0-9_-]{1,300}$/.test(value)) throw invalid();
  let parsed: Partial<Cursor>;
  try { parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")); } catch { throw invalid(); }
  if (!parsed || typeof parsed.d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.d) || typeof parsed.i !== "string" || !/^[0-9a-f-]{36}$/.test(parsed.i)) throw invalid();
  return { d: parsed.d, i: parsed.i };
}

export async function nextNumber(db: Db, master: MasterApi, docDate: string, requestId: string) {
  const numbering = (await master.numbering(docDate, false, { requestId }, "stock-adjustment")).numbering;
  if (!numbering) throw new AppError(422, "NUMBERING_NOT_CONFIGURED");
  const [row] = await db.$queryRaw<{ max: number | null }[]>`SELECT max("running_no") AS "max" FROM "inventory"."stock_adjustment" WHERE "numbering_id" = ${numbering.id}::uuid`;
  return { docNo: formatDocNo(numbering, Math.max(row?.max === null || row?.max === undefined ? numbering.startNo : row.max + 1, numbering.startNo)) };
}

export async function listDocuments(db: Db, query: { status?: string; deleted?: "true" | "false"; q?: string; cursor?: string; limit: number }) {
  const where: Prisma.Sql[] = [query.deleted === "true" ? Prisma.sql`h."deleted_at" IS NOT NULL` : Prisma.sql`h."deleted_at" IS NULL`];
  if (query.status) where.push(Prisma.sql`h."status" = ${query.status}`);
  if (query.q) { const p = `%${esc(query.q)}%`; where.push(Prisma.sql`(h."doc_no" ILIKE ${p} ESCAPE '\\' OR h."location" ILIKE ${p} ESCAPE '\\' OR h."ref" ILIKE ${p} ESCAPE '\\')`); }
  if (query.cursor) { const c = decodeCursor(query.cursor); where.push(Prisma.sql`(h."doc_date", h."id") < (${c.d}::date, ${c.i}::uuid)`); }
  const rows = await db.$queryRaw<{ id: string; doc_no: string; doc_date: string; location: string; status: string; line_count: number; auto_approved: boolean; deleted: boolean }[]>(Prisma.sql`
    WITH counts AS (SELECT "adjustment_id", count(*)::int AS line_count FROM "inventory"."stock_adjustment_line" GROUP BY "adjustment_id")
    SELECT h."id", h."doc_no", to_char(h."doc_date", 'YYYY-MM-DD') AS "doc_date", h."location", h."status", COALESCE(c.line_count, 0)::int AS "line_count",
      h."auto_approved", (h."deleted_at" IS NOT NULL) AS "deleted"
    FROM "inventory"."stock_adjustment" h LEFT JOIN counts c ON c."adjustment_id" = h."id" WHERE ${Prisma.join(where, " AND ")}
    ORDER BY h."doc_date" DESC, h."id" DESC LIMIT ${query.limit + 1}`);
  const page = rows.slice(0, query.limit); const last = page.at(-1);
  return { items: page.map((r) => ({ id: r.id, docNo: r.doc_no, docDate: r.doc_date, location: r.location, status: r.status, lineCount: r.line_count, autoApproved: r.auto_approved, deleted: r.deleted })),
    nextCursor: rows.length > query.limit && last ? encode({ d: last.doc_date, i: last.id }) : null };
}

export async function getDetail(db: Db, id: string, principal: Principal) {
  const [header] = await db.$queryRaw<DetailHeader[]>`
    SELECT h."id", h."doc_no", to_char(h."doc_date", 'YYYY-MM-DD') AS "doc_date", h."location", h."ref", h."note", h."status", h."auto_approved", h."version",
      h."revision_count", h."submitted_at", h."submitted_by", h."submitted_by_name", h."review_action", h."review_note", h."reviewed_at", h."reviewed_by", h."reviewed_by_name",
      h."approved_at", h."approved_by", h."deleted_at", h."deleted_by", h."created_at", h."created_by", h."updated_at",
      (SELECT a."require_approval" FROM "inventory"."approval_setting" a WHERE a."type" = 'stock-adjustment') AS "require_approval"
    FROM "inventory"."stock_adjustment" h WHERE h."id" = ${id}::uuid`;
  if (!header) throw new AppError(404, "STOCK_ADJUSTMENT_NOT_FOUND");
  const lines = await db.$queryRaw<DetailLine[]>`
    SELECT l."id", l."position", l."stock_uuid", l."stock_id", l."lot_key", l."stock_pcs", l."stock_weight_ct"::text AS "stock_weight_ct", l."stock_price"::text AS "stock_price",
      l."physical_pcs", l."physical_weight_ct"::text AS "physical_weight_ct", l."physical_price"::text AS "physical_price", l."remark",
      s."price_unit", s."ref_doc_no", s."stone_code", s."stone", s."shape", s."size", s."color", s."clarity", s."cutting", s."quality", s."lot", s."location", s."cer_type", s."cer_no"
    FROM "inventory"."stock_adjustment_line" l JOIN "inventory"."stock" s ON s."id" = l."stock_uuid"
    WHERE l."adjustment_id" = ${id}::uuid ORDER BY l."position"`;
  const requireApproval = header.require_approval ?? true;
  return {
    id: header.id, docNo: header.doc_no, docDate: header.doc_date, location: header.location, ref: header.ref, note: header.note,
    status: header.status, autoApproved: header.auto_approved, version: header.version, deleted: header.deleted_at ? { at: header.deleted_at.toISOString(), by: header.deleted_by } : null,
    lines: lines.map((l) => {
      const diffWeight = new Prisma.Decimal(l.physical_weight_ct).minus(l.stock_weight_ct).toFixed(3);
      const diffPrice = new Prisma.Decimal(l.physical_price ?? l.stock_price).minus(l.stock_price).toFixed(2);
      return { id: l.id, position: l.position, stockUuid: l.stock_uuid, stockId: l.stock_id, lotKey: l.lot_key, refDocNo: l.ref_doc_no,
        stockPcs: l.stock_pcs, stockWeightCt: l.stock_weight_ct, stockPrice: l.stock_price,
        physicalPcs: l.physical_pcs, physicalWeightCt: l.physical_weight_ct, physicalPrice: l.physical_price, remark: l.remark,
        priceUnit: l.price_unit, diffPcs: l.physical_pcs - l.stock_pcs, diffWeightCt: diffWeight, diffPrice,
        attrs: { stoneCode: l.stone_code, stone: l.stone, shape: l.shape, size: l.size, color: l.color, clarity: l.clarity, cutting: l.cutting, quality: l.quality, lot: l.lot, location: l.location, cerType: l.cer_type, cerNo: l.cer_no } };
    }),
    approval: { requireApproval, autoApproved: header.auto_approved, revisionCount: Math.min(header.revision_count, 1),
      submitted: header.submitted_at ? { at: header.submitted_at.toISOString(), by: header.submitted_by, byName: header.submitted_by_name } : null,
      review: header.review_action ? { action: header.review_action, note: header.review_note, at: header.reviewed_at?.toISOString() ?? null, by: header.reviewed_by, byName: header.reviewed_by_name } : null },
    flow: { canEdit: !header.deleted_at && (header.status === "DRAFT" || header.status === "REVISION_REQUESTED" || (header.status === "APPROVED" && header.auto_approved)) && hasGrant(principal, "stock-adjustment", "EDIT"),
      canDelete: !header.deleted_at && ( ["DRAFT", "REVISION_REQUESTED", "REJECTED"].includes(header.status) || (header.status === "APPROVED" && header.auto_approved)) && hasGrant(principal, "stock-adjustment", "DELETE"),
      canSubmit: !header.deleted_at && requireApproval && ["DRAFT", "REVISION_REQUESTED"].includes(header.status) && (hasGrant(principal, "stock-adjustment", "ADD") || hasGrant(principal, "stock-adjustment", "EDIT")),
      canRestore: Boolean(header.deleted_at) && hasGrant(principal, "stock-adjustment", "DELETE"), usedBy: null },
    created: { at: header.created_at.toISOString(), by: header.created_by }, updatedAt: header.updated_at.toISOString(), approvedAt: header.approved_at?.toISOString() ?? null, approvedBy: header.approved_by,
  };
}

export function stockPage(db: Db, query: Parameters<typeof stockAdjustmentPage>[1]) { return stockAdjustmentPage(db, query); }

export const SUMMARY_COUNT_CAP = 100;
export async function approvalSummary(db: Db, principal: Principal) {
  if (!canApprove(principal, "stock-adjustment")) return [];
  const [row] = await db.$queryRaw<{ require_approval: boolean | null; count: number }[]>`
    SELECT (SELECT "require_approval" FROM "inventory"."approval_setting" WHERE "type" = 'stock-adjustment') AS "require_approval",
      (SELECT count(*) FROM (SELECT 1 FROM "inventory"."stock_adjustment" WHERE "status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL LIMIT ${SUMMARY_COUNT_CAP}) c)::int AS "count"`;
  return row.require_approval === false ? [] : [{ type: "stock-adjustment" as const, count: Number(row.count) }];
}

export async function approvalPending(db: Db, input: { q?: string; cursor?: string; limit: number }) {
  const where: Prisma.Sql[] = [Prisma.sql`h."status" = 'PENDING_APPROVAL'`, Prisma.sql`h."deleted_at" IS NULL`];
  if (input.q) { const p = `%${esc(input.q)}%`; where.push(Prisma.sql`(h."doc_no" ILIKE ${p} ESCAPE '\\' OR h."location" ILIKE ${p} ESCAPE '\\' OR h."ref" ILIKE ${p} ESCAPE '\\')`); }
  if (input.cursor) { const c = decodeCursor(input.cursor); where.push(Prisma.sql`(h."submitted_at", h."id") > ((SELECT k."submitted_at" FROM "inventory"."stock_adjustment" k WHERE k."id" = ${c.i}::uuid), ${c.i}::uuid)`); }
  const rows = await db.$queryRaw<PendingRow[]>(Prisma.sql`
    WITH totals AS (SELECT "adjustment_id", count(*)::int AS line_count,
      sum("physical_pcs" - "stock_pcs")::int AS diff_pcs, sum("physical_weight_ct" - "stock_weight_ct")::numeric(15,3)::text AS diff_weight
      FROM "inventory"."stock_adjustment_line" GROUP BY "adjustment_id")
    SELECT h."id", h."doc_no", to_char(h."doc_date", 'YYYY-MM-DD') AS "doc_date", h."location", h."submitted_at", h."submitted_by_name", h."revision_count",
      COALESCE(t.line_count,0)::int AS "line_count", COALESCE(t.diff_pcs,0)::int AS "diff_pcs", COALESCE(t.diff_weight,'0.000') AS "diff_weight"
    FROM "inventory"."stock_adjustment" h LEFT JOIN totals t ON t."adjustment_id" = h."id" WHERE ${Prisma.join(where, " AND ")}
    ORDER BY h."submitted_at" ASC, h."id" ASC LIMIT ${input.limit + 1}`);
  const page = rows.slice(0, input.limit); const last = page.at(-1);
  return { items: page.map((r) => ({ id: r.id, docNo: r.doc_no, docDate: r.doc_date, partyName: r.location, submittedAt: r.submitted_at.toISOString(), submittedByName: r.submitted_by_name, revisionCount: r.revision_count, lineCount: r.line_count, totalDiffPcs: r.diff_pcs, totalDiffWeightCt: r.diff_weight })), nextCursor: rows.length > input.limit && last ? encode({ d: last.doc_date, i: last.id }) : null };
}
