import { validationException, type FieldError } from "../common/errors";
import type { Tx } from "../common/persistence";
import { Prisma } from "../generated/prisma/client";
import { lockSourceHeaders } from "../trade-document/source-lock";
import { purchaseErrors } from "./purchase.errors";
import type { LineMemoGroup, MemoGroup, PurchaseInput, PurchaseLineInput } from "./purchase.schemas";

const Decimal = Prisma.Decimal;
type Dec = Prisma.Decimal;

/** Fields a picked line takes from its source row (SA-PU-03/14); every other field but pcs, weight, price, note stays the user's. */
type CopiedFields = Pick<PurchaseLineInput, "stoneCodeId" | "stoneCode" | "stone" | "shape" | "size" | "color" | "clarity" | "cutting" | "quality" | "lot" | "location" | "cerType" | "cerNo" | "priceUnit">;

/**
 * A line after `completeSourceLines`: source fields copied from the database, plus what the line hook needs. For a PO
 * line `stoneCodeId` is null here (so the engine's active-stone-code check does not refuse a code that became inactive)
 * and the PO line's code travels in `copiedStoneCodeId` (architecture.md, "Create / update").
 */
export type PreparedLine = PurchaseLineInput & { copiedStoneCodeId?: string | null; sourceStockId?: string };
export type PreparedInput = Omit<PurchaseInput, "lines"> & { lines: PreparedLine[] };

/** Current availability of a Memo Stock item per group (SA-PU-05/12): IN_STOCK = pending, SOLD = sold − purchased. */
export function memoAvailable(item: { pendingPcs: number; pendingWeightCt: Dec; soldPcs: number; soldWeightCt: Dec; purchasedPcs: number; purchasedWeightCt: Dec }, group: MemoGroup) {
  return group === "IN_STOCK"
    ? { pcs: item.pendingPcs, weightCt: new Decimal(item.pendingWeightCt) }
    : { pcs: item.soldPcs - item.purchasedPcs, weightCt: new Decimal(item.soldWeightCt).minus(item.purchasedWeightCt) };
}

type MemoItem = Parameters<typeof memoAvailable>[0];

/**
 * The quantity range of a line per its group (SA-PU-22/24): IN_STOCK 0…pending; SOLD exactly sold − purchased (bought
 * whole, Q-PU-29); MERGED from the Sold part up to Sold + pending (Q-PU-31). `min` is null when there is no lower bound.
 */
export function memoLineRange(item: MemoItem, group: LineMemoGroup) {
  if (group === "IN_STOCK") return { min: null, max: memoAvailable(item, "IN_STOCK") };
  const sold = memoAvailable(item, "SOLD");
  if (group === "SOLD") return { min: sold, max: sold };
  const pending = memoAvailable(item, "IN_STOCK");
  return { min: sold, max: { pcs: sold.pcs + pending.pcs, weightCt: sold.weightCt.plus(pending.weightCt) } };
}

/** A MERGED line needs both a Sold part and an In-stock part (SA-PU-22 `not_mergeable`). */
const hasBothParts = (item: MemoItem) => {
  const sold = memoAvailable(item, "SOLD");
  const pending = memoAvailable(item, "IN_STOCK");
  return (sold.pcs > 0 || sold.weightCt.gt(0)) && (pending.pcs > 0 || pending.weightCt.gt(0));
};

/** Current availability of a PO line (SA-PU-06): ordered − purchased. */
export function purchaseOrderAvailable(line: { pcs: number; weightCt: Dec; purchasedPcs: number; purchasedWeightCt: Dec }) {
  return { pcs: line.pcs - line.purchasedPcs, weightCt: new Decimal(line.weightCt).minus(line.purchasedWeightCt) };
}

