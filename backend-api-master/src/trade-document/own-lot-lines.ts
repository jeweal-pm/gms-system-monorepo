import { AsyncLocalStorage } from "node:async_hooks";
import { validationException, type FieldError } from "../common/errors";
import { Prisma } from "../generated/prisma/client";
import { inventoryClient, InventoryRefusal, type OwnStockBatchRow } from "../inventory-client/inventory-client";
import { allocateFifo, totalOf, type Candidate, type Qty } from "./lot-allocation";
import { isOwnLot, LOT_GROUP_MAX, stockLotTooLarge, stockLotUnavailable } from "./lot-key";
import type { ShortLine } from "./lot-apply";
import { inventoryUnavailable, type OwnCopied } from "./own-stock-lines";

/**
 * lot-based-stock SA rev 1 / ADR-0055 D7 (BE-LOT-005, SA-LOT-08): lines naming an own-stock lot (`O…`) in master
 * documents. Before the save transaction (no HTTP inside a transaction, D19):
 * 1. `POST /internal/v1/master/stock/lots` (≤ 200 keys, 5 s) gives each lot's open stocks FIFO (no lock);
 * 2. `POST /internal/v1/master/stock/batch` for one stock per lot gives the shared details (no cost);
 * 3. each line is checked against the lot's available (on-hand + what this document already holds of it) and
 *    allocated FIFO (oldest first, Q-LOT-06) into a per-stock plan.
 * The plan feeds the unchanged per-stock hold PUT of the D19 saga (H_new) and is written as the document's own-stock
 * allocation rows inside tx1 (`currentOwnLotPlan`). Inventory's lock and guard stay authoritative: a concurrent
 * document taking a stock in between is refused there (`STOCK_HOLD_EXCEEDS_AVAILABLE`) and mapped to the lot line.
 * A load being saved (SYNCING) is left out of the candidates. Inventory down → 503 INVENTORY_UNAVAILABLE.
 */
const Decimal = Prisma.Decimal;

export type OwnLotAlloc = { stockUuid: string; stockId: string; pcs: number; weight: Prisma.Decimal };
/** Per lot key: the FIFO allocation of the line naming it (one lot per document and source). */
export type OwnLotPlan = Map<string, OwnLotAlloc[]>;

const planStore = new AsyncLocalStorage<OwnLotPlan>();
export const withOwnLotPlan = <T>(plan: OwnLotPlan, fn: () => Promise<T>): Promise<T> => planStore.run(plan, fn);
export const currentOwnLotPlan = (): OwnLotPlan | undefined => planStore.getStore();

type LotLine = { ownStockId?: string | null; lotKey?: string | null; pcs: number; weightCt: string; /** 0-based line position (error path `lines.N`) */ index?: number };

/** Reads the candidates (and, when `details`, one stock's details per lot) of the own lots of `lines`. */
async function readOwnLots(keys: readonly string[], details: boolean, actorId?: string) {
  try {
    const groups = await inventoryClient().stockLots(keys, { actorId });
    const firsts = details ? groups.flatMap((group) => (group.rows.length > 0 ? [group.rows[group.rows.length - 1].stockUuid] : [])) : [];
    const batch = firsts.length > 0 ? await inventoryClient().batch(firsts, { actorId }) : [];
    return { groups: new Map(groups.map((group) => [group.lotKey, group.rows])), stocks: new Map(batch.map((row) => [row.stockUuid, row])) };
  } catch (error) {
    if (error instanceof InventoryRefusal && error.code === "STOCK_LOT_TOO_LARGE") {
      const lotKey = typeof error.details?.lotKey === "string" ? error.details.lotKey : null;
      throw stockLotTooLarge(lotKey, Number(error.details?.limit ?? LOT_GROUP_MAX));
    }
    throw inventoryUnavailable();
  }
}

const keysOf = (lines: readonly LotLine[]) => [...new Set(lines.flatMap((line) => (!line.ownStockId && isOwnLot(line.lotKey) ? [line.lotKey] : [])))];

/** FIFO candidates of a lot for this document: on-hand + what it holds now, loads being saved left out. */
function candidatesOf(rows: readonly { stockUuid: string; stockId: string; refDocDate: string; onHandPcs: number; onHandWeightCt: string; loadSyncing: boolean }[], held: ReadonlyMap<string, Qty>): Candidate[] {
  return rows.filter((row) => !row.loadSyncing).map((row) => {
    const mine = held.get(row.stockUuid);
    return { id: row.stockUuid, stockId: row.stockId, refDate: row.refDocDate, pcs: row.onHandPcs + (mine?.pcs ?? 0), weight: new Decimal(row.onHandWeightCt).plus(mine?.weight ?? 0) };
  });
}

/**
 * Save path: completes own-lot lines (details, group snapshot, stock count; no Stock ID) and returns the FIFO plan.
 * A lot with nothing open → 422 STOCK_LOT_UNAVAILABLE; above its available → VALIDATION_ERROR `exceeds_pending`.
 */
