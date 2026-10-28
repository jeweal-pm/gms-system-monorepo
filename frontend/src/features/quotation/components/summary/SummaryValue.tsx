"use client";

import { Check, ChevronDown, CircleX } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import type { QuotationTotals } from "../../lib/calculate";
import { formatMoney } from "../../lib/format";
import { SERVICE_CHARGE_TYPES } from "../../lib/options";
import type { QuotationFormValues } from "../../schema";
import { DiscountPair } from "../DiscountPair";
import { Checkbox, cx, NumberInput, TextInput } from "../ui";

const numberInput = "h-10";

export function SummaryValue({ totals, currency }: { totals: QuotationTotals; currency: string }) {
  const { register, control, setValue } = useFormContext<QuotationFormValues>();
  /** A money value followed by the document currency (owner 2026-10-27). */
  const money = (value: Parameters<typeof formatMoney>[0]) => (
    <>
      {formatMoney(value)} {currency && <span className="text-xs text-[#6B7480]">{currency}</span>}
    </>
  );
  const discount = useWatch({ control, name: "discount" });
  const tax = useWatch({ control, name: "tax" });
  const labor = useWatch({ control, name: "labor" });

  return (
    <div className="text-[15px] text-[#1C252E]">
      <Row label="Subtotal" value={money(totals.subtotal)} />

      {/* Discount */}
      <div className="border-b border-[#E3E6EA] pb-4">
        <div className="flex items-center justify-between py-3">
          <Checkbox label="Discount" {...register("discount.enabled")} />
          <span className="text-[#E5484D]">{money(totals.discountAmount)}</span>
        </div>
        {/* Owner 2026-10-27: Discount (%) and Discount Amt side by side; typing either fills the other. */}
        {discount.enabled && (
          <div className="pl-8">
            <DiscountPair
              compact
              labels={false}
              type={discount.type}
              value={discount.value}
              base={totals.subtotal}
              currency={currency}
              onChange={(type, value) => {
                setValue("discount.type", type, { shouldDirty: true });
                setValue("discount.value", value, { shouldDirty: true });
              }}
            />
          </div>
        )}
      </div>

      {/* Tax */}
      <div className="border-b border-[#E3E6EA] py-4">
        <Row
          label={<span className="font-medium">Total after Discount</span>}
          value={
            <>
              {money(totals.totalAfterDiscount)}
            </>
          }
        />
        <div className="py-2">
          <Checkbox label="Tax" {...register("tax.enabled")} />
        </div>
        {/* Figma 140:57207: the tax rate is keyed on the Tax row inside the breakdown box. */}
        {tax.enabled && (
          <>
            <div className="py-2">
              <Checkbox label="Include tax in price" {...register("tax.includeInPrice")} />
            </div>
            <div className="mt-2 ml-6 space-y-2 rounded-xl bg-[#F6F7F8] px-4 py-3 text-sm">
              <Row compact label="Price before tax" value={money(totals.priceBeforeTax)} />
              <Row
                compact
                label={
                  <span className="flex items-center gap-3">
                    Tax
                    <span className="block w-24">
                      <NumberInput compact placeholder="0" suffix="%" aria-label="Tax rate (%)" className="h-9" {...register("tax.rate")} />
                    </span>
                  </span>
                }
                value={money(totals.taxAmount)}
              />
              <div className="border-t border-dashed border-[#D5DADF] pt-2">
                <Row compact label={<span className="font-medium">Total amount</span>} value={money(totals.totalWithTax)} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Other charge */}
      <div className="border-b border-[#E3E6EA] py-4">
        <h3 className="mb-3 font-medium">Other Charge</h3>
        <ServiceCharges totalLabel={`${formatMoney(totals.serviceChargeTotal)}${currency ? ` ${currency}` : ""}`} currency={currency} />
        <Checkbox label="Labor" className="mt-3" {...register("labor.enabled")} />
        {labor.enabled && (
          <div className="mt-3 ml-8 space-y-3 rounded-xl bg-[#F6F7F8] p-4 text-sm">
            <label className="flex items-center gap-3">
              <span className="w-12 font-medium">Work</span>
              <TextInput compact placeholder="Re-cutting" {...register("labor.work")} />
            </label>
            {(["PCS", "WEIGHT"] as const).map((basis) => {
              const active = labor.basis === basis;
              return (
                <div key={basis} className="flex items-center gap-2">
                  <label className="flex w-24 shrink-0 items-center gap-2">
                    <input type="radio" value={basis} className="size-4 accent-[#0E5E63]" {...register("labor.basis")} />
                    {basis === "PCS" ? "Pcs" : "Weight"}
                  </label>
                  {active ? (
                    <>
                      <NumberInput
                        key={`qty-${basis}`}
                        compact
                        decimals={basis === "PCS" ? 0 : 3}
                        placeholder={basis === "PCS" ? "0" : "0.00"}
                        className={numberInput}
                        {...register("labor.qty")}
                      />
                      <span className="shrink-0 text-[#6B7480]">{basis === "PCS" ? "pcs ×" : "cts ×"}</span>
                      <NumberInput compact placeholder="0.00" suffix={currency || undefined} className={numberInput} {...register("labor.rate")} />
                    </>
                  ) : (
                    <>
                      <NumberInput compact disabled placeholder={basis === "PCS" ? "0" : "0.00"} className={numberInput} />
                      <span className="shrink-0 text-[#6B7480]">{basis === "PCS" ? "pcs ×" : "cts ×"}</span>
                      <NumberInput compact disabled placeholder="0.00" suffix={currency || undefined} className={numberInput} />
                    </>
                  )}
                </div>
              );
            })}
            <div className="flex items-center justify-between border-t border-dashed border-[#D5DADF] pt-3">
              <span>
                <span className="font-medium">Labor Total</span>{" "}
                <span className="text-[#6B7480]">
                  {labor.qty || 0} {labor.basis === "PCS" ? "pcs" : "cts"} × {labor.rate || "0.00"}
                </span>
              </span>
              <span className="font-medium">{money(totals.laborAmount)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between rounded-xl bg-[#1F2530] px-6 py-6 text-white">
        <span className="text-lg font-medium">Grand Total</span>
        <span className="text-3xl font-semibold tabular-nums">
          {formatMoney(totals.grandTotal)} {currency && <span className="text-base font-medium text-white/70">{currency}</span>}
        </span>
      </div>
    </div>
  );
}

function ServiceCharges({ totalLabel, currency }: { totalLabel: string; currency: string }) {
  // ไม่ใช้ useFieldArray เพราะ component นี้ถูก render 2 ที่ (ใต้ตาราง + right rail)
  const { control, register, setValue } = useFormContext<QuotationFormValues>();
  const fields = useWatch({ control, name: "serviceCharges" });
  const [open, setOpen] = useState(false);
  const selectedIds = fields.map((f) => f.chargeId);

  const remove = (index: number) =>
    setValue("serviceCharges", fields.filter((_, i) => i !== index), { shouldDirty: true });
  const toggle = (chargeId: string) => {
    const index = selectedIds.indexOf(chargeId);
    if (index >= 0) remove(index);
    else setValue("serviceCharges", [...fields, { chargeId, amount: "" }], { shouldDirty: true });
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <span>Service Charge</span>
        <div className="relative w-52" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className={cx(
              "flex h-10 w-full items-center justify-between rounded-lg border bg-white px-3 text-sm",
              open || fields.length ? "border-[#1C252E]" : "border-[#E3E6EA]",
            )}
          >
            {fields.length ? `${fields.length} charge${fields.length > 1 ? "s" : ""} selected` : "Select charges"}
            <ChevronDown className="size-4" />
          </button>
          {open && (
            <ul className="absolute right-0 z-20 mt-1 w-full overflow-hidden rounded-lg border border-[#E3E6EA] bg-white py-1 text-sm shadow-lg">
              {SERVICE_CHARGE_TYPES.map((c) => {
                const on = selectedIds.includes(c.value);
                return (
                  <li key={c.value}>
                    <button
                      type="button"
                      onClick={() => toggle(c.value)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-[#F6F7F8]"
                    >
                      {c.label}
                      {on && <Check className="size-4 text-[#0E5E63]" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {fields.length > 0 && (
        <div className="mt-3 space-y-2 pl-6">
          {fields.map((f, i) => (
            <div key={f.chargeId} className="flex items-center gap-3">
              <span className="flex-1 text-[#6B7480]">
                {SERVICE_CHARGE_TYPES.find((c) => c.value === f.chargeId)?.label ?? f.chargeId}
              </span>
              <div className="w-36">
                <NumberInput compact placeholder="0.00" suffix={currency || undefined} className={numberInput} {...register(`serviceCharges.${i}.amount`)} />
              </div>
              <button type="button" aria-label="Remove charge" onClick={() => remove(i)} className="text-[#6B7480]">
                <CircleX className="size-5" />
              </button>
            </div>
          ))}
          <div className="flex justify-between border-t border-dashed border-[#D5DADF] pt-2 pr-8">
            <span className="font-medium">Total other charges</span>
            <span className="font-medium tabular-nums">{totalLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, compact }: { label: ReactNode; value: ReactNode; compact?: boolean }) {
  return (
    <div className={cx("flex items-center justify-between", !compact && "py-3")}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
