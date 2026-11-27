import { dec, toFixed } from "@/features/quotation/lib/decimal";
import type { PriceUnit, StockLot, StoneAttrs, TransferOut } from "./types";

/**
 * stock-transfer-location FE-STL-002 (ADR-0060 D3 / D12, owner images 01–03): the pure form model.
 *
 * - One lot per row (unique `stockUuid`), at most 200 rows. The grid shows at least 5 rows: picked rows first, then
 *   "Empty row · click to pick from stock" placeholders (there is no Add row).
 * - New Location: an active Location Master name other than the row's own location.
 * - PCS integer 0…on hand, WEIGHT 0…on hand with ≤ 3 decimals, at least one > 0. Typing PCS equal to on hand fills
 *   WEIGHT with the on-hand weight; otherwise the two are independent.
 */

export const STOCK_TRANSFER_HREF = "/inventory/stock-transfer-location";
export const stockTransferHref = (id: string) => `${STOCK_TRANSFER_HREF}/${encodeURIComponent(id)}`;

export const REF_MAX = 100;
export const NOTE_MAX = 250;
export const ROW_MAX = 200;
export const MIN_VISIBLE_ROWS = 5;
export const WEIGHT_PLACES = 3;

export type TransferRow = {
  /** Client key (the saved line id once saved). */
  key: string;
  /** Saved line id; "" for a new row. */
  id: string;
  stockUuid: string;
  stockId: string;
  newStockId: string;
  lotKey: string;
  refDocNo: string;
  fromLocation: string;
  priceUnit: PriceUnit;
  stockPrice: string;
  currency: string;
  onHandPcs: number;
  onHandWeightCt: string;
  attrs: StoneAttrs;
  toLocation: string;
  /** Typed text; "" shows the placeholder 0. */
  pcs: string;
  weightCt: string;
  remark: string;
};

export type TransferFormValues = {
  docDate: string;
  ref: string;
  note: string;
  rows: TransferRow[];
};

export type TransferLineInput = {
  id?: string;
  fromStockUuid: string;
  onHandPcs: number;
  onHandWeightCt: string;
  toLocation: string;
  pcs: number;
  weightCt: string;
  remark?: string;
};
export type TransferInput = { docDate: string; ref: string; note?: string; lines: TransferLineInput[] };

let keySeq = 0;
const newKey = () => `stl-${Date.now().toString(36)}-${(keySeq += 1)}`;

export function emptyTransfer(docDate: string): TransferFormValues {
  return { docDate, ref: "", note: "", rows: [] };
}

/** A picked lot → a new row: amounts empty (placeholder 0), New Location unset. */
export function lotToRow(lot: StockLot): TransferRow {
  return {
    key: newKey(),
    id: "",
    stockUuid: lot.stockUuid,
    stockId: lot.stockId,
    newStockId: "",
    lotKey: lot.lotKey,
    refDocNo: lot.refDocNo,
    fromLocation: lot.location || lot.attrs.location,
    priceUnit: lot.priceUnit,
    stockPrice: lot.stockPrice,
    currency: lot.currency,
    onHandPcs: lot.onHandPcs,
    onHandWeightCt: lot.onHandWeightCt,
    attrs: lot.attrs,
    toLocation: "",
    pcs: "",
    weightCt: "",
    remark: "",
  };
}

/** Adds picked lots in pick order, skipping lots already on the document (one lot per row) and past 200 rows. */
export function addLots(values: TransferFormValues, lots: readonly StockLot[]): { values: TransferFormValues; added: number; skipped: number } {
  const seen = new Set(values.rows.map((row) => row.stockUuid));
  const rows = [...values.rows];
  let skipped = 0;
  for (const lot of lots) {
    if (seen.has(lot.stockUuid) || rows.length >= ROW_MAX) {
      skipped += 1;
      continue;
    }
    seen.add(lot.stockUuid);
    rows.push(lotToRow(lot));
  }
  return { values: { ...values, rows }, added: rows.length - values.rows.length, skipped };
}

