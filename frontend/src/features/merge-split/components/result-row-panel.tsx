"use client";

import { useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import { EditorSection, ItemEditorShell } from "@/features/quotation/components/items/ItemEditorPanel";
import { Field, NumberInput, ReadonlyBox, SelectMenu, TextInput, type Option } from "@/features/quotation/components/ui";
import { toFixed } from "@/features/quotation/lib/decimal";
import { CER_TYPES } from "@/features/quotation/lib/options";
import { LoadPhotoBox, RowPhotos } from "@/features/load-to-stock/components/load-row-panel";
import { rowLocationOptions } from "@/features/load-to-stock/components/load-table";
import { mergeSplitPhotoUrl, uploadMergeSplitPhoto } from "../api";
import { ITEM_NOTE_MAX, LOT_MAX, PHOTO_MAX, rowCost, unitLabel, UNIT_COST_PLACES, type MsFormValues, type MsRowValues } from "../form";
import type { MsAttrs } from "../types";

const withCurrent = (names: readonly string[], current: string): Option[] => {
  const options = names.map((name) => ({ value: name, label: name }));
  return current && !names.includes(current) ? [{ value: current, label: current }, ...options] : options;
};

type TextPart = "stone" | "shape" | "size" | "color" | "clarity" | "cutting" | "quality";
const PART_LABEL: Record<TextPart, string> = { stone: "Stone", shape: "Shape", size: "Size", color: "Color", clarity: "Clarity", cutting: "Cutting", quality: "Quality" };

/**
 * R-07 row panel "More" (FE-MS-005, M-01…M-11) on the Quotation `ItemEditorShell`, as Load's. Stock ID "Auto" until
 * issued, Lot (≤ 40), Location *, stone details and grading prefilled from the source (Q-MS-06, editable; the SA rev 1
 * options carry no Stone Master lists, so they are text fields and the Stone Code stays the source's), certificate,
 * Pcs / Weight (locked in Merge), read-only cost, Stock Price * / Sale Price * (prefilled, Q-MS-10), ≤ 5 photos, note.
 */
export function MergeSplitRowPanel({ row, index, total, values, locations, currency, readOnly, errors, onChange, onPrev, onNext, onRemove, onClose }: {
  row: MsRowValues;
  index: number;
  total: number;
  values: Pick<MsFormValues, "mode" | "rows" | "sources">;
  locations: readonly string[];
  currency: string;
  readOnly: boolean;
  errors: Partial<Record<string, string>>;
  onChange: (patch: Partial<MsRowValues>) => void;
  onPrev: () => void;
  onNext: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const nf = useNumberFormat();
  const cost = rowCost(values, index);
  const merge = values.mode === "MERGE";
  const setAttr = (field: keyof MsAttrs, value: string) => onChange({ attrs: { ...row.attrs, [field]: value } });
  const part = (field: TextPart) => (
    <Field label={PART_LABEL[field]}>
      <TextInput compact aria-label={PART_LABEL[field]} maxLength={60} value={row.attrs[field]} onChange={(event) => setAttr(field, event.target.value)} />
    </Field>
  );

  return (
    <ItemEditorShell
      index={index}
      total={total}
      readOnly={readOnly}
      title={row.attrs.stoneCode || (row.stockId ? `Stock ID ${row.stockId}` : "Result row")}
      nextRowDisabled={index >= total - 1}
      onPrev={onPrev}
      onNext={onNext}
      onNextRow={onNext}
      onRemove={onRemove}
      onClose={onClose}
    >
      <div key={row.key} data-editor-row={index} className="space-y-1">
        {merge && <p className="pt-3 text-xs text-[#6B7480]">Merged row · pcs and weight are the sum of the picked stocks</p>}
        <EditorSection title="Info">
          <div>
            <Field label="Stock ID"><ReadonlyBox compact value={row.stockId} placeholder="Auto" /></Field>
            {!row.stockId && <p className="mt-1 pl-3 text-xs text-[#6B7480]">Assigned when the document is applied</p>}
          </div>
          <Field label="Lot" error={errors.lot}><TextInput compact aria-label="Lot" maxLength={LOT_MAX} value={row.lot} onChange={(event) => onChange({ lot: event.target.value })} /></Field>
          <Field label="Location" required error={errors.location}>
            <SelectMenu compact portal value={row.location} placeholder="Select location" options={rowLocationOptions(locations, row.location)} onChange={(location) => onChange({ location })} />
          </Field>
        </EditorSection>
        <EditorSection title="Stone">
          <Field label="Stone Code" className="col-span-2"><ReadonlyBox compact value={row.attrs.stoneCode} placeholder="—" /></Field>
          {part("stone")}
          {part("shape")}
          {part("size")}
        </EditorSection>
        <EditorSection title="Stone Quality">
          {part("color")}
          {part("clarity")}
          {part("cutting")}
          {part("quality")}
        </EditorSection>
        <EditorSection title="Certificate">
          <Field label="Cer Type">
            <SelectMenu compact portal value={row.attrs.cerType} options={withCurrent(CER_TYPES.map((option) => option.value), row.attrs.cerType)} onChange={(value) => setAttr("cerType", value)} />
          </Field>
          <Field label="Cer No.">
            <TextInput compact aria-label="Cer No." maxLength={60} value={row.attrs.cerNo} onChange={(event) => setAttr("cerNo", event.target.value)} />
          </Field>
        </EditorSection>
        <EditorSection title="Quantity & Price">
          <Field label="PCS" required error={errors.pcs}>
            <NumberInput compact decimals={0} value={row.pcs} readOnly={merge} onChange={(event) => onChange({ pcs: event.target.value })} />
          </Field>
          <Field label="Weight (ct)" required error={errors.weightCt}>
            <NumberInput compact decimals={nf.weightInputDecimals} value={row.weightCt} readOnly={merge} onChange={(event) => onChange({ weightCt: event.target.value })} />
          </Field>
          <Field label="Price Unit"><ReadonlyBox compact value={unitLabel(cost.unit)} /></Field>
          <Field label="Price"><ReadonlyBox compact value={`${nf.money(toFixed(cost.unitCost, UNIT_COST_PLACES))} ${currency}`} /></Field>
          <Field label="Stock Price" required error={errors.stockPrice}>
            <NumberInput compact decimals={2} suffix={currency} value={row.stockPrice} placeholder="0.00" onChange={(event) => onChange({ stockPrice: event.target.value })} />
          </Field>
          <Field label="Sale Price" required error={errors.salePrice}>
            <NumberInput compact decimals={2} suffix={currency} value={row.salePrice} placeholder="0.00" onChange={(event) => onChange({ salePrice: event.target.value })} />
          </Field>
        </EditorSection>
        <EditorSection title={`Photos ${row.photoIds.length} / ${PHOTO_MAX}`}>
          <div className="col-span-2">
            <RowPhotos photoIds={row.photoIds} readOnly={readOnly} onChange={(photoIds) => onChange({ photoIds })} upload={(file) => uploadMergeSplitPhoto(file)} photoUrl={mergeSplitPhotoUrl} hideTitle />
          </div>
        </EditorSection>
        <EditorSection title="Item Note">
          <label className="col-span-2 block text-sm">
            <span className="sr-only">Note</span>
            <textarea
              rows={3}
              maxLength={ITEM_NOTE_MAX}
              value={row.itemNote}
              onChange={(event) => onChange({ itemNote: event.target.value })}
              className="w-full resize-none rounded-lg border border-[#E3E6EA] px-3 py-2 text-sm outline-none focus:border-[#0E5E63] disabled:bg-[#F6F7F8]"
            />
            <span className="block text-right text-xs text-[#6B7480]">{row.itemNote.length} / {ITEM_NOTE_MAX}</span>
          </label>
        </EditorSection>
      </div>
    </ItemEditorShell>
  );
}

/** R-02 photo card: the selected result row's first photo and note. */
export function MergeSplitPhotoBox({ row, index }: { row: MsRowValues | null; index: number | null }) {
  return <LoadPhotoBox row={row} index={index} photoUrl={mergeSplitPhotoUrl} />;
}
