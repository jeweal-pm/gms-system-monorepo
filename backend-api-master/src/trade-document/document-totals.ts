import { Prisma } from "../generated/prisma/client";

/** A stored line's quantity: `pcs` and `weightCt` (memo out return: the Return quantity). */
export type QuantityLine = { pcs: number; weightCt: string | number | Prisma.Decimal };

/**
 * Header totals (approve-center ADR-0046 D17): line count, Σ pcs and Σ weight of the lines being stored, written on
 * every create / update so the Approve queue can show and sort by quantity without aggregating lines. Exact decimal
 * arithmetic; the result fits `line_count SMALLINT`, `total_pcs INTEGER`, `total_weight_ct DECIMAL(15,3)` for the
 * bounded inputs (≤ 200 lines, pcs ≤ 999 999, weight DECIMAL(12,3)).
 */
export function lineTotals(lines: readonly QuantityLine[]) {
  let weight = new Prisma.Decimal(0);
  let pcs = 0;
  for (const line of lines) {
    pcs += line.pcs;
    weight = weight.plus(new Prisma.Decimal(line.weightCt.toString()));
  }
  return { lineCount: lines.length, totalPcs: pcs, totalWeightCt: weight.toFixed(3) };
}
