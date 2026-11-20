import { z } from "zod";
import { add, dec, div, mul, round, toFixed, ZERO, type Dec } from "@/features/quotation/lib/decimal";
import type { LoadMode, LoadOut, PriceUnit, PurchaseLineRef, StoneAttrs } from "./types";

/**
 * load-to-stock FE-LS-001 (UI rev 1 + owner answers 2026-11-16, ADR-0052 D7): the pure form model.
 *
 * - One `mode` per document (owner Q-LS-07). Rows carry their source PU line ids only (no per-row mode or batch).
 *   NONE: one row per PU line. SPLIT: rows grouped by their single source line, "+ Split" adds a child. MERGE: one
 *   row with ≥ 2 sources and their full remaining quantity (owner Q-LS-08), locked.
 * - Cost follows each PU line's price unit (owner Q-LS-12): per ct → weight × unit cost, per pcs → pcs × unit cost;
 *   unit cost = net unit price × the PU's rate (`unitCostBase`, from the server). A row's cost = Σ of its sources; the
 *   merged row's unit is per ct unless every source is per pcs (Q-LS-27); its price = cost ÷ basis.
 * - Merge details and photos come from the source with the highest company-currency amount per piece (Q-LS-27).
 * - Stock Price and Sale Price are required and start empty (owner Q-LS-13); Location is required and starts empty
 *   (owner Q-LS-28, ADR-0053: a Location Master name).
 */

export type LoadRowValues = {
  /** Client key (the saved row id once saved). */
  key: string;
  /** Saved row id; "" for a new row. */
  id: string;
  /** Issued Stock ID; "" shows "Auto" (ADR-0052 D5). */
  stockId: string;
  /** Source PU line ids: NONE / SPLIT exactly 1, MERGE ≥ 2. */
  sources: string[];
  pcs: string;
  weightCt: string;
  location: string;
  parcel: string;
  attrs: StoneAttrs;
  priceUnit: PriceUnit;
  stockPrice: string;
  salePrice: string;
  itemNote: string;
  photoIds: string[];
};

export type LoadFormValues = {
  id?: string;
  docNo?: string;
  version?: number;
  status?: string;
  docDate: string;
  vendorId: string;
  ref: string;
  documentNote: string;
  /** "" until the first pick sets it. */
  mode: LoadMode | "";
  /** Picked PU lines (Item table T-04), in pick order. */
  sources: PurchaseLineRef[];
  rows: LoadRowValues[];
};

export const REF_MAX = 100;
export const NOTE_MAX = 250;
export const ITEM_NOTE_MAX = 500;
export const PARCEL_MAX = 50;
export const LOCATION_MAX = 40;
/** FE-LS-018 (ADR-0052 D23, owner Q-LS-P2-02): Lot is optional, pre-filled from the PU line, up to 40 characters. */
export const LOT_MAX = 40;
export const PHOTO_MAX = 5;
export const ROW_MAX = 200;
export const SOURCE_MAX = 200;
export const WEIGHT_PLACES = 3;
export const MONEY_PLACES = 2;
export const UNIT_COST_PLACES = 4;

export const MODE_LABEL: Record<LoadMode, string> = { NONE: "None", SPLIT: "Split", MERGE: "Merge" };

let keySeq = 0;
export const newRowKey = () => `row-${Date.now().toString(36)}-${(keySeq += 1)}`;

export function emptyLoad(docDate: string): LoadFormValues {
  return { docDate, vendorId: "", ref: "", documentNote: "", mode: "", sources: [], rows: [] };
}

// ---------- cost (owner Q-LS-12) ----------

const isZero = (value: Dec) => value === ZERO;

/** Company-currency cost of loading `pcs` / `weightCt` of one PU line, 2 dp half-up (ADR-0052 D7). */
export function sourceCost(ref: Pick<PurchaseLineRef, "priceUnit" | "unitCostBase">, pcs: number | string, weightCt: string): Dec {
  const basis = ref.priceUnit === "PER_PCS" ? dec(String(pcs)) : dec(weightCt);
  return round(mul(basis, dec(ref.unitCostBase)), MONEY_PLACES);
}

/** The merged row's unit: per ct unless every source is per pcs (Q-LS-27). */
export function mergedUnit(refs: readonly Pick<PurchaseLineRef, "priceUnit">[]): PriceUnit {
  return refs.length > 0 && refs.every((ref) => ref.priceUnit === "PER_PCS") ? "PER_PCS" : "PER_CT";
}

