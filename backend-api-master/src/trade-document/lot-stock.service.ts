import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { escapeLike } from "../common/persistence";
import { prisma } from "../database/prisma-client";
import { toDbDate } from "../document-setup/document-setup.service";
import { Prisma } from "../generated/prisma/client";
import { inventoryClient } from "../inventory-client/inventory-client";
import { purchaseErrors } from "../purchase/purchase.errors";
import { decodeLotCursor, encodeLotCursor, type LotKey } from "./lot-key";
import { memoReceiveErrors } from "./memo-receive.service";

/**
 * lot-based-stock SA rev 1 / ADR-0055 D3 (BE-LOT-003): the lot pickers. A row is a lot group (every item detail equal,
 * `lot_key`), never a Stock ID (owner Q-LOT-10): no `stockId`, `stockIds` or Stock ID count is returned.
 * - A group is listed when ANY of its open rows matches q (Lot, Stone, Stone Code, Cer No., source doc no.; never the
 *   Stock ID, Q-LOT-10a) or the date range; the quantities always cover the whole group (Q-LOT-12).
 * - Order: newest ref date in the group DESC, lot_key DESC (Q-LOT-11); keyset cursor base64url(`date|lotKey`).
 * - Statements: Memo Stock = ONE statement per page (matching keys LIMIT n + 1, aggregate and newest-row CTEs on
 *   `memo_stock_lot_open_idx`); Purchase adds one count statement; `fromStock.lots` adds ONE inventory call
 *   (`stock/lots/available`, 2 s) and keeps our stock FIRST, then Memo Stock (owner 2026-11-20).
 */
const DAY_MS = 86_400_000;
function dateRange(value: { from?: string; to?: string }, ctx: z.RefinementCtx) {
  if (value.from && value.to) {
    const days = (Date.parse(value.to) - Date.parse(value.from)) / DAY_MS;
    if (days < 0) ctx.addIssue({ code: "custom", path: ["to"], params: { code: "before_from" }, message: "before_from" });
    else if (days > 366) ctx.addIssue({ code: "custom", path: ["to"], params: { code: "range_too_long" }, message: "range_too_long" });
  }
}
const filterFields = {
  q: z.string().trim().max(100).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  cursor: z.string().max(200).nullish(),
  /** Sent by tRPC infinite queries; pages only go forward. */
  direction: z.enum(["forward", "backward"]).optional(),
  limit: z.number().int().min(1).max(50).default(50),
};
export const memoStockLotsSchema = z.object({ vendorId: z.uuid(), currency: z.string().regex(/^[A-Z]{3}$/), ...filterFields }).strict().superRefine(dateRange);
export const fromStockLotsSchema = z.object({ ...filterFields, location: z.string().trim().min(1).max(40).optional() }).strict().superRefine(dateRange);
export const purchaseMemoStockLotsSchema = z.object({
  vendorId: z.uuid(), currency: z.string().regex(/^[A-Z]{3}$/), group: z.enum(["ALL", "SOLD", "IN_STOCK"]).default("ALL"), ...filterFields,
}).strict().superRefine(dateRange);
export type MemoStockLotsInput = z.output<typeof memoStockLotsSchema>;
export type FromStockLotsInput = z.output<typeof fromStockLotsSchema>;
export type PurchaseMemoStockLotsInput = z.output<typeof purchaseMemoStockLotsSchema>;

/** api-contract `LotGroupRow`. */
export type LotGroupRow = {
  lotKey: LotKey;
  source: "MEMO_STOCK" | "OWN_STOCK";
  lot: string;
  merged: boolean;
  stoneCode: string; stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string;
  cerType: string; cerNo: string;
  location: string;
  itemNote: string;
  ref: { type: "MEMO_RECEIVE" | "LOAD"; id: string; docNo: string; docDate: string };
  refCount: number;
  pendingPcs: number; pendingWeightCt: string;
  priceUnit: "PER_CT" | "PER_PCS";
  unitPrice: string | null; netUnitPrice: string | null; amount: string | null;
  currency: string | null; vendor: { id: string; code: string; name: string } | null;
  /** Own stock only (sale-own-stock ADR-0058 D7): the lot's Sale Price per price unit, to prefill the Sale unit price; absent for Memo Stock. */
  salePrice?: string | null;
};

