import { Prisma } from "../generated/prisma/client";
import type { Tx } from "../common/persistence";
import { settleOldestFirst, type AllocRow } from "../trade-document/lot-allocation";

/**
 * sale-own-stock ADR-0058 D5 (phase B): a Sale line taken From Reserve whose Reserve line holds OWN stock (Load to Stock).
 * Master settles it exactly like a Memo Stock Reserve line, only without Memo Stock buckets: `reserve_line.sold += d` and the
 * Reserve line's allocation rows (`reserve_line_alloc.own_stock_id`) carry what the Sales settled, oldest seq first. What was
 * settled per own stock is stored in `partner.sale_consumption_own_line` (set semantics, replaced per revision), and returned
 * as `source: "OWN_STOCK"` allocation rows, which inventory turns into reserved -> sold moves (it owns the stock).
 */
const Decimal = Prisma.Decimal;
type Dec = Prisma.Decimal;
const ZERO = new Decimal(0);

export type OwnUse = { lineId: string; reserveLineId: string; ownStockId: string; stockId: string; pcs: number; weightCt: string };
export type OwnAllocRow = AllocRow & { lineId: string; ownStockId: string | null; stockId: string };
export type OwnRequestLine = { lineId: string; reserveLineId: string; pcs: number; weightCt: string };
export type OwnShort = { lineId: string; field: "pcs" | "weightCt"; code: "exceeds_open"; availablePcs: number; availableWeightCt: string };

const sum = (rows: readonly { pcs: number; weightCt: string }[]) => rows.reduce((acc, row) => ({ pcs: acc.pcs + row.pcs, weight: acc.weight.plus(row.weightCt) }), { pcs: 0, weight: ZERO as Dec });

/**
 * Pure expansion (UT-SO-M01): per own Reserve line, the rows it settles on the Reserve line's own-stock allocation, oldest seq
 * first, each row's open = qty - settled + this line's own applied quantity on it. A line equal to what is applied keeps its rows.
 */
export function expandOwnReserve(lines: readonly OwnRequestLine[], applied: readonly OwnUse[], allocsOf: ReadonlyMap<string, readonly OwnAllocRow[]>): { rows: OwnUse[]; short: OwnShort[] } {
  const rows: OwnUse[] = [];
  const short: OwnShort[] = [];
  for (const line of lines) {
    const own = applied.filter((row) => row.lineId === line.lineId);
    const total = sum(own);
    if (own.length > 0 && own.every((row) => row.reserveLineId === line.reserveLineId) && total.pcs === line.pcs && total.weight.equals(line.weightCt)) {
      rows.push(...own);
      continue;
    }
    const allocs = (allocsOf.get(line.reserveLineId) ?? []).filter((row) => row.ownStockId);
    const open = allocs.map((row) => {
      const mine = sum(own.filter((use) => use.ownStockId === row.ownStockId));
      return { ...row, settledPcs: row.settledPcs - mine.pcs, settledWeight: row.settledWeight.minus(mine.weight) };
    });
    const parts = settleOldestFirst(open, { pcs: line.pcs, weight: new Decimal(line.weightCt) });
    if (!parts) {
      const available = open.reduce((acc, row) => ({ pcs: acc.pcs + row.pcs - row.settledPcs, weight: acc.weight.plus(row.weight.minus(row.settledWeight)) }), { pcs: 0, weight: ZERO as Dec });
      short.push({ lineId: line.lineId, field: "pcs", code: "exceeds_open", availablePcs: available.pcs, availableWeightCt: available.weight.toFixed(3) });
      continue;
    }
    const byId = new Map(allocs.map((row) => [row.id, row]));
    for (const part of parts) {
      const alloc = byId.get(part.id)!;
      rows.push({ lineId: line.lineId, reserveLineId: line.reserveLineId, ownStockId: alloc.ownStockId!, stockId: alloc.stockId, pcs: part.pcs, weightCt: part.weight.toFixed(3) });
    }
  }
  return { rows, short };
}

