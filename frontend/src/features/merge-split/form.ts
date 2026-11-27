import { z } from "zod";
import { add, dec, div, mul, round, toFixed, ZERO, type Dec } from "@/features/quotation/lib/decimal";
import type { MsAttrs, MsMode, MsOut, OwnStockRow, PriceUnit } from "./types";

/**
 * merge-split FE-MS-002 (UI rev 1 + Q-MS defaults, SA rev 1 / ADR-0060): the pure form model.
 *
 * - One mode per document: SPLIT (each picked stock → ≥ 2 new stocks whose pcs and weight add up to its whole
 *   available on hand, Q-MS-04) or MERGE (≥ 2 picked stocks → 1 new stock, quantities locked).
 * - C-01 Split cost follows the source unit cost; the last child of a balanced group absorbs the rounding so the
 *   group's cost equals the source cost. C-02 Merge cost = Σ source costs; per ct unless every source is per pcs.
 * - C-03 Merge details, prices and photos come from the source with the highest cost per piece (tie → first picked).
 */

export type MsSource = {
  /** Client key (≤ 40), sent as `sources[].key`; results name it as `sourceKey`. */
  key: string;
  stockUuid: string;
  stockId: string;
  location: string;
  attrs: MsAttrs;
  lot: string;
  priceUnit: PriceUnit;
  unitCostBase: string;
  availPcs: number;
  availWeightCt: string;
  /** Cost (company currency) of the whole available quantity. */
  costAmountBase: string;
  stockPrice: string;
  salePrice: string;
  photoCount: number;
  loadedFrom: { docNo: string; docDate: string };
};

export type MsRowValues = {
  key: string;
  /** Saved result id; "" for a new row. */
  id: string;
  /** Issued Stock ID; "" shows "Auto" until applied. */
  stockId: string;
  /** SPLIT: the source key; MERGE: null. */
  sourceKey: string | null;
  pcs: string;
  weightCt: string;
  location: string;
  lot: string;
  parcel: string;
  attrs: MsAttrs;
  priceUnit: PriceUnit;
  stockPrice: string;
  salePrice: string;
  itemNote: string;
  photoIds: string[];
  /** Saved new stock already used by a later document. */
  inUse?: boolean;
};

export type MsFormValues = {
  docDate: string;
  ref: string;
  /** Document Note (sent as `note`). */
  documentNote: string;
  mode: MsMode | "";
  sources: MsSource[];
  rows: MsRowValues[];
};

export const REF_MAX = 100;
export const NOTE_MAX = 250;
export const ITEM_NOTE_MAX = 500;
export const LOT_MAX = 40;
export const PARCEL_MAX = 50;
export const PHOTO_MAX = 5;
export const ROW_MAX = 200;
export const SOURCE_MAX = 200;
export const WEIGHT_PLACES = 3;
export const MONEY_PLACES = 2;
export const UNIT_COST_PLACES = 4;

export const MODE_LABEL: Record<MsMode, string> = { SPLIT: "Split", MERGE: "Merge" };
export const MODE_TITLE: Record<MsMode, string> = { SPLIT: "Split · one stock into several", MERGE: "Merge · stocks into one" };

let seq = 0;
export const newKey = (prefix = "r") => `${prefix}-${Date.now().toString(36)}-${(seq += 1)}`;

export function emptyMergeSplit(docDate: string): MsFormValues {
  return { docDate, ref: "", documentNote: "", mode: "", sources: [], rows: [] };
}

const pcsOf = (text: string) => Number.parseInt(text || "0", 10) || 0;
const weightText = (value: Dec) => toFixed(value, WEIGHT_PLACES);

// ---------- picking ----------

export function sourceFromStock(row: OwnStockRow): MsSource {
  return {
    key: newKey("s"),
    stockUuid: row.stockUuid,
    stockId: row.stockId,
    location: row.location,
    attrs: { ...row.attrs },
    lot: row.lot,
    priceUnit: row.priceUnit,
    unitCostBase: row.unitCostBase,
    availPcs: row.availPcs,
    availWeightCt: row.availWeightCt,
    costAmountBase: row.costAmountBase,
    stockPrice: row.stockPrice,
    salePrice: row.salePrice,
    photoCount: row.photoCount,
    loadedFrom: row.loadedFrom,
  };
}

