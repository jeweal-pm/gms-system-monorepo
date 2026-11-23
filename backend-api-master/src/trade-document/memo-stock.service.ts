import type { FieldError } from "../common/errors";
import { type Tx } from "../common/persistence";
import { prisma } from "../database/prisma-client";
import { Prisma } from "../generated/prisma/client";

const Decimal = Prisma.Decimal;
type Dec = Prisma.Decimal;

/** One approved line taking quantity off a Memo Stock item; `index` is its line position for error paths. */
export type MemoStockTake = { memoStockId: string; pcs: number; weightCt: Dec; index: number };

/** One Memo Stock item's total over the lines that name it, with those lines' positions for error paths. */
type ItemTotal = { memoStockId: string; pcs: number; weightCt: Dec; indexes: number[] };

/**
 * Sums lines per Memo Stock item (INV-20261031-001): one memo out return can bring back lines of two memo outs that
 * took the same item, and an `UPDATE … FROM (VALUES …)` applies only one joined row per target row. Checking and
 * updating per item keeps every line's quantity.
 */
export function totalPerItem(lines: MemoStockTake[]): ItemTotal[] {
  const totals = new Map<string, ItemTotal>();
  for (const line of lines) {
    const total = totals.get(line.memoStockId);
    if (total) {
      total.pcs += line.pcs;
      total.weightCt = total.weightCt.plus(line.weightCt);
      total.indexes.push(line.index);
    } else {
      totals.set(line.memoStockId, { memoStockId: line.memoStockId, pcs: line.pcs, weightCt: line.weightCt, indexes: [line.index] });
    }
  }
  return [...totals.values()];
}

/** Error paths of every line of an item that falls short. */
const shortPaths = (total: ItemTotal, field: "pcs" | "weightCt", code: string): FieldError[] => total.indexes.map((index) => ({ path: `lines.${index}.${field}`, code }));

const valuesOf = (totals: ItemTotal[]) => totals.map((total) => Prisma.sql`(${total.memoStockId}::uuid, ${total.pcs}::int, ${total.weightCt.toFixed(3)}::numeric)`);

/** Memo Stock buckets a document approval fills (memo-outstanding-vendor SA-MOV-02, Q-MOV-04). Fixed SQL, never input. */
const BUCKET_SQL = {
  returned: Prisma.sql`returned_pcs = s.returned_pcs + r.pcs, returned_weight_ct = s.returned_weight_ct + r.weight`,
  reserved: Prisma.sql`reserved_pcs = s.reserved_pcs + r.pcs, reserved_weight_ct = s.reserved_weight_ct + r.weight`,
} as const;

/**
 * Inside an approval transaction: locks the items in id order (`FOR NO KEY UPDATE`, so concurrent approvals of the same
 * item queue up instead of deadlocking, while the FK `KEY SHARE` checks of concurrent line inserts no longer conflict:
 * only non-key columns change, INV-20261031-002), re-checks each line against the item's current pending (owner Q-MR-15 over-pull
 * guard) and moves the quantity from pending into `bucket` in one UPDATE (CHECK memo_stock_balance holds). A line asking
 * more than pending → `short(fields)` is thrown and the caller's transaction rolls back. Memo Return → returned
 * (memo-return SA rev 2); Memo Out → reserved (memo-out SA-MO-14). Lines are summed per item first (`totalPerItem`).
 */
export async function takeFromMemoStock(tx: Tx, takes: MemoStockTake[], bucket: keyof typeof BUCKET_SQL, short: (fields: FieldError[]) => Error, now: Date): Promise<void> {
  if (takes.length === 0) return;
  const totals = totalPerItem(takes);
  const ids = totals.map((total) => total.memoStockId);
  const locked = await tx.$queryRaw<{ id: string; pending_pcs: number; pending_weight_ct: Dec | string }[]>(Prisma.sql`
    SELECT id::text AS id, pending_pcs, pending_weight_ct FROM "partner"."memo_stock"
    WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR NO KEY UPDATE`);
  const pending = new Map(locked.map((row) => [row.id, row]));
  const shortFields: FieldError[] = [];
  for (const total of totals) {
    const item = pending.get(total.memoStockId);
    if (!item || total.pcs > item.pending_pcs) shortFields.push(...shortPaths(total, "pcs", "exceeds_pending"));
    if (!item || total.weightCt.gt(new Decimal(item.pending_weight_ct.toString()))) shortFields.push(...shortPaths(total, "weightCt", "exceeds_pending"));
  }
  if (shortFields.length > 0) throw short(shortFields);
  await tx.$executeRaw(Prisma.sql`
    UPDATE "partner"."memo_stock" AS s
    SET pending_pcs = s.pending_pcs - r.pcs, pending_weight_ct = s.pending_weight_ct - r.weight, ${BUCKET_SQL[bucket]},
        version = s.version + 1, updated_at = ${now}
    FROM (VALUES ${Prisma.join(valuesOf(totals))}) AS r(id, pcs, weight)
    WHERE s.id = r.id`);
}

