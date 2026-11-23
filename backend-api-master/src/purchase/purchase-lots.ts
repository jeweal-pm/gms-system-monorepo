import { uuidV7 } from "@gms/storage";
import type { FieldError } from "../common/errors";
import type { Tx } from "../common/persistence";
import { fromDbDate } from "../document-setup/document-setup.service";
import { Prisma } from "../generated/prisma/client";
import { splitPurchaseLot, type PurchaseCandidate } from "../trade-document/lot-allocation";
import { isMemoLot, LOT_GROUP_MAX, stockLotTooLarge } from "../trade-document/lot-key";
import { lockLotCandidates, type LockedStock } from "../trade-document/lot-apply";
import type { PurchaseGiveBack, PurchaseTake } from "./purchase-stock";

/**
 * lot-based-stock SA rev 1 / ADR-0055 D5 + ADR-0043 per lot (BE-LOT-004): Purchase STOCK lines naming a Memo Stock lot.
 * - Save (`readPurchaseLots`, no lock): the lot's sold-open and pending totals, vendor / currency, snapshot.
 * - Approve (`expandLotTakes`): one id-ordered lock over the lots' rows (sold-open or pending), `splitPurchaseLot`
 *   (SOLD exact, MERGED sold part first, IN_STOCK pending, FIFO), then per-item SOLD / IN_STOCK takes for the existing
 *   `takeForPurchase` bucket SQL; the allocation is stored per part in `purchase_line_alloc`.
 * - Reverse (`allocGiveBacks`): the stored allocation as per-item SOLD / IN_STOCK give-backs (exact inverse).
 */
const Decimal = Prisma.Decimal;
type Dec = Prisma.Decimal;

export type PurchaseLot = {
  lotKey: string; stockCount: number; vendorId: string; currency: string;
  soldOpen: { pcs: number; weight: Dec }; pending: { pcs: number; weight: Dec };
  stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string; lot: string; location: string;
  cerType: string; cerNo: string; priceUnit: "PER_CT" | "PER_PCS";
};
type LotRow = {
  lot_key: string; n: number; sp: number; sw: string; pp: number; pw: string; vendor_id: string; currency_code: string; stone: string; shape: string; size: string;
  color: string; clarity: string; cutting: string; quality: string; lot: string; location: string; cer_type: string; cer_no: string; price_unit: string;
};

/** Save-time read of Purchase lots (one statement, no lock). */
export async function readPurchaseLots(tx: Pick<Tx, "$queryRaw">, lotKeys: readonly string[]): Promise<Map<string, PurchaseLot>> {
  const keys = [...new Set(lotKeys)].filter(isMemoLot);
  if (keys.length === 0) return new Map();
  const rows = await tx.$queryRaw<LotRow[]>(Prisma.sql`
    WITH g AS (
      SELECT lot_key, count(*)::int AS n,
        sum(GREATEST(sold_pcs - purchased_pcs, 0))::int AS sp, sum(GREATEST(sold_weight_ct - purchased_weight_ct, 0))::text AS sw,
        sum(pending_pcs)::int AS pp, sum(pending_weight_ct)::text AS pw
      FROM "partner"."memo_stock"
      WHERE lot_key = ANY(${keys}::varchar[]) AND (pending_pcs > 0 OR pending_weight_ct > 0 OR sold_pcs > purchased_pcs OR sold_weight_ct > purchased_weight_ct)
      GROUP BY lot_key
    )
    SELECT DISTINCT ON (s.lot_key) s.lot_key, g.n, g.sp, g.sw, g.pp, g.pw, s.vendor_id::text AS vendor_id, s.currency_code, s.stone, s.shape, s.size, s.color,
      s.clarity, s.cutting, s.quality, s.lot, s.location, s.cer_type, s.cer_no, s.price_unit
    FROM "partner"."memo_stock" s JOIN g ON g.lot_key = s.lot_key
    ORDER BY s.lot_key, s.received_doc_date DESC, s.stock_id DESC`);
  return new Map(rows.map((row) => [row.lot_key, {
    lotKey: row.lot_key, stockCount: row.n, vendorId: row.vendor_id, currency: row.currency_code,
    soldOpen: { pcs: row.sp, weight: new Decimal(row.sw) }, pending: { pcs: row.pp, weight: new Decimal(row.pw) },
    stone: row.stone, shape: row.shape, size: row.size, color: row.color, clarity: row.clarity, cutting: row.cutting, quality: row.quality, lot: row.lot,
    location: row.location, cerType: row.cer_type, cerNo: row.cer_no, priceUnit: row.price_unit as "PER_CT" | "PER_PCS",
  }]));
}