/**
 * Engine `prepare` (SA-PU-07): inside the save transaction, reads the source rows by primary key without a lock (≤ 2
 * queries), checks vendor / currency / PO status (`PURCHASE_REFERENCE_INVALID` at `lines.N.memoStockId` or
 * `lines.N.purchaseOrderLineId`), copies the source fields over the browser's and refuses a quantity above the current
 * availability (`VALIDATION_ERROR lines.N.pcs|weightCt` / `exceeds_available`). Moves no stock (SA default D2).
 */
export async function completeSourceLines(tx: Tx, input: PurchaseInput): Promise<PreparedInput> {
  const memoIds = [...new Set(input.lines.flatMap((line) => (line.source === "STOCK" && line.memoStockId ? [line.memoStockId] : [])))];
  const poLineIds = [...new Set(input.lines.flatMap((line) => (line.source === "PURCHASE_ORDER" && line.purchaseOrderLineId ? [line.purchaseOrderLineId] : [])))];
  const [items, poLines] = await Promise.all([
    memoIds.length === 0 ? [] : tx.memoStock.findMany({ where: { id: { in: memoIds } } }),
    poLineIds.length === 0 ? [] : tx.purchaseOrderLine.findMany({
      where: { id: { in: poLineIds } },
      include: { document: { select: { status: true, vendorId: true, currencyCode: true, deletedAt: true } } },
    }),
  ]);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const poLineById = new Map(poLines.map((line) => [line.id, line]));
  const references: FieldError[] = [];
  const quantities: FieldError[] = [];
  const checkQuantity = (index: number, line: PurchaseLineInput, available: { pcs: number; weightCt: Dec }) => {
    if (line.pcs > available.pcs) quantities.push({ path: `lines.${index}.pcs`, code: "exceeds_available" });
    if (new Decimal(line.weightCt).gt(available.weightCt)) quantities.push({ path: `lines.${index}.weightCt`, code: "exceeds_available" });
  };
  // ADR-0043: a SOLD line equals the Sold part (`must_equal_sold`); a MERGED line is at least the Sold part (`below_sold`)
  // and needs both parts (`not_mergeable`); pcs and weight are checked on their own.
  const checkMemoQuantity = (index: number, line: PurchaseLineInput, item: MemoItem, group: LineMemoGroup) => {
    if (group === "MERGED" && !hasBothParts(item)) {
      quantities.push({ path: `lines.${index}.memoStockId`, code: "not_mergeable" });
      return;
    }
    const { min, max } = memoLineRange(item, group);
    if (group === "SOLD") {
      if (line.pcs !== max.pcs) quantities.push({ path: `lines.${index}.pcs`, code: "must_equal_sold" });
      if (!new Decimal(line.weightCt).eq(max.weightCt)) quantities.push({ path: `lines.${index}.weightCt`, code: "must_equal_sold" });
      return;
    }
    if (min && line.pcs < min.pcs) quantities.push({ path: `lines.${index}.pcs`, code: "below_sold" });
    if (min && new Decimal(line.weightCt).lt(min.weightCt)) quantities.push({ path: `lines.${index}.weightCt`, code: "below_sold" });
    checkQuantity(index, line, max);
  };

  const lines = input.lines.map((line, index): PreparedLine => {
    if (line.source === "STOCK") {
      const item = line.memoStockId ? itemById.get(line.memoStockId) : undefined;
      if (!item || item.vendorId !== input.vendorId || item.currencyCode !== input.currency || !line.memoGroup) {
        references.push({ path: `lines.${index}.memoStockId`, code: "invalid_reference" });
        return line;
      }
      checkMemoQuantity(index, line, item, line.memoGroup);
      const copied: CopiedFields = {
        stoneCodeId: null, stoneCode: "", stone: item.stone, shape: item.shape, size: item.size, color: item.color, clarity: item.clarity,
        cutting: item.cutting, quality: item.quality, lot: item.lot, location: item.location, cerType: item.cerType, cerNo: item.cerNo,
        priceUnit: item.priceUnit as "PER_CT" | "PER_PCS",
      };
      return { ...line, ...copied, copiedStoneCodeId: null, sourceStockId: item.stockId };
    }
    if (line.source === "PURCHASE_ORDER") {
      const source = line.purchaseOrderLineId ? poLineById.get(line.purchaseOrderLineId) : undefined;
      if (!source || source.document.status !== "APPROVED" || source.document.deletedAt || source.document.vendorId !== input.vendorId || source.document.currencyCode !== input.currency) {
        references.push({ path: `lines.${index}.purchaseOrderLineId`, code: "invalid_reference" });
        return line;
      }
      checkQuantity(index, line, purchaseOrderAvailable(source));
      const copied: CopiedFields = {
        stoneCodeId: null, stoneCode: source.stoneCodeSnapshot, stone: source.stone, shape: source.shape, size: source.size, color: source.color,
        clarity: source.clarity, cutting: source.cutting, quality: source.quality, lot: source.lot, location: source.location,
        cerType: source.cerType, cerNo: source.cerNo, priceUnit: source.priceUnit as "PER_CT" | "PER_PCS",
      };
      return { ...line, ...copied, copiedStoneCodeId: source.stoneCodeId };
    }
    return line;
  });
  if (references.length > 0) throw purchaseErrors.referenceInvalid(references);
  if (quantities.length > 0) throw validationException(quantities);
  return { ...input, lines };
}