/** Amount per piece of a line's remaining quantity (Q-LS-27 "most expensive line per piece"). */
export function amountPerPiece(ref: Pick<PurchaseLineRef, "remainingAmountBase" | "remainingPcs">): Dec {
  return ref.remainingPcs > 0 ? div(dec(ref.remainingAmountBase), dec(String(ref.remainingPcs))) : ZERO;
}

/** The suggested line of a merge: the highest amount per piece; the first picked wins a tie. */
export function highestPriced<T extends Pick<PurchaseLineRef, "remainingAmountBase" | "remainingPcs">>(refs: readonly T[]): T | undefined {
  let best: T | undefined;
  let bestValue = ZERO;
  for (const ref of refs) {
    const value = amountPerPiece(ref);
    if (!best || value > bestValue) {
      best = ref;
      bestValue = value;
    }
  }
  return best;
}

export type MergeSummary = { pcs: number; weightCt: Dec; cost: Dec; unit: PriceUnit; price: Dec; suggested: PurchaseLineRef | undefined };

/** Σ pcs / weight / cost of the full remaining of every line, the unit, the average price and the suggested line. */
export function mergeSummary(refs: readonly PurchaseLineRef[]): MergeSummary {
  const pcs = refs.reduce((sum, ref) => sum + ref.remainingPcs, 0);
  const weightCt = add(...refs.map((ref) => dec(ref.remainingWeightCt)));
  const cost = add(...refs.map((ref) => sourceCost(ref, ref.remainingPcs, ref.remainingWeightCt)));
  const unit = mergedUnit(refs);
  const basis = unit === "PER_PCS" ? dec(String(pcs)) : weightCt;
  return { pcs, weightCt, cost, unit, price: isZero(basis) ? ZERO : round(div(cost, basis), UNIT_COST_PLACES), suggested: highestPriced(refs) };
}

export type RowCost = { unit: PriceUnit; unitCost: Dec; cost: Dec };

/** A row's read-only Price / Amount (LT-11/12) from its sources. */
export function rowCost(row: Pick<LoadRowValues, "sources" | "pcs" | "weightCt" | "priceUnit">, mode: LoadMode | "", refs: ReadonlyMap<string, PurchaseLineRef>): RowCost {
  const sources = row.sources.map((id) => refs.get(id)).filter((ref): ref is PurchaseLineRef => Boolean(ref));
  if (mode === "MERGE") {
    const summary = mergeSummary(sources);
    return { unit: summary.unit, unitCost: summary.price, cost: summary.cost };
  }
  const ref = sources[0];
  if (!ref) return { unit: row.priceUnit, unitCost: ZERO, cost: ZERO };
  return { unit: ref.priceUnit, unitCost: dec(ref.unitCostBase), cost: sourceCost(ref, row.pcs || "0", row.weightCt || "0") };
}

export type LoadTotals = { rowCount: number; pcs: number; weightCt: Dec; cost: Dec };

/** Totals row (L-07, DV-05): computed from the load rows. */
export function loadTotals(values: Pick<LoadFormValues, "rows" | "mode" | "sources">): LoadTotals {
  const refs = refsById(values.sources);
  let pcs = 0;
  let weightCt = ZERO;
  let cost = ZERO;
  for (const row of values.rows) {
    pcs += Number.parseInt(row.pcs || "0", 10) || 0;
    weightCt = add(weightCt, dec(row.weightCt));
    cost = add(cost, rowCost(row, values.mode, refs).cost);
  }
  return { rowCount: values.rows.length, pcs, weightCt, cost };
}

export const refsById = (sources: readonly PurchaseLineRef[]) => new Map(sources.map((ref) => [ref.purchaseLineId, ref]));

// ---------- picking (P-01 / P-02) ----------

export function attrsOf(ref: StoneAttrs): StoneAttrs {
  return {
    stoneCodeId: ref.stoneCodeId,
    stoneCode: ref.stoneCode,
    stone: ref.stone,
    shape: ref.shape,
    size: ref.size,
    color: ref.color,
    clarity: ref.clarity,
    cutting: ref.cutting,
    quality: ref.quality,
    lot: ref.lot,
    cerType: ref.cerType,
    cerNo: ref.cerNo,
  };
}

