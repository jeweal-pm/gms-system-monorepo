import { HttpStatus } from "@nestjs/common";
import { partnerException, validationException, type FieldError } from "../common/errors";
import { inventoryClient, InventoryRefusal, type OwnStockBatchRow } from "../inventory-client/inventory-client";
import { Prisma } from "../generated/prisma/client";
import type { CopiedStockFields } from "./stock-lines";

/**
 * Lines naming our stock (ADR-0052 D17/D20, SA-LS-P2-03/10; mirror of `completeFromMemoStock`). Runs BEFORE the save
 * transaction (no HTTP inside a transaction, D19): one `POST /internal/v1/master/stock/batch` (≤ 200 ids, 5 s) for the
 * lines that are new or raised; a line is KEPT without a call when the same stock is already on the stored document and
 * its quantity is not raised (it keeps its stored copy). Each read stock must be ACTIVE (else `<CODE>_REFERENCE_INVALID`
 * `lines.N.ownStockId invalid_reference`) and the line's pcs / weight ≤ its available plus what this document already
 * holds (`exceeds_pending {availablePcs, availableWeightCt}`). Copied: Stock ID, stone code text, attributes, lot, location,
 * cer, price unit and the snapshot (available at save). Price, discount and item note stay the user's. Inventory down while a
 * read is needed → 503 INVENTORY_UNAVAILABLE, nothing saved.
 */
const Decimal = Prisma.Decimal;
type Dec = Prisma.Decimal;

export type OwnLineInput = { ownStockId?: string | null; pcs: number; weightCt: string };
/** The stored copy of an own-stock line (kept rule). */
export type StoredOwnLine = CopiedStockFields & { ownStockId: string; pcs: number; weightCt: string };
export type OwnCopied = Omit<CopiedStockFields, "stoneCodeId"> & { stoneCodeId: null; ownStockId: string };
export type Qty = { pcs: number; weight: Dec };

export const inventoryUnavailable = () => partnerException("INVENTORY_UNAVAILABLE", HttpStatus.SERVICE_UNAVAILABLE);

function copyOf(row: OwnStockBatchRow, held: Qty | undefined): OwnCopied {
  return {
    ownStockId: row.stockUuid,
    stoneCodeId: null,
    stoneCode: row.stoneCode,
    stone: row.stone,
    shape: row.shape,
    size: row.size,
    color: row.color,
    clarity: row.clarity,
    cutting: row.cutting,
    quality: row.quality,
    lot: row.lot,
    location: row.location,
    cerType: row.cerType,
    cerNo: row.cerNo,
    priceUnit: row.priceUnit,
    stockId: row.stockId,
    stockPendingPcs: row.availablePcs + (held?.pcs ?? 0),
    stockPendingWeightCt: new Decimal(row.availableWeightCt).plus(held?.weight ?? 0).toFixed(3),
  };
}

/**
 * Completes the own-stock lines of `lines`. `stored` = the stored document's own-stock lines by stock (update; empty on
 * create); `held` = what this document holds now in inventory by stock (Reserve / Memo Out applied set; empty for a
 * Quotation). Returns the lines with copied fields (other lines unchanged) and whether a call was made.
 */
