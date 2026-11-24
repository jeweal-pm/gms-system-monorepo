import { createHash } from "node:crypto";
import { AppError, validationError } from "../../platform/errors";
import { Prisma, type Db } from "../../platform/db";
import type { MasterApi, SalePrepared } from "../../platform/master-api";
import { canApprove, hasGrant, type Principal } from "../../platform/auth/principal";
import { resolveOwnLots } from "./own-stock";
import { formatDocNo, nextRunningNo } from "./repository";

/**
 * Sale reads (sale SA rev 1 architecture.md "Read paths", N+1 budgets IT-SL-B12):
 * - detail: 3 inventory statements (header with the approval switch; lines with photo ids aggregated per line; charges)
 *   + at most ONE master `sale/prepare` for live caps while the document is editable, none for read-only documents;
 * - list / Daybook / Approve Center pending: one keyset statement (limit + 1), no per-row lookups;
 * - summary: one statement.
 */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (character) => `\\${character}`);
const iso = (value: Date | null) => (value ? value.toISOString() : null);

export type HeaderRow = {
  id: string; doc_no: string; status: string; version: number; doc_date: string; due_date: string;
  customer_id: string; customer_code_snapshot: string; customer_name_snapshot: string;
  shipping_address_id: string | null; shipping_address_snapshot: string; invoice_address_id: string | null; invoice_address_snapshot: string;
  currency_code: string; exchange_rate: string | null; ref: string; document_note: string;
  discount_type: string; discount_value: string; tax_enabled: boolean; tax_rate: string; tax_included: boolean;
  labor_work: string | null; labor_basis: string | null; labor_qty: string | null; labor_rate: string | null;
  subtotal: string; discount_amount: string; price_before_tax: string; tax_amount: string; charges_amount: string; labor_amount: string; grand_total: string;
  line_count: number; total_pcs: number; total_weight_ct: string;
  auto_approved: boolean; revision_count: number; submitted_at: Date | null; submitted_by: string | null; submitted_by_name: string | null;
  review_action: string | null; review_note: string | null; reviewed_at: Date | null; reviewed_by: string | null; reviewed_by_name: string | null;
  approved_at: Date | null; approved_by: string | null; deleted_at: Date | null; deleted_by: string | null;
  created_at: Date; created_by: string; updated_at: Date; updated_by: string;
  sync_state: string; provisional: boolean; applied_revision: number; require_approval: boolean | null;
};
type LineRow = {
  id: string; position: number; source: "RESERVE" | "STOCK" | "OWN_STOCK"; reserve_line_id: string | null; reserve_id: string | null; reserve_doc_no: string | null;
  memo_stock_id: string | null; lot_key: string | null; allocated: boolean; stock_id: string; memo_receive_id: string | null; memo_receive_doc_no: string | null;
  load_id: string | null; load_doc_no: string | null;
  stone_code: string; stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string; lot: string; location: string; cer_type: string; cer_no: string;
  price_unit: string; pcs: number; weight_ct: string; cap_pcs: number; cap_weight_ct: string; reserve_net_unit_price: string | null;
  unit_price: string; discount_type: string; discount_value: string; discount_amount: string; amount: string; item_note: string; photo_ids: string[];
};

/** Editable = DRAFT / REVISION_REQUESTED, or auto-approved APPROVED (edit-until-used, SQ-SL-02); never deleted / syncing. */
export function isEditable(row: Pick<HeaderRow, "status" | "auto_approved" | "deleted_at" | "sync_state">): boolean {
  if (row.deleted_at || row.sync_state === "SYNCING") return false;
  return row.status === "DRAFT" || row.status === "REVISION_REQUESTED" || (row.status === "APPROVED" && row.auto_approved);
}

/**
 * UT-SL-B02 flow flags (api-contract `flow`): Edit (EDIT) and Delete (DELETE) while editable (Delete also REJECTED);
 * Submit (ADD or EDIT) for DRAFT / REVISION with approval ON; Restore (DELETE) of a deleted Sale. `usedBy` is null:
 * "used" is decided by master at apply (`SALE_IN_USE`), no later document names a Sale yet.
 */
