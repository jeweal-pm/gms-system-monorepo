"use client";

import { cx } from "@/components/ui/button";
import { useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import { pickerSub } from "@/features/trade-document/picker-ui";
import { moneyText, NO_VALUE, priceCaption, priceTooltip, profitTone, unitLabel } from "../model";
import type { PriceRef } from "../types";

/**
 * Value cells of Stock Value (FE-SV-003): Price with its source caption, Unit, Amount and Profit/Loss. The server's decimal
 * strings are only formatted with the Decimal Setup places; nothing is added or multiplied here.
 */

/** "—" with an accessible name, so a missing value is announced and not read as a dash. */
export function Dash() {
  return (
    <span title="No value">
      <span aria-hidden>{NO_VALUE}</span>
      <span className="sr-only">No value</span>
    </span>
  );
}

type PriceProps = {
  price: string | null;
  source: string;
  label: string | null;
  priceRef: PriceRef;
  /** Customize view "Price source" off: the number only (the tooltip stays). */
  showCaption?: boolean;
};

/** The current unit price and, under it, where it comes from ("Price list" / "Last sale" / "Mixed" / "No price"). */
export function PriceBlock({ price, source, label, priceRef, showCaption = true }: PriceProps) {
  const nf = useNumberFormat();
  const caption = priceCaption(source, label);
  return (
    <div title={priceTooltip(source, priceRef)} className="text-right">
      <div>{price === null ? <Dash /> : nf.money(price)}</div>
      {showCaption && caption && <div className={cx(pickerSub, "whitespace-nowrap")}>{caption}</div>}
    </div>
  );
}

export function UnitText({ unit }: { unit: string | null }) {
  return <>{unitLabel(unit)}</>;
}

export function AmountText({ value }: { value: string | null }) {
  const nf = useNumberFormat();
  return value === null ? <Dash /> : <>{moneyText(value, nf.money)}</>;
}

/** Negative Profit/Loss is red with its minus sign; zero, positive and no value use the normal colour. */
export function ProfitLossText({ value }: { value: string | null }) {
  const nf = useNumberFormat();
  if (value === null) return <Dash />;
  return <span className={cx(profitTone(value) === "negative" && "text-gms-danger")}>{nf.money(value)}</span>;
}