// ---------- cost (C-01 / C-02 / C-03) ----------

/** Cost of `pcs` / `weightCt` of one source at its unit cost, 2 dp. */
export function costOf(source: Pick<MsSource, "priceUnit" | "unitCostBase">, pcs: number | string, weightCt: string): Dec {
  const basis = source.priceUnit === "PER_PCS" ? dec(String(pcs)) : dec(weightCt);
  return round(mul(basis, dec(source.unitCostBase)), MONEY_PLACES);
}

export function mergedUnit(sources: readonly Pick<MsSource, "priceUnit">[]): PriceUnit {
  return sources.length > 0 && sources.every((source) => source.priceUnit === "PER_PCS") ? "PER_PCS" : "PER_CT";
}

export function costPerPiece(source: Pick<MsSource, "costAmountBase" | "availPcs">): Dec {
  return source.availPcs > 0 ? div(dec(source.costAmountBase), dec(String(source.availPcs))) : ZERO;
}

/** C-03: highest cost per piece, the first picked wins a tie. */
export function suggestedSource<T extends Pick<MsSource, "costAmountBase" | "availPcs">>(sources: readonly T[]): T | undefined {
  let best: T | undefined;
  let bestValue = ZERO;
  for (const source of sources) {
    const value = costPerPiece(source);
    if (!best || value > bestValue) {
      best = source;
      bestValue = value;
    }
  }
  return best;
}

export type MergeSummary = { pcs: number; weightCt: Dec; cost: Dec; unit: PriceUnit; unitCost: Dec; suggested: MsSource | undefined };

/** C-02: Σ available pcs / weight / cost, the unit and the weighted-average unit cost. */
export function mergeSummary(sources: readonly MsSource[]): MergeSummary {
  const pcs = sources.reduce((sum, source) => sum + source.availPcs, 0);
  const weightCt = add(...sources.map((source) => dec(source.availWeightCt)));
  const cost = add(...sources.map((source) => dec(source.costAmountBase)));
  const unit = mergedUnit(sources);
  const basis = unit === "PER_PCS" ? dec(String(pcs)) : weightCt;
  return { pcs, weightCt, cost, unit, unitCost: basis === ZERO ? ZERO : round(div(cost, basis), UNIT_COST_PLACES), suggested: suggestedSource(sources) };
}

export const sourcesByKey = (sources: readonly MsSource[]) => new Map(sources.map((source) => [source.key, source]));

export type RowCost = { unit: PriceUnit; unitCost: Dec; cost: Dec };

/** RT-10 / RT-11: one result row's read-only unit cost and amount (preview; the server is authoritative). */
export function rowCost(values: Pick<MsFormValues, "mode" | "rows" | "sources">, rowIndex: number): RowCost {
  const row = values.rows[rowIndex];
  if (!row) return { unit: "PER_CT", unitCost: ZERO, cost: ZERO };
  if (values.mode === "MERGE") {
    const summary = mergeSummary(values.sources);
    return { unit: summary.unit, unitCost: summary.unitCost, cost: summary.cost };
  }
  const source = values.sources.find((candidate) => candidate.key === row.sourceKey);
  if (!source) return { unit: row.priceUnit, unitCost: ZERO, cost: ZERO };
  const unitCost = dec(source.unitCostBase);
  const group = values.rows.map((candidate, index) => ({ candidate, index })).filter(({ candidate }) => candidate.sourceKey === source.key);
  const last = group[group.length - 1];
  if (last && last.index === rowIndex && group.length > 1 && groupBalance(values.rows, source).state === "balanced") {
    // C-01: the last child absorbs the rounding, Σ child cost = source cost.
    const others = add(...group.slice(0, -1).map(({ candidate }) => costOf(source, candidate.pcs || "0", candidate.weightCt || "0")));
    return { unit: source.priceUnit, unitCost, cost: dec(source.costAmountBase) - others };
  }
  return { unit: source.priceUnit, unitCost, cost: costOf(source, row.pcs || "0", row.weightCt || "0") };
}