/** Memo Stock bucket a picker lists (fixed SQL, never input). */
const BUCKETS = {
  pending: { open: Prisma.sql`(s.pending_pcs > 0 OR s.pending_weight_ct > 0)`, pcs: Prisma.sql`s.pending_pcs`, weight: Prisma.sql`s.pending_weight_ct` },
  soldOpen: { open: Prisma.sql`(s.sold_pcs > s.purchased_pcs OR s.sold_weight_ct > s.purchased_weight_ct)`, pcs: Prisma.sql`(s.sold_pcs - s.purchased_pcs)`, weight: Prisma.sql`(s.sold_weight_ct - s.purchased_weight_ct)` },
} as const;
type Bucket = keyof typeof BUCKETS;

type MemoLotRow = {
  lot_key: string; d: string; n: number; p: number; w: string; amount: string; ref_count: number; sold_p: number; sold_w: string; avg_unit: string; avg_net: string;
  lot: string; stone_code: string | null; stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string;
  cer_type: string; cer_no: string; location: string; item_note: string; price_unit: string; unit_price: string; net_unit_price: string; currency_code: string;
  vendor_id: string; vendor_code_snapshot: string; vendor_name_snapshot: string; memo_receive_id: string; received_doc_no: string; ref_date: string;
};

type MemoLotQuery = { bucket: Bucket; vendorId?: string; currency?: string; q?: string; from?: string; to?: string; after?: { date: string; lotKey: string }; limit: number };