/** A NONE / SPLIT row for one line: its remaining quantity, its details; Location, Stock Price and Sale Price empty. */
export function rowForLine(ref: PurchaseLineRef, photoIds: readonly string[] = []): LoadRowValues {
  return {
    key: newRowKey(),
    id: "",
    stockId: "",
    sources: [ref.purchaseLineId],
    pcs: String(ref.remainingPcs),
    weightCt: toFixed(dec(ref.remainingWeightCt), WEIGHT_PLACES),
    location: "",
    parcel: "",
    attrs: attrsOf(ref),
    priceUnit: ref.priceUnit,
    stockPrice: "",
    salePrice: "",
    itemNote: ref.itemNote,
    photoIds: photoIds.slice(0, PHOTO_MAX),
  };
}

/** The merged row (L-05): full remaining of every source, details and photos from the highest-priced line. */
export function mergedRow(refs: readonly PurchaseLineRef[], photosByLine: ReadonlyMap<string, readonly string[]> = new Map()): LoadRowValues {
  const summary = mergeSummary(refs);
  const suggested = summary.suggested ?? refs[0]!;
  return {
    ...rowForLine(suggested, photosByLine.get(suggested.purchaseLineId) ?? []),
    sources: refs.map((ref) => ref.purchaseLineId),
    pcs: String(summary.pcs),
    weightCt: toFixed(summary.weightCt, WEIGHT_PLACES),
    priceUnit: summary.unit,
  };
}

/**
 * Adds picked lines to the document with its mode (the first pick sets it). NONE / SPLIT append one row per line
 * (Split: one group each); MERGE: the first pick creates the one merged row, later picks join it and its quantity is
 * recomputed (the details the user chose are kept).
 */
export function applyPick(values: LoadFormValues, picked: readonly PurchaseLineRef[], mode: LoadMode, photosByLine: ReadonlyMap<string, readonly string[]> = new Map()): LoadFormValues {
  const known = new Set(values.sources.map((ref) => ref.purchaseLineId));
  const fresh = picked.filter((ref) => !known.has(ref.purchaseLineId));
  if (fresh.length === 0) return values;
  const sources = [...values.sources, ...fresh];
  if (mode === "MERGE") {
    const existing = values.rows[0];
    if (!existing) return { ...values, mode, sources, rows: [mergedRow(fresh, photosByLine)] };
    const all = existing.sources.concat(fresh.map((ref) => ref.purchaseLineId));
    const refs = refsById(sources);
    const summary = mergeSummary(all.map((id) => refs.get(id)!).filter(Boolean));
    return { ...values, mode, sources, rows: [{ ...existing, sources: all, pcs: String(summary.pcs), weightCt: toFixed(summary.weightCt, WEIGHT_PLACES), priceUnit: summary.unit }] };
  }
  return { ...values, mode, sources, rows: [...values.rows, ...fresh.map((ref) => rowForLine(ref, photosByLine.get(ref.purchaseLineId) ?? []))] };
}

/** Load pcs / weight already given to a line's rows. */
export function allocated(rows: readonly LoadRowValues[], purchaseLineId: string, exceptKey?: string): { pcs: number; weightCt: Dec } {
  let pcs = 0;
  let weightCt = ZERO;
  for (const row of rows) {
    if (row.key === exceptKey || row.sources.length !== 1 || row.sources[0] !== purchaseLineId) continue;
    pcs += Number.parseInt(row.pcs || "0", 10) || 0;
    weightCt = add(weightCt, dec(row.weightCt));
  }
  return { pcs, weightCt };
}

/** What a line still has for a new Split child (Q-LS-10: the unallocated remainder, 0 if none). */
export function unallocated(values: Pick<LoadFormValues, "rows">, ref: PurchaseLineRef): { pcs: number; weightCt: Dec } {
  const used = allocated(values.rows, ref.purchaseLineId);
  const pcs = Math.max(0, ref.remainingPcs - used.pcs);
  const weightCt = dec(ref.remainingWeightCt) - used.weightCt;
  return { pcs, weightCt: weightCt > ZERO ? weightCt : ZERO };
}

/** "+ Split" (S-01): a child with the same details and the unallocated remainder, after the group's last row. */
export function addSplitChild(values: LoadFormValues, purchaseLineId: string): LoadFormValues {
  const ref = values.sources.find((source) => source.purchaseLineId === purchaseLineId);
  if (!ref || values.mode !== "SPLIT") return values;
  const rest = unallocated(values, ref);
  const lastIndex = values.rows.reduce((last, row, index) => (row.sources[0] === purchaseLineId ? index : last), -1);
  const template = values.rows[lastIndex];
  const child: LoadRowValues = {
    ...(template ?? rowForLine(ref)),
    key: newRowKey(),
    id: "",
    stockId: "",
    location: "",
    parcel: "",
    stockPrice: template?.stockPrice ?? "",
    salePrice: template?.salePrice ?? "",
    pcs: String(rest.pcs),
    weightCt: toFixed(rest.weightCt, WEIGHT_PLACES),
  };
  const rows = [...values.rows];
  rows.splice(lastIndex + 1, 0, child);
  return { ...values, rows };
}