/** Save-time quantity rule of a lot line per group (ADR-0043 per lot); field errors at `lines.N.pcs|weightCt`. */
export function lotQuantityErrors(index: number, line: { pcs: number; weightCt: string }, lot: PurchaseLot, group: "SOLD" | "IN_STOCK" | "MERGED"): FieldError[] {
  const errors: FieldError[] = [];
  const weight = new Decimal(line.weightCt);
  const has = (qty: { pcs: number; weight: Dec }) => qty.pcs > 0 || qty.weight.gt(0);
  const push = (field: "pcs" | "weightCt", code: string, qty?: { pcs: number; weight: Dec }) =>
    errors.push({ path: `lines.${index}.${field}`, code, ...(qty ? { params: { availablePcs: qty.pcs, availableWeightCt: qty.weight.toFixed(3) } } : {}) });
  if (group === "MERGED" && !(has(lot.soldOpen) && has(lot.pending))) return [{ path: `lines.${index}.reference`, code: "not_mergeable" }];
  if (group === "SOLD") {
    if (line.pcs !== lot.soldOpen.pcs) push("pcs", "must_equal_sold", lot.soldOpen);
    if (!weight.equals(lot.soldOpen.weight)) push("weightCt", "must_equal_sold", lot.soldOpen);
    return errors;
  }
  const max = group === "IN_STOCK" ? lot.pending : { pcs: lot.soldOpen.pcs + lot.pending.pcs, weight: lot.soldOpen.weight.plus(lot.pending.weight) };
  if (group === "MERGED" && line.pcs < lot.soldOpen.pcs) push("pcs", "below_sold", lot.soldOpen);
  if (group === "MERGED" && weight.lt(lot.soldOpen.weight)) push("weightCt", "below_sold", lot.soldOpen);
  if (line.pcs > max.pcs) push("pcs", "exceeds_available", max);
  if (weight.gt(max.weight)) push("weightCt", "exceeds_available", max);
  return errors;
}

export type LotLine = { lineId: string; index: number; lotKey: string; memoGroup: "SOLD" | "IN_STOCK" | "MERGED"; pcs: number; weight: Dec };
export type LotAllocRow = { lineId: string; seq: number; memoStockId: string; stockId: string; part: "SOLD" | "IN_STOCK"; pcs: number; weight: Dec };

/**
 * Approve: locks the lots' open rows (one statement), splits each lot line FIFO and returns per-item takes (SOLD /
 * IN_STOCK, the line's index for error paths), the allocation rows and each MERGED line's Sold part. A short line →
 * `short(fields)` with `exceeds_available` / `must_equal_sold` / `below_sold` (nothing changed).
 */