/** Reverse moves of a bucket back to pending (fixed SQL per bucket, never input). */
const RELEASE_SQL = {
  returned: {
    read: Prisma.sql`returned_pcs AS bucket_pcs, returned_weight_ct AS bucket_weight_ct`,
    set: Prisma.sql`returned_pcs = s.returned_pcs - r.pcs, returned_weight_ct = s.returned_weight_ct - r.weight`,
    code: "exceeds_returned",
  },
  reserved: {
    read: Prisma.sql`reserved_pcs AS bucket_pcs, reserved_weight_ct AS bucket_weight_ct`,
    set: Prisma.sql`reserved_pcs = s.reserved_pcs - r.pcs, reserved_weight_ct = s.reserved_weight_ct - r.weight`,
    code: "exceeds_reserved",
  },
} as const;

/**
 * Moves quantity from `bucket` back to pending (`bucket -= q, pending += q`) under the same id-ordered `FOR NO KEY UPDATE` lock
 * as `takeFromMemoStock`. Used by a Memo Out Return approval (Reserve → pending, memo-out-return SA-MOR-17) and by the
 * reversal of an auto-approved Memo Out / Reserve (reserved) or Memo Return (returned) edit or delete (approval-setup
 * ADR-0050 D4). An item with less in the bucket than the lines bring back → `short` (nothing changes);
 * `memo_stock_balance` holds either way. Lines naming the same item are summed first (`totalPerItem`, INV-20261031-001).
 */
export async function releaseToMemoStock(tx: Tx, puts: MemoStockTake[], short: (fields: FieldError[]) => Error, now: Date, bucket: keyof typeof RELEASE_SQL = "reserved"): Promise<void> {
  if (puts.length === 0) return;
  const sql = RELEASE_SQL[bucket];
  const totals = totalPerItem(puts);
  const ids = totals.map((total) => total.memoStockId);
  const locked = await tx.$queryRaw<{ id: string; bucket_pcs: number; bucket_weight_ct: Dec | string }[]>(Prisma.sql`
    SELECT id::text AS id, ${sql.read} FROM "partner"."memo_stock"
    WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR NO KEY UPDATE`);
  const held = new Map(locked.map((row) => [row.id, row]));
  const shortFields: FieldError[] = [];
  for (const total of totals) {
    const item = held.get(total.memoStockId);
    if (!item || total.pcs > item.bucket_pcs) shortFields.push(...shortPaths(total, "pcs", sql.code));
    if (!item || total.weightCt.gt(new Decimal(item.bucket_weight_ct.toString()))) shortFields.push(...shortPaths(total, "weightCt", sql.code));
  }
  if (shortFields.length > 0) throw short(shortFields);
  await tx.$executeRaw(Prisma.sql`
    UPDATE "partner"."memo_stock" AS s
    SET ${sql.set},
        pending_pcs = s.pending_pcs + r.pcs, pending_weight_ct = s.pending_weight_ct + r.weight,
        version = s.version + 1, updated_at = ${now}
    FROM (VALUES ${Prisma.join(valuesOf(totals))}) AS r(id, pcs, weight)
    WHERE s.id = r.id`);
}

/**
 * The newest live document line (Memo Return, Reserve, Memo Out, Purchase, Quotation; any status) that names one of
 * `memoStockIds`, excluding `excludeDocIds` (the documents being reversed / their own sources): who took the stock
 * again, for `<CODE>_IN_USE {usedBy}`. One bounded statement over the line FK indexes.
 */
