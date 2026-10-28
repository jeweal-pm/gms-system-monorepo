"use client";

import { ChevronDown, ChevronUp, Lock, X } from "lucide-react";
import type { ReactNode } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { lineGross } from "../../lib/calculate";
import { CER_TYPES, toOptions, type Option } from "../../lib/options";
import { ATTRIBUTE_KEYS, rebuildStoneCode } from "../../lib/stone-code";
import { DiscountPair } from "../DiscountPair";
import { useDocumentKind } from "../../document-kind";
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
  const kind = useDocumentKind();
  const quotationStone = useOptions()?.stone;
  const stone = kind.stone ?? quotationStone;
  if (!line) return null;

  const fromStock = line.source === "STOCK";
  const locked = readOnly || fromStock;
  const name = <K extends keyof typeof line>(key: K) => `lines.${index}.${key}` as const;

  const set = (key: keyof typeof line, value: unknown) => setValue(`lines.${index}.${key}` as never, value as never, { shouldDirty: true });
  const masterByCode = (code: string) => stone?.codes.find((x) => x.code.toUpperCase() === code.trim().toUpperCase());

  // Choosing a master Stone Code fills the stone attributes (text snapshot, SA-QT-07).
  const applyMasterCode = (code: NonNullable<typeof stone>["codes"][number]) => {
    set("stoneCodeId", code.id);
    set("stoneCode", code.code);
    set("stonePartOrder", code.partOrder);
    for (const key of ATTRIBUTE_KEYS) set(key, code[key]);
  };

  // Owner 2026-10-27: the Stone Code can be typed; a master code that matches is linked, anything else
  // stays a quotation-only code (the stone master is never changed).
  const onStoneCodeTyped = (text: string) => {
    const match = masterByCode(text);
    if (match) return applyMasterCode(match);
    set("stoneCode", text);
    set("stoneCodeId", "");
  };

  // Owner 2026-10-27: changing a part rebuilds the Stone Code from the parts' codes, in the chosen master
  // code's part order (default order otherwise); it links to a master code only when one matches.
  const onPartChange = (key: (typeof ATTRIBUTE_KEYS)[number], value: string) => {
    if (!kind.stoneCode) return;
    const lists = { stone: stone?.stones, shape: stone?.shapes, size: stone?.sizes, color: stone?.colors, clarity: stone?.clarities, cutting: stone?.cuttings, quality: stone?.qualities };
    const names = { ...pick(line, ATTRIBUTE_KEYS), [key]: value };
    const { code: built, complete } = rebuildStoneCode(names, lists, line.stonePartOrder);
    if (!built) return;
    // Link to a master code only when every chosen part was found (a skipped part could match another code).
    const match = complete ? masterByCode(built) : undefined;
    set("stoneCode", built);
    set("stoneCodeId", match?.id ?? "");
  };

  /** Active choices, plus the saved value so an old/inactive one still shows. */
  const withCurrent = (options: Option[], current: string) =>
    current && !options.some((option) => option.value === current) ? [{ value: current, label: current }, ...options] : options;
  const datalistId = `stone-codes-${index}`;

  const select = (key: (typeof ATTRIBUTE_KEYS)[number], items: readonly { name: string }[] | undefined) => (
    <FormSelect<QuotationFormValues>
      compact
      disabled={locked}
      name={name(key)}
      options={withCurrent(toOptions((items ?? []).map((item) => item.name)), String(line[key] ?? ""))}
      onValueChange={(value) => onPartChange(key, value)}
    />
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
          {!isFilledLine(line) ? "New item" : kind.stoneCode ? line.stoneCode || line.stockId || "Item" : line.stockId ? `Stock ID ${line.stockId}` : "Item"}
          {fromStock && (
            <span className="inline-flex items-center gap-1 rounded bg-[#EEF0F2] px-2 py-0.5 text-xs font-normal text-[#6B7480]">
              <Lock className="size-3" /> From stock
            </span>
          )}
        </h2>
      </header>

      <fieldset disabled={readOnly} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-5 py-2">
        <Section title="Info">
          {/* Quotation: Stock ID / Location come from From Stock only. Memo Receive (owner 2026-10-28): the
              Stock ID is a running number assigned on save and the location is chosen from a list. */}
          {kind.stockId === "auto" ? (
            <div>
              <Field label="Stock ID">
                <ReadonlyBox compact value={line.stockId} placeholder="Auto" />
              </Field>
              {!line.stockId && <p className="mt-1 pl-3 text-xs text-[#6B7480]">Assigned when you save</p>}
            </div>
          ) : (
            <Field label="Stock ID">
              <ReadonlyBox compact value={line.stockId} placeholder="From stock only" />
            </Field>
          )}
          <Field label="Lot">
            <TextInput compact readOnly={locked} placeholder="e.g. L-2609-001" maxLength={30} {...register(name("lot"))} />
          </Field>
          <Field label="Location">
            {kind.locations ? (
              <FormSelect<QuotationFormValues> compact disabled={locked} name={name("locationId")} options={withCurrent(kind.locations, line.locationId)} />
            ) : (
              <ReadonlyBox compact value={line.locationId} placeholder="From stock only" />
            )}
          </Field>
        </Section>

        <Section title="Stone">
          {kind.stoneCode && <Field label="Stone Code" className="col-span-2">
            <TextInput
              compact
              list={datalistId}
              readOnly={locked}
              maxLength={60}
              placeholder="Choose or type a stone code"
              value={line.stoneCode}
              onChange={(event) => onStoneCodeTyped(event.target.value.toUpperCase())}
            />
            <datalist id={datalistId}>
              {(stone?.codes ?? []).map((code) => <option key={code.id} value={code.code} />)}
            </datalist>
          </Field>}
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
            <NumberInput compact placeholder="0.00" suffix={currency || undefined} {...register(name("unitPrice"))} />
          </Field>
          {/* Owner 2026-10-27: typing either one fills the other; the Amount shows in the table, not here. */}
          <DiscountPair
            compact
            type={line.discountType}
            value={line.discountValue}
            base={lineGross(line)}
            currency={currency}
            disabled={readOnly}
            percentError={lineErrors?.discountValue?.message}
            onChange={(type, value) => {
              set("discountType", type);
              set("discountValue", value);
            }}
          />
        </Section>

        <Section title={`Photos ${line.photos.length} / ${MAX_LINE_PHOTOS}`}>
          <div className="col-span-2">
            <LinePhotosField index={index} readOnly={readOnly} />
          </div>
        </Section>

        <Section title={kind.itemNote.section}>
          <Field label="Note" className="col-span-2">
            <TextInput compact maxLength={kind.itemNote.max} placeholder={kind.itemNote.placeholder} {...register(name("itemNote"))} />
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

function pick<T, K extends keyof T>(source: T, keys: readonly K[]): Pick<T, K> {
  return Object.fromEntries(keys.map((key) => [key, source[key]])) as Pick<T, K>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-[#EEF0F2] py-4 last:border-b-0">
      <h3 className="mb-4 text-sm font-medium text-[#1C252E]">{title}</h3>
      <div className="grid grid-cols-2 gap-x-3 gap-y-5">{children}</div>
    </div>
  );
}
