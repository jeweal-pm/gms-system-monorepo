"use client";

import { ImagePlus, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import { EditorSection, ItemEditorShell } from "@/features/quotation/components/items/ItemEditorPanel";
import { Field, NumberInput, ReadonlyBox, SelectMenu, TextInput, type Option } from "@/features/quotation/components/ui";
import { toFixed } from "@/features/quotation/lib/decimal";
import { CER_TYPES } from "@/features/quotation/lib/options";
import { loadPhotoUrl, PhotoUploadError, uploadLoadPhoto } from "../api";
import { ITEM_NOTE_MAX, LOT_MAX, PHOTO_MAX, rowCost, unitLabel, UNIT_COST_PLACES, type LoadFormValues, type LoadRowValues } from "../form";
import type { LoadOptions, PurchaseLineRef, StoneAttrs } from "../types";
import { rowLocationOptions } from "./load-table";

const withCurrent = (names: readonly string[], current: string): Option[] => {
  const options = names.map((name) => ({ value: name, label: name }));
  return current && !names.includes(current) ? [{ value: current, label: current }, ...options] : options;
};

type StoneList = "stones" | "shapes" | "sizes" | "colors" | "clarities" | "cuttings" | "qualities";
type StonePart = "stone" | "shape" | "size" | "color" | "clarity" | "cutting" | "quality";
const PART_FIELDS: Record<StonePart, { label: string; list: StoneList }> = {
  stone: { label: "Stone", list: "stones" },
  shape: { label: "Shape", list: "shapes" },
  size: { label: "Size", list: "sizes" },
  color: { label: "Color", list: "colors" },
  clarity: { label: "Clarity", list: "clarities" },
  cutting: { label: "Cutting", list: "cuttings" },
  quality: { label: "Quality", list: "qualities" },
};

/**
 * L-09 row panel "More" (FE-LS-008, M-01…M-12), owner 2026-11-24: the Quotation row editor's frame and sections, docked
 * beside the Item card (ItemEditorDock). Info (Stock ID, Lot, Location *), Stone, Stone Quality, Certificate, Quantity &
 * Price (Price = read-only PU cost, Stock Price * and Sale Price * start empty, owner Q-LS-13; Pcs / Weight locked in
 * Merge), ≤ 5 photos and the note. Remove row / Close / Next row. Parcel is not shown (owner 2026-11-24).
 */
export function LoadRowPanel({ row, index, total, values, options, currency, readOnly, errors, onChange, onPrev, onNext, onRemove, onClose }: {
  row: LoadRowValues;
  index: number;
  total: number;
  values: Pick<LoadFormValues, "mode" | "sources">;
  options: LoadOptions | undefined;
  currency: string;
  readOnly: boolean;
  errors: Partial<Record<string, string>>;
  onChange: (patch: Partial<LoadRowValues>) => void;
  onPrev: () => void;
  onNext: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const nf = useNumberFormat();
  const refs = new Map<string, PurchaseLineRef>(values.sources.map((ref) => [ref.purchaseLineId, ref]));
  const cost = rowCost(row, values.mode, refs);
  const merge = values.mode === "MERGE";
  const stone = options?.stone;
  const setAttr = (field: keyof StoneAttrs, value: string) => onChange({ attrs: { ...row.attrs, [field]: value } });
  const codeOptions: Option[] = (stone?.codes ?? []).map((code) => ({ value: code.id, label: code.code }));
  if (row.attrs.stoneCodeId && !codeOptions.some((option) => option.value === row.attrs.stoneCodeId)) codeOptions.unshift({ value: row.attrs.stoneCodeId, label: row.attrs.stoneCode });
  const pickCode = (id: string) => {
    const code = stone?.codes.find((candidate) => candidate.id === id);
    if (!code) return;
    onChange({ attrs: { ...row.attrs, stoneCodeId: code.id, stoneCode: code.code, stone: code.stone, shape: code.shape, size: code.size, color: code.color, clarity: code.clarity, cutting: code.cutting, quality: code.quality } });
  };
  const part = (field: StonePart) => {
    const { label, list } = PART_FIELDS[field];
    const current = String(row.attrs[field] ?? "");
    return (
      <Field label={label}>
        <SelectMenu compact portal value={current} options={withCurrent((stone?.[list] ?? []).map((item) => item.name), current)} onChange={(value) => setAttr(field, value)} />
      </Field>
    );
  };

  return (
    <ItemEditorShell
      index={index}
      total={total}
      readOnly={readOnly}
      title={row.attrs.stoneCode || (row.stockId ? `Stock ID ${row.stockId}` : "Load row")}
      nextRowDisabled={index >= total - 1}
      onPrev={onPrev}
      onNext={onNext}
      onNextRow={onNext}
      onRemove={onRemove}
      onClose={onClose}
    >
      <div key={row.key} data-editor-row={index} className="space-y-1">
        {merge && <p className="pt-3 text-xs text-[#6B7480]">Merged row · pcs and weight come from the PU lines</p>}
        {/* FE-LS-018 (source 07): Stock ID (Auto until issued), Lot (optional, ≤ 40, pre-filled from the PU line), Location. */}
        <EditorSection title="Info">
          <div>
            <Field label="Stock ID"><ReadonlyBox compact value={row.stockId} placeholder="Auto" /></Field>
            {!row.stockId && <p className="mt-1 pl-3 text-xs text-[#6B7480]">Assigned when you save</p>}
          </div>
          <Field label="Lot" error={errors.lot}><TextInput compact aria-label="Lot" maxLength={LOT_MAX} value={row.attrs.lot} onChange={(event) => setAttr("lot", event.target.value)} /></Field>
          <Field label="Location" required error={errors.location}>
            <SelectMenu compact portal value={row.location} placeholder="Select location" options={rowLocationOptions(options?.locations ?? [], row.location)} onChange={(location) => onChange({ location })} />
          </Field>
        </EditorSection>
        <EditorSection title="Stone">
          <Field label="Stone Code" className="col-span-2">
            <SelectMenu compact portal value={row.attrs.stoneCodeId ?? ""} placeholder={row.attrs.stoneCode || "Select"} options={codeOptions} onChange={pickCode} />
          </Field>
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
            <TextInput compact maxLength={60} value={row.attrs.cerNo} onChange={(event) => setAttr("cerNo", event.target.value)} />
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
            <RowPhotos photoIds={row.photoIds} readOnly={readOnly} onChange={(photoIds) => onChange({ photoIds })} hideTitle />
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

/** M-12 / L-02: ≤ 5 photos, upload one at a time (JPEG/PNG ≤ 5 MB), remove keeps the file (ADR-0030). */
export function RowPhotos({ photoIds, readOnly, onChange, upload = uploadLoadPhoto, hideTitle, photoUrl = loadPhotoUrl }: {
  photoIds: readonly string[];
  readOnly: boolean;
  /** The row panel shows the count in its section title instead. */
  hideTitle?: boolean;
  onChange: (photoIds: string[]) => void;
  upload?: (file: File) => Promise<string>;
  /** Photo read link (merge-split reuses these tiles with its own photo route). */
  photoUrl?: (id: string) => string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const id = await upload(file);
      onChange([...photoIds, id].slice(0, PHOTO_MAX));
    } catch (caught) {
      setError(caught instanceof PhotoUploadError ? caught.message : "Couldn't upload the photo. Try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  let addTile: ReactNode = null;
  if (!readOnly && photoIds.length < PHOTO_MAX) {
    addTile = (
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className="flex size-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[#D5DADF] text-xs text-[#6B7480] hover:bg-[#F6F7F8]">
        <ImagePlus className="size-5" /> {busy ? "Uploading…" : "Add photo"}
      </button>
    );
  }
  return (
    <div>
      {!hideTitle && <p className="mb-2 text-sm font-medium text-[#1C252E]">Photos <span className="font-normal text-[#6B7480]">({photoIds.length} / {PHOTO_MAX})</span></p>}
      <div className="flex flex-wrap gap-2">
        {photoIds.map((id, position) => (
          <div key={id} className="relative size-20 overflow-hidden rounded-lg border border-[#E3E6EA] bg-[#F9F9F9]">
            {/* eslint-disable-next-line @next/next/no-img-element -- same-origin protected photo route, resized at upload */}
            <img src={photoUrl(id)} alt={`Photo ${position + 1}`} className="size-full object-cover" />
            {!readOnly && (
              <button type="button" aria-label={`Remove photo ${position + 1}`} onClick={() => onChange(photoIds.filter((photo) => photo !== id))} className="absolute top-1 right-1 rounded-full bg-white/90 p-0.5 text-[#1C252E] shadow">
                <X className="size-3" />
              </button>
            )}
          </div>
        ))}
        {addTile}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png" className="hidden" aria-label="Add a photo" onChange={(event) => void onFile(event.target.files?.[0])} />
      {error && <p role="alert" className="mt-2 text-xs text-[#E5484D]">{error}</p>}
    </div>
  );
}

/** L-02 photo box beside the Load table: the selected row's first photo, count and note. */
export function LoadPhotoBox({ row, index, photoUrl = loadPhotoUrl }: { row: Pick<LoadRowValues, "photoIds" | "itemNote"> | null; index: number | null; photoUrl?: (id: string) => string }) {
  const first = row?.photoIds[0];
  return (
    <div className="hidden w-[200px] shrink-0 rounded-xl border border-[#E3E6EA] p-2 lg:block">
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-[#F9F9F9] text-center text-xs text-[#6B7480]">
        {first ? (
          // eslint-disable-next-line @next/next/no-img-element -- same-origin protected photo route
          <img src={photoUrl(first)} alt={`Row ${(index ?? 0) + 1} photo`} className="size-full object-cover" />
        ) : (
          <span>{row ? `Row ${(index ?? 0) + 1} · no photos` : `Add up to ${PHOTO_MAX} photos`}</span>
        )}
      </div>
      {row && row.photoIds.length > 1 && <p className="mt-1 text-xs text-[#6B7480]">{row.photoIds.length} photos</p>}
      <p className="mt-3 text-xs font-medium text-[#1C252E]">Item Note</p>
      <p className="mt-1 text-xs break-words text-[#6B7480]">{row?.itemNote || "-"}</p>
    </div>
  );
}
