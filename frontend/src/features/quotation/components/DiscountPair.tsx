"use client";

import { useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import { amountText, percentText, type DiscountType } from "../lib/discount";
import type { Dec } from "../lib/decimal";
import { Field, NumberInput } from "./ui";

/**
 * Discount (%) and Discount Amt side by side (owner 2026-10-27): typing a percent fills the amount and
 * typing an amount fills the percent; the one typed last is what gets saved.
 */
export function DiscountPair({
  type,
  value,
  base,
  currency,
  disabled = false,
  compact = false,
  labels = true,
  percentError,
  onChange,
}: {
  type: DiscountType;
  value: string;
  /** What the discount applies to: the line gross or the subtotal. */
  base: Dec;
  currency: string;
  disabled?: boolean;
  compact?: boolean;
  labels?: boolean;
  percentError?: string;
  onChange: (type: DiscountType, value: string) => void;
}) {
  // decimal-setup FE-DEC-105: the amount is money (min(price places, 2)); the percent keeps its own 2 decimals.
  const nf = useNumberFormat();
  const percent = (
    <NumberInput
      compact={compact}
      placeholder="0"
      suffix="%"
      aria-label="Discount (%)"
      disabled={disabled}
      value={percentText(base, type, value)}
      onChange={(event) => onChange("PERCENT", event.target.value)}
    />
  );
  const amount = (
    <NumberInput
      compact={compact}
      decimals={nf.priceInputDecimals}
      placeholder="0.00"
      suffix={currency || undefined}
      aria-label={`Discount Amt${currency ? ` (${currency})` : ""}`}
      disabled={disabled}
      value={amountText(base, type, value)}
      onChange={(event) => onChange("AMOUNT", event.target.value)}
    />
  );
  if (!labels) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {percent}
        {amount}
      </div>
    );
  }
  return (
    <>
      <Field label="Discount (%)" error={percentError}>{percent}</Field>
      <Field label="Discount Amt">{amount}</Field>
    </>
  );
}
