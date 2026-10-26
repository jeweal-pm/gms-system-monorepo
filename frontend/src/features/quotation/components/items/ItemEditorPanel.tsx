"use client";

import { ChevronDown, ChevronUp, Lock, X } from "lucide-react";
import type { ReactNode } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { CER_TYPES, toOptions, type Option } from "../../lib/options";
import { useOptions } from "../../options-context";
import { isFilledLine, MAX_LINE_PHOTOS, type QuotationFormValues } from "../../schema";
import { LinePhotosField } from "./LinePhotosField";
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
  const { register, setValue, control, formState } = useFormContext<QuotationFormValues>();
  const line = useWatch({ control, name: `lines.${index}` });
  const currency = useWatch({ control, name: "currency" });
  const lineErrors = formState.errors.lines?.[index];
  const stone = useOptions()?.stone;
  if (!line) return null;

  const fromStock = line.source === "STOCK";
  const locked = readOnly || fromStock;
  const name = <K extends keyof typeof line>(key: K) => `lines.${index}.${key}` as const;

  // Choosing a Stone Code fills the stone attributes from the stone master (text snapshot, SA-QT-07).
  const onStoneCodeChange = (id: string) => {
    const code = stone?.codes.find((x) => x.id === id);
    if (!code) return;
    setValue(`lines.${index}.stoneCode`, code.code, { shouldDirty: true });
    for (const key of ["stone", "shape", "size", "color", "clarity", "cutting", "quality"] as const) {
      setValue(`lines.${index}.${key}`, code[key], { shouldDirty: true });
    }
  };

  /** Active choices, plus the saved value so an old/inactive one still shows. */
  const withCurrent = (options: Option[], current: string) =>
    current && !options.some((option) => option.value === current) ? [{ value: current, label: current }, ...options] : options;
  const stoneCodeOptions = (stone?.codes ?? []).map((code) => ({ value: code.id, label: code.code }));
  const savedStoneCode = line.stoneCodeId && !stoneCodeOptions.some((option) => option.value === line.stoneCodeId)
    ? [{ value: line.stoneCodeId, label: line.stoneCode || "(inactive)" }]
    : [];

  const select = (key: Parameters<typeof name>[0], values: readonly string[] | undefined) => (
    <FormSelect<QuotationFormValues> compact disabled={locked} name={name(key)} options={withCurrent(toOptions(values ?? []), String(line[key] ?? ""))} />
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
            <FormSelect<QuotationFormValues> compact disabled={locked} name={name("stoneCodeId")} options={[...savedStoneCode, ...stoneCodeOptions]} onValueChange={onStoneCodeChange} />
          </Field>
          <Field label="Stone">{select("stone", stone?.stones)}</Field>
          <Field label="Shape">{select("shape", stone?.shapes)}</Field>
          <Field label="Size">{select("size", stone?.sizes)}</Field>
        </Section>

        <Section title="Stone Quality">
          <Field label="Color">{select("color", stone?.colors)}</Field>
          <Field label="Clarity">{select("clarity", stone?.clarities)}</Field>
          <Field label="Cutting">{select("cutting", stone?.cuttings)}</Field>
          <Field label="Quality">{select("quality", stone?.qualities)}</Field>
        </Section>

        <Section title="Certificate">
          <Field label="Cer Type">
            <FormSelect<QuotationFormValues> compact disabled={locked} name={name("cerType")} options={withCurrent(CER_TYPES, line.cerType)} />
          </Field>
          <Field label="Cer No.">
            <TextInput compact readOnly={locked} maxLength={60} {...register(name("cerNo"))} />
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
          {/* Owner 2026-10-26: one of the two only; the Amount shows in the table, not here. */}
          <Field label="Discount (%)" error={lineErrors?.discountPercent?.message}>
            <NumberInput compact placeholder="0 %" readOnly={line.discountAmount !== ""} {...register(name("discountPercent"))} />
          </Field>
          <Field label={`Discount Amt${currency ? ` (${currency})` : ""}`}>
            <NumberInput compact placeholder="0" readOnly={line.discountPercent !== ""} {...register(name("discountAmount"))} />
          </Field>
          {(line.discountPercent !== "" || line.discountAmount !== "") && (
            <p className="col-span-2 -mt-3 text-xs text-[#6B7480]">
              Use either a percent or an amount. Clear one to enter the other.
            </p>
          )}
        </Section>

        <Section title={`Photos ${line.photos.length} / ${MAX_LINE_PHOTOS}`}>
          <div className="col-span-2">
            <LinePhotosField index={index} readOnly={readOnly} />
          </div>
        </Section>

        <Section title="Item Note">
          <Field label="Note" className="col-span-2">
            <TextInput compact maxLength={500} {...register(name("itemNote"))} />
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