/** One statement: ≤ limit groups of Memo Stock lots after the cursor, with sums, newest ref and details. */
export function memoLotSql(query: MemoLotQuery): Prisma.Sql {
  const bucket = BUCKETS[query.bucket];
  const where: Prisma.Sql[] = [bucket.open];
  if (query.vendorId) where.push(Prisma.sql`s.vendor_id = ${query.vendorId}::uuid`);
  if (query.currency) where.push(Prisma.sql`s.currency_code = ${query.currency}::char(3)`);
  const having: Prisma.Sql[] = [];
  if (query.q) {
    // The lots with ANY matching open row (one set-based semi-join; the stone code lives on the Memo Receive line).
    const pattern = `%${escapeLike(query.q)}%`;
    const scope = Prisma.join(where, " AND ");
    where.push(Prisma.sql`s.lot_key IN (SELECT s.lot_key FROM "partner"."memo_stock" s LEFT JOIN "partner"."memo_receive_line" ml ON ml.id = s.memo_receive_line_id
      WHERE ${scope} AND (s.lot ILIKE ${pattern} OR s.stone ILIKE ${pattern} OR s.cer_no ILIKE ${pattern} OR s.received_doc_no ILIKE ${pattern} OR ml.stone_code_snapshot ILIKE ${pattern}))`);
  }
  if (query.from || query.to) {
    const from = query.from ? Prisma.sql`s.received_doc_date >= ${toDbDate(query.from)}::date` : Prisma.sql`TRUE`;
    const to = query.to ? Prisma.sql`s.received_doc_date <= ${toDbDate(query.to)}::date` : Prisma.sql`TRUE`;
    having.push(Prisma.sql`bool_or(${from} AND ${to})`);
  }
  if (query.after) having.push(Prisma.sql`(max(s.received_doc_date), s.lot_key) < (${toDbDate(query.after.date)}::date, ${query.after.lotKey}::varchar)`);
  const basis = (pcs: Prisma.Sql, weight: Prisma.Sql) => Prisma.sql`(CASE WHEN s.price_unit = 'PER_CT' THEN ${weight} ELSE ${pcs}::numeric END)`;
  const received = basis(Prisma.sql`s.received_pcs`, Prisma.sql`s.received_weight_ct`);
  const open = basis(bucket.pcs, bucket.weight);
  return Prisma.sql`
    WITH k AS (
      SELECT s.lot_key, max(s.received_doc_date) AS d FROM "partner"."memo_stock" s
      WHERE ${Prisma.join(where, " AND ")}
      GROUP BY s.lot_key
      ${having.length > 0 ? Prisma.sql`HAVING ${Prisma.join(having, " AND ")}` : Prisma.empty}
      ORDER BY d DESC, s.lot_key DESC
      LIMIT ${query.limit}
    ), g AS (
      SELECT s.lot_key, count(*)::int AS n, sum(${bucket.pcs})::int AS p, sum(${bucket.weight})::text AS w, count(DISTINCT s.memo_receive_id)::int AS ref_count,
        sum(round(CASE WHEN ${received} = 0 THEN s.line_amount ELSE s.line_amount * ${open} / ${received} END, 2))::text AS amount,
        sum(GREATEST(s.sold_pcs - s.purchased_pcs, 0))::int AS sold_p, sum(GREATEST(s.sold_weight_ct - s.purchased_weight_ct, 0))::text AS sold_w,
        -- Owner 2026-11-21 (Q1): prices may differ inside a lot; the row shows the average weighted by the open quantity in the
        -- price unit (weight for PER_CT, pcs for PER_PCS; the plain average when nothing is open in that unit).
        COALESCE(sum(s.unit_price * ${open}) / NULLIF(sum(${open}), 0), avg(s.unit_price))::text AS avg_unit,
        COALESCE(sum(s.net_unit_price * ${open}) / NULLIF(sum(${open}), 0), avg(s.net_unit_price))::text AS avg_net
      FROM "partner"."memo_stock" s WHERE s.lot_key IN (SELECT lot_key FROM k) AND ${bucket.open} GROUP BY s.lot_key
    ), n AS (
      SELECT DISTINCT ON (s.lot_key) s.lot_key, s.lot, s.stone, s.shape, s.size, s.color, s.clarity, s.cutting, s.quality, s.cer_type, s.cer_no, s.location, s.item_note,
        s.price_unit, s.unit_price::text AS unit_price, s.net_unit_price::text AS net_unit_price, s.currency_code, s.vendor_id::text AS vendor_id,
        s.vendor_code_snapshot, s.vendor_name_snapshot, s.memo_receive_id::text AS memo_receive_id, s.received_doc_no, to_char(s.received_doc_date, 'YYYY-MM-DD') AS ref_date,
        (SELECT ml.stone_code_snapshot FROM "partner"."memo_receive_line" ml WHERE ml.id = s.memo_receive_line_id) AS stone_code
      FROM "partner"."memo_stock" s WHERE s.lot_key IN (SELECT lot_key FROM k) AND ${bucket.open}
      ORDER BY s.lot_key, s.received_doc_date DESC, s.stock_id DESC
    )
    SELECT n.*, g.n, g.p, g.w, g.amount, g.ref_count, g.sold_p, g.sold_w, g.avg_unit, g.avg_net, to_char(k.d, 'YYYY-MM-DD') AS d
    FROM k JOIN g ON g.lot_key = k.lot_key JOIN n ON n.lot_key = k.lot_key
    ORDER BY k.d DESC, k.lot_key DESC`;
}

export function memoLotRow(row: MemoLotRow): LotGroupRow {
  const merged = row.lot_key.startsWith("ML");
  return {
    lotKey: row.lot_key,
    source: "MEMO_STOCK",
    lot: row.lot,
    merged,
    stoneCode: row.stone_code ?? "", stone: row.stone, shape: row.shape, size: row.size, color: row.color, clarity: row.clarity, cutting: row.cutting, quality: row.quality,
    cerType: row.cer_type, cerNo: merged ? "" : row.cer_no,
    location: row.location,
    itemNote: row.item_note,
    ref: { type: "MEMO_RECEIVE", id: row.memo_receive_id, docNo: row.received_doc_no, docDate: row.ref_date },
    refCount: Number(row.ref_count),
    pendingPcs: Number(row.p),
    pendingWeightCt: new Prisma.Decimal(row.w).toFixed(3),
    priceUnit: row.price_unit as "PER_CT" | "PER_PCS",
    // Quantity-weighted average of the lot's open items (owner 2026-11-21 Q1); each Stock ID keeps its own price.
    unitPrice: new Prisma.Decimal(row.avg_unit).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2),
    netUnitPrice: new Prisma.Decimal(row.avg_net).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP).toFixed(4),
    amount: new Prisma.Decimal(row.amount).toFixed(2),
    currency: row.currency_code,
    vendor: { id: row.vendor_id, code: row.vendor_code_snapshot, name: row.vendor_name_snapshot },
  };
}