export async function completeOwnLotLines<L extends LotLine>(lines: readonly L[], options: { held?: ReadonlyMap<string, Qty>; actorId?: string }): Promise<{ lines: (L | (L & OwnCopied & { lotKey: string; stockCount: number }))[]; plan: OwnLotPlan }> {
  const keys = keysOf(lines);
  const plan: OwnLotPlan = new Map();
  if (keys.length === 0) return { lines: [...lines], plan };
  const { groups, stocks } = await readOwnLots(keys, true, options.actorId);
  const held = options.held ?? new Map();
  const unavailable: number[] = [];
  const quantities: FieldError[] = [];
  const completed = lines.map((line, index) => {
    if (line.ownStockId || !isOwnLot(line.lotKey)) return line;
    const rows = groups.get(line.lotKey) ?? [];
    const candidates = candidatesOf(rows, held);
    const detail: OwnStockBatchRow | undefined = rows.length > 0 ? stocks.get(rows[rows.length - 1].stockUuid) : undefined;
    if (candidates.length === 0 || !detail) {
      unavailable.push(index);
      return line;
    }
    const total = totalOf(candidates);
    const want = { pcs: line.pcs, weight: new Decimal(line.weightCt) };
    const result = allocateFifo(candidates, want);
    if (!result.ok) {
      const params = { availablePcs: total.pcs, availableWeightCt: total.weight.toFixed(3) };
      if (want.pcs > total.pcs) quantities.push({ path: `lines.${index}.pcs`, code: "exceeds_pending", params });
      if (want.weight.gt(total.weight)) quantities.push({ path: `lines.${index}.weightCt`, code: "exceeds_pending", params });
    } else {
      plan.set(line.lotKey, result.rows.map((row) => ({ stockUuid: row.id, stockId: row.stockId, pcs: row.pcs, weight: row.weight })));
    }
    const copy: OwnCopied & { lotKey: string; stockCount: number } = {
      ownStockId: null as unknown as string, stoneCodeId: null, stoneCode: detail.stoneCode, stone: detail.stone, shape: detail.shape, size: detail.size,
      color: detail.color, clarity: detail.clarity, cutting: detail.cutting, quality: detail.quality, lot: detail.lot, location: detail.location,
      cerType: detail.cerType, cerNo: detail.cerNo, priceUnit: detail.priceUnit, stockId: null,
      stockPendingPcs: total.pcs, stockPendingWeightCt: total.weight.toFixed(3), lotKey: line.lotKey, stockCount: candidates.length,
    };
    const { ownStockId: _none, ...rest } = copy;
    return { ...line, ...rest } as L & OwnCopied & { lotKey: string; stockCount: number };
  });
  if (unavailable.length > 0) throw stockLotUnavailable(unavailable);
  if (quantities.length > 0) throw validationException(quantities);
  return { lines: completed, plan };
}

/**
 * Approve / restore path: the FIFO plan of stored own-lot lines (no details). Fail closed (INV-20261121-002 F1): a line
 * the lot cannot cover in full (taken by another document since Save, or the lot is gone / being loaded) is NOT left
 * out — `onShort` receives every short line (`details.lines[] {index, lotKey, availablePcs, availableWeightCt}`) and its
 * error is thrown before the saga and tx1, so nothing is held, allocated or approved. Inventory's hold PUT stays the
 * authoritative check for races after this pre-read.
 */
export async function planOwnLots(lines: readonly LotLine[], held: ReadonlyMap<string, Qty>, onShort: (short: ShortLine[]) => Error, actorId?: string): Promise<OwnLotPlan> {
  const keys = keysOf(lines);
  const plan: OwnLotPlan = new Map();
  if (keys.length === 0) return plan;
  const { groups } = await readOwnLots(keys, false, actorId);
  const short: ShortLine[] = [];
  lines.forEach((line, position) => {
    if (line.ownStockId || !isOwnLot(line.lotKey)) return;
    const candidates = candidatesOf(groups.get(line.lotKey) ?? [], held);
    const result = allocateFifo(candidates, { pcs: line.pcs, weight: new Decimal(line.weightCt) });
    if (!result.ok) {
      const available = totalOf(candidates);
      short.push({ index: line.index ?? position, lotKey: line.lotKey, availablePcs: available.pcs, availableWeightCt: available.weight.toFixed(3) });
      return;
    }
    plan.set(line.lotKey, result.rows.map((row) => ({ stockUuid: row.id, stockId: row.stockId, pcs: row.pcs, weight: row.weight })));
  });
  if (short.length > 0) throw onShort(short);
  return plan;
}

/** Whether a plan covers a line in full (pcs and weight): the tx1 re-check of `writeOwnAllocations`. */
export function planCovers(planned: readonly OwnLotAlloc[], line: { pcs: number; weightCt: string }): boolean {
  const total = planned.reduce((sum, row) => ({ pcs: sum.pcs + row.pcs, weight: sum.weight.plus(row.weight) }), { pcs: 0, weight: new Decimal(0) });
  return total.pcs === line.pcs && total.weight.equals(line.weightCt);
}

/** Hold set of a plan (per stock), to add to the legacy own-stock lines' sums. */
export function planHolds(plan: OwnLotPlan): Map<string, Qty> {
  const set = new Map<string, Qty>();
  for (const rows of plan.values()) for (const row of rows) {
    const qty = set.get(row.stockUuid) ?? { pcs: 0, weight: new Decimal(0) };
    set.set(row.stockUuid, { pcs: qty.pcs + row.pcs, weight: qty.weight.plus(row.weight) });
  }
  return set;
}

export function mergeHolds(a: ReadonlyMap<string, Qty>, b: ReadonlyMap<string, Qty>): Map<string, Qty> {
  const set = new Map(a);
  for (const [stock, qty] of b) {
    const before = set.get(stock) ?? { pcs: 0, weight: new Decimal(0) };
    set.set(stock, { pcs: before.pcs + qty.pcs, weight: before.weight.plus(qty.weight) });
  }
  return set;
}

/** Line positions per planned stock (row errors of a refused hold PUT). */
export function planLineIndex(lines: readonly { lotKey?: string | null; ownStockId?: string | null }[], plan: OwnLotPlan, base: Map<string, number[]>): Map<string, number[]> {
  lines.forEach((line, index) => {
    if (line.ownStockId || !line.lotKey) return;
    for (const row of plan.get(line.lotKey) ?? []) base.set(row.stockUuid, [...(base.get(row.stockUuid) ?? []), index]);
  });
  return base;
}