/** Net change per Reserve line (`sold`) and per (Reserve line, own stock) (`settled`), desired minus applied. */
export function ownDeltas(desired: readonly OwnUse[], applied: readonly OwnUse[]) {
  const reserve = new Map<string, { pcs: number; weight: Dec }>();
  const settle = new Map<string, { line: string; stock: string; pcs: number; weight: Dec }>();
  const add = (row: OwnUse, sign: 1 | -1) => {
    const w = new Decimal(row.weightCt).times(sign);
    const r = reserve.get(row.reserveLineId) ?? { pcs: 0, weight: ZERO as Dec };
    reserve.set(row.reserveLineId, { pcs: r.pcs + sign * row.pcs, weight: r.weight.plus(w) });
    const key = `${row.reserveLineId}|${row.ownStockId}`;
    const s = settle.get(key) ?? { line: row.reserveLineId, stock: row.ownStockId, pcs: 0, weight: ZERO as Dec };
    settle.set(key, { ...s, pcs: s.pcs + sign * row.pcs, weight: s.weight.plus(w) });
  };
  desired.forEach((row) => add(row, 1));
  applied.forEach((row) => add(row, -1));
  return {
    reserve: [...reserve].filter(([, d]) => d.pcs !== 0 || !d.weight.isZero()).map(([id, d]) => ({ reserveLineId: id, ...d })),
    settle: [...settle.values()].filter((d) => d.pcs !== 0 || !d.weight.isZero()),
  };
}

export async function readAppliedOwn(tx: Tx, saleId: string): Promise<OwnUse[]> {
  const rows = await tx.$queryRaw<{ line_id: string; reserve_line_id: string; own_stock_id: string; stock_id: string; pcs: number; weight_ct: string }[]>(Prisma.sql`
    SELECT "line_id"::text AS "line_id", "reserve_line_id"::text AS "reserve_line_id", "own_stock_id"::text AS "own_stock_id", "stock_id", "pcs", "weight_ct"::text AS "weight_ct"
    FROM "partner"."sale_consumption_own_line" WHERE "sale_id" = ${saleId}::uuid`);
  return rows.map((row) => ({ lineId: row.line_id, reserveLineId: row.reserve_line_id, ownStockId: row.own_stock_id, stockId: row.stock_id, pcs: row.pcs, weightCt: new Decimal(row.weight_ct).toFixed(3) }));
}

/** Writes the net deltas (Reserve line sold, allocation settled) and replaces the Sale's own rows: <= 4 statements. */
export async function writeOwn(tx: Tx, saleId: string, desired: readonly OwnUse[], applied: readonly OwnUse[]): Promise<void> {
  const deltas = ownDeltas(desired, applied);
  if (deltas.reserve.length > 0) {
    const values = deltas.reserve.map((d) => Prisma.sql`(${d.reserveLineId}::uuid, ${d.pcs}::int, ${d.weight.toFixed(3)}::numeric)`);
    await tx.$executeRaw(Prisma.sql`
      UPDATE "partner"."reserve_line" AS l SET "sold_pcs" = l."sold_pcs" + d.pcs, "sold_weight_ct" = l."sold_weight_ct" + d.weight
      FROM (VALUES ${Prisma.join(values)}) AS d(id, pcs, weight) WHERE l."id" = d.id`);
  }
  if (deltas.settle.length > 0) {
    const values = deltas.settle.map((d) => Prisma.sql`(${d.line}::uuid, ${d.stock}::uuid, ${d.pcs}::int, ${d.weight.toFixed(3)}::numeric)`);
    await tx.$executeRaw(Prisma.sql`
      UPDATE "partner"."reserve_line_alloc" AS a SET "settled_pcs" = a."settled_pcs" + d.pcs, "settled_weight_ct" = a."settled_weight_ct" + d.weight
      FROM (VALUES ${Prisma.join(values)}) AS d(line_id, stock, pcs, weight) WHERE a."line_id" = d.line_id AND a."own_stock_id" = d.stock`);
  }
  if (applied.length > 0) await tx.$executeRaw(Prisma.sql`DELETE FROM "partner"."sale_consumption_own_line" WHERE "sale_id" = ${saleId}::uuid`);
  if (desired.length > 0) {
    const values = desired.map((row) => Prisma.sql`(${saleId}::uuid, ${row.lineId}::uuid, ${row.reserveLineId}::uuid, ${row.ownStockId}::uuid, ${row.stockId}, ${row.pcs}::int, ${row.weightCt}::numeric)`);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "partner"."sale_consumption_own_line" ("sale_id", "line_id", "reserve_line_id", "own_stock_id", "stock_id", "pcs", "weight_ct") VALUES ${Prisma.join(values)}`);
  }
}