/**
 * Removes load rows (L-08 / S-01 trash). A PU line with no row left leaves the Item table; an empty Load table clears
 * the mode, so the next pick asks for one again (Q-LS-07).
 */
export function removeRows(values: LoadFormValues, keys: ReadonlySet<string>): LoadFormValues {
  const rows = values.rows.filter((row) => !keys.has(row.key));
  const used = new Set(rows.flatMap((row) => row.sources));
  return { ...values, rows, sources: values.sources.filter((ref) => used.has(ref.purchaseLineId)), mode: rows.length === 0 ? "" : values.mode };
}

/** Removes one PU line with all its rows (Split group trash). */
export function removeSource(values: LoadFormValues, purchaseLineId: string): LoadFormValues {
  return removeRows(values, new Set(values.rows.filter((row) => row.sources.includes(purchaseLineId)).map((row) => row.key)));
}

export type SplitGroup = { ref: PurchaseLineRef; rows: { row: LoadRowValues; index: number }[] };

/** Split view: one group per picked line (Item table order) with its rows. */
export function splitGroups(values: Pick<LoadFormValues, "sources" | "rows">): SplitGroup[] {
  return values.sources.map((ref) => ({
    ref,
    rows: values.rows.flatMap((row, index) => (row.sources[0] === ref.purchaseLineId ? [{ row, index }] : [])),
  }));
}

// ---------- mode dialog (P-02) ----------

export function modeAvailability(mode: LoadMode, pickedCount: number, documentMode: LoadMode | ""): { enabled: boolean; reason: string | null } {
  if (documentMode && documentMode !== mode) return { enabled: false, reason: `This document is in ${MODE_LABEL[documentMode]} mode` };
  if (mode === "MERGE" && !documentMode && pickedCount < 2) return { enabled: false, reason: "Pick at least 2 lines to merge" };
  return { enabled: true, reason: null };
}

export function createLabel(mode: LoadMode, pickedCount: number, documentMode: LoadMode | ""): string {
  if (mode === "MERGE") return documentMode === "MERGE" ? "Add to the merged row" : "Merge · create 1 load row";
  return `Create ${pickedCount} load row${pickedCount === 1 ? "" : "s"}`;
}

export function addedToast(mode: LoadMode, pickedCount: number): string {
  if (mode === "MERGE") return `Added ${pickedCount} line${pickedCount === 1 ? "" : "s"} to the merged row`;
  return `Added ${pickedCount} load row${pickedCount === 1 ? "" : "s"}`;
}

// ---------- validation (Save) ----------

const DECIMAL = /^\d+(\.\d+)?$/;
const INTEGER = /^\d+$/;
const places = (text: string) => text.split(".")[1]?.length ?? 0;

export const MESSAGES = {
  docDate: "Choose a date",
  vendor: "Choose an account",
  rows: "Pick at least one PU line to load",
  tooManyRows: `Up to ${ROW_MAX} load rows`,
  location: "Location is required",
  stockPrice: "Stock Price is required",
  salePrice: "Sale Price is required",
  money: "Enter an amount of 0 or more (2 decimals)",
  pcs: "Pcs must be 1 or more",
  weight: "Weight must be more than 0",
  weightFormat: `Enter a weight (up to ${WEIGHT_PLACES} decimals)`,
} as const;

export const exceedsMessage = (ref: Pick<PurchaseLineRef, "remainingPcs" | "remainingWeightCt" | "purchase">) =>
  `Up to ${ref.remainingPcs} pcs / ${toFixed(dec(ref.remainingWeightCt), WEIGHT_PLACES)} ct left on ${ref.purchase.docNo}`;

type Issue = { path: (string | number)[]; message: string };

