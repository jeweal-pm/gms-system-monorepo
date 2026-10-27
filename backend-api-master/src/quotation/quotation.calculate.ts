import { Prisma } from "../generated/prisma/client";
import type { LineInput, QuotationInput } from "./quotation.schemas";

/**
 * Server-authoritative totals (SA-QT-08): the ADR-0025 D5 formulas, mirrored from the browser preview
 * `frontend/src/features/quotation/lib/calculate.ts` (same rounding: half-up to 2 dp at the same steps).
 */
const Decimal = Prisma.Decimal;
type Dec = Prisma.Decimal;
const ZERO = new Decimal(0);
const HUNDRED = new Decimal(100);
const round = (value: Dec) => value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const sum = (values: readonly Dec[]) => values.reduce((total, value) => total.plus(value), ZERO);

type LinePrice = Pick<LineInput, "priceUnit" | "pcs" | "weightCt" | "unitPrice"> & { discount?: LineInput["discount"] };

/** Weight (per carat) or pieces × unit price, half-up to 2 dp. */
export function lineGross(line: LinePrice): Dec {
  const qty = line.priceUnit === "PER_CT" ? new Decimal(line.weightCt) : new Decimal(line.pcs);
  return round(qty.times(line.unitPrice));
}

/** Owner 2026-10-26: per-line discount, a percent of the gross or an amount, capped at the gross. */
export function lineDiscount(line: LinePrice): Dec {
  const gross = lineGross(line);
  if (!line.discount || line.discount.type === "NONE") return ZERO;
  const value = new Decimal(line.discount.value);
  const amount = line.discount.type === "PERCENT" ? round(gross.times(value).dividedBy(HUNDRED)) : round(value);
  return Decimal.min(Decimal.max(amount, ZERO), gross);
}

/** Line amount after its discount. */
export function lineAmount(line: LinePrice): Dec {
  return lineGross(line).minus(lineDiscount(line));
}

export type QuotationTotals = {
  lineDiscounts: Dec[];
  lineAmounts: Dec[];
  subtotal: Dec;
  discountAmount: Dec;
  priceBeforeTax: Dec;
  taxAmount: Dec;
  chargesAmount: Dec;
  laborAmount: Dec;
  grandTotal: Dec;
};

/** Largest amount a DECIMAL(18,2) column holds. */
export const AMOUNT_MAX = new Decimal("9999999999999999.99");

/**
 * Paths of amounts too large to store (each line amount and line discount, and the document totals), for
 * `VALIDATION_ERROR`. The discount is checked too: a 100 % discount leaves the amount at 0 (INV-20261026-002).
 */
export function oversizeAmounts(totals: QuotationTotals): string[] {
  const paths = totals.lineAmounts.flatMap((amount, index) =>
    amount.greaterThan(AMOUNT_MAX) || totals.lineDiscounts[index].greaterThan(AMOUNT_MAX) ? [`lines.${index}.unitPrice`] : [],
  );
  const { subtotal, priceBeforeTax, taxAmount, chargesAmount, laborAmount, grandTotal } = totals;
  if ([subtotal, priceBeforeTax, taxAmount, chargesAmount, laborAmount, grandTotal].some((amount) => amount.greaterThan(AMOUNT_MAX))) paths.push("lines");
  return paths;
}

export function calculateTotals(input: Pick<QuotationInput, "lines" | "discount" | "tax" | "serviceCharges" | "labor">): QuotationTotals {
  const lineDiscounts = input.lines.map(lineDiscount);
  const lineAmounts = input.lines.map(lineAmount);
  const subtotal = sum(lineAmounts);

  let discountAmount = ZERO;
  if (input.discount.type !== "NONE") {
    const value = new Decimal(input.discount.value);
    discountAmount = input.discount.type === "PERCENT" ? round(subtotal.times(value).dividedBy(HUNDRED)) : round(value);
    discountAmount = Decimal.min(Decimal.max(discountAmount, ZERO), subtotal);
  }
  const totalAfterDiscount = subtotal.minus(discountAmount);

  let priceBeforeTax = totalAfterDiscount;
  let taxAmount = ZERO;
  if (input.tax.enabled) {
    const rate = new Decimal(input.tax.rate).dividedBy(HUNDRED);
    if (input.tax.includeInPrice) {
      priceBeforeTax = round(totalAfterDiscount.dividedBy(rate.plus(1)));
      taxAmount = totalAfterDiscount.minus(priceBeforeTax);
    } else {
      taxAmount = round(totalAfterDiscount.times(rate));
    }
  }

  const chargesAmount = round(sum(input.serviceCharges.map((charge) => new Decimal(charge.amount))));
  const laborAmount = input.labor ? round(new Decimal(input.labor.qty).times(input.labor.rate)) : ZERO;
  const grandTotal = priceBeforeTax.plus(taxAmount).plus(chargesAmount).plus(laborAmount);
  return { lineDiscounts, lineAmounts, subtotal, discountAmount, priceBeforeTax, taxAmount, chargesAmount, laborAmount, grandTotal };
}