// ---------- Split groups and balance ----------

export type Balance = { state: "balanced" | "left" | "over"; pcs: number; weightCt: Dec };

/** Σ children vs the source's available: balanced, what is left, or how much over (S-02, balance chip). */
export function groupBalance(rows: readonly MsRowValues[], source: Pick<MsSource, "key" | "availPcs" | "availWeightCt">, exceptKey?: string): Balance {
  let pcs = 0;
  let weightCt = ZERO;
  for (const row of rows) {
    if (row.sourceKey !== source.key || row.key === exceptKey) continue;
    pcs += pcsOf(row.pcs);
    weightCt = add(weightCt, dec(row.weightCt));
  }
  const leftPcs = source.availPcs - pcs;
  const leftWeight = dec(source.availWeightCt) - weightCt;
  if (leftPcs === 0 && leftWeight === ZERO) return { state: "balanced", pcs: 0, weightCt: ZERO };
  if (leftPcs < 0 || leftWeight < ZERO) return { state: "over", pcs: Math.max(0, -leftPcs), weightCt: leftWeight < ZERO ? -leftWeight : ZERO };
  return { state: "left", pcs: leftPcs, weightCt: leftWeight };
}

export type SplitGroup = { source: MsSource; rows: { row: MsRowValues; index: number }[] };

export function splitGroups(values: Pick<MsFormValues, "sources" | "rows">): SplitGroup[] {
  return values.sources.map((source) => ({ source, rows: values.rows.flatMap((row, index) => (row.sourceKey === source.key ? [{ row, index }] : [])) }));
}

/** A Split child of `source` with its details (Q-MS-06/10: prefilled, editable), location defaulting to the source's. */
export function childOf(source: MsSource, pcs: number, weightCt: Dec, photoIds: readonly string[] = []): MsRowValues {
  return {
    key: newKey(),
    id: "",
    stockId: "",
    sourceKey: source.key,
    pcs: String(pcs),
    weightCt: weightText(weightCt),
    location: source.location,
    lot: source.lot,
    parcel: "",
    attrs: { ...source.attrs },
    priceUnit: source.priceUnit,
    stockPrice: source.stockPrice,
    salePrice: source.salePrice,
    itemNote: "",
    photoIds: photoIds.slice(0, PHOTO_MAX),
  };
}

/** P-02 "Create": two children that add up to the source (pcs and weight halved, the second takes the rest). */
export function splitPair(source: MsSource, photoIds: readonly string[] = []): MsRowValues[] {
  const firstPcs = Math.ceil(source.availPcs / 2);
  const total = dec(source.availWeightCt);
  const firstWeight = round(div(total, dec("2")), WEIGHT_PLACES);
  return [childOf(source, firstPcs, firstWeight, photoIds), childOf(source, source.availPcs - firstPcs, total - firstWeight, photoIds)];
}

/** The one Merge result (R-04): Σ quantities, details / prices / photos from the suggested source, no location (Q-MS-07). */
export function mergedRow(sources: readonly MsSource[], photoIds: readonly string[] = []): MsRowValues {
  const summary = mergeSummary(sources);
  const suggested = summary.suggested ?? sources[0]!;
  return { ...childOf(suggested, summary.pcs, summary.weightCt, photoIds), sourceKey: null, location: "", priceUnit: summary.unit };
}

/**
 * Adds picked stocks with the document's mode (the first pick sets it). SPLIT: one group of two children per stock.
 * MERGE: the first pick creates the merged row; later picks join it (quantities recomputed, chosen details kept).
 */
