"use client";

import { ChevronDown, ChevronUp, Lock, X } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { lineGross } from "../../lib/calculate";
import { dec, div, mul, toFixed, ZERO } from "../../lib/decimal";
import { CER_TYPES, toOptions, type Option } from "../../lib/options";
import { ATTRIBUTE_KEYS, rebuildStoneCode } from "../../lib/stone-code";
import { DiscountPair } from "../DiscountPair";
import { useCountBump } from "./photo-motion";
import { DEFAULT_PRICE_TITLE, useDocumentKind } from "../../document-kind";
import { useLineOptions, useRefreshLineOptions } from "../../options-context";
import { isFilledLine, MAX_LINE_PHOTOS, type QuotationFormValues } from "../../schema";
import { useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import { LinePhotosField } from "./LinePhotosField";
import { AutocompleteInput, Button, Field, FormSelect, IconButton, NumberInput, ReadonlyBox, TextInput } from "../ui";

const PRICE_UNITS = [
  { value: "PER_CT", label: "per cts" },
  { value: "PER_PCS", label: "per pcs" },
];

/**
 * Purchase rev 3: the value a stock row's Pcs / Weight snaps back to when the field is left, or null when the typed
 * value is already within min…cap (an empty field counts as 0). Rows without a minimum never snap.
 */
export function stockQuantityBound(text: string, minText: string | undefined, capText: string | undefined): string | null {
  if (!minText) return null;
  const value = dec(text);
  if (value < dec(minText)) return minText;
  if (capText && value > dec(capText)) return capText;
  return null;
}

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
  const lineStone = useLineOptions()?.stone;
  const stone = kind.stone ?? lineStone;
  const refreshOptions = useRefreshLineOptions();
  // decimal-setup FE-DEC-105: typing is capped at min(places, storage scale); display places come from the setting.
  const nf = useNumberFormat();
  if (!line) return null;

  const fromStock = line.source === "STOCK";
  const locked = readOnly || fromStock;
  // memo-out rev 2: a From Stock row takes part or all of its item, up to the pending it was picked with.
  const stockQuantity = fromStock && Boolean(kind.stockQuantity);
  const stockPending = line as typeof line & { stockPendingPcs?: string; stockPendingWeightCt?: string; stockMinPcs?: string; stockMinWeightCt?: string };
  // Purchase rev 3 (Q-PU-29): a row whose minimum equals its cap is bought whole, so its quantity is fixed; Price stays editable.
  const fixedQuantity = stockQuantity && Boolean(stockPending.stockMinPcs)
    && stockPending.stockMinPcs === stockPending.stockPendingPcs && stockPending.stockMinWeightCt === stockPending.stockPendingWeightCt;
  const quantityReadOnly = readOnly || (fromStock && !stockQuantity) || fixedQuantity;
  const fillWeight = (pcsText: string) => {
    const pendingPcs = dec(stockPending.stockPendingPcs);
    if (!stockQuantity || pendingPcs <= ZERO || pcsText === "") return;
    // All of it → exactly the pending weight; part of it → the typed weight decimals (Decimal Setup), never above the pending weight.
    const full = dec(stockPending.stockPendingWeightCt);
    const pcs = dec(pcsText);
    const weight = div(mul(full, pcs), pendingPcs);
    set("weightCt", pcs === pendingPcs ? toFixed(full, 3) : toFixed(weight > full ? full : weight, nf.weightInputDecimals));
  };
  // Purchase rev 3 (owner 2026-11-06): a row with a minimum (the Sold part) snaps back into min…cap when the field is
  // left, so Pcs and Weight never stay below what is already sold; typing in between keeps the red row error.
  const clampQuantity = (key: "pcs" | "weightCt", text: string) => {
    const minText = key === "pcs" ? stockPending.stockMinPcs : stockPending.stockMinWeightCt;
    const capText = key === "pcs" ? stockPending.stockPendingPcs : stockPending.stockPendingWeightCt;
    if (!stockQuantity || !minText || quantityReadOnly) return;
    const bound = stockQuantityBound(text, minText, capText);
    if (bound === null) return;
    setValue(`lines.${index}.${key}` as never, (key === "pcs" ? toFixed(dec(bound), 0) : toFixed(dec(bound), 3)) as never, { shouldDirty: true, shouldValidate: true });
    if (key === "pcs") fillWeight(bound);
  };
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

  // Owner 2026-10-27 / 2026-11-02: the Stone Code is an autocomplete: type it or pick a master code. A master
  // code that matches is linked, anything else stays a document-only code (the stone master is never changed).
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

  const select = (key: (typeof ATTRIBUTE_KEYS)[number], items: readonly { name: string }[] | undefined) => (
    <FormSelect<QuotationFormValues>
      compact
      disabled={locked}
      name={name(key)}
      options={withCurrent(toOptions((items ?? []).map((item) => item.name)), String(line[key] ?? ""))}
      onValueChange={(value) => onPartChange(key, value)}
      onOpen={refreshOptions}
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
          {/* Quotation: Stock ID / Location come from From Stock only. Memo Receive (rev 3, owner 2026-10-29): the
              server assigns the Stock ID (YY####) on save, and there is no Location field. */}
          {kind.stockId === "auto" ? (
            <div>
              <Field label="Stock ID">
                <ReadonlyBox compact value={line.stockId} placeholder="Auto" />
              </Field>
              {!line.stockId && <p className="mt-1 pl-3 text-xs text-[#6B7480]">Assigned when you save</p>}
            </div>
          ) : kind.stockId === "from-stock" ? (
            <Field label="Stock ID">
              <ReadonlyBox compact value={line.stockId} placeholder={kind.stockIdEmpty ?? "From stock only"} />
            </Field>
          ) : null}
          <Field label="Lot">
            <TextInput compact readOnly={locked} placeholder="e.g. L-2609-001" maxLength={30} {...register(name("lot"))} />
          </Field>
          {kind.location && (
            <Field label="Location">
              {kind.locations === "text" ? (
                <TextInput compact readOnly={locked} placeholder="e.g. Safe A" maxLength={40} {...register(name("locationId"))} />
              ) : kind.locations ? (
                <FormSelect<QuotationFormValues> compact disabled={locked} name={name("locationId")} options={withCurrent(kind.locations, line.locationId)} />
              ) : (
                <ReadonlyBox compact value={line.locationId} placeholder="From stock only" />
              )}
            </Field>
          )}
        </Section>

        <Section title="Stone">
          {kind.stoneCode && <Field label="Stone Code" className="col-span-2">
            <AutocompleteInput
              compact
              readOnly={locked}
              maxLength={60}
              placeholder="Choose or type a stone code"
              value={line.stoneCode}
              options={toOptions((stone?.codes ?? []).map((code) => code.code))}
              onChange={(text) => onStoneCodeTyped(text.toUpperCase())}
              onOpen={refreshOptions}
            />
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
          <Field label="PCS" error={stockQuantity ? lineErrors?.pcs?.message : undefined}>
            <NumberInput
              compact
              decimals={0}
              placeholder="0"
              readOnly={quantityReadOnly}
              {...register(name("pcs"), {
                onChange: (event: { target: { value: string } }) => fillWeight(event.target.value),
                onBlur: (event: { target: { value: string } }) => clampQuantity("pcs", event.target.value),
              })}
            />
          </Field>
          <Field label="Weight (ct)" error={stockQuantity ? lineErrors?.weightCt?.message : undefined}>
            <NumberInput compact decimals={nf.weightInputDecimals} placeholder="0.00" readOnly={quantityReadOnly} {...register(name("weightCt"), { onBlur: (event: { target: { value: string } }) => clampQuantity("weightCt", event.target.value) })} />
          </Field>
          {stockQuantity && (
            <p className="col-span-full -mt-2 text-xs text-[#6B7480]">
              {kind.stockNote?.(line) ?? `Pending ${stockPending.stockPendingPcs || "0"} pcs / ${nf.weight(stockPending.stockPendingWeightCt || "0")} ct`}
            </p>
          )}
          <Field label="Price Unit">
            <FormSelect<QuotationFormValues> compact disabled={readOnly || stockQuantity} name={name("priceUnit")} options={PRICE_UNITS} />
          </Field>
          <Field label={kind.priceTitle ?? DEFAULT_PRICE_TITLE} error={stockQuantity ? lineErrors?.unitPrice?.message : undefined}>
            <NumberInput compact decimals={nf.priceInputDecimals} placeholder="0.00" suffix={currency || undefined} {...register(name("unitPrice"))} />
          </Field>
          {/* Owner 2026-10-27: typing either one fills the other; the Amount shows in the table, not here. */}
          <DiscountPair
            compact
            type={line.discountType}
            value={line.discountValue}
            base={lineGross(line)}
            currency={currency}
            disabled={readOnly || (fromStock && Boolean(kind.lockStockDiscount))}
            percentError={lineErrors?.discountValue?.message}
            onChange={(type, value) => {
              set("discountType", type);
              set("discountValue", value);
            }}
          />
        </Section>

        <Section title={<PhotoCountTitle count={line.photos.length} row={index} />}>
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

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="border-b border-[#EEF0F2] py-4 last:border-b-0">
      <h3 className="mb-4 text-sm font-medium text-[#1C252E]">{title}</h3>
      <div className="grid grid-cols-2 gap-x-3 gap-y-5">{children}</div>
    </div>
  );
}

/** "Photos n / 5"; the number bumps when a photo is added or removed (PhotoGrid sample, owner 2026-11-10). */
function PhotoCountTitle({ count, row }: { count: number; row: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useCountBump(ref, count, row);
  return (
    <>
      Photos{" "}
      <span ref={ref} className="inline-block tabular-nums">
        {count} / {MAX_LINE_PHOTOS}
      </span>
    </>
  );
}