/** One approved line's take; `index` is its position for error paths. */
export type PurchaseTake = {
  source: string;
  memoStockId: string | null;
  memoGroup: string | null;
  purchaseOrderLineId: string | null;
  pcs: number;
  weightCt: Dec;
  index: number;
};

type KeyTotal = { id: string; pcs: number; weightCt: Dec; indexes: number[] };

/** Sums lines per key (memo stock item × group, PO line; INV-20261031-001): ≤ one VALUES row per target row. */
export function totalsPerKey(takes: PurchaseTake[]) {
  const inStock = new Map<string, KeyTotal>();
  const sold = new Map<string, KeyTotal>();
  const merged = new Map<string, KeyTotal>();
  const po = new Map<string, KeyTotal>();
  const add = (map: Map<string, KeyTotal>, id: string, take: PurchaseTake) => {
    const total = map.get(id);
    if (total) {
      total.pcs += take.pcs;
      total.weightCt = total.weightCt.plus(take.weightCt);
      total.indexes.push(take.index);
    } else {
      map.set(id, { id, pcs: take.pcs, weightCt: new Decimal(take.weightCt), indexes: [take.index] });
    }
  };
  for (const take of takes) {
    if (take.source === "STOCK" && take.memoStockId) add(take.memoGroup === "SOLD" ? sold : take.memoGroup === "MERGED" ? merged : inStock, take.memoStockId, take);
    else if (take.source === "PURCHASE_ORDER" && take.purchaseOrderLineId) add(po, take.purchaseOrderLineId, take);
  }
  return { inStock, sold, merged, po };
}

/** The Sold part a MERGED line took first, by line position (written to `purchase_line.sold_part_*`, SA-PU-25). */
export type SoldPart = { index: number; pcs: number; weightCt: Dec };

/**
 * SA-PU-23 (ADR-0043): splits each MERGED total under the lock, Sold part first: `soldTake` = sold − purchased now,
 * `stockTake` = q − soldTake, for pcs and weight on their own. Below the Sold part (`below_sold`) or a stock part above
 * pending (`exceeds_available`) is short. The parts join the SOLD / IN_STOCK totals, so the guards and the one bulk
 * UPDATE stay as for separate lines (an item is never both MERGED and SOLD / IN_STOCK on one purchase, SA-PU-21).
 */