export function applyPick(values: MsFormValues, picked: readonly OwnStockRow[], mode: MsMode, photosByStock: ReadonlyMap<string, readonly string[]> = new Map()): MsFormValues {
  const known = new Set(values.sources.map((source) => source.stockUuid));
  const fresh = picked.filter((row) => !known.has(row.stockUuid)).map(sourceFromStock);
  if (fresh.length === 0) return values;
  const sources = [...values.sources, ...fresh];
  if (mode === "MERGE") {
    const existing = values.rows[0];
    if (!existing) {
      const suggested = suggestedSource(fresh);
      return { ...values, mode, sources, rows: [mergedRow(fresh, suggested ? (photosByStock.get(suggested.stockUuid) ?? []) : [])] };
    }
    const summary = mergeSummary(sources);
    return { ...values, mode, sources, rows: [{ ...existing, pcs: String(summary.pcs), weightCt: weightText(summary.weightCt), priceUnit: summary.unit }] };
  }
  return { ...values, mode, sources, rows: [...values.rows, ...fresh.flatMap((source) => splitPair(source, photosByStock.get(source.stockUuid) ?? []))] };
}

/** "+ Split": a child after the group's last row, with the template's details and what is left (0 if nothing). */
export function addSplitChild(values: MsFormValues, sourceKey: string): MsFormValues {
  const source = values.sources.find((candidate) => candidate.key === sourceKey);
  if (!source || values.mode !== "SPLIT") return values;
  const balance = groupBalance(values.rows, source);
  const left = balance.state === "left" ? balance : { pcs: 0, weightCt: ZERO };
  const lastIndex = values.rows.reduce((last, row, index) => (row.sourceKey === sourceKey ? index : last), -1);
  const template = values.rows[lastIndex];
  const child: MsRowValues = { ...(template ?? childOf(source, 0, ZERO)), key: newKey(), id: "", stockId: "", inUse: false, pcs: String(left.pcs), weightCt: weightText(left.weightCt) };
  const rows = [...values.rows];
  rows.splice(lastIndex + 1, 0, child);
  return { ...values, rows };
}

/** Removes result rows; a source without rows leaves the document; no rows clears the mode. */
export function removeRows(values: MsFormValues, keys: ReadonlySet<string>): MsFormValues {
  if (values.mode === "MERGE") return values; // the merged row is removed through its sources
  const rows = values.rows.filter((row) => !keys.has(row.key));
  const used = new Set(rows.map((row) => row.sourceKey));
  return { ...values, rows, sources: values.sources.filter((source) => used.has(source.key)), mode: rows.length === 0 ? "" : values.mode };
}

/** Group trash (Split) / source chip ✕ (Merge). The merged row's quantities follow; no source left clears the table. */
export function removeSource(values: MsFormValues, sourceKey: string): MsFormValues {
  const sources = values.sources.filter((source) => source.key !== sourceKey);
  if (sources.length === 0) return { ...values, sources, rows: [], mode: "" };
  if (values.mode === "MERGE") {
    const row = values.rows[0];
    const summary = mergeSummary(sources);
    return { ...values, sources, rows: row ? [{ ...row, pcs: String(summary.pcs), weightCt: weightText(summary.weightCt), priceUnit: summary.unit }] : [] };
  }
  return { ...values, sources, rows: values.rows.filter((row) => row.sourceKey !== sourceKey) };
}

// ---------- mode dialog (P-02) ----------

export function modeAvailability(mode: MsMode, pickedCount: number, documentMode: MsMode | ""): { enabled: boolean; reason: string | null } {
  if (documentMode && documentMode !== mode) return { enabled: false, reason: `This document is in ${MODE_LABEL[documentMode]} mode` };
  if (mode === "MERGE" && !documentMode && pickedCount < 2) return { enabled: false, reason: "Pick at least 2 stocks to merge" };
  return { enabled: true, reason: null };
}

/** Default selection: the document's mode, else Split for 1 stock and Merge for ≥ 2 (A). */
export const defaultMode = (pickedCount: number, documentMode: MsMode | ""): MsMode => documentMode || (pickedCount >= 2 ? "MERGE" : "SPLIT");

export function createLabel(mode: MsMode, pickedCount: number, documentMode: MsMode | ""): string {
  if (mode === "MERGE") return documentMode === "MERGE" ? "Add to the merged row" : "Create 1 row";
  return `Create ${pickedCount * 2} rows`;
}

export function addedToast(mode: MsMode, pickedCount: number, documentMode: MsMode | ""): string {
  if (documentMode) return `Added with mode ${MODE_LABEL[mode]}`;
  return mode === "MERGE" ? "Added 1 row" : `Added ${pickedCount * 2} rows`;
}