export function flowFlags(row: Pick<HeaderRow, "status" | "auto_approved" | "deleted_at" | "sync_state">, requireApproval: boolean, principal: Pick<Principal, "isSuperAdmin" | "grants">) {
  const live = !row.deleted_at && row.sync_state !== "SYNCING";
  const editable = isEditable(row);
  return {
    canEdit: editable && hasGrant(principal, "sale", "EDIT"),
    canDelete: live && (editable || row.status === "REJECTED") && hasGrant(principal, "sale", "DELETE"),
    canSubmit: live && (row.status === "DRAFT" || row.status === "REVISION_REQUESTED") && requireApproval && (hasGrant(principal, "sale", "ADD") || hasGrant(principal, "sale", "EDIT")),
    canRestore: Boolean(row.deleted_at) && row.sync_state !== "SYNCING" && hasGrant(principal, "sale", "DELETE"),
    usedBy: null as string | null,
  };
}

export async function readHeader(db: Pick<Db, "$queryRaw">, id: string): Promise<HeaderRow | null> {
  const [header] = await db.$queryRaw<HeaderRow[]>`
    SELECT h."id", h."doc_no", h."status", h."version", to_char(h."doc_date", 'YYYY-MM-DD') AS "doc_date", to_char(h."due_date", 'YYYY-MM-DD') AS "due_date",
      h."customer_id", h."customer_code_snapshot", h."customer_name_snapshot", h."shipping_address_id", h."shipping_address_snapshot", h."invoice_address_id", h."invoice_address_snapshot",
      h."currency_code", h."exchange_rate"::text AS "exchange_rate", h."ref", h."document_note", h."discount_type", h."discount_value"::text AS "discount_value",
      h."tax_enabled", h."tax_rate"::text AS "tax_rate", h."tax_included", h."labor_work", h."labor_basis", h."labor_qty"::text AS "labor_qty", h."labor_rate"::text AS "labor_rate",
      h."subtotal"::text AS "subtotal", h."discount_amount"::text AS "discount_amount", h."price_before_tax"::text AS "price_before_tax", h."tax_amount"::text AS "tax_amount",
      h."charges_amount"::text AS "charges_amount", h."labor_amount"::text AS "labor_amount", h."grand_total"::text AS "grand_total",
      h."line_count", h."total_pcs", h."total_weight_ct"::text AS "total_weight_ct", h."auto_approved", h."revision_count", h."submitted_at", h."submitted_by", h."submitted_by_name",
      h."review_action", h."review_note", h."reviewed_at", h."reviewed_by", h."reviewed_by_name", h."approved_at", h."approved_by", h."deleted_at", h."deleted_by",
      h."created_at", h."created_by", h."updated_at", h."updated_by", h."sync_state", h."provisional", h."applied_revision",
      (SELECT a."require_approval" FROM "inventory"."approval_setting" a WHERE a."type" = 'sale') AS "require_approval"
    FROM "inventory"."sale" h WHERE h."id" = ${id}::uuid`;
  return header ?? null;
}

export async function readLines(db: Pick<Db, "$queryRaw">, id: string): Promise<LineRow[]> {
  return db.$queryRaw<LineRow[]>`
    SELECT l."id", l."position", l."source", l."reserve_line_id", l."reserve_id", l."reserve_doc_no", l."memo_stock_id", l."lot_key", l."stock_id", l."memo_receive_id", l."memo_receive_doc_no", l."load_id", l."load_doc_no",
      EXISTS (SELECT 1 FROM "inventory"."sale_line_alloc" a WHERE a."sale_line_id" = l."id") AS "allocated",
      l."stone_code", l."stone", l."shape", l."size", l."color", l."clarity", l."cutting", l."quality", l."lot", l."location", l."cer_type", l."cer_no",
      l."price_unit", l."pcs", l."weight_ct"::text AS "weight_ct", l."cap_pcs", l."cap_weight_ct"::text AS "cap_weight_ct", l."reserve_net_unit_price"::text AS "reserve_net_unit_price",
      l."unit_price"::text AS "unit_price", l."discount_type", l."discount_value"::text AS "discount_value", l."discount_amount"::text AS "discount_amount", l."amount"::text AS "amount", l."item_note",
      COALESCE((SELECT array_agg(p."file_id"::text ORDER BY p."position") FROM "inventory"."sale_line_photo" p WHERE p."line_id" = l."id"), ARRAY[]::text[]) AS "photo_ids"
    FROM "inventory"."sale_line" l WHERE l."sale_id" = ${id}::uuid ORDER BY l."position"`;
}