export async function latestStockUser(client: Tx | typeof prisma, memoStockIds: readonly string[], excludeDocIds: readonly string[] = []): Promise<string | null> {
  if (memoStockIds.length === 0) return null;
  const exclude = excludeDocIds.length === 0 ? [ZERO_UUID] : [...excludeDocIds];
  const [row] = await client.$queryRaw<{ doc_no: string }[]>(Prisma.sql`
    SELECT doc_no FROM (
      SELECT h.doc_no, h.created_at FROM "partner"."memo_return_line" l JOIN "partner"."memo_return" h ON h.id = l.memo_return_id
        WHERE l.memo_stock_id = ANY(${memoStockIds}::uuid[]) AND h.deleted_at IS NULL AND h.id <> ALL(${exclude}::uuid[])
      UNION ALL
      SELECT h.doc_no, h.created_at FROM "partner"."reserve_line" l JOIN "partner"."reserve" h ON h.id = l.reserve_id
        WHERE l.memo_stock_id = ANY(${memoStockIds}::uuid[]) AND h.deleted_at IS NULL AND h.id <> ALL(${exclude}::uuid[])
      UNION ALL
      SELECT h.doc_no, h.created_at FROM "partner"."memo_out_line" l JOIN "partner"."memo_out" h ON h.id = l.memo_out_id
        WHERE l.memo_stock_id = ANY(${memoStockIds}::uuid[]) AND h.deleted_at IS NULL AND h.id <> ALL(${exclude}::uuid[])
      UNION ALL
      SELECT h.doc_no, h.created_at FROM "partner"."purchase_line" l JOIN "partner"."purchase" h ON h.id = l.purchase_id
        WHERE l.memo_stock_id = ANY(${memoStockIds}::uuid[]) AND h.deleted_at IS NULL AND h.id <> ALL(${exclude}::uuid[])
      -- lot-based-stock (ADR-0055): lot lines reach their items through the allocation tables.
      UNION ALL
      SELECT h.doc_no, h.created_at FROM "partner"."reserve_line_alloc" a JOIN "partner"."reserve_line" l ON l.id = a.line_id JOIN "partner"."reserve" h ON h.id = l.reserve_id
        WHERE a.memo_stock_id = ANY(${memoStockIds}::uuid[]) AND l.lot_key IS NOT NULL AND h.deleted_at IS NULL AND h.id <> ALL(${exclude}::uuid[])
      UNION ALL
      SELECT h.doc_no, h.created_at FROM "partner"."memo_out_line_alloc" a JOIN "partner"."memo_out_line" l ON l.id = a.line_id JOIN "partner"."memo_out" h ON h.id = l.memo_out_id
        WHERE a.memo_stock_id = ANY(${memoStockIds}::uuid[]) AND l.lot_key IS NOT NULL AND h.deleted_at IS NULL AND h.id <> ALL(${exclude}::uuid[])
      UNION ALL
      SELECT h.doc_no, h.created_at FROM "partner"."memo_return_line_alloc" a JOIN "partner"."memo_return_line" l ON l.id = a.line_id JOIN "partner"."memo_return" h ON h.id = l.memo_return_id
        WHERE a.memo_stock_id = ANY(${memoStockIds}::uuid[]) AND l.lot_key IS NOT NULL AND h.deleted_at IS NULL AND h.id <> ALL(${exclude}::uuid[])
      UNION ALL
      SELECT h.doc_no, h.created_at FROM "partner"."purchase_line_alloc" a JOIN "partner"."purchase_line" l ON l.id = a.line_id JOIN "partner"."purchase" h ON h.id = l.purchase_id
        WHERE a.memo_stock_id = ANY(${memoStockIds}::uuid[]) AND l.lot_key IS NOT NULL AND h.deleted_at IS NULL AND h.id <> ALL(${exclude}::uuid[])
    ) u
    ORDER BY created_at DESC
    LIMIT 1`);
  return row?.doc_no ?? null;
}

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

const dec = (value: Dec | string) => new Decimal(value.toString());

/**
 * Dialog amount (SA-MR-11): line amount × pending basis ÷ received basis (weight for PER_CT, pcs for PER_PCS),
 * half-up 2 dp, so a fully pending item shows exactly its line amount.
 */
export function pendingAmount(row: { price_unit: string; received_pcs: number; received_weight_ct: Dec | string; pending_pcs: number; pending_weight_ct: Dec | string; line_amount: Dec | string }): Dec {
  const perCt = row.price_unit === "PER_CT";
  const received = perCt ? dec(row.received_weight_ct) : new Decimal(row.received_pcs);
  const pending = perCt ? dec(row.pending_weight_ct) : new Decimal(row.pending_pcs);
  const amount = dec(row.line_amount);
  if (received.isZero() || pending.equals(received)) return amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return amount.times(pending).dividedBy(received).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}
