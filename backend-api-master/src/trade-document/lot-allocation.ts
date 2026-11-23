import { Prisma } from "../generated/prisma/client";

/**
 * lot-based-stock SA rev 1 / ADR-0055 D5 (BE-LOT-002, SA-LOT-05/06): pure allocation rules over locked candidates.
 * - `allocateFifo`: oldest first (ref date ASC, Stock ID ASC, owner Q-LOT-06); pcs and weight are allocated
 *   independently in the same order, each row giving min(its available, remaining). Short → nothing, with the
 *   group's total available (the caller raises its `<DOC>_PENDING_SHORT`).
 * - `releaseNewestFirst`: gives back unsettled quantity, newest seq first (Q-LOT-07: undoing an edit).
 * - `settleOldestFirst`: downstream settlement (Memo Out Return, Sale From Reserve), oldest seq first, ≤ qty − settled.
 * - `splitPurchaseLot`: ADR-0043 per lot (SOLD = exactly the sold-open part; MERGED = sold part first, then pending).
 * Every function is deterministic: equal inputs give equal outputs (replays of master's stored results rely on it).
 */
const Decimal = Prisma.Decimal;
type Dec = Prisma.Decimal;

export type Qty = { pcs: number; weight: Dec };
export type Candidate = { id: string; stockId: string; refDate: string; pcs: number; weight: Dec };
export type Allocation = { id: string; stockId: string; pcs: number; weight: Dec };
export type AllocRow = { id: string; seq: number; pcs: number; weight: Dec; settledPcs: number; settledWeight: Dec };
export type Part = { id: string; pcs: number; weight: Dec };

export const ZERO_QTY = (): Qty => ({ pcs: 0, weight: new Decimal(0) });
const isEmpty = (qty: { pcs: number; weight: Dec }) => qty.pcs === 0 && qty.weight.isZero();

/** FIFO order: oldest ref date first, then the lowest Stock ID (string compare of equal-length numeric IDs). */
export function fifoOrder(a: Pick<Candidate, "refDate" | "stockId">, b: Pick<Candidate, "refDate" | "stockId">): number {
  if (a.refDate !== b.refDate) return a.refDate < b.refDate ? -1 : 1;
  if (a.stockId.length !== b.stockId.length) return a.stockId.length - b.stockId.length;
  return a.stockId < b.stockId ? -1 : a.stockId > b.stockId ? 1 : 0;
}

export function totalOf(rows: readonly { pcs: number; weight: Dec }[]): Qty {
  return rows.reduce((sum, row) => ({ pcs: sum.pcs + row.pcs, weight: sum.weight.plus(row.weight) }), ZERO_QTY());
}

export type FifoResult = { ok: true; rows: Allocation[] } | { ok: false; available: Qty };

/** Allocates `want` over `candidates` (any order; sorted FIFO here). Rows that would give nothing are skipped. */
export function allocateFifo(candidates: readonly Candidate[], want: Qty): FifoResult {
  const sorted = [...candidates].sort(fifoOrder);
  const available = totalOf(sorted);
  if (want.pcs > available.pcs || want.weight.gt(available.weight)) return { ok: false, available };
  let pcs = want.pcs;
  let weight = want.weight;
  const rows: Allocation[] = [];
  for (const candidate of sorted) {
    if (pcs === 0 && weight.isZero()) break;
    const takePcs = Math.min(candidate.pcs, pcs);
    const takeWeight = Decimal.min(candidate.weight, weight);
    if (takePcs === 0 && takeWeight.isZero()) continue;
    rows.push({ id: candidate.id, stockId: candidate.stockId, pcs: takePcs, weight: takeWeight });
    pcs -= takePcs;
    weight = weight.minus(takeWeight);
  }
  return { ok: true, rows };
}

/** Per-row release of `amount` from unsettled quantity, newest seq first; null when the unsettled total is short. */
export function releaseNewestFirst(rows: readonly AllocRow[], amount: Qty): Part[] | null {
  return walk([...rows].sort((a, b) => b.seq - a.seq), amount);
}

/** Per-row settlement of `amount` from unsettled quantity, oldest seq first; null when the unsettled total is short. */
export function settleOldestFirst(rows: readonly AllocRow[], amount: Qty): Part[] | null {
  return walk([...rows].sort((a, b) => a.seq - b.seq), amount);
}