/** Live caps of an editable Sale (one master call; read-only mode, no party). Master down → the stored caps. */
async function liveCaps(db: Db, master: MasterApi, header: HeaderRow, lines: LineRow[], requestId: string): Promise<Map<string, { capPcs: number; capWeightCt: string }> | null> {
  // ADR-0058: own-stock lines read their caps locally (available + this Sale's own quantity); master is asked only for the others.
  const ownLots = await resolveOwnLots(db, lines.flatMap((line) => (line.source === "OWN_STOCK" && line.lot_key ? [line.lot_key] : [])), header.id);
  const masterLines = lines.filter((line) => line.source !== "OWN_STOCK");
  let prepared: SalePrepared | null = null;
  try {
    if (masterLines.length > 0) prepared = await master.salePrepare({
      currency: header.currency_code,
      reserveLineIds: masterLines.flatMap((line) => (line.reserve_line_id ? [line.reserve_line_id] : [])),
      memoStockIds: masterLines.flatMap((line) => (line.source === "STOCK" && line.memo_stock_id ? [line.memo_stock_id] : [])),
      lotKeys: masterLines.flatMap((line) => (line.source === "STOCK" && !line.memo_stock_id && line.lot_key ? [line.lot_key] : [])),
      saleId: header.id,
    }, { requestId });
  } catch (error) {
    if (error instanceof AppError && error.status === 503) return null;
    throw error;
  }
  const reserve = new Map((prepared?.reserveLines ?? []).map((ref) => [ref.reserveLineId, ref]));
  const stock = new Map((prepared?.memoStocks ?? []).map((item) => [item.memoStockId, item]));
  const lots = new Map((prepared?.memoLots ?? []).map((lot) => [lot.lotKey, lot]));
  const caps = new Map<string, { capPcs: number; capWeightCt: string }>();
  for (const line of lines) {
    if (line.source === "OWN_STOCK") {
      const lot = line.lot_key ? ownLots.get(line.lot_key) : undefined;
      caps.set(line.id, lot ? { capPcs: lot.availablePcs, capWeightCt: lot.availableWeightCt } : { capPcs: 0, capWeightCt: "0.000" });
    } else if (line.source === "RESERVE") {
      const ref = reserve.get(line.reserve_line_id!);
      const usable = ref && ref.status !== "UNAVAILABLE" && ref.customerId === header.customer_id && ref.currency === header.currency_code;
      caps.set(line.id, usable ? { capPcs: ref.openPcs, capWeightCt: ref.openWeightCt } : { capPcs: 0, capWeightCt: "0.000" });
    } else {
      if (!line.memo_stock_id) {
        const lot = line.lot_key ? lots.get(line.lot_key) : undefined;
        caps.set(line.id, lot && lot.status === "OK" ? { capPcs: lot.pendingPcs ?? 0, capWeightCt: lot.pendingWeightCt ?? "0.000" } : { capPcs: 0, capWeightCt: "0.000" });
        continue;
      }
      const item = stock.get(line.memo_stock_id);
      caps.set(line.id, item && item.status === "OK" ? { capPcs: item.pendingPcs, capWeightCt: item.pendingWeightCt } : { capPcs: 0, capWeightCt: "0.000" });
    }
  }
  return caps;
}

