import { validationException, type FieldError } from "../common/errors";
import type { Tx } from "../common/persistence";
import { Prisma } from "../generated/prisma/client";
import { isMemoLot, itemReferenceErrors, stockLotUnavailable } from "./lot-key";

/** A line that may name a Memo Stock item (legacy, From Stock) or a Memo Stock lot (ADR-0055 D4). */
export type StockLineInput = { memoStockId?: string | null; lotKey?: string | null; pcs: number; weightCt: string };

/** The item's / lot's pending a stock line was checked against, stored on the line (SA-MO-12, SA-QT-15, ADR-0055 D4). */
export type StockSnapshot = { stockPendingPcs: number; stockPendingWeightCt: string; stockCount?: number | null };

/** What a stock line takes from its Memo Stock item or lot (a lot line has no Stock ID). */
export type CopiedStockFields = StockSnapshot & {
  stoneCodeId: null;
  stoneCode: string;
  stone: string;
  shape: string;
  size: string;
  color: string;
  clarity: string;
  cutting: string;
  quality: string;
  lot: string;
  location: string;
  cerType: string;
  cerNo: string;
  priceUnit: "PER_CT" | "PER_PCS";
  stockId: string | null;
  lotKey?: string | null;
  stockCount?: number | null;
};

const Decimal = Prisma.Decimal;
type Dec = Prisma.Decimal;

/** Line tables whose stored item references keep legacy lines acceptable (fixed SQL map, never input). */
const LINE_TABLES = {
  quotation: { table: Prisma.raw(`"partner"."quotation_line"`), parent: Prisma.raw(`"quotation_id"`), own: true },
  reserve: { table: Prisma.raw(`"partner"."reserve_line"`), parent: Prisma.raw(`"reserve_id"`), own: true },
  memoOut: { table: Prisma.raw(`"partner"."memo_out_line"`), parent: Prisma.raw(`"memo_out_id"`), own: true },
  memoReturn: { table: Prisma.raw(`"partner"."memo_return_line"`), parent: Prisma.raw(`"memo_return_id"`), own: false },
  purchase: { table: Prisma.raw(`"partner"."purchase_line"`), parent: Prisma.raw(`"purchase_id"`), own: false },
} as const;
export type LineTable = keyof typeof LINE_TABLES;

/**
 * FE-LOT-008 / Q-LOT-09 (INV-20261121-002 H2): a NEW stock line must name a lot. An item reference (`memoStockId` /
 * `ownStockId`) stays accepted only for the same item already on the stored document (legacy lines are never converted);
 * anything else → 400 VALIDATION_ERROR `lines.N.reference lot_required`. One read of the stored line references (none on create).
 */
export async function refuseNewItemReferences(
  tx: Pick<Tx, "$queryRaw">,
  table: LineTable,
  documentId: string | null,
  lines: readonly { memoStockId?: string | null; ownStockId?: string | null; lotKey?: string | null }[],
): Promise<void> {
  if (!lines.some((line) => line.memoStockId || line.ownStockId)) return;
  const stored = { memoStockIds: new Set<string>(), ownStockIds: new Set<string>() };
  if (documentId) {
    const spec = LINE_TABLES[table];
    const rows = await tx.$queryRaw<{ memo_stock_id: string | null; own_stock_id: string | null }[]>(Prisma.sql`
      SELECT memo_stock_id::text AS memo_stock_id, ${spec.own ? Prisma.raw("own_stock_id::text") : Prisma.raw("NULL::text")} AS own_stock_id
      FROM ${spec.table} WHERE ${spec.parent} = ${documentId}::uuid AND (memo_stock_id IS NOT NULL${spec.own ? Prisma.raw(" OR own_stock_id IS NOT NULL") : Prisma.empty})`);
    for (const row of rows) {
      if (row.memo_stock_id) stored.memoStockIds.add(row.memo_stock_id);
      if (row.own_stock_id) stored.ownStockIds.add(row.own_stock_id);
    }
  }
  const errors = itemReferenceErrors(lines, stored).filter((error) => error.code === "lot_required");
  if (errors.length > 0) throw validationException(errors);
}

/** A Memo Stock lot group now (ADR-0055 D3): the open rows' sums and the shared details (uniform: all are in the key). */
export type MemoLotGroup = {
  lotKey: string; stockCount: number; pendingPcs: number; pendingWeight: Dec; vendorId: string; currency: string;
  stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string; lot: string;
  location: string; cerType: string; cerNo: string; itemNote: string; priceUnit: "PER_CT" | "PER_PCS"; unitPrice: Dec; netUnitPrice: Dec;
};
type GroupRow = {
  lot_key: string; n: number | null; p: number | null; w: string | null; vendor_id: string; currency_code: string; stone: string; shape: string; size: string;
  color: string; clarity: string; cutting: string; quality: string; lot: string; location: string; cer_type: string; cer_no: string; item_note: string;
  price_unit: string; unit_price: string; net_unit_price: string; avg_unit: string | null; avg_net: string | null;
};