async function memoLots(query: MemoLotQuery) {
  const rows = await prisma.$queryRaw<MemoLotRow[]>(memoLotSql({ ...query, limit: query.limit + 1 }));
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return { rows: page, nextCursor: rows.length > query.limit && last ? encodeLotCursor(last.d, last.lot_key) : null };
}

/** fromStock.lots cursor: `o:<lot cursor>` our stock continues, `m:` Memo Stock from the start, `m:<lot cursor>` more Memo Stock. */
export type LotSectionCursor = { section: "own"; cursor: string | undefined } | { section: "memo"; after: { date: string; lotKey: string } | undefined };
export function decodeLotSectionCursor(value: string | null | undefined): LotSectionCursor {
  if (!value) return { section: "own", cursor: undefined };
  if (value.startsWith("o:")) {
    decodeLotCursor(value.slice(2));
    return { section: "own", cursor: value.slice(2) };
  }
  const rest = value.startsWith("m:") ? value.slice(2) : value;
  return { section: "memo", after: rest ? decodeLotCursor(rest) : undefined };
}

/** One own-first lot page: more own groups than `limit` → own only; else own then Memo Stock fills the rest. */
export function ownFirstLotPage(own: LotGroupRow[] | null, memo: { items: LotGroupRow[]; nextCursor: string | null } | null, limit: number) {
  const ownRows = own ?? [];
  if (ownRows.length > limit) {
    const items = ownRows.slice(0, limit);
    const last = items.at(-1)!;
    return { items, nextCursor: `o:${encodeLotCursor(last.ref.docDate, last.lotKey)}` };
  }
  const room = limit - ownRows.length;
  const items = [...ownRows, ...(memo?.items ?? []).slice(0, room)];
  if (room === 0) return { items, nextCursor: (memo?.items.length ?? 0) > 0 ? "m:" : null };
  return { items, nextCursor: memo?.nextCursor ? `m:${memo.nextCursor}` : null };
}

/** Purchase lot cursor: `s:<lot cursor>` (SOLD group) / `i:<lot cursor>` (IN_STOCK group). */
function decodePurchaseCursor(value: string | null | undefined): { group: 0 | 1; after?: { date: string; lotKey: string } } | null {
  if (!value) return null;
  const group = value.startsWith("s:") ? 0 : value.startsWith("i:") ? 1 : -1;
  if (group < 0) return { group: 0, after: decodeLotCursor(value) }; // throws VALIDATION_ERROR cursor invalid
  return { group: group as 0 | 1, after: value.length > 2 ? decodeLotCursor(value.slice(2)) : undefined };
}

@Injectable()
export class LotStockService {
  private readonly logger = new Logger("LotStock");

  /** memoStock.lots (Memo Return Add Memo Stock): the vendor's lots in the document currency, bucket = pending. */
  async memoStockLots(input: MemoStockLotsInput) {
    try {
      const page = await memoLots({ bucket: "pending", vendorId: input.vendorId, currency: input.currency, q: input.q, from: input.from, to: input.to, after: input.cursor ? decodeLotCursor(input.cursor) : undefined, limit: input.limit });
      return { items: page.rows.map(memoLotRow), nextCursor: page.nextCursor };
    } catch (error) {
      throw memoReceiveErrors.map(error, "memo_stock.lots");
    }
  }

