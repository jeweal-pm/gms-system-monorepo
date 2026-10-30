import { Injectable } from "@nestjs/common";
import { escapeLike } from "../common/persistence";
import { prisma } from "../database/prisma-client";
import { fromDbDate, toDbDate } from "../document-setup/document-setup.service";
import { Prisma } from "../generated/prisma/client";
import { memoReceiveErrors } from "./memo-receive.service";
import type {
  MemoOutstandingFilters,
  MemoOutstandingItemsInput,
  MemoOutstandingListInput,
  MemoOutstandingSortKey,
} from "./memo-outstanding.schemas";

const Decimal = Prisma.Decimal;
type Dec = Prisma.Decimal;
type Num = Dec | string | number | bigint;

/** Asia/Bangkok has no daylight saving: UTC+7 all year. */
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
export const MEMO_OUTSTANDING_VENDOR_OPTIONS_MAX = 1_000;
const APPROVED = "APPROVED";

/** Today's calendar date in Asia/Bangkok as YYYY-MM-DD (SA-MOV-07). */
export function bangkokToday(now: Date): string {
  return new Date(now.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Open value of one item (SA-MOV-06): line_amount × (reserved + pending basis) ÷ received basis, basis = weight for
 * PER_CT and pcs for PER_PCS; a zero received basis uses net_unit_price × open quantity. PostgreSQL `round(numeric, 2)`
 * rounds half away from zero, which is half-up for these non-negative amounts.
 */
const OPEN_VALUE = Prisma.sql`round(CASE WHEN s.price_unit = 'PER_CT' THEN
    CASE WHEN s.received_weight_ct = 0 THEN s.net_unit_price * (s.reserved_weight_ct + s.pending_weight_ct)
      ELSE s.line_amount * (s.reserved_weight_ct + s.pending_weight_ct) / s.received_weight_ct END
  ELSE
    CASE WHEN s.received_pcs = 0 THEN s.net_unit_price * (s.reserved_pcs + s.pending_pcs)
      ELSE s.line_amount * (s.reserved_pcs + s.pending_pcs) / s.received_pcs END
  END, 2)`;

/** SA-MOV-04: a document is listed while any of its items has Reserve or Outstanding above 0. */
const HAS_OPEN_ITEM = Prisma.sql`bool_or(s.pending_pcs > 0 OR s.pending_weight_ct > 0 OR s.reserved_pcs > 0 OR s.reserved_weight_ct > 0)`;

/** Document sums of every item (Q-MOV-02/09: the document row is always the sum of its items). */
const DOC_SUMS = Prisma.sql`
  sum(s.received_pcs)::bigint AS memo_pcs, sum(s.received_weight_ct) AS memo_wt,
  sum(s.returned_pcs)::bigint AS return_pcs, sum(s.returned_weight_ct) AS return_wt,
  sum(s.sold_pcs)::bigint AS sold_pcs, sum(s.sold_weight_ct) AS sold_wt,
  sum(s.reserved_pcs)::bigint AS reserve_pcs, sum(s.reserved_weight_ct) AS reserve_wt,
  sum(s.pending_pcs)::bigint AS outstanding_pcs, sum(s.pending_weight_ct) AS outstanding_wt,
  sum(${OPEN_VALUE}) AS open_value`;

/** Whitelisted ORDER BY columns of the grouped `docs` CTE (SA-MOV-05). Never built from client text. */
const SORT_COLUMNS: Record<MemoOutstandingSortKey, Prisma.Sql> = {
  docNo: Prisma.sql`doc_no`,
  dueDate: Prisma.sql`due_date`,
  vendorName: Prisma.sql`vendor_name_snapshot`,
  memoPcs: Prisma.sql`memo_pcs`,
  returnPcs: Prisma.sql`return_pcs`,
  soldPcs: Prisma.sql`sold_pcs`,
  reservePcs: Prisma.sql`reserve_pcs`,
  outstandingPcs: Prisma.sql`outstanding_pcs`,
  openValue: Prisma.sql`open_value`,
};

type BucketSums = {
  memo_pcs: Num; memo_wt: Num; return_pcs: Num; return_wt: Num; sold_pcs: Num; sold_wt: Num;
  reserve_pcs: Num; reserve_wt: Num; outstanding_pcs: Num; outstanding_wt: Num; open_value: Num;
};
type DocRow = BucketSums & {
  id: string; doc_no: string; doc_date: Date; due_date: Date; due_in_days: number;
  vendor_id: string; vendor_code_snapshot: string; vendor_name_snapshot: string; currency_code: string;
};
type ItemRow = BucketSums & {
  id: string; memo_receive_id: string; position: number; stock_id: string; lot: string; location: string;
  stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string;
  cer_type: string; cer_no: string; item_note: string; photo_count: Num; price_unit: string; net_unit_price: Num; currency_code: string;
};
type SummaryRow = { documents: Num; overdue: Num; due_in_7_days: Num; grand_total: Num | null; company_currency: string | null };

const dec = (value: Num | null) => new Decimal((value ?? 0).toString());
const qty = (pcs: Num, weight: Num) => ({ pcs: Number(pcs), weightCt: dec(weight).toFixed(3) });
const buckets = (row: BucketSums) => ({
  memo: qty(row.memo_pcs, row.memo_wt),
  return: qty(row.return_pcs, row.return_wt),
  sold: qty(row.sold_pcs, row.sold_wt),
  reserve: qty(row.reserve_pcs, row.reserve_wt),
  outstanding: qty(row.outstanding_pcs, row.outstanding_wt),
});

/** Header filters on `memo_receive r` (SA-MOV-04): approved only, escaped ILIKE, vendor ids, doc date range. */
function receiveFilters(input: MemoOutstandingFilters): Prisma.Sql {
  const filters: Prisma.Sql[] = [Prisma.sql`r.status = ${APPROVED}`];
  if (input.q) {
    const pattern = `%${escapeLike(input.q)}%`;
    filters.push(Prisma.sql`(r.doc_no ILIKE ${pattern} OR r.vendor_name_snapshot ILIKE ${pattern})`);
  }
  if (input.vendorIds && input.vendorIds.length > 0) {
    const ids = [...new Set(input.vendorIds)].map((id) => Prisma.sql`${id}::uuid`);
    filters.push(Prisma.sql`r.vendor_id IN (${Prisma.join(ids)})`);
  }
  if (input.from) filters.push(Prisma.sql`r.doc_date >= ${toDbDate(input.from)}::date`);
  if (input.to) filters.push(Prisma.sql`r.doc_date <= ${toDbDate(input.to)}::date`);
  return Prisma.join(filters, " AND ");
}

/**
 * memoOutstanding.* (memo-outstanding-vendor SA-MOV-01…09, ADR-0035): read-only report over approved Memo Receive
 * documents and their Memo Stock buckets. Bound parameters only; summary 1 query, list 2, items 1, options 1.
 */
@Injectable()
export class MemoOutstandingService {
  /** Injectable for tests (Bangkok date boundary). */
  clock: () => Date = () => new Date();

  async vendorSummary(input: MemoOutstandingFilters) {
    const today = toDbDate(bangkokToday(this.clock()));
    try {
      const [row] = await prisma.$queryRaw<SummaryRow[]>(Prisma.sql`
        WITH company AS (SELECT currency_code FROM "partner"."company_profile" WHERE id = 1),
        docs AS (
          SELECT r.id, r.due_date, r.currency_code, r.exchange_rate, sum(${OPEN_VALUE}) AS open_value
          FROM "partner"."memo_receive" r
          JOIN "partner"."memo_stock" s ON s.memo_receive_id = r.id
          WHERE ${receiveFilters(input)}
          GROUP BY r.id
          HAVING ${HAS_OPEN_ITEM}
        )
        SELECT count(*)::bigint AS documents,
          count(*) FILTER (WHERE d.due_date < ${today}::date)::bigint AS overdue,
          count(*) FILTER (WHERE d.due_date >= ${today}::date AND d.due_date <= ${today}::date + 7)::bigint AS due_in_7_days,
          round(sum(d.open_value * CASE WHEN d.currency_code = (SELECT currency_code FROM company) THEN 1
            ELSE COALESCE(d.exchange_rate, 1) END), 2) AS grand_total,
          (SELECT currency_code FROM company) AS company_currency
        FROM docs d`);
      return {
        documents: Number(row?.documents ?? 0),
        overdue: Number(row?.overdue ?? 0),
        dueIn7Days: Number(row?.due_in_7_days ?? 0),
        grandTotal: dec(row?.grand_total ?? 0).toFixed(2),
        companyCurrency: row?.company_currency?.trim() ?? "",
      };
    } catch (error) {
      throw memoReceiveErrors.map(error, "memo_outstanding.vendor_summary");
    }
  }

  async vendorList(input: MemoOutstandingListInput) {
    const today = toDbDate(bangkokToday(this.clock()));
    const dir = input.dir === "desc" ? Prisma.sql`DESC` : Prisma.sql`ASC`;
    const sort = input.sort ?? "dueDate";
    const orderBy = sort === "dueDate"
      ? Prisma.sql`due_date ${dir}, doc_no ASC, id ASC`
      : Prisma.sql`${SORT_COLUMNS[sort]} ${dir}, id ASC`;
    const docs = Prisma.sql`
      SELECT r.id, r.doc_no, r.doc_date, r.due_date, r.vendor_id, r.vendor_code_snapshot, r.vendor_name_snapshot, r.currency_code,
        ${DOC_SUMS}
      FROM "partner"."memo_receive" r
      JOIN "partner"."memo_stock" s ON s.memo_receive_id = r.id
      WHERE ${receiveFilters(input)}
      GROUP BY r.id
      HAVING ${HAS_OPEN_ITEM}`;
    try {
      const [rows, counted] = await Promise.all([
        prisma.$queryRaw<DocRow[]>(Prisma.sql`
          WITH docs AS (${docs})
          SELECT id::text AS id, doc_no, doc_date, due_date, (due_date - ${today}::date)::int AS due_in_days,
            vendor_id::text AS vendor_id, vendor_code_snapshot, vendor_name_snapshot, currency_code,
            memo_pcs, memo_wt, return_pcs, return_wt, sold_pcs, sold_wt, reserve_pcs, reserve_wt, outstanding_pcs, outstanding_wt, open_value
          FROM docs
          ORDER BY ${orderBy}
          LIMIT ${input.pageSize} OFFSET ${(input.page - 1) * input.pageSize}`),
        prisma.$queryRaw<{ total: Num }[]>(Prisma.sql`WITH docs AS (${docs}) SELECT count(*)::bigint AS total FROM docs`),
      ]);
      return {
        items: rows.map((row) => ({
          memoReceiveId: row.id,
          docNo: row.doc_no,
          docDate: fromDbDate(row.doc_date),
          dueDate: fromDbDate(row.due_date),
          dueInDays: Number(row.due_in_days),
          vendor: { id: row.vendor_id, code: row.vendor_code_snapshot, name: row.vendor_name_snapshot },
          currency: row.currency_code.trim(),
          openValue: dec(row.open_value).toFixed(2),
          ...buckets(row),
        })),
        total: Number(counted[0]?.total ?? 0),
        page: input.page,
        pageSize: input.pageSize,
      };
    } catch (error) {
      throw memoReceiveErrors.map(error, "memo_outstanding.vendor_list");
    }
  }

  /**
   * SA-MOV-08: every item of the given documents that are listed (approved, with an open item, SA-MOV-04), so the items
   * sum to the document row; unknown, unapproved or fully settled ids are skipped. Doc number, then line order.
   */
  async vendorItems(input: MemoOutstandingItemsInput) {
    const ids = [...new Set(input.memoReceiveIds)].map((id) => Prisma.sql`${id}::uuid`);
    try {
      const rows = await prisma.$queryRaw<ItemRow[]>(Prisma.sql`
        SELECT s.id::text AS id, s.memo_receive_id::text AS memo_receive_id, l.position, s.stock_id, s.lot, s.location,
          s.stone, s.shape, s.size, s.color, s.clarity, s.cutting, s.quality, s.cer_type, s.cer_no, s.item_note,
          s.received_pcs AS memo_pcs, s.received_weight_ct AS memo_wt, s.returned_pcs AS return_pcs, s.returned_weight_ct AS return_wt,
          s.sold_pcs, s.sold_weight_ct AS sold_wt, s.reserved_pcs AS reserve_pcs, s.reserved_weight_ct AS reserve_wt,
          s.pending_pcs AS outstanding_pcs, s.pending_weight_ct AS outstanding_wt,
          ${OPEN_VALUE} AS open_value, s.price_unit, s.net_unit_price, s.currency_code,
          (SELECT count(*) FROM "partner"."memo_receive_line_photo" p WHERE p.line_id = s.memo_receive_line_id)::bigint AS photo_count
        FROM "partner"."memo_stock" s
        JOIN "partner"."memo_receive" r ON r.id = s.memo_receive_id
        JOIN "partner"."memo_receive_line" l ON l.id = s.memo_receive_line_id
        WHERE r.status = ${APPROVED} AND r.id IN (${Prisma.join(ids)})
          AND EXISTS (SELECT 1 FROM "partner"."memo_stock" o WHERE o.memo_receive_id = r.id
            AND (o.pending_pcs > 0 OR o.pending_weight_ct > 0 OR o.reserved_pcs > 0 OR o.reserved_weight_ct > 0))
        ORDER BY r.doc_no ASC, r.id ASC, l.position ASC`);
      return {
        items: rows.map((row) => ({
          id: row.id,
          memoReceiveId: row.memo_receive_id,
          position: Number(row.position),
          stockId: row.stock_id,
          lot: row.lot,
          location: row.location as "Memo",
          stone: row.stone,
          shape: row.shape,
          size: row.size,
          color: row.color,
          clarity: row.clarity,
          cutting: row.cutting,
          quality: row.quality,
          cerType: row.cer_type,
          cerNo: row.cer_no,
          itemNote: row.item_note,
          photoCount: Number(row.photo_count),
          priceUnit: (row.price_unit === "PER_CT" ? "CTS" : "PCS") as "CTS" | "PCS",
          netUnitPrice: dec(row.net_unit_price).toFixed(4),
          currency: row.currency_code.trim(),
          openValue: dec(row.open_value).toFixed(2),
          ...buckets(row),
        })),
      };
    } catch (error) {
      throw memoReceiveErrors.map(error, "memo_outstanding.vendor_items");
    }
  }

  /** SA-MOV-09: distinct vendors with approved Memo Receive documents, by name, at most 1,000. */
  async vendorOptions() {
    try {
      const rows = await prisma.$queryRaw<{ id: string; code: string; name: string }[]>(Prisma.sql`
        SELECT v.id::text AS id, v.code, v.name
        FROM "partner"."vendor" v
        WHERE EXISTS (SELECT 1 FROM "partner"."memo_receive" r WHERE r.vendor_id = v.id AND r.status = ${APPROVED})
        ORDER BY v.name_key ASC, v.id ASC
        LIMIT ${MEMO_OUTSTANDING_VENDOR_OPTIONS_MAX}`);
      return { vendors: rows.map((row) => ({ id: row.id, code: row.code, name: row.name })) };
    } catch (error) {
      throw memoReceiveErrors.map(error, "memo_outstanding.vendor_options");
    }
  }
}