/**
 * The Memo Stock lot groups of `lotKeys` (one statement, no lock): every known group with its OPEN rows' pending sums
 * and count (0 when nothing is left) and the newest row's details. Unknown keys are absent.
 */
export async function readMemoLotGroups(client: Pick<Tx, "$queryRaw">, lotKeys: readonly string[]): Promise<Map<string, MemoLotGroup>> {
  const keys = [...new Set(lotKeys)].filter(isMemoLot);
  if (keys.length === 0) return new Map();
  const rows = await client.$queryRaw<GroupRow[]>(Prisma.sql`
    WITH g AS (
      SELECT lot_key, count(*)::int AS n, sum(pending_pcs)::int AS p, sum(pending_weight_ct)::text AS w,
        -- Owner 2026-11-21 (Q1): the lot price is the average weighted by pending in the price unit.
        COALESCE(sum(unit_price * (CASE WHEN price_unit = 'PER_CT' THEN pending_weight_ct ELSE pending_pcs::numeric END)) / NULLIF(sum(CASE WHEN price_unit = 'PER_CT' THEN pending_weight_ct ELSE pending_pcs::numeric END), 0), avg(unit_price))::text AS avg_unit,
        COALESCE(sum(net_unit_price * (CASE WHEN price_unit = 'PER_CT' THEN pending_weight_ct ELSE pending_pcs::numeric END)) / NULLIF(sum(CASE WHEN price_unit = 'PER_CT' THEN pending_weight_ct ELSE pending_pcs::numeric END), 0), avg(net_unit_price))::text AS avg_net
      FROM "partner"."memo_stock"
      WHERE lot_key = ANY(${keys}::varchar[]) AND (pending_pcs > 0 OR pending_weight_ct > 0) GROUP BY lot_key
    )
    SELECT DISTINCT ON (s.lot_key) s.lot_key, g.n, g.p, g.w, g.avg_unit, g.avg_net, s.vendor_id::text AS vendor_id, s.currency_code, s.stone, s.shape, s.size, s.color, s.clarity,
      s.cutting, s.quality, s.lot, s.location, s.cer_type, s.cer_no, s.item_note, s.price_unit, s.unit_price::text AS unit_price, s.net_unit_price::text AS net_unit_price
    FROM "partner"."memo_stock" s LEFT JOIN g ON g.lot_key = s.lot_key
    WHERE s.lot_key = ANY(${keys}::varchar[])
    ORDER BY s.lot_key, s.received_doc_date DESC, s.stock_id DESC`);
  return new Map(rows.map((row) => [row.lot_key, {
    lotKey: row.lot_key, stockCount: row.n ?? 0, pendingPcs: row.p ?? 0, pendingWeight: new Decimal(row.w ?? "0"), vendorId: row.vendor_id, currency: row.currency_code,
    stone: row.stone, shape: row.shape, size: row.size, color: row.color, clarity: row.clarity, cutting: row.cutting, quality: row.quality, lot: row.lot,
    location: row.location, cerType: row.cer_type, cerNo: row.cer_no, itemNote: row.item_note, priceUnit: row.price_unit as "PER_CT" | "PER_PCS",
    unitPrice: new Decimal(row.avg_unit ?? row.unit_price), netUnitPrice: new Decimal(row.avg_net ?? row.net_unit_price),
  }]));
}

/** Copied fields of a lot line (Stock ID NULL; the group snapshot). */
export function lotCopy(group: MemoLotGroup, snapshot: StockSnapshot): CopiedStockFields {
  return {
    stoneCodeId: null, stoneCode: "", stone: group.stone, shape: group.shape, size: group.size, color: group.color, clarity: group.clarity,
    cutting: group.cutting, quality: group.quality, lot: group.lot, location: group.location, cerType: group.cerType, cerNo: group.cerNo,
    priceUnit: group.priceUnit, stockId: null, lotKey: group.lotKey, ...snapshot, stockCount: snapshot.stockCount ?? group.stockCount,
  };
}

