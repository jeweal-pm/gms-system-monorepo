import { isFilledLine, type QuotationFormValues, type QuotationLine } from "../schema";
import { add, dec, div, max, min, mul, round, sub, ZERO, type Dec } from "./decimal";
import { discountAmount as discountOf } from "./discount";

export type QuotationTotals = {
  totalPcs: Dec;
  totalWeight: Dec;
  subtotal: Dec;
  discountAmount: Dec;
  totalAfterDiscount: Dec;
  priceBeforeTax: Dec;
  taxAmount: Dec;
  totalWithTax: Dec;
  serviceChargeTotal: Dec;
  laborAmount: Dec;
  grandTotal: Dec;
};

type LinePrice = Pick<QuotationLine, "priceUnit" | "pcs" | "weightCt" | "unitPrice"> & Partial<Pick<QuotationLine, "discountType" | "discountValue">>;

/** Weight (per carat) or pieces × unit price. */
export function lineGross(line: LinePrice): Dec {
  const qty = line.priceUnit === "PER_CT" ? dec(line.weightCt) : dec(line.pcs);
  return round(mul(qty, dec(line.unitPrice)));
}

/** The line discount — a percent of the line or an amount — capped at the line (same as the server). */
export function lineDiscount(line: LinePrice): Dec {
  return discountOf(lineGross(line), line.discountType ?? "PERCENT", line.discountValue ?? "");
}

/** Line amount after its discount. */
export function lineAmount(line: LinePrice): Dec {
  return sub(lineGross(line), lineDiscount(line));
}

type CalcInput = Pick<QuotationFormValues, "lines" | "discount" | "tax" | "serviceCharges" | "labor">;

/** Pure calculation ของใบเสนอราคา (FE ใช้ preview; ภายหลัง backend ใช้สูตรเดียวกัน) */
export function calculateTotals(values: CalcInput): QuotationTotals {
  const lines = values.lines.filter(isFilledLine);

  const totalPcs = add(...lines.map((l) => dec(l.pcs)));
  const totalWeight = add(...lines.map((l) => dec(l.weightCt)));
  const subtotal = add(...lines.map(lineAmount));

  let discountAmount = ZERO;
  if (values.discount.enabled) {
    const value = dec(values.discount.value);
    discountAmount = values.discount.type === "PERCENT" ? round(div(mul(subtotal, value), dec(100))) : round(value);
    discountAmount = min(max(discountAmount, ZERO), subtotal);
  }
  const totalAfterDiscount = sub(subtotal, discountAmount);

  let priceBeforeTax = totalAfterDiscount;
  let taxAmount = ZERO;
  if (values.tax.enabled) {
    const rate = div(dec(values.tax.rate), dec(100));
    if (values.tax.includeInPrice) {
      priceBeforeTax = round(div(totalAfterDiscount, add(dec(1), rate)));
      taxAmount = sub(totalAfterDiscount, priceBeforeTax);
    } else {
      taxAmount = round(mul(totalAfterDiscount, rate));
    }
  }
  const totalWithTax = add(priceBeforeTax, taxAmount);

  const serviceChargeTotal = round(add(...values.serviceCharges.map((c) => dec(c.amount))));
  const laborAmount = values.labor.enabled ? round(mul(dec(values.labor.qty), dec(values.labor.rate))) : ZERO;

  return {
    totalPcs,
    totalWeight,
    subtotal,
    discountAmount,
    totalAfterDiscount,
    priceBeforeTax,
    taxAmount,
    totalWithTax,
    serviceChargeTotal,
    laborAmount,
    grandTotal: add(totalWithTax, serviceChargeTotal, laborAmount),
  };
}
