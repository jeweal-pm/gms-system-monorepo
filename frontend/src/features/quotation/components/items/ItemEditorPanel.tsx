"use client";

import { ChevronDown, ChevronUp, Lock, X } from "lucide-react";
import type { ReactNode } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { lineAmount } from "../../lib/calculate";
import { formatMoney } from "../../lib/format";
import * as m from "../../mock/masters";
import { isFilledLine, type QuotationFormValues } from "../../schema";
import { Button, Field, FormSelect, IconButton, NumberInput, ReadonlyBox, TextInput } from "../ui";

const PRICE_UNITS = [
  { value: "PER_CT", label: "per cts" },
  { value: "PER_PCS", label: "per pcs" },
];

export function ItemEditorPanel({
  index,
  total,
  readOnly,
  onPrev,
  onNext,
  onNextRow,
  onRemove,
  onClose,
}: {
  index: number;
  total: number;
  readOnly: boolean;
  onPrev: () => void;
  onNext: () => void;
  onNextRow: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const { register, setValue, control } = useFormContext<QuotationFormValues>();
  const line = useWatch({ control, name: `lines.${index}` });
  if (!line) return null;

  const fromStock = line.source === "STOCK";
  const locked = readOnly || fromStock;
  const name = <K extends keyof typeof line>(key: K) => `lines.${index}.${key}` as const;

  // เลือก Stone Code → fill คุณสมบัติพลอยจาก stone master
  const onStoneCodeChange = (code: string) => {
    const s = m.stoneCodes.find((x) => x.value === code);
    if (!s) return;
    for (const key of ["stone", "shape", "size", "color", "clarity", "cutting", "quality"] as const) {
      setValue(`lines.${index}.${key}`, s[key], { shouldDirty: true });
    }
  };

  const select = (key: Parameters<typeof name>[0], options: readonly m.Option[], extra?: { onValueChange?: (v: string) => void }) => (
    <FormSelect<QuotationFormValues> compact disabled={locked} name={name(key)} options={options} {...extra} />
  );

  return (
    <aside className="flex h-full w-[460px] shrink-0 flex-col border-l border-[#E3E6EA] bg-white">
      <header className="border-b border-[#E3E6EA] px-5 pt-4 pb-5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#6B7480]">
            Row {index + 1} of {total}
          </span>
          <div className="flex items-center gap-1">
            <IconButton label="Previous row" onClick={onPrev} disabled={index === 0}>
              <ChevronUp className="size-4" />
            </IconButton>
            <IconButton label="Next row" onClick={onNext} disabled={index >= total - 1}>
              <ChevronDown className="size-4" />
            </IconButton>
            <IconButton label="Close" onClick={onClose} className="rounded-full bg-[#F6F7F8]">
              <X className="size-4" />
            </IconButton>
          </div>
        </div>
        <h2 className="mt-2 flex items-center gap-2 text-lg font-medium text-[#1C252E]">
          {isFilledLine(line) ? line.stoneCode || line.stockId || "Item" : "New item"}
          {fromStock && (
            <span className="inline-flex items-center gap-1 rounded bg-[#EEF0F2] px-2 py-0.5 text-xs font-normal text-[#6B7480]">
              <Lock className="size-3" /> From stock
            </span>
          )}
        </h2>
      </header>

      <fieldset disabled={readOnly} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-5 py-2">
        <Section title="Stone Code">
          {/* Stock ID / Location มาจาก From Stock เท่านั้น — กรอกเองไม่ได้ */}
          <Field label="Stock ID">
            <ReadonlyBox compact value={line.stockId} placeholder="From stock only" />
          </Field>
          <Field label="Lot">
            <TextInput compact readOnly={locked} placeholder="e.g. L-2609-001" maxLength={30} {...register(name("lot"))} />
          </Field>
          <Field label="Location">
            <ReadonlyBox compact value={line.locationId} placeholder="From stock only" />
          </Field>
        </Section>

        <Section title="Stone">
          <Field label="Stone Code" className="col-span-2">
            {select("stoneCode", m.stoneCodes, { onValueChange: onStoneCodeChange })}
          </Field>
          <Field label="Stone">{select("stone", m.stones)}</Field>
          <Field label="Shape">{select("shape", m.shapes)}</Field>
          <Field label="Size">{select("size", m.sizes)}</Field>
        </Section>

        <Section title="Stone Quality">
          <Field label="Color">{select("color", m.colors)}</Field>
          <Field label="Clarity">{select("clarity", m.clarities)}</Field>
          <Field label="Cutting">{select("cutting", m.cuttings)}</Field>
          <Field label="Quality">{select("quality", m.qualities)}</Field>
        </Section>

        <Section title="Certificate">
          <Field label="Cer Type">{select("cerType", m.cerTypes)}</Field>
          <Field label="Cer No.">
            <TextInput compact readOnly={locked} maxLength={40} {...register(name("cerNo"))} />
          </Field>
        </Section>

        {/* ราคาแก้ได้แม้มาจาก stock; จำนวน/น้ำหนักล็อกตาม stock */}
        <Section title="Quantity & Price">
          <Field label="PCS">
            <NumberInput compact decimals={0} placeholder="0" readOnly={fromStock} {...register(name("pcs"))} />
          </Field>
          <Field label="Weight (ct)">
            <NumberInput compact decimals={3} placeholder="0.00" readOnly={fromStock} {...register(name("weightCt"))} />
          </Field>
          <Field label="Price Unit">
            <FormSelect<QuotationFormValues> compact name={name("priceUnit")} options={PRICE_UNITS} />
          </Field>
          <Field label="Sale Price">
            <NumberInput compact placeholder="0.00" {...register(name("unitPrice"))} />
          </Field>
          <div className="col-span-2 flex items-center justify-between rounded-lg bg-[#F6F7F8] px-4 py-3 text-sm">
            <span className="text-[#6B7480]">Amount</span>
            <span className="font-medium">{formatMoney(lineAmount(line))}</span>
          </div>
        </Section>

        <Section title="Item Note">
          <Field label="Note" className="col-span-2">
            <TextInput compact maxLength={200} {...register(name("itemNote"))} />
          </Field>
        </Section>
      </fieldset>

      <footer className="flex items-center justify-between gap-2 border-t border-[#E3E6EA] px-5 py-4">
        <Button variant="danger-outline" onClick={onRemove} disabled={readOnly}>
          Remove row
        </Button>
        <div className="flex gap-2">
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" onClick={onNextRow} disabled={readOnly && index >= total - 1}>
            Next row
          </Button>
        </div>
      </footer>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-[#EEF0F2] py-4 last:border-b-0">
      <h3 className="mb-4 text-sm font-medium text-[#1C252E]">{title}</h3>
      <div className="grid grid-cols-2 gap-x-3 gap-y-5">{children}</div>
    </div>
  );
}