export function splitMerged(
  merged: Map<string, KeyTotal>,
  items: Map<string, LockedItem>,
  totals: { inStock: Map<string, KeyTotal>; sold: Map<string, KeyTotal> },
): { shortFields: FieldError[]; soldParts: SoldPart[] } {
  const shortFields: FieldError[] = [];
  const soldParts: SoldPart[] = [];
  for (const total of merged.values()) {
    const item = items.get(total.id);
    if (!item) {
      shortFields.push(...shortPaths(total, "pcs"), ...shortPaths(total, "weightCt"));
      continue;
    }
    const soldPcs = item.sold_pcs - item.purchased_pcs;
    const soldWeight = dec(item.sold_weight_ct).minus(dec(item.purchased_weight_ct));
    const stockPcs = total.pcs - soldPcs;
    const stockWeight = total.weightCt.minus(soldWeight);
    const before = shortFields.length;
    if (stockPcs < 0) shortFields.push(...shortPaths(total, "pcs", "below_sold"));
    else if (stockPcs > item.pending_pcs) shortFields.push(...shortPaths(total, "pcs"));
    if (stockWeight.lt(0)) shortFields.push(...shortPaths(total, "weightCt", "below_sold"));
    else if (stockWeight.gt(dec(item.pending_weight_ct))) shortFields.push(...shortPaths(total, "weightCt"));
    // A short line moves nothing (the caller throws); only a line that fits joins the per-group totals.
    if (shortFields.length > before) continue;
    totals.sold.set(total.id, { id: total.id, pcs: soldPcs, weightCt: soldWeight, indexes: total.indexes });
    totals.inStock.set(total.id, { id: total.id, pcs: stockPcs, weightCt: stockWeight, indexes: total.indexes });
    for (const index of total.indexes) soldParts.push({ index, pcs: soldPcs, weightCt: soldWeight });
  }
  return { shortFields, soldParts };
}

const shortPaths = (total: KeyTotal, field: "pcs" | "weightCt" | "purchaseOrderLineId", code = "exceeds_available"): FieldError[] =>
  total.indexes.map((index) => ({ path: `lines.${index}.${field}`, code }));

type LockedItem = {
  id: string;
  pending_pcs: number;
  pending_weight_ct: Dec | string;
  sold_pcs: number;
  sold_weight_ct: Dec | string;
  purchased_pcs: number;
  purchased_weight_ct: Dec | string;
};
type LockedPoLine = {
  id: string;
  pcs: number;
  weight_ct: Dec | string;
  purchased_pcs: number;
  purchased_weight_ct: Dec | string;
  status: string;
  deleted: boolean;
  vendor_id: string;
  currency_code: string;
};

const dec = (value: Dec | string) => new Decimal(value.toString());
const zero = () => new Decimal(0);

/**
 * BE-PU-004 / SA-PU-09 step 2–5, inside the approve transaction (after the guarded status update):
 * 1. sums the lines per key;
 * 2. locks the source `purchase_order` headers `FOR SHARE` (INV-20261111-002 F1), the touched `memo_stock` rows
 *    `FOR UPDATE` in id order, then the touched `purchase_order_line` rows in id order (lock order purchase → PO header →
 *    memo_stock → purchase_order_line; other memo_stock writers lock only memo_stock);
 * 3. re-checks each PO is APPROVED with the purchase's vendor and currency;
 * 4. splits each MERGED line Sold part first (`splitMerged`, ADR-0043), then guards every key (IN_STOCK q ≤ pending;
 *    SOLD q ≤ sold − purchased; PO q ≤ ordered − purchased). Any short →
 *    `short(fields)` with every short line, before any UPDATE, so the caller's transaction rolls back and nothing moves;
 * 5. applies ≤ 1 `UPDATE … FROM (VALUES …)` per table: IN_STOCK pending −= q, sold += q, purchased += q; SOLD
 *    purchased += q; PO purchased_* += q. Fixed SQL fragments only; ids and quantities are bound parameters.
 * Manual lines move nothing. Returns the number of keys moved per table (for the log).
 */
