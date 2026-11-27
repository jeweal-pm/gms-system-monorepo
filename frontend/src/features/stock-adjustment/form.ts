import { z } from "zod";
import { add, dec, sub, toFixed } from "@/features/quotation/lib/decimal";

export type AdjustmentLine = {
  key: string;
  id?: string;
  stockUuid: string;
  stockId: string;
  lotKey: string;
  refDocNo: string;
  priceUnit: "PER_CT" | "PER_PCS";
  stockPcs: number;
  stockWeightCt: string;
  stockPrice: string;
  physicalPcs: string;
  physicalWeightCt: string;
  physicalPrice: string;
  remark: string;
  attrs: { stoneCode: string; stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string; lot: string; location: string; cerType: string; cerNo: string };
};

export type AdjustmentForm = { docDate: string; location: string; ref: string; note: string; lines: AdjustmentLine[] };
export const ROW_MAX = 200;
export const emptyAdjustment = (docDate: string): AdjustmentForm => ({ docDate, location: "", ref: "", note: "", lines: [] });

let sequence = 0;
export function lineFromStock(item: {
  stockUuid: string; stockId: string; lotKey: string; refDocNo: string; priceUnit: "PER_CT" | "PER_PCS";
  onHandPcs: number; onHandWeightCt: string; stockPrice: string; attrs: AdjustmentLine["attrs"];
}): AdjustmentLine {
  return { ...item, stockPcs: item.onHandPcs, stockWeightCt: item.onHandWeightCt, key: `adjustment-${Date.now().toString(36)}-${++sequence}`, physicalPcs: "", physicalWeightCt: "", physicalPrice: item.stockPrice, remark: "" };
}

export function diff(value: string | number, stock: string | number, places: number): string | null {
  const text = String(value).trim();
  if (!text) return null;
  return toFixed(sub(dec(text), dec(String(stock))), places);
}

export function sanitize(value: string, decimals: number): string {
  const cleaned = value.replace(/,/g, "").replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  const normalized = dot < 0 ? cleaned : `${cleaned.slice(0, dot)}.${cleaned.slice(dot + 1).replace(/\./g, "")}`;
  const limited = decimals === 0 ? normalized.split(".")[0] ?? "" : normalized.replace(new RegExp(`(\\.\\d{${decimals}})\\d+`), "$1");
  const noLeadingZeros = limited.replace(/^0+(?=\d)/, "");
  return noLeadingZeros.startsWith(".") ? `0${noLeadingZeros}` : noLeadingZeros;
}

export const adjustmentSchema = z.object({
  docDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  location: z.string().trim().min(1, "Choose a Main Location"),
  ref: z.string().max(100),
  note: z.string().max(250),
  lines: z.array(z.object({
    stockUuid: z.string().uuid(),
    physicalPcs: z.string().regex(/^\d{1,6}$/, "Enter whole pieces"),
    physicalWeightCt: z.string().regex(/^\d{1,9}(\.\d{1,3})?$/, "Enter weight up to 3 decimal places"),
    physicalPrice: z.union([z.string().regex(/^\d{1,16}(\.\d{1,2})?$/, "Enter price up to 2 decimal places"), z.literal("")]),
    remark: z.string().max(250),
  })).min(1, "Pick at least one stock lot").max(ROW_MAX),
});

export function toAdjustmentInput(value: AdjustmentForm) {
  return {
    docDate: value.docDate,
    location: value.location.trim(),
    ref: value.ref.trim(),
    note: value.note.trim(),
    lines: value.lines.map((line) => ({
      ...(line.id ? { id: line.id } : {}), stockUuid: line.stockUuid, stockPcs: line.stockPcs,
      stockWeightCt: line.stockWeightCt, physicalPcs: Number(line.physicalPcs), physicalWeightCt: line.physicalWeightCt,
      physicalPrice: line.physicalPrice || null, remark: line.remark.trim(),
    })),
  };
}

/** Summary rail totals: on-hand Stock against the typed Physical counts (blank Physical counts as 0). */
export function adjustmentTotals(lines: readonly AdjustmentLine[]) {
  const whole = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text) : 0);
  const weight = (text: string) => (/^\d+(\.\d+)?$/.test(text.trim()) ? dec(text.trim()) : dec("0"));
  const stockPcs = lines.reduce((sum, line) => sum + line.stockPcs, 0);
  const physicalPcs = lines.reduce((sum, line) => sum + whole(line.physicalPcs), 0);
  const stockCt = add(dec("0"), ...lines.map((line) => weight(line.stockWeightCt)));
  const physicalCt = add(dec("0"), ...lines.map((line) => weight(line.physicalWeightCt)));
  return {
    rowCount: lines.length,
    stockPcs,
    physicalPcs,
    diffPcs: physicalPcs - stockPcs,
    stockWeightCt: toFixed(stockCt, 3),
    physicalWeightCt: toFixed(physicalCt, 3),
    diffWeightCt: toFixed(sub(physicalCt, stockCt), 3),
  };
}

export type StoneSort = "asc" | "desc" | null;
/** Stone Code header: none → ascending → descending → none. */
export const nextStoneSort = (current: StoneSort): StoneSort => (current === null ? "asc" : current === "asc" ? "desc" : null);
/** Rows ordered by Stone Code (Stock ID when there is none); the original order when unsorted. */
export function sortByStoneCode(lines: readonly AdjustmentLine[], sort: StoneSort): readonly AdjustmentLine[] {
  if (!sort) return lines;
  const code = (line: AdjustmentLine) => line.attrs.stoneCode || line.stockId;
  return [...lines].sort((a, b) => code(a).localeCompare(code(b), undefined, { numeric: true }) * (sort === "asc" ? 1 : -1));
}
