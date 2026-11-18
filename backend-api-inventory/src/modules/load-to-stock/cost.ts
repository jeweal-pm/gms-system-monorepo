import { Decimal, type Dec } from "../../platform/db";
import type { PriceUnit } from "../../platform/master-api";

/**
 * Cost in the company currency (ADR-0052 D7, SA-LS-10, owner Q-LS-12/23/24/27):
 * - per source: unit cost = PU net unit price × PU rate (4 dp half-up, computed by master as `unitCostBase`);
 *   amount = loaded weight (PER_CT) or loaded pcs (PER_PCS) × unit cost, 2 dp half-up;
 * - a row's cost = Σ of its sources; its unit price = cost ÷ its basis (4 dp half-up, 0 when the basis is 0);
 * - a merged row is PER_CT unless every source is PER_PCS; the "highest-priced" source is the one with the highest
 *   company-currency amount per piece (ties: the earlier source).
 */
export function sourceAmount(priceUnit: PriceUnit, pcs: number, weightCt: Dec | string, unitCostBase: Dec | string): Dec {
  const basis = priceUnit === "PER_CT" ? new Decimal(weightCt) : new Decimal(pcs);
  return basis.times(unitCostBase).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function rowPriceUnit(mode: "NONE" | "SPLIT" | "MERGE", sourceUnits: readonly PriceUnit[]): PriceUnit {
  if (mode !== "MERGE") return sourceUnits[0] ?? "PER_CT";
  return sourceUnits.length > 0 && sourceUnits.every((unit) => unit === "PER_PCS") ? "PER_PCS" : "PER_CT";
}

export function rowUnitCost(priceUnit: PriceUnit, pcs: number, weightCt: Dec, cost: Dec): Dec {
  const basis = priceUnit === "PER_CT" ? weightCt : new Decimal(pcs);
  return basis.isZero() ? new Decimal(0) : cost.dividedBy(basis).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

export type PricedSource = { priceUnit: PriceUnit; remainingPcs: number; remainingWeightCt: string; unitCostBase: string };

/** Index of the merge "detail" source: highest company-currency amount per piece of its remaining (Q-LS-27). */
export function highestPricedSource(sources: readonly PricedSource[]): number {
  let best = -1;
  let bestValue = new Decimal(-1);
  sources.forEach((source, index) => {
    const amount = sourceAmount(source.priceUnit, source.remainingPcs, source.remainingWeightCt, source.unitCostBase);
    const perPiece = source.remainingPcs > 0 ? amount.dividedBy(source.remainingPcs) : amount;
    if (perPiece.greaterThan(bestValue)) {
      best = index;
      bestValue = perPiece;
    }
  });
  return best;
}