export function removeRows(values: TransferFormValues, keys: ReadonlySet<string>): TransferFormValues {
  return { ...values, rows: values.rows.filter((row) => !keys.has(row.key)) };
}

/** `exclude` for the picker / barcode lookup: the lots already on the document. */
export const pickedStockUuids = (values: Pick<TransferFormValues, "rows">) => values.rows.map((row) => row.stockUuid);

/** Placeholder rows under the picked ones so the grid shows at least 5 rows. */
export const emptyRowCount = (rowCount: number) => Math.max(0, MIN_VISIBLE_ROWS - rowCount);

/** New Location choices: every active location except the row's own (ADR-0060 D12). */
export function newLocationOptions(locations: readonly string[], fromLocation: string, current = ""): { value: string; label: string }[] {
  const own = fromLocation.trim().toLowerCase();
  const options = locations.filter((name) => name.trim().toLowerCase() !== own).map((name) => ({ value: name, label: name }));
  // A saved destination that is no longer active stays visible so the row reads correctly (Save reports it).
  if (current && current.trim().toLowerCase() !== own && !options.some((option) => option.value === current)) options.unshift({ value: current, label: current });
  return options;
}

/** Only digits; leading zeros dropped. */
const cleanInt = (value: string) => value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");

/** PCS typed: integer text; PCS equal to on hand fills WEIGHT with the on-hand weight. */
export function pcsPatch(row: Pick<TransferRow, "onHandPcs" | "onHandWeightCt">, typed: string): Pick<TransferRow, "pcs"> & Partial<Pick<TransferRow, "weightCt">> {
  const pcs = cleanInt(typed);
  if (pcs !== "" && Number(pcs) === row.onHandPcs && row.onHandPcs > 0) return { pcs, weightCt: toFixed(dec(row.onHandWeightCt), WEIGHT_PLACES) };
  return { pcs };
}

export type RowIssue = "location" | "amount" | "pcs" | "weight";

export const ISSUE_TEXT: Record<RowIssue, string> = {
  location: "Select a new location",
  amount: "Enter Pcs or Weight to move",
  pcs: "Pcs must be a whole number up to on hand",
  weight: "Weight must be up to on hand (3 decimals)",
};

const WEIGHT_TEXT = /^\d+(\.\d{1,3})?$/;

/** The first problem of a picked row, or null. */
export function rowIssue(row: TransferRow): RowIssue | null {
  if (!row.toLocation || row.toLocation.trim().toLowerCase() === row.fromLocation.trim().toLowerCase()) return "location";
  const pcsText = row.pcs.trim();
  const weightText = row.weightCt.trim();
  if (pcsText && (!/^\d+$/.test(pcsText) || Number(pcsText) > row.onHandPcs)) return "pcs";
  if (weightText && (!WEIGHT_TEXT.test(weightText) || dec(weightText) > dec(row.onHandWeightCt))) return "weight";
  const pcs = pcsText ? Number(pcsText) : 0;
  const weight = weightText ? dec(weightText) : dec("0");
  if (pcs <= 0 && weight <= dec("0")) return "amount";
  return null;
}

export type TransferIssues = { docDate: boolean; noRows: boolean; tooMany: boolean; rows: { index: number; key: string; issue: RowIssue }[] };

/** Save rule (ADR-0060 D12): Doc Date, ≥ 1 picked row, and every row with a New Location and an amount. */
export function validateTransfer(values: TransferFormValues): TransferIssues {
  return {
    docDate: !/^\d{4}-\d{2}-\d{2}$/.test(values.docDate),
    noRows: values.rows.length === 0,
    tooMany: values.rows.length > ROW_MAX,
    rows: values.rows.flatMap((row, index) => {
      const issue = rowIssue(row);
      return issue ? [{ index, key: row.key, issue }] : [];
    }),
  };
}

export const isValid = (issues: TransferIssues) => !issues.docDate && !issues.noRows && !issues.tooMany && issues.rows.length === 0;