export async function takeForPurchase(
  tx: Tx,
  scope: { vendorId: string; currency: string },
  takes: PurchaseTake[],
  short: (fields: FieldError[]) => Error,
  now: Date,
): Promise<{ memoStockKeys: number; purchaseOrderKeys: number; soldParts: SoldPart[] }> {
  const { inStock, sold, merged, po } = totalsPerKey(takes);
  const memoIds = [...new Set([...inStock.keys(), ...sold.keys(), ...merged.keys()])].sort();
  const poIds = [...po.keys()].sort();
  const shortFields: FieldError[] = [];

  // INV-20261111-002 F1: the source POs FOR SHARE first (their soft delete / edit locks the header before `usedBy`); the
  // PO line read below then sees their committed state and re-checks APPROVED / not deleted.
  await lockSourceHeaders(tx, "purchaseOrder", poIds);
  const lockedItems = memoIds.length === 0 ? [] : await tx.$queryRaw<LockedItem[]>(Prisma.sql`
    SELECT id::text AS id, pending_pcs, pending_weight_ct, sold_pcs, sold_weight_ct, purchased_pcs, purchased_weight_ct
    FROM "partner"."memo_stock"
    WHERE id = ANY(${memoIds}::uuid[]) ORDER BY id FOR UPDATE`);
  const lockedPoLines = poIds.length === 0 ? [] : await tx.$queryRaw<LockedPoLine[]>(Prisma.sql`
    SELECT l.id::text AS id, l.pcs, l.weight_ct, l.purchased_pcs, l.purchased_weight_ct, d.status, (d.deleted_at IS NOT NULL) AS deleted, d.vendor_id::text AS vendor_id, d.currency_code
    FROM "partner"."purchase_order_line" l JOIN "partner"."purchase_order" d ON d.id = l.purchase_order_id
    WHERE l.id = ANY(${poIds}::uuid[]) ORDER BY l.id FOR UPDATE OF l`);

  const items = new Map(lockedItems.map((row) => [row.id, row]));
  const mergedParts = splitMerged(merged, items, { inStock, sold });
  shortFields.push(...mergedParts.shortFields);
  for (const total of inStock.values()) {
    const item = items.get(total.id);
    if (!item || total.pcs > item.pending_pcs) shortFields.push(...shortPaths(total, "pcs"));
    if (!item || total.weightCt.gt(dec(item.pending_weight_ct))) shortFields.push(...shortPaths(total, "weightCt"));
  }
  for (const total of sold.values()) {
    const item = items.get(total.id);
    if (!item || total.pcs > item.sold_pcs - item.purchased_pcs) shortFields.push(...shortPaths(total, "pcs"));
    if (!item || total.weightCt.gt(dec(item.sold_weight_ct).minus(dec(item.purchased_weight_ct)))) shortFields.push(...shortPaths(total, "weightCt"));
  }
  const poLines = new Map(lockedPoLines.map((row) => [row.id, row]));
  for (const total of po.values()) {
    const line = poLines.get(total.id);
    if (!line || line.status !== "APPROVED" || line.deleted || line.vendor_id !== scope.vendorId || line.currency_code !== scope.currency) {
      // A PO that is no longer valid (unreachable while approved POs are read-only, SA-PO-03).
      shortFields.push(...shortPaths(total, "purchaseOrderLineId", "invalid_reference"));
      continue;
    }
    if (total.pcs > line.pcs - line.purchased_pcs) shortFields.push(...shortPaths(total, "pcs"));
    if (total.weightCt.gt(dec(line.weight_ct).minus(dec(line.purchased_weight_ct)))) shortFields.push(...shortPaths(total, "weightCt"));
  }
  if (shortFields.length > 0) {
    shortFields.sort((a, b) => a.path.localeCompare(b.path, "en", { numeric: true }));
    throw short(shortFields);
  }

  if (memoIds.length > 0) {
    const rows = memoIds.map((id) => {
      const taken = inStock.get(id);
      const settled = sold.get(id);
      return Prisma.sql`(${id}::uuid, ${taken?.pcs ?? 0}::int, ${(taken?.weightCt ?? zero()).toFixed(3)}::numeric, ${settled?.pcs ?? 0}::int, ${(settled?.weightCt ?? zero()).toFixed(3)}::numeric)`;
    });
    await tx.$executeRaw(Prisma.sql`
      UPDATE "partner"."memo_stock" AS s
      SET pending_pcs = s.pending_pcs - r.in_pcs, pending_weight_ct = s.pending_weight_ct - r.in_weight,
          sold_pcs = s.sold_pcs + r.in_pcs, sold_weight_ct = s.sold_weight_ct + r.in_weight,
          purchased_pcs = s.purchased_pcs + r.in_pcs + r.sold_pcs, purchased_weight_ct = s.purchased_weight_ct + r.in_weight + r.sold_weight,
          version = s.version + 1, updated_at = ${now}
      FROM (VALUES ${Prisma.join(rows)}) AS r(id, in_pcs, in_weight, sold_pcs, sold_weight)
      WHERE s.id = r.id`);
  }
  if (poIds.length > 0) {
    const rows = poIds.map((id) => {
      const total = po.get(id)!;
      return Prisma.sql`(${id}::uuid, ${total.pcs}::int, ${total.weightCt.toFixed(3)}::numeric)`;
    });
    await tx.$executeRaw(Prisma.sql`
      UPDATE "partner"."purchase_order_line" AS o
      SET purchased_pcs = o.purchased_pcs + r.pcs, purchased_weight_ct = o.purchased_weight_ct + r.weight
      FROM (VALUES ${Prisma.join(rows)}) AS r(id, pcs, weight)
      WHERE o.id = r.id`);
  }
  return { memoStockKeys: inStock.size + sold.size, purchaseOrderKeys: po.size, soldParts: mergedParts.soldParts };
}