// ---------- totals (R-05, S-06) ----------

export type MsTotals = { pcs: number; weightCt: Dec; cost: Dec };

export function sourceTotals(values: Pick<MsFormValues, "sources">): MsTotals {
  return {
    pcs: values.sources.reduce((sum, source) => sum + source.availPcs, 0),
    weightCt: add(...values.sources.map((source) => dec(source.availWeightCt))),
    cost: add(...values.sources.map((source) => dec(source.costAmountBase))),
  };
}

export function resultTotals(values: Pick<MsFormValues, "mode" | "rows" | "sources">): MsTotals {
  let pcs = 0;
  let weightCt = ZERO;
  let cost = ZERO;
  values.rows.forEach((row, index) => {
    pcs += pcsOf(row.pcs);
    weightCt = add(weightCt, dec(row.weightCt));
    cost = add(cost, rowCost(values, index).cost);
  });
  return { pcs, weightCt, cost };
}

/** S-06: the banner text when result Pcs / Weight differ from the source, else null (cost rounding is not shown). */
export function totalsMismatch(values: Pick<MsFormValues, "mode" | "rows" | "sources">): string | null {
  if (values.rows.length === 0) return null;
  const source = sourceTotals(values);
  const result = resultTotals(values);
  if (source.pcs === result.pcs && source.weightCt === result.weightCt) return null;
  return `Result does not match the source: Pcs ${source.pcs} vs ${result.pcs}, Weight ${weightText(source.weightCt)} vs ${weightText(result.weightCt)}`;
}

// ---------- validation (S-01…S-06) ----------

const DECIMAL = /^\d+(\.\d+)?$/;
const INTEGER = /^\d+$/;
const places = (value: string) => value.split(".")[1]?.length ?? 0;

export const MESSAGES = {
  docDate: "Choose a date",
  rows: "Pick at least one stock",
  tooMany: `Up to ${ROW_MAX} rows and ${SOURCE_MAX} stocks`,
  splitTwo: "Split needs at least 2 new stocks",
  mergeTwo: "Merge needs at least 2 stocks",
  location: "Location is required",
  stockPrice: "Stock Price is required",
  salePrice: "Sale Price is required",
  money: "Enter an amount of 0 or more (2 decimals)",
  pcs: "Pcs must be 1 or more",
  weight: "Weight must be more than 0",
  weightFormat: `Enter a weight (up to ${WEIGHT_PLACES} decimals)`,
} as const;

export const balanceMessage = (source: Pick<MsSource, "stockId" | "availPcs" | "availWeightCt">) =>
  `pcs/weight must add up to ${source.stockId} (${source.availPcs} pcs · ${weightText(dec(source.availWeightCt))} ct)`;

export type Issue = { path: (string | number)[]; message: string };

