import { HttpStatus } from "@nestjs/common";
import { uuidV7 } from "@gms/storage";
import { partnerException, type FieldError } from "../common/errors";
import type { Tx } from "../common/persistence";
import { fromDbDate } from "../document-setup/document-setup.service";
import { Prisma } from "../generated/prisma/client";
import { allocateFifo, releaseNewestFirst, type AllocRow, type Allocation, type Candidate, type Qty } from "./lot-allocation";
import { isMemoLot, LOT_GROUP_MAX, LOT_TX_MAX, stockLotTooLarge } from "./lot-key";
import { releaseToMemoStock, takeFromMemoStock, type MemoStockTake } from "./memo-stock.service";

/**
 * lot-based-stock SA rev 1 / ADR-0055 D5/D6 (BE-LOT-002): applying Memo Stock lot lines inside the owner's transaction.
 * - `lockLotCandidates`: ONE id-ordered `FOR NO KEY UPDATE` over the open rows of the touched groups plus the legacy
 *   items (the lock every Memo Stock writer takes, so concurrent approvals of one lot queue instead of deadlocking).
 *   > 500 rows in a group or > 2,000 in all → 422 STOCK_LOT_TOO_LARGE, nothing changed.
 * - `applyMemoStockLines`: legacy lines take their item; lot lines are allocated FIFO over what is left; any short line
 *   raises the document's `<DOC>_PENDING_SHORT` with every short line (`details.lines[] {index, lotKey, availablePcs,
 *   availableWeightCt}`); then the existing per-item bucket SQL runs (`takeFromMemoStock`) and the allocation is stored.
 * - `reverseMemoStockLines`: the exact inverse from the stored allocation (newest seq first, unsettled only).
 * Allocation tables come from a fixed map (never input). Statements per apply: 1 line read (caller) + 1 lock + 1 bucket
 * re-check lock + 1 bucket UPDATE + 1 DELETE + 1 INSERT, independent of the line count.
 */
const Decimal = Prisma.Decimal;
type Dec = Prisma.Decimal;

export const ALLOC_TABLES = {
  reserve: { table: Prisma.raw(`"partner"."reserve_line_alloc"`), line: Prisma.raw(`"partner"."reserve_line"`) },
  memoOut: { table: Prisma.raw(`"partner"."memo_out_line_alloc"`), line: Prisma.raw(`"partner"."memo_out_line"`) },
  memoReturn: { table: Prisma.raw(`"partner"."memo_return_line_alloc"`), line: Prisma.raw(`"partner"."memo_return_line"`) },
} as const;
export type AllocTable = keyof typeof ALLOC_TABLES;

/** Open-bucket filter of the lock (fixed SQL, never input). */
const OPEN_SQL = {
  pending: Prisma.sql`(pending_pcs > 0 OR pending_weight_ct > 0)`,
  purchase: Prisma.sql`(pending_pcs > 0 OR pending_weight_ct > 0 OR sold_pcs > purchased_pcs OR sold_weight_ct > purchased_weight_ct)`,
  soldOpen: Prisma.sql`(sold_pcs > purchased_pcs OR sold_weight_ct > purchased_weight_ct)`,
} as const;

export type LockedStock = {
  id: string; stockId: string; lotKey: string; refDate: string; vendorId: string; currency: string;
  pendingPcs: number; pendingWeight: Dec; reservedPcs: number; reservedWeight: Dec; soldPcs: number; soldWeight: Dec; purchasedPcs: number; purchasedWeight: Dec;
};
type LockedRow = {
  id: string; stock_id: string; lot_key: string; received_doc_date: Date; vendor_id: string; currency_code: string;
  pending_pcs: number; pending_weight_ct: string; reserved_pcs: number; reserved_weight_ct: string; sold_pcs: number; sold_weight_ct: string; purchased_pcs: number; purchased_weight_ct: string;
};