export async function completeOwnStockLines<L extends OwnLineInput>(
  lines: readonly L[],
  options: { stored?: ReadonlyMap<string, StoredOwnLine>; held?: ReadonlyMap<string, Qty>; referenceInvalid: (fields: FieldError[]) => unknown; requestId?: string; actorId?: string },
): Promise<{ lines: (L | (L & OwnCopied))[]; called: boolean }> {
  const kept = (line: L): StoredOwnLine | null => {
    const before = line.ownStockId ? options.stored?.get(line.ownStockId) : undefined;
    if (!before) return null;
    return line.pcs <= before.pcs && new Decimal(line.weightCt).lte(before.weightCt) ? before : null;
  };
  const toRead = [...new Set(lines.flatMap((line) => (line.ownStockId && !kept(line) ? [line.ownStockId] : [])))];
  if (lines.every((line) => !line.ownStockId)) return { lines: [...lines], called: false };
  let rows = new Map<string, OwnStockBatchRow>();
  if (toRead.length > 0) {
    try {
      rows = new Map((await inventoryClient().batch(toRead, { requestId: options.requestId, actorId: options.actorId })).map((row) => [row.stockUuid, row]));
    } catch (error) {
      if (error instanceof InventoryRefusal && error.status === 422) {
        throw options.referenceInvalid(lines.flatMap((line, index) => (line.ownStockId ? [{ path: `lines.${index}.ownStockId`, code: "invalid_reference" }] : [])));
      }
      throw inventoryUnavailable();
    }
  }
  const references: FieldError[] = [];
  const quantities: FieldError[] = [];
  const completed = lines.map((line, index): L | (L & OwnCopied) => {
    if (!line.ownStockId) return line;
    const before = kept(line);
    if (before) {
      const { pcs: _pcs, weightCt: _weight, ...copy } = before;
      return { ...line, ...copy, stoneCodeId: null, ownStockId: line.ownStockId };
    }
    const row = rows.get(line.ownStockId);
    if (!row || row.status !== "ACTIVE") {
      references.push({ path: `lines.${index}.ownStockId`, code: "invalid_reference" });
      return line;
    }
    const copy = copyOf(row, options.held?.get(line.ownStockId));
    const params = { availablePcs: copy.stockPendingPcs, availableWeightCt: copy.stockPendingWeightCt };
    if (line.pcs > copy.stockPendingPcs) quantities.push({ path: `lines.${index}.pcs`, code: "exceeds_pending", params });
    if (new Decimal(line.weightCt).gt(copy.stockPendingWeightCt)) quantities.push({ path: `lines.${index}.weightCt`, code: "exceeds_pending", params });
    return { ...line, ...copy };
  });
  if (references.length > 0) throw options.referenceInvalid(references);
  if (quantities.length > 0) throw validationException(quantities);
  return { lines: completed, called: toRead.length > 0 };
}

/** Stored own-stock lines (any document line table) → kept-rule map. */
export function storedOwnLines(rows: readonly Record<string, unknown>[]): Map<string, StoredOwnLine> {
  const map = new Map<string, StoredOwnLine>();
  for (const row of rows) {
    if (!row.ownStockId) continue;
    const decimal = (value: unknown, scale: number) => (value === null || value === undefined ? "0" : new Decimal(String(value)).toFixed(scale));
    map.set(row.ownStockId as string, {
      ownStockId: row.ownStockId as string,
      stoneCodeId: null,
      stoneCode: (row.stoneCodeSnapshot as string) ?? "",
      stone: row.stone as string, shape: row.shape as string, size: row.size as string, color: row.color as string, clarity: row.clarity as string,
      cutting: row.cutting as string, quality: row.quality as string, lot: row.lot as string, location: row.location as string,
      cerType: row.cerType as string, cerNo: row.cerNo as string, priceUnit: row.priceUnit as "PER_CT" | "PER_PCS", stockId: row.stockId as string,
      stockPendingPcs: Number(row.stockPendingPcs ?? 0), stockPendingWeightCt: decimal(row.stockPendingWeightCt, 3),
      pcs: Number(row.pcs), weightCt: decimal(row.weightCt, 3),
    });
  }
  return map;
}

/** Select of the stored line columns `storedOwnLines` reads. */
export const STORED_OWN_LINE_SELECT = {
  ownStockId: true, stoneCodeSnapshot: true, stone: true, shape: true, size: true, color: true, clarity: true, cutting: true, quality: true, lot: true,
  location: true, cerType: true, cerNo: true, priceUnit: true, stockId: true, stockPendingPcs: true, stockPendingWeightCt: true, pcs: true, weightCt: true,
} as const;