  /**
   * fromStock.lots (Quotation, Reserve, Memo Out, Sale): our stock lots FIRST (one inventory call), then Memo Stock lots
   * of every vendor. Inventory down or slow → Memo Stock lots only with `ownStock: "UNAVAILABLE"`. `location` "Memo" →
   * Memo Stock only (inventory not called); another name → our stock only.
   */
  async fromStockLots(input: FromStockLotsInput, requestId?: string) {
    const location = input.location?.toLowerCase();
    const memoOnly = location === "memo";
    const ownOnly = location !== undefined && !memoOnly;
    const at = decodeLotSectionCursor(input.cursor);
    const readMemo = async (after: { date: string; lotKey: string } | undefined, limit: number) => {
      const page = await memoLots({ bucket: "pending", q: input.q, from: input.from, to: input.to, after, limit });
      return { items: page.rows.map(memoLotRow), nextCursor: page.nextCursor };
    };
    try {
      if (memoOnly || at.section === "memo") {
        if (ownOnly) return { items: [], nextCursor: null, ownStock: "OK" as const };
        const memo = await readMemo(at.section === "memo" ? at.after : undefined, input.limit);
        return { items: memo.items, nextCursor: memo.nextCursor ? `m:${memo.nextCursor}` : null, ownStock: "OK" as const };
      }
      const own = await inventoryClient()
        .lotsAvailable({ q: input.q || undefined, from: input.from, to: input.to, location: ownOnly ? input.location : undefined, cursor: at.cursor, limit: input.limit + 1 }, { requestId })
        .catch((error: unknown) => {
          this.logger.warn({ event: "master.from_stock_lots_inventory_unavailable", reason: error instanceof Error ? error.message.slice(0, 40) : "unknown" });
          return null;
        });
      const status = own === null ? ("UNAVAILABLE" as const) : ("OK" as const);
      if (ownOnly) return { ...ownFirstLotPage(own, { items: [], nextCursor: null }, input.limit), ownStock: status };
      const ownCount = own?.length ?? 0;
      const memo = ownCount > input.limit ? null : await readMemo(undefined, Math.max(1, input.limit - ownCount));
      return { ...ownFirstLotPage(own, memo, input.limit), ownStock: status };
    } catch (error) {
      throw memoReceiveErrors.map(error, "from_stock.lots");
    }
  }

  /**
   * purchase.memoStockLots (Purchase Add Memo Stock, ADR-0043 per lot): the vendor's lots in the document currency in two
   * groups, SOLD (sold − purchased > 0) first, then IN_STOCK (pending > 0). Each row carries the lot's sold-open
   * quantity so the Merge question pairs the two rows of one lot. One page statement per group read (≤ 2) + one count.
   */
  async purchaseMemoStockLots(input: PurchaseMemoStockLotsInput) {
    const at = decodePurchaseCursor(input.cursor);
    const groups: ("SOLD" | "IN_STOCK")[] = input.group === "ALL" ? ["SOLD", "IN_STOCK"] : [input.group];
    const base = { vendorId: input.vendorId, currency: input.currency, q: input.q, from: input.from, to: input.to };
    try {
      const items: (LotGroupRow & { memoGroup: "SOLD" | "IN_STOCK"; soldOpenPcs: number; soldOpenWeightCt: string })[] = [];
      let nextCursor: string | null = null;
      for (const group of groups) {
        const order = group === "SOLD" ? 0 : 1;
        if (at && at.group > order) continue;
        const room = input.limit - items.length;
        if (room <= 0) {
          nextCursor = `${group === "SOLD" ? "s" : "i"}:`;
          break;
        }
        const page = await memoLots({ ...base, bucket: group === "SOLD" ? "soldOpen" : "pending", after: at && at.group === order ? at.after : undefined, limit: room });
        items.push(...page.rows.map((row) => ({ ...memoLotRow(row), memoGroup: group, soldOpenPcs: Number(row.sold_p), soldOpenWeightCt: new Prisma.Decimal(row.sold_w).toFixed(3) })));
        if (page.nextCursor) {
          nextCursor = `${group === "SOLD" ? "s" : "i"}:${page.nextCursor}`;
          break;
        }
      }
      const [counts] = await prisma.$queryRaw<{ sold: number; in_stock: number }[]>(Prisma.sql`
        SELECT count(DISTINCT s.lot_key) FILTER (WHERE ${BUCKETS.soldOpen.open})::int AS sold, count(DISTINCT s.lot_key) FILTER (WHERE ${BUCKETS.pending.open})::int AS in_stock
        FROM "partner"."memo_stock" s
        WHERE s.vendor_id = ${input.vendorId}::uuid AND s.currency_code = ${input.currency}::char(3) AND (${BUCKETS.soldOpen.open} OR ${BUCKETS.pending.open})`);
      const sold = Number(counts?.sold ?? 0);
      const inStock = Number(counts?.in_stock ?? 0);
      return { items, nextCursor, counts: { all: sold + inStock, sold, inStock } };
    } catch (error) {
      throw purchaseErrors.map(error, "memo_stock_lots");
    }
  }
}