/** One id-ordered lock over the open rows of `lotKeys` plus `ids` (legacy items, any bucket). */
export async function lockLotCandidates(tx: Tx, lotKeys: readonly string[], ids: readonly string[], open: keyof typeof OPEN_SQL = "pending"): Promise<LockedStock[]> {
  const keys = [...new Set(lotKeys)].filter(isMemoLot);
  const items = [...new Set(ids)];
  if (keys.length === 0 && items.length === 0) return [];
  const rows = await tx.$queryRaw<LockedRow[]>(Prisma.sql`
    SELECT id::text AS id, stock_id, lot_key, received_doc_date, vendor_id::text AS vendor_id, currency_code,
      pending_pcs, pending_weight_ct::text AS pending_weight_ct, reserved_pcs, reserved_weight_ct::text AS reserved_weight_ct,
      sold_pcs, sold_weight_ct::text AS sold_weight_ct, purchased_pcs, purchased_weight_ct::text AS purchased_weight_ct
    FROM "partner"."memo_stock"
    WHERE (lot_key = ANY(${keys}::varchar[]) AND ${OPEN_SQL[open]}) OR id = ANY(${items}::uuid[])
    ORDER BY id FOR NO KEY UPDATE
    LIMIT ${LOT_TX_MAX + 1}`);
  if (rows.length > LOT_TX_MAX) throw stockLotTooLarge(null, LOT_TX_MAX);
  const perKey = new Map<string, number>();
  for (const row of rows) {
    const count = (perKey.get(row.lot_key) ?? 0) + 1;
    perKey.set(row.lot_key, count);
    if (count > LOT_GROUP_MAX && keys.includes(row.lot_key)) throw stockLotTooLarge(row.lot_key, LOT_GROUP_MAX);
  }
  return rows.map((row) => ({
    id: row.id, stockId: row.stock_id, lotKey: row.lot_key, refDate: fromDbDate(row.received_doc_date), vendorId: row.vendor_id, currency: row.currency_code,
    pendingPcs: row.pending_pcs, pendingWeight: new Decimal(row.pending_weight_ct), reservedPcs: row.reserved_pcs, reservedWeight: new Decimal(row.reserved_weight_ct),
    soldPcs: row.sold_pcs, soldWeight: new Decimal(row.sold_weight_ct), purchasedPcs: row.purchased_pcs, purchasedWeight: new Decimal(row.purchased_weight_ct),
  }));
}

/** A stored document line as the apply reads it (position order; `index` = its error path position). */
export type ApplyLine = { lineId: string; index: number; memoStockId: string | null; lotKey: string | null; pcs: number; weight: Dec };
/** A short line of an apply (`details.lines[]`). */
export type ShortLine = { index: number; lotKey: string | null; availablePcs: number; availableWeightCt: string };
export type AllocationRow = { lineId: string; seq: number; memoStockId: string | null; ownStockId: string | null; stockId: string; pcs: number; weight: Dec; settledPcs?: number; settledWeight?: Dec };

/** `<DOC>_PENDING_SHORT` (409): field paths per dimension plus `details.lines[]` per short line (error-handling). */
export function pendingShortError(code: string, short: readonly ShortLine[], fields: readonly FieldError[] = []) {
  const paths: FieldError[] = fields.length > 0 ? [...fields] : short.flatMap((line) => {
    const params = { availablePcs: line.availablePcs, availableWeightCt: line.availableWeightCt };
    return [{ path: `lines.${line.index}.pcs`, code: "exceeds_pending", params }, { path: `lines.${line.index}.weightCt`, code: "exceeds_pending", params }];
  });
  return partnerException(code, HttpStatus.CONFLICT, paths, { lines: short.map((line) => ({ ...line })) });
}

/**
 * Plans the Memo Stock take of `lines` against locked rows (`available` = the bucket they take from): legacy lines first
 * (their item), then lot lines FIFO over what remains. Pure; returns the allocation rows or the short lines.
 */
export function planMemoStockTakes(lines: readonly ApplyLine[], locked: readonly LockedStock[], availableOf: (row: LockedStock) => Qty):
  { ok: true; rows: AllocationRow[] } | { ok: false; short: ShortLine[] } {
  const left = new Map(locked.map((row) => [row.id, availableOf(row)]));
  const rows: AllocationRow[] = [];
  const short: ShortLine[] = [];
  const byId = new Map(locked.map((row) => [row.id, row]));
  for (const line of lines) {
    if (!line.memoStockId) continue;
    const item = byId.get(line.memoStockId);
    const free = left.get(line.memoStockId);
    if (!item || !free || line.pcs > free.pcs || line.weight.gt(free.weight)) {
      short.push({ index: line.index, lotKey: null, availablePcs: free?.pcs ?? 0, availableWeightCt: (free?.weight ?? new Decimal(0)).toFixed(3) });
      continue;
    }
    left.set(item.id, { pcs: free.pcs - line.pcs, weight: free.weight.minus(line.weight) });
    rows.push({ lineId: line.lineId, seq: 1, memoStockId: item.id, ownStockId: null, stockId: item.stockId, pcs: line.pcs, weight: line.weight });
  }
  for (const line of lines) {
    if (line.memoStockId || !line.lotKey) continue;
    const candidates: Candidate[] = locked.filter((row) => row.lotKey === line.lotKey).map((row) => {
      const free = left.get(row.id)!;
      return { id: row.id, stockId: row.stockId, refDate: row.refDate, pcs: free.pcs, weight: free.weight };
    });
    const result = allocateFifo(candidates, { pcs: line.pcs, weight: line.weight });
    if (!result.ok) {
      short.push({ index: line.index, lotKey: line.lotKey, availablePcs: result.available.pcs, availableWeightCt: result.available.weight.toFixed(3) });
      continue;
    }
    result.rows.forEach((row: Allocation, seq) => {
      const free = left.get(row.id)!;
      left.set(row.id, { pcs: free.pcs - row.pcs, weight: free.weight.minus(row.weight) });
      rows.push({ lineId: line.lineId, seq: seq + 1, memoStockId: row.id, ownStockId: null, stockId: row.stockId, pcs: row.pcs, weight: row.weight });
    });
  }
  return short.length > 0 ? { ok: false, short: short.sort((a, b) => a.index - b.index) } : { ok: true, rows };
}