/** A stored, approved purchase line with the Sold part its MERGED line took (`purchase_line.sold_part_*`). */
export type PurchaseGiveBack = PurchaseTake & { soldPartPcs: number | null; soldPartWeightCt: Dec | null };

/**
 * Exact inverse of `takeForPurchase` (approval-setup "Effects and their reversal", auto-approved edit / delete), with the
 * same lock order (memo_stock rows, then purchase_order_line rows, each in id order) and ≤ 1 bulk UPDATE per table:
 * IN_STOCK q → pending += q, sold −= q, purchased −= q; SOLD q → purchased −= q; MERGED → its recorded Sold part as SOLD
 * and the rest as IN_STOCK; PO q → purchased_* −= q. A bucket that no longer holds the quantity (a later document moved
 * it) → `inUse()` before any UPDATE, so nothing changes. Manual lines move nothing.
 */
export async function giveBackForPurchase(tx: Tx, lines: PurchaseGiveBack[], inUse: () => Error, now: Date): Promise<void> {
  const inStock = new Map<string, { pcs: number; weightCt: Dec }>();
  const sold = new Map<string, { pcs: number; weightCt: Dec }>();
  const po = new Map<string, { pcs: number; weightCt: Dec }>();
  const add = (map: Map<string, { pcs: number; weightCt: Dec }>, id: string, pcs: number, weightCt: Dec) => {
    const total = map.get(id) ?? { pcs: 0, weightCt: zero() };
    map.set(id, { pcs: total.pcs + pcs, weightCt: total.weightCt.plus(weightCt) });
  };
  for (const line of lines) {
    const weight = new Decimal(line.weightCt);
    if (line.source === "STOCK" && line.memoStockId) {
      if (line.memoGroup === "SOLD") add(sold, line.memoStockId, line.pcs, weight);
      else if (line.memoGroup === "MERGED") {
        if (line.soldPartPcs === null || line.soldPartWeightCt === null) throw inUse();
        const soldWeight = new Decimal(line.soldPartWeightCt);
        add(sold, line.memoStockId, line.soldPartPcs, soldWeight);
        add(inStock, line.memoStockId, line.pcs - line.soldPartPcs, weight.minus(soldWeight));
      } else add(inStock, line.memoStockId, line.pcs, weight);
    } else if (line.source === "PURCHASE_ORDER" && line.purchaseOrderLineId) add(po, line.purchaseOrderLineId, line.pcs, weight);
  }
  const memoIds = [...new Set([...inStock.keys(), ...sold.keys()])].sort();
  const poIds = [...po.keys()].sort();
  const items = memoIds.length === 0 ? [] : await tx.$queryRaw<LockedItem[]>(Prisma.sql`
    SELECT id::text AS id, pending_pcs, pending_weight_ct, sold_pcs, sold_weight_ct, purchased_pcs, purchased_weight_ct
    FROM "partner"."memo_stock"
    WHERE id = ANY(${memoIds}::uuid[]) ORDER BY id FOR UPDATE`);
  const poLines = poIds.length === 0 ? [] : await tx.$queryRaw<{ id: string; purchased_pcs: number; purchased_weight_ct: Dec | string }[]>(Prisma.sql`
    SELECT id::text AS id, purchased_pcs, purchased_weight_ct FROM "partner"."purchase_order_line"
    WHERE id = ANY(${poIds}::uuid[]) ORDER BY id FOR UPDATE`);
  const byId = new Map(items.map((row) => [row.id, row]));
  for (const id of memoIds) {
    const item = byId.get(id);
    const back = inStock.get(id) ?? { pcs: 0, weightCt: zero() };
    const settled = sold.get(id) ?? { pcs: 0, weightCt: zero() };
    if (!item || back.pcs > item.sold_pcs || back.weightCt.gt(dec(item.sold_weight_ct))
      || back.pcs + settled.pcs > item.purchased_pcs || back.weightCt.plus(settled.weightCt).gt(dec(item.purchased_weight_ct))) throw inUse();
  }
  const poById = new Map(poLines.map((row) => [row.id, row]));
  for (const id of poIds) {
    const line = poById.get(id);
    const back = po.get(id)!;
    if (!line || back.pcs > line.purchased_pcs || back.weightCt.gt(dec(line.purchased_weight_ct))) throw inUse();
  }
  if (memoIds.length > 0) {
    const rows = memoIds.map((id) => {
      const back = inStock.get(id) ?? { pcs: 0, weightCt: zero() };
      const settled = sold.get(id) ?? { pcs: 0, weightCt: zero() };
      return Prisma.sql`(${id}::uuid, ${back.pcs}::int, ${back.weightCt.toFixed(3)}::numeric, ${settled.pcs}::int, ${settled.weightCt.toFixed(3)}::numeric)`;
    });
    await tx.$executeRaw(Prisma.sql`
      UPDATE "partner"."memo_stock" AS s
      SET pending_pcs = s.pending_pcs + r.in_pcs, pending_weight_ct = s.pending_weight_ct + r.in_weight,
          sold_pcs = s.sold_pcs - r.in_pcs, sold_weight_ct = s.sold_weight_ct - r.in_weight,
          purchased_pcs = s.purchased_pcs - r.in_pcs - r.sold_pcs, purchased_weight_ct = s.purchased_weight_ct - r.in_weight - r.sold_weight,
          version = s.version + 1, updated_at = ${now}
      FROM (VALUES ${Prisma.join(rows)}) AS r(id, in_pcs, in_weight, sold_pcs, sold_weight)
      WHERE s.id = r.id`);
  }
  if (poIds.length > 0) {
    const rows = poIds.map((id) => {
      const back = po.get(id)!;
      return Prisma.sql`(${id}::uuid, ${back.pcs}::int, ${back.weightCt.toFixed(3)}::numeric)`;
    });
    await tx.$executeRaw(Prisma.sql`
      UPDATE "partner"."purchase_order_line" AS o
      SET purchased_pcs = o.purchased_pcs - r.pcs, purchased_weight_ct = o.purchased_weight_ct - r.weight
      FROM (VALUES ${Prisma.join(rows)}) AS r(id, pcs, weight)
      WHERE o.id = r.id`);
  }
}
