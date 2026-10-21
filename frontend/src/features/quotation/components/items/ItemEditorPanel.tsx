"use client";

import { ChevronDown, ChevronUp, Lock, X } from "lucide-react";
import type { ReactNode } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { lineAmount } from "../../lib/calculate";
import { formatMoney } from "../../lib/format";
import * as m from "../../mock/masters";
import { isFilledLine, type QuotationFormValues } from "../../schema";
import { Button, Field, IconButton, SelectInput, TextInput } from "../ui";

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
          <Field label="Stock ID">
            <TextInput compact readOnly={locked} {...register(name("stockId"))} />
          </Field>
          <Field label="Lot">
            <TextInput compact readOnly={locked} placeholder="e.g. L-2609-001" {...register(name("lot"))} />
          </Field>
          <Field label="Location">
            <SelectInput compact disabled={locked} options={m.locations} {...register(name("locationId"))} />
          </Field>
        </Section>

        <Section title="Stone">
          <Field label="Stone Code" className="col-span-2">
            <SelectInput
              compact
              disabled={locked}
              options={m.stoneCodes}
              {...register(name("stoneCode"), { onChange: (e) => onStoneCodeChange(e.target.value) })}
            />
          </Field>
          <Field label="Stone">
            <SelectInput compact disabled={locked} options={m.stones} {...register(name("stone"))} />
          </Field>
          <Field label="Shape">
            <SelectInput compact disabled={locked} options={m.shapes} {...register(name("shape"))} />
          </Field>
          <Field label="Size">
            <SelectInput compact disabled={locked} options={m.sizes} {...register(name("size"))} />
          </Field>
        </Section>

        <Section title="Stone Quality">
          <Field label="Color">
            <SelectInput compact disabled={locked} options={m.colors} {...register(name("color"))} />
          </Field>
          <Field label="Clarity">
            <SelectInput compact disabled={locked} options={m.clarities} {...register(name("clarity"))} />
          </Field>
          <Field label="Cutting">
            <SelectInput compact disabled={locked} options={m.cuttings} {...register(name("cutting"))} />
          </Field>
          <Field label="Quality">
            <SelectInput compact disabled={locked} options={m.qualities} {...register(name("quality"))} />
          </Field>
        </Section>

        <Section title="Certificate">
          <Field label="Cer Type">
            <SelectInput compact disabled={locked} options={m.cerTypes} {...register(name("cerType"))} />
          </Field>
          <Field label="Cer No.">
            <TextInput compact readOnly={locked} {...register(name("cerNo"))} />
          </Field>
        </Section>

        {/* ราคา/จำนวน แก้ได้แม้มาจาก stock */}
        <Section title="Quantity & Price">
          <Field label="PCS">
            <TextInput compact inputMode="numeric" readOnly={fromStock} className="text-right" {...register(name("pcs"))} />
          </Field>
          <Field label="Weight (ct)">
            <TextInput compact inputMode="decimal" readOnly={fromStock} className="text-right" {...register(name("weightCt"))} />
          </Field>
          <Field label="Price Unit">
            <SelectInput
              compact
              placeholder="Per"
              options={[
                { value: "PER_CT", label: "per cts" },
                { value: "PER_PCS", label: "per pcs" },
              ]}
              {...register(name("priceUnit"))}
            />
          </Field>
          <Field label="Sale Price">
            <TextInput compact inputMode="decimal" className="text-right" {...register(name("unitPrice"))} />
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
