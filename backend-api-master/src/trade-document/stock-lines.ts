import { validationException, type FieldError } from "../common/errors";
import type { Tx } from "../common/persistence";
import { Prisma } from "../generated/prisma/client";

/** A line that may name a Memo Stock item (From Stock). */
export type StockLineInput = { memoStockId?: string | null; pcs: number; weightCt: string };

/** The item's pending a stock line was checked against, stored on the line (SA-MO-12, SA-QT-15). */
export type StockSnapshot = { stockPendingPcs: number; stockPendingWeightCt: string };

/** What a stock line takes from its Memo Stock item. */
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
  stockId: string;
};

/**
 * Completes stock lines from their Memo Stock items inside the save transaction (SA-MO-13, SA-RS-06, SA-QT-17/20):
 * - each item must exist (`referenceInvalid` at `lines.N.memoStockId`);
 * - the line's pcs / weight must be ≤ the item's current pending (`exceeds_pending`), unless `kept` returns the stored
 *   snapshot of a line that may keep it (quotation: the item was already on it and the quantity was not raised);
 * - Stock ID, lot, location, stone attributes, certificate and price unit are copied, and stone code stays empty because
 *   Memo Stock has none. Price, discount and item note stay the user's.
 * Reads by primary key, without a lock: saving holds nothing. Lines without an item pass unchanged.
 */
export async function completeFromMemoStock<L extends StockLineInput>(
  tx: Tx,
  lines: readonly L[],
  referenceInvalid: (fieldErrors: FieldError[]) => unknown,
  kept?: (line: L) => StockSnapshot | null,
): Promise<(L | (L & CopiedStockFields))[]> {
  const ids = lines.flatMap((line) => (line.memoStockId ? [line.memoStockId] : []));
  if (ids.length === 0) return [...lines];
  const items = new Map((await tx.memoStock.findMany({ where: { id: { in: ids } } })).map((item) => [item.id, item]));
  const references: FieldError[] = [];
  const quantities: FieldError[] = [];
  const completed = lines.map((line, index): L | (L & CopiedStockFields) => {
    if (!line.memoStockId) return line;
    const item = items.get(line.memoStockId);
    if (!item) {
      references.push({ path: `lines.${index}.memoStockId`, code: "invalid_reference" });
      return line;
    }
    let snapshot = kept?.(line) ?? null;
    if (!snapshot) {
      if (line.pcs > item.pendingPcs) quantities.push({ path: `lines.${index}.pcs`, code: "exceeds_pending" });
      if (new Prisma.Decimal(line.weightCt).gt(item.pendingWeightCt)) quantities.push({ path: `lines.${index}.weightCt`, code: "exceeds_pending" });
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
      ...snapshot,
    };
  });
  if (references.length > 0) throw referenceInvalid(references);
  if (quantities.length > 0) throw validationException(quantities);
  return completed;
}