function walk(ordered: readonly AllocRow[], amount: Qty): Part[] | null {
  const open = ordered.map((row) => ({ id: row.id, pcs: row.pcs - row.settledPcs, weight: row.weight.minus(row.settledWeight) }));
  const total = totalOf(open);
  if (amount.pcs > total.pcs || amount.weight.gt(total.weight) || amount.pcs < 0 || amount.weight.isNegative()) return null;
  let pcs = amount.pcs;
  let weight = amount.weight;
  const parts: Part[] = [];
  for (const row of open) {
    if (pcs === 0 && weight.isZero()) break;
    const p = Math.min(row.pcs, pcs);
    const w = Decimal.min(row.weight, weight);
    if (p === 0 && w.isZero()) continue;
    parts.push({ id: row.id, pcs: p, weight: w });
    pcs -= p;
    weight = weight.minus(w);
  }
  return parts;
}

/** A Purchase lot candidate: its Sold-open (sold − purchased) and pending quantities. */
export type PurchaseCandidate = { id: string; stockId: string; refDate: string; soldOpen: Qty; pending: Qty };
export type PurchaseAllocation = Allocation & { part: "SOLD" | "IN_STOCK" };
export type PurchaseSplit =
  | { ok: true; rows: PurchaseAllocation[]; soldPart: Qty }
  | { ok: false; code: "must_equal_sold" | "below_sold" | "exceeds_available" | "not_mergeable"; soldOpen: Qty; pending: Qty };

/**
 * ADR-0043 per lot (UT-LOT-05): SOLD takes exactly the lot's sold-open total (FIFO over rows with sold > purchased);
 * IN_STOCK takes from pending only (FIFO); MERGED takes the whole sold-open part first, then the rest from pending.
 * `group` is the line's memo group; quantities are checked per dimension as `completeSourceLines` does.
 */
export function splitPurchaseLot(candidates: readonly PurchaseCandidate[], group: "SOLD" | "IN_STOCK" | "MERGED", want: Qty): PurchaseSplit {
  const soldRows = candidates.map((row) => ({ id: row.id, stockId: row.stockId, refDate: row.refDate, pcs: row.soldOpen.pcs, weight: row.soldOpen.weight }));
  const pendingRows = candidates.map((row) => ({ id: row.id, stockId: row.stockId, refDate: row.refDate, pcs: row.pending.pcs, weight: row.pending.weight }));
  const soldOpen = totalOf(soldRows);
  const pending = totalOf(pendingRows);
  const fail = (code: Extract<PurchaseSplit, { ok: false }>["code"]): PurchaseSplit => ({ ok: false, code, soldOpen, pending });
  const tag = (rows: Allocation[], part: "SOLD" | "IN_STOCK") => rows.map((row) => ({ ...row, part }));
  if (group === "SOLD") {
    if (want.pcs !== soldOpen.pcs || !want.weight.equals(soldOpen.weight)) return fail("must_equal_sold");
    const sold = allocateFifo(soldRows, want);
    return sold.ok ? { ok: true, rows: tag(sold.rows, "SOLD"), soldPart: want } : fail("must_equal_sold");
  }
  if (group === "IN_STOCK") {
    const taken = allocateFifo(pendingRows, want);
    return taken.ok ? { ok: true, rows: tag(taken.rows, "IN_STOCK"), soldPart: ZERO_QTY() } : fail("exceeds_available");
  }
  if (isEmpty(soldOpen) || isEmpty(pending)) return fail("not_mergeable");
  if (want.pcs < soldOpen.pcs || want.weight.lt(soldOpen.weight)) return fail("below_sold");
  const rest = { pcs: want.pcs - soldOpen.pcs, weight: want.weight.minus(soldOpen.weight) };
  const sold = allocateFifo(soldRows, soldOpen);
  const taken = allocateFifo(pendingRows, rest);
  if (!sold.ok || !taken.ok) return fail("exceeds_available");
  return { ok: true, rows: [...tag(sold.rows, "SOLD"), ...tag(taken.rows, "IN_STOCK")], soldPart: soldOpen };
}