export function validateMergeSplit(values: MsFormValues): Issue[] {
  const issues: Issue[] = [];
  if (!values.docDate) issues.push({ path: ["docDate"], message: MESSAGES.docDate });
  if (values.ref.length > REF_MAX) issues.push({ path: ["ref"], message: `Up to ${REF_MAX} characters` });
  if (values.documentNote.length > NOTE_MAX) issues.push({ path: ["documentNote"], message: `Up to ${NOTE_MAX} characters` });
  if (values.sources.length === 0 || values.rows.length === 0) issues.push({ path: ["rows"], message: MESSAGES.rows });
  if (values.rows.length > ROW_MAX || values.sources.length > SOURCE_MAX) issues.push({ path: ["rows"], message: MESSAGES.tooMany });
  if (values.mode === "MERGE" && values.sources.length < 2) issues.push({ path: ["rows"], message: MESSAGES.mergeTwo });
  values.rows.forEach((row, index) => {
    const at = (field: string) => ["rows", index, field];
    if (!row.location.trim()) issues.push({ path: at("location"), message: MESSAGES.location });
    if (row.lot.trim().length > LOT_MAX) issues.push({ path: at("lot"), message: `Up to ${LOT_MAX} characters` });
    if (!row.stockPrice.trim()) issues.push({ path: at("stockPrice"), message: MESSAGES.stockPrice });
    else if (!DECIMAL.test(row.stockPrice) || places(row.stockPrice) > MONEY_PLACES) issues.push({ path: at("stockPrice"), message: MESSAGES.money });
    if (!row.salePrice.trim()) issues.push({ path: at("salePrice"), message: MESSAGES.salePrice });
    else if (!DECIMAL.test(row.salePrice) || places(row.salePrice) > MONEY_PLACES) issues.push({ path: at("salePrice"), message: MESSAGES.money });
    if (row.itemNote.length > ITEM_NOTE_MAX) issues.push({ path: at("itemNote"), message: `Up to ${ITEM_NOTE_MAX} characters` });
    if (row.photoIds.length > PHOTO_MAX) issues.push({ path: at("photoIds"), message: `Up to ${PHOTO_MAX} photos` });
    if (values.mode === "MERGE") return; // quantities are the sum of the sources
    if (!INTEGER.test(row.pcs) || Number.parseInt(row.pcs, 10) < 1) issues.push({ path: at("pcs"), message: MESSAGES.pcs });
    if (!DECIMAL.test(row.weightCt) || places(row.weightCt) > WEIGHT_PLACES) issues.push({ path: at("weightCt"), message: MESSAGES.weightFormat });
    else if (dec(row.weightCt) === ZERO) issues.push({ path: at("weightCt"), message: MESSAGES.weight });
  });
  if (values.mode === "SPLIT") {
    for (const group of splitGroups(values)) {
      const first = group.rows[0];
      if (!first) continue;
      if (group.rows.length < 2) issues.push({ path: ["rows", first.index, "pcs"], message: MESSAGES.splitTwo });
      const balance = groupBalance(values.rows, group.source);
      if (balance.state !== "balanced") {
        const field = balance.pcs !== 0 ? "pcs" : "weightCt";
        for (const { index } of group.rows) issues.push({ path: ["rows", index, field], message: balanceMessage(group.source) });
      }
    }
  }
  return issues;
}

export const mergeSplitSchema = z.custom<MsFormValues>().superRefine((values, ctx) => {
  for (const issue of validateMergeSplit(values)) ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
});

export function firstRowIssue(issues: readonly Issue[]): { index: number; message: string } | null {
  const row = issues
    .filter((issue) => issue.path[0] === "rows" && typeof issue.path[1] === "number")
    .sort((a, b) => (a.path[1] as number) - (b.path[1] as number))[0];
  return row ? { index: row.path[1] as number, message: row.message } : null;
}

export function invalidMessage(issues: readonly Issue[]): string {
  const row = firstRowIssue(issues);
  if (row) return `Row ${row.index + 1}: ${row.message}`;
  return issues.find((issue) => issue.path[0] === "rows")?.message ?? issues[0]?.message ?? "Please complete the required fields";
}

// ---------- server mapping (contract MergeSplitInput / MergeSplitOut) ----------

export type MsSourceInput = { key: string; stockUuid: string; availPcs: number; availWeightCt: string };
export type MsResultInput = {
  id?: string;
  sourceKey: string | null;
  attrs: MsAttrs;
  location: string;
  lot: string;
  parcel: string;
  pcs: number;
  weightCt: string;
  stockPrice: string;
  salePrice: string;
  itemNote: string;
  photoIds: string[];
};
export type MergeSplitInput = { docDate: string; mode: MsMode; ref: string; note: string; sources: MsSourceInput[]; results: MsResultInput[] };

const trimAttrs = (attrs: MsAttrs): MsAttrs => ({
  stoneCodeId: attrs.stoneCodeId || null,
  stoneCode: attrs.stoneCode.trim(),
  stone: attrs.stone.trim(),
  shape: attrs.shape.trim(),
  size: attrs.size.trim(),
  color: attrs.color.trim(),
  clarity: attrs.clarity.trim(),
  cutting: attrs.cutting.trim(),
  quality: attrs.quality.trim(),
  cerType: attrs.cerType.trim(),
  cerNo: attrs.cerNo.trim(),
});