export async function expandLotTakes(tx: Tx, scope: { vendorId: string; currency: string }, lines: readonly LotLine[], short: (fields: FieldError[]) => Error) {
  if (lines.length === 0) return { takes: [] as PurchaseTake[], allocs: [] as LotAllocRow[], soldParts: [] as { index: number; pcs: number; weightCt: Dec }[] };
  const locked = await lockLotCandidates(tx, lines.map((line) => line.lotKey), [], "purchase");
  const byLot = new Map<string, LockedStock[]>();
  for (const row of locked) byLot.set(row.lotKey, [...(byLot.get(row.lotKey) ?? []), row]);
  // The same lot may be on two lines (SOLD + IN_STOCK): the second sees what the first took.
  const left = new Map(locked.map((row) => [row.id, { soldPcs: row.soldPcs - row.purchasedPcs, soldWeight: row.soldWeight.minus(row.purchasedWeight), pendingPcs: row.pendingPcs, pendingWeight: row.pendingWeight }]));
  const fields: FieldError[] = [];
  const takes: PurchaseTake[] = [];
  const allocs: LotAllocRow[] = [];
  const soldParts: { index: number; pcs: number; weightCt: Dec }[] = [];
  for (const line of [...lines].sort((a, b) => (a.memoGroup === "SOLD" ? -1 : b.memoGroup === "SOLD" ? 1 : 0) || a.index - b.index)) {
    const rows = byLot.get(line.lotKey) ?? [];
    if (rows.length > LOT_GROUP_MAX) throw stockLotTooLarge(line.lotKey, LOT_GROUP_MAX);
    const wrong = rows.find((row) => row.vendorId !== scope.vendorId || row.currency !== scope.currency);
    if (wrong || rows.length === 0) {
      fields.push({ path: `lines.${line.index}.reference`, code: wrong ? "vendor_mismatch" : "unavailable" });
      continue;
    }
    const candidates: PurchaseCandidate[] = rows.map((row) => {
      const free = left.get(row.id)!;
      return { id: row.id, stockId: row.stockId, refDate: row.refDate, soldOpen: { pcs: Math.max(free.soldPcs, 0), weight: Decimal.max(free.soldWeight, 0) }, pending: { pcs: free.pendingPcs, weight: free.pendingWeight } };
    });
    const split = splitPurchaseLot(candidates, line.memoGroup, { pcs: line.pcs, weight: line.weight });
    if (!split.ok) {
      const params = { availablePcs: split.pending.pcs + (line.memoGroup === "IN_STOCK" ? 0 : split.soldOpen.pcs), availableWeightCt: split.pending.weight.plus(line.memoGroup === "IN_STOCK" ? 0 : split.soldOpen.weight).toFixed(3) };
      const code = split.code === "not_mergeable" ? "exceeds_available" : split.code;
      fields.push({ path: `lines.${line.index}.pcs`, code, params }, { path: `lines.${line.index}.weightCt`, code, params });
      continue;
    }
    split.rows.forEach((row, seq) => {
      const free = left.get(row.id)!;
      if (row.part === "SOLD") left.set(row.id, { ...free, soldPcs: free.soldPcs - row.pcs, soldWeight: free.soldWeight.minus(row.weight) });
      else left.set(row.id, { ...free, pendingPcs: free.pendingPcs - row.pcs, pendingWeight: free.pendingWeight.minus(row.weight) });
      takes.push({ source: "STOCK", memoStockId: row.id, memoGroup: row.part, purchaseOrderLineId: null, pcs: row.pcs, weightCt: row.weight, index: line.index });
      allocs.push({ lineId: line.lineId, seq: seq + 1, memoStockId: row.id, stockId: row.stockId, part: row.part, pcs: row.pcs, weight: row.weight });
    });
    if (line.memoGroup === "MERGED") soldParts.push({ index: line.index, pcs: split.soldPart.pcs, weightCt: split.soldPart.weight });
  }
  if (fields.length > 0) throw short(fields.sort((a, b) => a.path.localeCompare(b.path, "en", { numeric: true })));
  return { takes, allocs, soldParts };
}

/** Replaces the Purchase lines' allocation (legacy lines: one row per part; lot lines: the split rows). */
export async function writePurchaseAllocs(tx: Tx, lineIds: readonly string[], rows: readonly LotAllocRow[]) {
  if (lineIds.length > 0) await tx.$executeRaw(Prisma.sql`DELETE FROM "partner"."purchase_line_alloc" WHERE line_id = ANY(${[...lineIds]}::uuid[])`);
  if (rows.length === 0) return;
  const values = rows.map((row) => Prisma.sql`(${uuidV7()}::uuid, ${row.lineId}::uuid, ${row.seq}::smallint, ${row.memoStockId}::uuid, ${row.stockId}, ${row.part}, ${row.pcs}::int, ${row.weight.toFixed(3)}::numeric)`);
  await tx.$executeRaw(Prisma.sql`INSERT INTO "partner"."purchase_line_alloc" (id, line_id, seq, memo_stock_id, stock_id, part, pcs, weight_ct) VALUES ${Prisma.join(values)}`);
}

/** The stored allocation of lot lines as per-item give-backs (SOLD / IN_STOCK), for `giveBackForPurchase`. */
export async function allocGiveBacks(tx: Tx, lines: readonly { id: string; index: number }[]): Promise<PurchaseGiveBack[]> {
  if (lines.length === 0) return [];
  const rows = await tx.$queryRaw<{ line_id: string; memo_stock_id: string; part: string; pcs: number; weight_ct: string }[]>(Prisma.sql`
    SELECT line_id::text AS line_id, memo_stock_id::text AS memo_stock_id, part, pcs, weight_ct::text AS weight_ct
    FROM "partner"."purchase_line_alloc" WHERE line_id = ANY(${lines.map((line) => line.id)}::uuid[]) ORDER BY id`);
  const indexOf = new Map(lines.map((line) => [line.id, line.index]));
  return rows.map((row) => ({
    source: "STOCK", memoStockId: row.memo_stock_id, memoGroup: row.part, purchaseOrderLineId: null, pcs: row.pcs, weightCt: new Decimal(row.weight_ct),
    index: indexOf.get(row.line_id) ?? 0, soldPartPcs: null, soldPartWeightCt: null,
  }));
}

export const refDateOf = (value: Date) => fromDbDate(value);