/** Every Save rule of the form (ui-spec "Save validation", form-guidelines), as field paths. */
export function validateLoad(values: LoadFormValues): Issue[] {
  const issues: Issue[] = [];
  if (!values.docDate) issues.push({ path: ["docDate"], message: MESSAGES.docDate });
  if (!values.vendorId) issues.push({ path: ["vendorId"], message: MESSAGES.vendor });
  if (values.ref.length > REF_MAX) issues.push({ path: ["ref"], message: `Up to ${REF_MAX} characters` });
  if (values.documentNote.length > NOTE_MAX) issues.push({ path: ["documentNote"], message: `Up to ${NOTE_MAX} characters` });
  if (values.rows.length === 0) issues.push({ path: ["rows"], message: MESSAGES.rows });
  if (values.rows.length > ROW_MAX || values.rows.reduce((sum, row) => sum + row.sources.length, 0) > SOURCE_MAX) issues.push({ path: ["rows"], message: MESSAGES.tooManyRows });
  const refs = refsById(values.sources);
  values.rows.forEach((row, index) => {
    const at = (field: string) => ["rows", index, field];
    if (!row.location.trim()) issues.push({ path: at("location"), message: MESSAGES.location });
    else if (row.location.trim().length > LOCATION_MAX) issues.push({ path: at("location"), message: `Up to ${LOCATION_MAX} characters` });
    if (row.attrs.lot.trim().length > LOT_MAX) issues.push({ path: at("lot"), message: `Up to ${LOT_MAX} characters` });
    if (row.parcel.length > PARCEL_MAX) issues.push({ path: at("parcel"), message: `Up to ${PARCEL_MAX} characters` });
    if (!row.stockPrice.trim()) issues.push({ path: at("stockPrice"), message: MESSAGES.stockPrice });
    else if (!DECIMAL.test(row.stockPrice) || places(row.stockPrice) > MONEY_PLACES) issues.push({ path: at("stockPrice"), message: MESSAGES.money });
    if (!row.salePrice.trim()) issues.push({ path: at("salePrice"), message: MESSAGES.salePrice });
    else if (!DECIMAL.test(row.salePrice) || places(row.salePrice) > MONEY_PLACES) issues.push({ path: at("salePrice"), message: MESSAGES.money });
    if (row.itemNote.length > ITEM_NOTE_MAX) issues.push({ path: at("itemNote"), message: `Up to ${ITEM_NOTE_MAX} characters` });
    if (row.photoIds.length > PHOTO_MAX) issues.push({ path: at("photoIds"), message: `Up to ${PHOTO_MAX} photos` });
    if (values.mode === "MERGE") return; // pcs / weight come from the PU lines
    if (!INTEGER.test(row.pcs) || Number.parseInt(row.pcs, 10) < 1) issues.push({ path: at("pcs"), message: MESSAGES.pcs });
    const ref = refs.get(row.sources[0] ?? "");
    if (!DECIMAL.test(row.weightCt) || places(row.weightCt) > WEIGHT_PLACES) issues.push({ path: at("weightCt"), message: MESSAGES.weightFormat });
    // Owner Q-LS-26: weight may be 0 only when the PU line's weight is 0.
    else if (dec(row.weightCt) === ZERO && !(ref && dec(ref.weightCt) === ZERO)) issues.push({ path: at("weightCt"), message: MESSAGES.weight });
  });
  // Per PU line: Σ rows ≤ remaining (None / Split, Q-LS-10).
  if (values.mode !== "MERGE") {
    for (const ref of values.sources) {
      const used = allocated(values.rows, ref.purchaseLineId);
      const overPcs = used.pcs > ref.remainingPcs;
      const overWeight = used.weightCt > dec(ref.remainingWeightCt);
      if (!overPcs && !overWeight) continue;
      values.rows.forEach((row, index) => {
        if (row.sources[0] !== ref.purchaseLineId) return;
        issues.push({ path: ["rows", index, overPcs ? "pcs" : "weightCt"], message: exceedsMessage(ref) });
      });
    }
  }
  return issues;
}

/** The react-hook-form resolver schema: the same rules as `validateLoad`. */
export const loadSchema = z.custom<LoadFormValues>().superRefine((values, ctx) => {
  for (const issue of validateLoad(values)) ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
});

/** "Row n: …" (INV-20261102-003): the first bad row and its first message, or null. */
export function firstRowIssue(issues: readonly Issue[]): { index: number; message: string } | null {
  const row = issues.find((issue) => issue.path[0] === "rows" && typeof issue.path[1] === "number");
  return row ? { index: row.path[1] as number, message: row.message } : null;
}

export function invalidMessage(issues: readonly Issue[]): string {
  const row = firstRowIssue(issues);
  if (row) return `Row ${row.index + 1}: ${row.message}`;
  return issues.find((issue) => issue.path[0] === "rows")?.message ?? "Please complete the required fields";
}

// ---------- server mapping (contract LoadInput / LoadOut) ----------