export function toMergeSplitInput(values: MsFormValues): MergeSplitInput {
  const mode: MsMode = values.mode || "SPLIT";
  return {
    docDate: values.docDate,
    mode,
    ref: values.ref.trim(),
    note: values.documentNote.trim(),
    sources: values.sources.map((source) => ({ key: source.key, stockUuid: source.stockUuid, availPcs: source.availPcs, availWeightCt: weightText(dec(source.availWeightCt)) })),
    results: values.rows.map((row) => ({
      ...(row.id ? { id: row.id } : {}),
      sourceKey: mode === "SPLIT" ? row.sourceKey : null,
      attrs: trimAttrs(row.attrs),
      location: row.location.trim(),
      lot: row.lot.trim(),
      parcel: row.parcel.trim(),
      pcs: Number.parseInt(row.pcs, 10) || 0,
      weightCt: weightText(dec(row.weightCt)),
      stockPrice: toFixed(dec(row.stockPrice), MONEY_PLACES),
      salePrice: toFixed(dec(row.salePrice), MONEY_PLACES),
      itemNote: row.itemNote.trim(),
      photoIds: row.photoIds.slice(0, PHOTO_MAX),
    })),
  };
}

export function fromMergeSplit(detail: MsOut): MsFormValues {
  return {
    docDate: detail.docDate,
    ref: detail.ref,
    documentNote: detail.note,
    mode: detail.mode,
    sources: [...detail.sources]
      .sort((a, b) => a.position - b.position)
      .map((source) => ({
        key: source.key,
        stockUuid: source.stockUuid,
        stockId: source.stockId,
        location: source.location,
        attrs: source.attrs,
        lot: source.lot,
        priceUnit: source.priceUnit,
        unitCostBase: source.unitCostBase,
        availPcs: source.availPcs,
        availWeightCt: source.availWeightCt,
        costAmountBase: source.takeCostBase,
        stockPrice: "",
        salePrice: "",
        photoCount: 0,
        loadedFrom: { docNo: source.refDocNo, docDate: source.refDocDate },
      })),
    rows: [...detail.results]
      .sort((a, b) => a.position - b.position)
      .map((row) => ({
        key: row.id,
        id: row.id,
        stockId: row.stockId ?? "",
        sourceKey: detail.mode === "SPLIT" ? row.sourceKey : null,
        pcs: String(row.pcs),
        weightCt: weightText(dec(row.weightCt)),
        location: row.location,
        lot: row.lot,
        parcel: row.parcel,
        attrs: row.attrs,
        priceUnit: row.priceUnit,
        stockPrice: row.stockPrice,
        salePrice: row.salePrice,
        itemNote: row.itemNote,
        photoIds: row.photoIds,
        inUse: row.inUse,
      })),
  };
}

// ---------- display ----------

export const unitLabel = (unit: PriceUnit) => (unit === "PER_PCS" ? "per pcs" : "per ct");
export const stoneLine = (attrs: Pick<MsAttrs, "stone" | "shape" | "size">) => [attrs.stone, attrs.shape, attrs.size].map((part) => part.trim()).filter(Boolean).join(" ");

/** RT-3 note: "From 260001" / Merge "From 260001 + 260002 + 260003 +2" (≤ 3 then "+n"). */
export function fromText(row: Pick<MsRowValues, "sourceKey">, values: Pick<MsFormValues, "mode" | "sources">): string {
  const ids = values.mode === "MERGE" ? values.sources.map((source) => source.stockId) : values.sources.filter((source) => source.key === row.sourceKey).map((source) => source.stockId);
  if (ids.length === 0) return "";
  const shown = ids.slice(0, 3).join(" + ");
  return `From ${shown}${ids.length > 3 ? ` +${ids.length - 3}` : ""}`;
}

/** Balance chip text (R-03). */
export function balanceText(balance: Balance): string {
  if (balance.state === "balanced") return "Balanced";
  const amount = `${balance.pcs} pcs · ${weightText(balance.weightCt)} ct`;
  return balance.state === "left" ? `Left ${amount}` : `Over by ${amount}`;
}

/** "02/10/26" from "2026-10-02". */
export function shortDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]!.slice(2)}` : iso;
}