/**
 * Completes stock lines from their Memo Stock items or lots inside the save transaction (SA-MO-13, SA-RS-06,
 * SA-QT-17/20; ADR-0055 D4):
 * - an item must exist (`referenceInvalid` at `lines.N.memoStockId`); a lot must have an open row
 *   (422 `STOCK_LOT_UNAVAILABLE` at `lines.N.reference`);
 * - the line's pcs / weight must be ≤ the item's / the whole lot's current pending (`exceeds_pending` with the
 *   available quantity), unless `kept` returns the stored snapshot of a line that may keep it (quotation: the item / lot
 *   was already on it and the quantity was not raised);
 * - Stock ID (items only), lot, location, stone attributes, certificate and price unit are copied, and stone code stays
 *   empty because Memo Stock has none. Price, discount and item note stay the user's.
 * Reads without a lock (≤ 2 statements): saving holds nothing. Lines without a Memo Stock reference pass unchanged.
 */
export async function completeFromMemoStock<L extends StockLineInput>(
  tx: Tx,
  lines: readonly L[],
  referenceInvalid: (fieldErrors: FieldError[]) => unknown,
  kept?: (line: L) => StockSnapshot | null,
): Promise<(L | (L & CopiedStockFields))[]> {
  const ids = lines.flatMap((line) => (line.memoStockId ? [line.memoStockId] : []));
  const lotKeys = lines.flatMap((line) => (!line.memoStockId && isMemoLot(line.lotKey) ? [line.lotKey] : []));
  if (ids.length === 0 && lotKeys.length === 0) return [...lines];
  const [itemRows, groups] = await Promise.all([
    ids.length === 0 ? Promise.resolve([]) : tx.memoStock.findMany({ where: { id: { in: ids } } }),
    readMemoLotGroups(tx, lotKeys),
  ]);
  const items = new Map(itemRows.map((item) => [item.id, item]));
  const references: FieldError[] = [];
  const unavailable: number[] = [];
  const quantities: FieldError[] = [];
  const checkQuantity = (index: number, line: L, available: { pcs: number; weight: Dec }) => {
    const params = { availablePcs: available.pcs, availableWeightCt: available.weight.toFixed(3) };
    if (line.pcs > available.pcs) quantities.push({ path: `lines.${index}.pcs`, code: "exceeds_pending", params });
    if (new Decimal(line.weightCt).gt(available.weight)) quantities.push({ path: `lines.${index}.weightCt`, code: "exceeds_pending", params });
  };
  const completed = lines.map((line, index): L | (L & CopiedStockFields) => {
    if (!line.memoStockId && isMemoLot(line.lotKey)) {
      const group = groups.get(line.lotKey);
      let snapshot = kept?.(line) ?? null;
      if (!group || (!snapshot && group.stockCount === 0)) {
        unavailable.push(index);
        return line;
      }
      if (!snapshot) {
        checkQuantity(index, line, { pcs: group.pendingPcs, weight: group.pendingWeight });
        snapshot = { stockPendingPcs: group.pendingPcs, stockPendingWeightCt: group.pendingWeight.toFixed(3), stockCount: group.stockCount };
      }
      return { ...line, ...lotCopy(group, snapshot) };
    }
    if (!line.memoStockId) return line;
    const item = items.get(line.memoStockId);
    if (!item) {
      references.push({ path: `lines.${index}.memoStockId`, code: "invalid_reference" });
      return line;
    }
    let snapshot = kept?.(line) ?? null;
    if (!snapshot) {
      if (line.pcs > item.pendingPcs) quantities.push({ path: `lines.${index}.pcs`, code: "exceeds_pending" });
      if (new Decimal(line.weightCt).gt(item.pendingWeightCt)) quantities.push({ path: `lines.${index}.weightCt`, code: "exceeds_pending" });
      snapshot = { stockPendingPcs: item.pendingPcs, stockPendingWeightCt: item.pendingWeightCt.toFixed(3) };
    }
    return {
      ...line,
      stoneCodeId: null,
      stoneCode: "",
      stone: item.stone,
      shape: item.shape,
      size: item.size,
      color: item.color,
      clarity: item.clarity,
      cutting: item.cutting,
      quality: item.quality,
      lot: item.lot,
      location: item.location,
      cerType: item.cerType,
      cerNo: item.cerNo,
      priceUnit: item.priceUnit as "PER_CT" | "PER_PCS",
      stockId: item.stockId,
      stockPendingPcs: snapshot.stockPendingPcs,
      stockPendingWeightCt: snapshot.stockPendingWeightCt,
    };
  });
  if (references.length > 0) throw referenceInvalid(references);
  if (unavailable.length > 0) throw stockLotUnavailable(unavailable);
  if (quantities.length > 0) throw validationException(quantities);
  return completed;
}