export type RowInput = {
  id?: string;
  sources: { purchaseLineId: string; pcs: number; weightCt: string }[];
  location: string;
  parcel?: string;
  attrs: StoneAttrs;
  stockPrice: string;
  salePrice: string;
  itemNote?: string;
  photoIds: string[];
};
export type LoadInput = { docDate: string; vendorId: string; ref?: string; documentNote?: string; mode: LoadMode; rows: RowInput[] };

const trimAttrs = (attrs: StoneAttrs): StoneAttrs => ({
  stoneCodeId: attrs.stoneCodeId || null,
  stoneCode: attrs.stoneCode.trim(),
  stone: attrs.stone.trim(),
  shape: attrs.shape.trim(),
  size: attrs.size.trim(),
  color: attrs.color.trim(),
  clarity: attrs.clarity.trim(),
  cutting: attrs.cutting.trim(),
  quality: attrs.quality.trim(),
  lot: attrs.lot.trim(),
  cerType: attrs.cerType.trim(),
  cerNo: attrs.cerNo.trim(),
});

/** Form → `LoadInput`. MERGE sends each source's full remaining (the server overwrites it anyway). */
export function toLoadInput(values: LoadFormValues): LoadInput {
  const refs = refsById(values.sources);
  const mode = values.mode || "NONE";
  return {
    docDate: values.docDate,
    vendorId: values.vendorId,
    ...(values.ref.trim() ? { ref: values.ref.trim() } : {}),
    ...(values.documentNote.trim() ? { documentNote: values.documentNote.trim() } : {}),
    mode,
    rows: values.rows.map((row) => ({
      ...(row.id ? { id: row.id } : {}),
      sources:
        mode === "MERGE"
          ? row.sources.map((id) => {
            const ref = refs.get(id);
            return { purchaseLineId: id, pcs: ref?.remainingPcs ?? 0, weightCt: toFixed(dec(ref?.remainingWeightCt ?? "0"), WEIGHT_PLACES) };
          })
          : [{ purchaseLineId: row.sources[0] ?? "", pcs: Number.parseInt(row.pcs, 10), weightCt: toFixed(dec(row.weightCt), WEIGHT_PLACES) }],
      location: row.location.trim(),
      ...(row.parcel.trim() ? { parcel: row.parcel.trim() } : {}),
      attrs: trimAttrs(row.attrs),
      stockPrice: toFixed(dec(row.stockPrice), MONEY_PLACES),
      salePrice: toFixed(dec(row.salePrice), MONEY_PLACES),
      ...(row.itemNote.trim() ? { itemNote: row.itemNote.trim() } : {}),
      photoIds: row.photoIds.slice(0, PHOTO_MAX),
    })),
  };
}

/** Saved document → form values. Rows keep their server id (and Stock ID) as their key. */
export function fromLoad(detail: LoadOut): LoadFormValues {
  return {
    id: detail.id,
    docNo: detail.docNo,
    version: detail.version,
    status: detail.status,
    docDate: detail.docDate,
    vendorId: detail.vendor.id,
    ref: detail.ref,
    documentNote: detail.documentNote,
    mode: detail.mode,
    sources: detail.sources,
    rows: [...detail.rows]
      .sort((a, b) => a.position - b.position)
      .map((row) => ({
        key: row.id,
        id: row.id,
        stockId: row.stockId ?? "",
        sources: row.sources.map((source) => source.purchaseLineId),
        pcs: String(row.pcs),
        weightCt: toFixed(dec(row.weightCt), WEIGHT_PLACES),
        location: row.location,
        parcel: row.parcel,
        attrs: row.attrs,
        priceUnit: row.priceUnit,
        stockPrice: row.stockPrice,
        salePrice: row.salePrice,
        itemNote: row.itemNote,
        photoIds: row.photoIds,
      })),
  };
}

// ---------- display ----------

export const unitLabel = (unit: PriceUnit) => (unit === "PER_PCS" ? "per pcs" : "per ct");
export const stoneLine = (attrs: Pick<StoneAttrs, "stone" | "shape" | "size">) => [attrs.stone, attrs.shape, attrs.size].map((part) => part.trim()).filter(Boolean).join(" ");
export const gradeLine = (attrs: Pick<StoneAttrs, "color" | "clarity">) => [attrs.color, attrs.clarity].map((part) => part.trim()).filter(Boolean).join(" ");
/** "02/10/26" from "2026-10-02". */
export function shortDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]!.slice(2)}` : iso;
}