export async function getDetail(db: Db, master: MasterApi, id: string, principal: Principal, requestId: string) {
  const header = await readHeader(db, id);
  if (!header || header.provisional) throw new AppError(404, "SALE_NOT_FOUND");
  const [lines, charges] = await Promise.all([
    readLines(db, id),
    db.$queryRaw<{ charge_type: string; amount: string }[]>`SELECT "charge_type", "amount"::text AS "amount" FROM "inventory"."sale_charge" WHERE "sale_id" = ${id}::uuid ORDER BY "charge_type"`,
  ]);
  const caps = isEditable(header) && lines.length > 0 ? await liveCaps(db, master, header, lines, requestId) : null;
  const requireApproval = header.require_approval ?? true;
  return {
    id: header.id, docNo: header.doc_no, status: header.status, version: header.version,
    docDate: header.doc_date, dueDate: header.due_date,
    customerId: header.customer_id, customer: { code: header.customer_code_snapshot, name: header.customer_name_snapshot },
    shippingAddressId: header.shipping_address_id, shippingAddressText: header.shipping_address_snapshot,
    invoiceAddressId: header.invoice_address_id, invoiceAddressText: header.invoice_address_snapshot,
    currency: header.currency_code, exchangeRate: header.exchange_rate, ref: header.ref, documentNote: header.document_note,
    discount: { type: header.discount_type, value: header.discount_value },
    tax: { enabled: header.tax_enabled, rate: header.tax_rate, includeInPrice: header.tax_included },
    labor: header.labor_work === null ? null : { work: header.labor_work, basis: header.labor_basis, qty: header.labor_qty, rate: header.labor_rate },
    serviceCharges: charges.map((charge) => ({ type: charge.charge_type, amount: charge.amount })),
    lines: lines.map((line) => {
      const cap = caps?.get(line.id);
      return {
        // ADR-0055: lot key + allocated flag; the Stock ID stays (owner 2026-11-21 Q3: "" on a lot line); no allocation rows.
        id: line.id, position: line.position, source: line.source, reserveLineId: line.reserve_line_id, memoStockId: line.memo_stock_id, stockId: line.stock_id,
        lotKey: line.lot_key, allocated: line.allocated,
        sourceDoc: line.source === "RESERVE"
          ? { type: "RESERVE" as const, id: line.reserve_id!, docNo: line.reserve_doc_no ?? "" }
          : line.source === "OWN_STOCK"
          ? { type: "LOAD" as const, id: line.load_id ?? "", docNo: line.load_doc_no ?? "" }
          : { type: "MEMO_RECEIVE" as const, id: line.memo_receive_id ?? "", docNo: line.memo_receive_doc_no ?? "" },
        stoneCode: line.stone_code, stone: line.stone, shape: line.shape, size: line.size, color: line.color, clarity: line.clarity, cutting: line.cutting, quality: line.quality,
        lot: line.lot, location: line.location, cerType: line.cer_type, cerNo: line.cer_no,
        priceUnit: line.price_unit, pcs: line.pcs, weightCt: line.weight_ct,
        capPcs: cap?.capPcs ?? line.cap_pcs, capWeightCt: cap?.capWeightCt ?? line.cap_weight_ct,
        reservePrice: line.reserve_net_unit_price, unitPrice: line.unit_price,
        discount: { type: line.discount_type, value: line.discount_value }, discountAmount: line.discount_amount, amount: line.amount,
        itemNote: line.item_note, photoIds: line.photo_ids,
      };
    }),
    totals: {
      lineCount: header.line_count, pcs: header.total_pcs, weightCt: header.total_weight_ct, subtotal: header.subtotal, discountAmount: header.discount_amount,
      priceBeforeTax: header.price_before_tax, taxAmount: header.tax_amount, chargesAmount: header.charges_amount, laborAmount: header.labor_amount, grandTotal: header.grand_total,
    },
    approval: {
      requireApproval, autoApproved: header.auto_approved, revisionCount: Math.min(header.revision_count, 1),
      submitted: header.submitted_at ? { at: header.submitted_at.toISOString(), by: header.submitted_by ?? "", byName: header.submitted_by_name } : null,
      review: header.review_action ? { action: header.review_action, note: header.review_note ?? "", at: iso(header.reviewed_at), by: header.reviewed_by ?? "", byName: header.reviewed_by_name } : null,
    },
    flow: flowFlags(header, requireApproval, principal),
    syncing: header.sync_state === "SYNCING",
    deleted: header.deleted_at ? { at: header.deleted_at.toISOString(), by: header.deleted_by ?? "" } : null,
    approvedAt: iso(header.approved_at), approvedBy: header.approved_by,
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

/** Daybook: newest first, keyset on sale_list_idx / sale_deleted_list_idx, one statement. */
export async function listDocuments(db: Db, query: { status?: string; deleted?: "true" | "false"; q?: string; cursor?: string; limit?: number }) {
  const limit = query.limit ?? 50;
  const where: Prisma.Sql[] = [Prisma.sql`NOT h."provisional"`, query.deleted === "true" ? Prisma.sql`h."deleted_at" IS NOT NULL` : Prisma.sql`h."deleted_at" IS NULL`];
  if (query.status) where.push(Prisma.sql`h."status" = ${query.status}`);
  if (query.q) {
    const pattern = `%${escapeLike(query.q)}%`;
    where.push(Prisma.sql`(h."doc_no" ILIKE ${pattern} ESCAPE '\\' OR h."customer_name_snapshot" ILIKE ${pattern} ESCAPE '\\')`);
  }
  if (query.cursor) {
    const after = decodeListCursor(query.cursor);
    where.push(Prisma.sql`(h."doc_date", h."created_at", h."id") < (${after.d}::date, ${after.c}::timestamptz, ${after.i}::uuid)`);
  }
  const rows = await db.$queryRaw<{ id: string; doc_no: string; doc_date: string; status: string; review_note: string | null; customer_name_snapshot: string; line_count: number; total_pcs: number; total_weight_ct: string; grand_total: string; currency_code: string; auto_approved: boolean; deleted: boolean; created_at: Date }[]>`
    SELECT h."id", h."doc_no", to_char(h."doc_date", 'YYYY-MM-DD') AS "doc_date", h."status", h."review_note", h."customer_name_snapshot", h."line_count", h."total_pcs",
      h."total_weight_ct"::text AS "total_weight_ct", h."grand_total"::text AS "grand_total", h."currency_code", h."auto_approved", (h."deleted_at" IS NOT NULL) AS "deleted", h."created_at"
    FROM "inventory"."sale" h
    WHERE ${Prisma.join(where, " AND ")}
    ORDER BY h."doc_date" DESC, h."created_at" DESC, h."id" DESC
    LIMIT ${limit + 1}`;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map((row) => ({
      id: row.id, docNo: row.doc_no, docDate: row.doc_date, status: row.status, reviewNote: row.review_note, customerName: row.customer_name_snapshot,
      lineCount: row.line_count, totalPcs: row.total_pcs, totalWeightCt: row.total_weight_ct, grandTotal: row.grand_total, currency: row.currency_code,
      autoApproved: row.auto_approved, deleted: row.deleted,
    })),
    nextCursor: rows.length > limit && last ? encode({ d: last.doc_date, c: last.created_at.toISOString(), i: last.id }) : null,
  };
}

/** `GET /sale/next-number`: preview, nothing reserved (master resolve with markUsed false + local max + 1). */
export async function nextNumber(db: Db, master: MasterApi, docDate: string, requestId: string) {
  const numbering = (await master.numbering(docDate, false, { requestId }, "sale")).numbering;
  return { docNo: formatDocNo(numbering, await nextRunningNo(db, numbering, false)) };
}

// ---------- Approve Center (ADR-0054 D8, master shapes) ----------

export const SUMMARY_COUNT_CAP = 100;

/** `{type: "sale", count}` for `sale` APPROVE + VIEW holders while approval is ON; one statement. */
export async function approvalSummary(db: Db, principal: Principal) {
  if (!canApprove(principal, "sale")) return [];
  const [row] = await db.$queryRaw<{ require_approval: boolean | null; count: number }[]>`
    SELECT (SELECT "require_approval" FROM "inventory"."approval_setting" WHERE "type" = 'sale') AS "require_approval",
      (SELECT count(*) FROM (SELECT 1 FROM "inventory"."sale" WHERE "status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL LIMIT ${SUMMARY_COUNT_CAP}) c)::int AS "count"`;
  if (row.require_approval === false) return [];
  return [{ type: "sale" as const, count: Number(row.count) }];
}

type Sort = "submittedAt" | "docNo" | "party" | "qty" | "value";
const SORT_COLUMN: Record<Sort, string> = { submittedAt: "submitted_at", docNo: "doc_no", party: "customer_name_snapshot", qty: "total_weight_ct", value: "grand_total" };
const queryHash = (q: string | undefined) => createHash("sha256").update(q ?? "").digest("hex").slice(0, 16);

/** `GET /approval/pending?type=sale`: one keyset statement on sale_pending_idx (party = customer, value = grand total). */
export async function approvalPending(db: Db, input: { q?: string; sort: Sort; dir: "asc" | "desc"; cursor?: string; limit: number }) {
  const column = Prisma.raw(`h."${SORT_COLUMN[input.sort]}"`);
  const direction = Prisma.raw(input.dir === "asc" ? "ASC" : "DESC");
  const where: Prisma.Sql[] = [Prisma.sql`h."status" = 'PENDING_APPROVAL'`, Prisma.sql`h."deleted_at" IS NULL`];
  if (input.q) {
    const pattern = `%${escapeLike(input.q)}%`;
    where.push(Prisma.sql`(h."doc_no" ILIKE ${pattern} ESCAPE '\\' OR h."customer_name_snapshot" ILIKE ${pattern} ESCAPE '\\' OR h."ref" ILIKE ${pattern} ESCAPE '\\')`);
  }
  if (input.cursor) {
    const invalid = () => validationError([{ path: "cursor", code: "invalid" }]);
    let body: { s?: string; d?: string; q?: string; i?: string };
    try { body = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")); } catch { throw invalid(); }
    if (!body || body.s !== input.sort || body.d !== input.dir || body.q !== queryHash(input.q) || typeof body.i !== "string" || !/^[0-9a-f-]{36}$/.test(body.i)) throw invalid();
    const op = Prisma.raw(input.dir === "asc" ? ">" : "<");
    where.push(Prisma.sql`(${column}, h."id") ${op} ((SELECT ${Prisma.raw(`k."${SORT_COLUMN[input.sort]}"`)} FROM "inventory"."sale" k WHERE k."id" = ${body.i}::uuid AND k."status" = 'PENDING_APPROVAL'), ${body.i}::uuid)`);
  }
  const rows = await db.$queryRaw<{ id: string; doc_no: string; doc_date: string; customer_name_snapshot: string; submitted_at: Date; submitted_by_name: string | null; total_pcs: number; total_weight_ct: string; grand_total: string; currency_code: string; revision_count: number }[]>`
    SELECT h."id", h."doc_no", to_char(h."doc_date", 'YYYY-MM-DD') AS "doc_date", h."customer_name_snapshot", h."submitted_at", h."submitted_by_name", h."total_pcs",
      h."total_weight_ct"::text AS "total_weight_ct", h."grand_total"::text AS "grand_total", h."currency_code", h."revision_count"
    FROM "inventory"."sale" h
    WHERE ${Prisma.join(where, " AND ")}
    ORDER BY ${column} ${direction}, h."id" ${direction}
    LIMIT ${input.limit + 1}`;
  const page = rows.slice(0, input.limit);
  const last = page[page.length - 1];
  return {
    items: page.map((row) => ({
      id: row.id, docNo: row.doc_no, docDate: row.doc_date, partyName: row.customer_name_snapshot, submittedAt: row.submitted_at.toISOString(), submittedByName: row.submitted_by_name,
      totalPcs: row.total_pcs, totalWeightCt: row.total_weight_ct, value: row.grand_total, currency: row.currency_code, revisionCount: Math.min(row.revision_count, 1),
    })),
    nextCursor: rows.length > input.limit && last ? encode({ s: input.sort, d: input.dir, q: queryHash(input.q), i: last.id }) : null,
  };
}