export const NO_ROWS_TEXT = "Pick at least one item from stock";
export const DOC_DATE_TEXT = "Doc Date is required";

/** One toast for a refused Save: the first problem. */
export function invalidMessage(issues: TransferIssues): string {
  if (issues.docDate) return DOC_DATE_TEXT;
  if (issues.noRows) return NO_ROWS_TEXT;
  if (issues.tooMany) return `A transfer can have up to ${ROW_MAX} rows`;
  const first = issues.rows[0];
  return first ? `Row ${first.index + 1}: ${ISSUE_TEXT[first.issue]}` : "Check the form and try again.";
}

/** Form → `TransferInput` (empty amounts sent as 0). */
export function toTransferInput(values: TransferFormValues): TransferInput {
  return {
    docDate: values.docDate,
    ref: values.ref.trim().slice(0, REF_MAX),
    ...(values.note.trim() ? { note: values.note.trim().slice(0, NOTE_MAX) } : {}),
    lines: values.rows.map((row) => ({
      ...(row.id ? { id: row.id } : {}),
      fromStockUuid: row.stockUuid,
      onHandPcs: row.onHandPcs,
      onHandWeightCt: row.onHandWeightCt,
      toLocation: row.toLocation,
      pcs: row.pcs.trim() ? Number(row.pcs) : 0,
      weightCt: toFixed(dec(row.weightCt.trim() || "0"), WEIGHT_PLACES),
      ...(row.remark ? { remark: row.remark } : {}),
    })),
  };
}

/** `GET /stock-transfer-location/{id}` → the form (lines in position order). */
export function fromTransfer(detail: TransferOut): TransferFormValues {
  return {
    docDate: detail.docDate,
    ref: detail.ref,
    note: detail.note,
    rows: [...detail.lines]
      .sort((a, b) => a.position - b.position)
      .map((line) => ({
        key: line.id,
        id: line.id,
        stockUuid: line.fromStockUuid,
        stockId: line.stockId,
        newStockId: line.newStockId ?? "",
        lotKey: line.lotKey,
        refDocNo: line.refDocNo,
        fromLocation: line.fromLocation,
        priceUnit: line.priceUnit,
        stockPrice: line.stockPrice,
        currency: line.currency,
        onHandPcs: line.onHandPcs,
        onHandWeightCt: line.onHandWeightCt,
        attrs: line.attrs,
        toLocation: line.toLocation,
        pcs: String(line.pcs),
        weightCt: line.weightCt,
        remark: line.remark,
      })),
  };
}

export const unitText = (unit: PriceUnit) => (unit === "PER_PCS" ? "per pcs" : "per cts");

export type SortKey = "stoneCode" | "location" | "lot" | "pcs" | "weight" | "price";
export type SortState = { key: SortKey; dir: "asc" | "desc" } | null;

/** Header click: a new column sorts ascending, the same column flips, a third click returns to pick order. */
export function nextSort(current: SortState, key: SortKey): SortState {
  if (!current || current.key !== key) return { key, dir: "asc" };
  return current.dir === "asc" ? { key, dir: "desc" } : null;
}

const sortValue = (row: TransferRow, key: SortKey): string | bigint => {
  switch (key) {
    case "stoneCode":
      return row.attrs.stoneCode.toLowerCase();
    case "location":
      return row.fromLocation.toLowerCase();
    case "lot":
      return row.attrs.lot.toLowerCase();
    case "pcs":
      return BigInt(row.onHandPcs);
    case "weight":
      return dec(row.onHandWeightCt);
    case "price":
      return dec(row.stockPrice);
  }
};

/** Display order of the rows (the stored order and row numbers stay the pick order). */
export function sortedRows(rows: readonly TransferRow[], sort: SortState): TransferRow[] {
  if (!sort) return [...rows];
  const factor = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = sortValue(a, sort.key);
    const right = sortValue(b, sort.key);
    if (left < right) return -factor;
    if (left > right) return factor;
    return 0;
  });
}