/** Per-item takes of allocation rows (the existing bucket SQL sums them per item, INV-20261031-001). */
export function takesOf(rows: readonly AllocationRow[], indexOf: ReadonlyMap<string, number>): MemoStockTake[] {
  return rows.flatMap((row) => (row.memoStockId ? [{ memoStockId: row.memoStockId, pcs: row.pcs, weightCt: row.weight, index: indexOf.get(row.lineId) ?? 0 }] : []));
}

/** Replaces the allocation of `lineIds` in `table` (one DELETE + one bulk INSERT). */
export async function writeAllocations(tx: Tx, table: AllocTable, lineIds: readonly string[], rows: readonly AllocationRow[]): Promise<void> {
  const target = ALLOC_TABLES[table].table;
  if (lineIds.length > 0) await tx.$executeRaw(Prisma.sql`DELETE FROM ${target} WHERE line_id = ANY(${[...lineIds]}::uuid[])`);
  if (rows.length === 0) return;
  const values = rows.map((row) => Prisma.sql`(${uuidV7()}::uuid, ${row.lineId}::uuid, ${row.seq}::smallint, ${row.memoStockId}::uuid, ${row.ownStockId}::uuid, ${row.stockId},
    ${row.pcs}::int, ${row.weight.toFixed(3)}::numeric, ${row.settledPcs ?? 0}::int, ${(row.settledWeight ?? new Decimal(0)).toFixed(3)}::numeric)`);
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO ${target} (id, line_id, seq, memo_stock_id, own_stock_id, stock_id, pcs, weight_ct, settled_pcs, settled_weight_ct)
    VALUES ${Prisma.join(values)}`);
}

type StoredAllocRow = { id: string; line_id: string; seq: number; memo_stock_id: string | null; own_stock_id: string | null; stock_id: string; pcs: number; weight_ct: string; settled_pcs: number; settled_weight_ct: string };
export type StoredAlloc = AllocRow & { lineId: string; memoStockId: string | null; ownStockId: string | null; stockId: string };

/** The stored allocation of `lineIds` (one statement; `lock` = FOR UPDATE in id order, for downstream settlement). */
export async function readAllocations(tx: Tx, table: AllocTable, lineIds: readonly string[], lock = false): Promise<StoredAlloc[]> {
  if (lineIds.length === 0) return [];
  const rows = await tx.$queryRaw<StoredAllocRow[]>(Prisma.sql`
    SELECT id::text AS id, line_id::text AS line_id, seq, memo_stock_id::text AS memo_stock_id, own_stock_id::text AS own_stock_id, stock_id,
      pcs, weight_ct::text AS weight_ct, settled_pcs, settled_weight_ct::text AS settled_weight_ct
    FROM ${ALLOC_TABLES[table].table} WHERE line_id = ANY(${[...lineIds]}::uuid[])
    ORDER BY id ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}`);
  return rows.map((row) => ({
    id: row.id, lineId: row.line_id, seq: row.seq, memoStockId: row.memo_stock_id, ownStockId: row.own_stock_id, stockId: row.stock_id,
    pcs: row.pcs, weight: new Decimal(row.weight_ct), settledPcs: row.settled_pcs, settledWeight: new Decimal(row.settled_weight_ct),
  }));
}

type LineRow = { id: string; memo_stock_id: string | null; lot_key: string | null; pcs: number; weight_ct: string };

/** The Memo Stock lines (legacy item or `M…` lot) of a document in position order, from a fixed line table. */
export async function memoStockLinesOf(tx: Tx, table: AllocTable, parentColumn: "reserve_id" | "memo_out_id" | "memo_return_id", documentId: string): Promise<ApplyLine[]> {
  const rows = await tx.$queryRaw<(LineRow & { position: number })[]>(Prisma.sql`
    SELECT id::text AS id, memo_stock_id::text AS memo_stock_id, lot_key, pcs, weight_ct::text AS weight_ct, position
    FROM ${ALLOC_TABLES[table].line} WHERE ${Prisma.raw(`"${parentColumn}"`)} = ${documentId}::uuid ORDER BY position`);
  return rows.flatMap((row, index) => (row.memo_stock_id || (row.lot_key && row.lot_key.startsWith("M"))
    ? [{ lineId: row.id, index, memoStockId: row.memo_stock_id, lotKey: row.memo_stock_id ? null : row.lot_key, pcs: row.pcs, weight: new Decimal(row.weight_ct) }]
    : []));
}

/**
 * Apply of a Memo Out / Reserve (pending → reserved) or Memo Return (pending → returned): lock, plan, short → the
 * document's short error (nothing changed), bucket move per item, allocation stored. Returns the stock line count.
 */
export async function applyMemoStockLines(tx: Tx, input: { table: AllocTable; lines: readonly ApplyLine[]; bucket: "reserved" | "returned"; shortCode: string; now: Date }): Promise<number> {
  const { lines } = input;
  if (lines.length === 0) return 0;
  const locked = await lockLotCandidates(tx, lines.flatMap((line) => (line.lotKey ? [line.lotKey] : [])), lines.flatMap((line) => (line.memoStockId ? [line.memoStockId] : [])));
  const plan = planMemoStockTakes(lines, locked, (row) => ({ pcs: row.pendingPcs, weight: row.pendingWeight }));
  if (!plan.ok) throw pendingShortError(input.shortCode, plan.short);
  const indexOf = new Map(lines.map((line) => [line.lineId, line.index]));
  await takeFromMemoStock(tx, takesOf(plan.rows, indexOf), input.bucket, (fields) => pendingShortError(input.shortCode, [], fields), input.now);
  await writeAllocations(tx, input.table, lines.map((line) => line.lineId), plan.rows);
  return lines.length;
}

/**
 * Exact inverse of `applyMemoStockLines` (auto-approved edit / delete, ADR-0050): every unsettled allocated quantity of
 * the lines goes back to pending (newest seq first, so a partial release would give back the newest first); a line
 * applied before its allocation existed (none stored) gives back its own quantity. `inUse` when a bucket no longer holds it.
 */
export async function reverseMemoStockLines(tx: Tx, input: { table: AllocTable; lines: readonly ApplyLine[]; bucket: "reserved" | "returned"; inUse: () => Error; now: Date }): Promise<void> {
  const { lines } = input;
  if (lines.length === 0) return;
  const stored = await readAllocations(tx, input.table, lines.map((line) => line.lineId));
  const byLine = new Map<string, StoredAlloc[]>();
  for (const row of stored) byLine.set(row.lineId, [...(byLine.get(row.lineId) ?? []), row]);
  const puts: MemoStockTake[] = [];
  for (const line of lines) {
    const rows = (byLine.get(line.lineId) ?? []).filter((row) => row.memoStockId);
    if (rows.length === 0) {
      if (line.memoStockId) puts.push({ memoStockId: line.memoStockId, pcs: line.pcs, weightCt: line.weight, index: line.index });
      continue;
    }
    const open = { pcs: rows.reduce((sum, row) => sum + row.pcs - row.settledPcs, 0), weight: rows.reduce((sum, row) => sum.plus(row.weight.minus(row.settledWeight)), new Decimal(0)) };
    const parts = releaseNewestFirst(rows, open) ?? [];
    const memoOf = new Map(rows.map((row) => [row.id, row.memoStockId!]));
    for (const part of parts) puts.push({ memoStockId: memoOf.get(part.id)!, pcs: part.pcs, weightCt: part.weight, index: line.index });
  }
  await releaseToMemoStock(tx, puts, input.inUse, input.now, input.bucket);
  await tx.$executeRaw(Prisma.sql`DELETE FROM ${ALLOC_TABLES[input.table].table} WHERE line_id = ANY(${lines.map((line) => line.lineId)}::uuid[]) AND memo_stock_id IS NOT NULL`);
}
