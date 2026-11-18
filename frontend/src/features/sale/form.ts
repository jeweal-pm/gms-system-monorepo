import { z } from "zod";
import { toTradeDocumentInput } from "@/features/quotation/api";
import { dec, toFixed } from "@/features/quotation/lib/decimal";
import { emptyLine, emptyQuotation, newKey } from "@/features/quotation/lib/defaults";
import { isFilledLine, lineSchema, tradeDocumentRules, tradeDocumentShape, type QuotationLine } from "@/features/quotation/schema";
import type { MemoStockItem } from "@/features/trade-document/memo-stock-api";
import { APPROVAL_DOC_STATUSES } from "@/features/trade-document/flow-status";

/**
 * Sale (SL) form model: UI rev 1 + SA rev 1 / ADR-0054 (owner "อนุมัติทั้งสอง" 2026-11-18). Every row is picked
 * (Q-SL-07): From Reserve (an open line of an approved Reserve of this customer in this currency, Q-SL-05) or From Stock
 * (a Memo Stock item with pending, phase 1, Q-SL-01). Picked rows are `source: "STOCK"` in the shared form, so the row
 * panel locks the copied fields; `saleSource` says which picker they came from. Only Pcs, Weight (≤ the row's cap),
 * Sale Price (> 0), the line discount and the Item Note are edited (Q-SL-06/08).
 */

export const SALE_HREF = "/sale/sale";
export const saleHref = (id: string) => `${SALE_HREF}/${id}`;
/** A document holds at most 200 lines (C `LINES_MAX`, api-contract `lines: 1..200`). */
export const SALE_LINES_MAX = 200;
/** Document Note ≤ 250 (form-guidelines). */
export const SALE_NOTE_MAX = 250;
/** ADR-0050: Draft, Pending Approval, Approved, Revise, Rejected. */
export const SALE_STATUSES = APPROVAL_DOC_STATUSES;

/** api-contract `Source` (phase 2 adds `OWN_STOCK`, ADR-0054 D11). */
export type SaleLineSource = "RESERVE" | "STOCK";

/**
 * `GET /api/inventory/v1/sale/reserve-lines` row (api-contract `ReserveLineRef`): an open line of an approved Reserve.
 * Typed here from the approved contract; the REST adapter (FE-SL-004/006) returns this shape.
 */
export type SaleReserveLineRef = {
  reserveLineId: string;
  reserveId: string;
  reserveNo: string;
  reserveDate: string;
  dueDate: string;
  memoStockId: string;
  stockId: string;
  priceUnit: "PER_CT" | "PER_PCS";
  netUnitPrice: string;
  openPcs: number;
  openWeightCt: string;
  openAmount: string;
  stoneCode: string;
  stone: string;
  shape: string;
  size: string;
  color: string;
  clarity: string;
  cutting: string;
  quality: string;
  lot: string;
  location: string;
  cerType: string;
  cerNo: string;
};

/**
 * A picked row keeps its source, the source id (`reserveLineId` or `memoStockId`), the source document number (shown as
 * "from {No.}") and its cap (`stockPendingPcs` / `stockPendingWeightCt`: open reserve or pending stock), which the shared
 * row panel reads for "Pcs fills Weight". `lineId` is the saved line id sent back on update. Empty rows have none.
 */
const saleLineSchema = lineSchema.extend({
  lineId: z.string().default(""),
  saleSource: z.enum(["", "RESERVE", "STOCK"]).default(""),
  reserveLineId: z.string().default(""),
  memoStockId: z.string().default(""),
  sourceDocNo: z.string().default(""),
  stockPendingPcs: z.string().default(""),
  stockPendingWeightCt: z.string().default(""),
});
export type SaleLine = z.infer<typeof saleLineSchema>;

const NO_SOURCE = { lineId: "", saleSource: "", reserveLineId: "", memoStockId: "", sourceDocNo: "", stockPendingPcs: "", stockPendingWeightCt: "" } as const;
export const emptySaleLine = (): SaleLine => ({ ...emptyLine(), ...NO_SOURCE });

/** Where a row comes from; "" for an empty (or, never on this page, a typed) row. */
export function saleLineSource(line: Partial<Pick<SaleLine, "saleSource">>): SaleLineSource | "" {
  return line.saleSource ?? "";
}

/** The cap word of each source in row errors and the row panel (ui-spec T-09). */
const CAP_WORD: Record<SaleLineSource, string> = { RESERVE: "reserved", STOCK: "available" };

/**
 * Row rules (form-guidelines, Q-SL-06/08): every filled row is picked; Pcs or Weight > 0 and each ≤ the row's cap; Sale
 * Price required > 0.
 */
export function saleLineRules(lines: readonly SaleLine[], ctx: z.RefinementCtx) {
  lines.forEach((line, index) => {
    if (!isFilledLine(line)) return;
    const issue = (field: "pcs" | "weightCt" | "unitPrice", message: string) => ctx.addIssue({ code: "custom", path: ["lines", index, field], message });
    const source = saleLineSource(line);
    if (source === "") {
      issue("pcs", "Pick this item From Reserve or From Stock");
      return;
    }
    const pcs = dec(line.pcs);
    const weight = dec(line.weightCt);
    if (pcs <= dec(0) && weight <= dec(0)) issue("pcs", "Enter the quantity");
    const capPcs = line.stockPendingPcs || "0";
    const capWeight = line.stockPendingWeightCt || "0";
    if (pcs > dec(capPcs)) issue("pcs", `More than the ${CAP_WORD[source]} ${capPcs} pcs`);
    if (weight > dec(capWeight)) issue("weightCt", `More than the ${CAP_WORD[source]} ${capWeight} ct`);
    if (dec(line.unitPrice) <= dec(0)) issue("unitPrice", "Enter the sale price");
  });
}

export const saleSchema = z
  .object({
    ...tradeDocumentShape,
    lines: z.array(saleLineSchema).max(SALE_LINES_MAX, `Up to ${SALE_LINES_MAX} rows`),
    documentNote: z.string().max(SALE_NOTE_MAX, `Up to ${SALE_NOTE_MAX} characters`),
    statusReason: z.string().optional(),
    status: z.enum(SALE_STATUSES),
    customerId: z.string().min(1, "Required"),
    shippingAddressId: z.string().min(1, "Required"),
    invoiceAddressId: z.string().min(1, "Required"),
  })
  .superRefine((value, ctx) => {
    tradeDocumentRules(value, ctx);
    saleLineRules(value.lines, ctx);
  });

export type SaleFormValues = z.infer<typeof saleSchema>;

/** A new sale: today, five empty rows, the company currency once options load. */
export function emptySale(): SaleFormValues {
  const q = emptyQuotation();
  return { ...q, status: "DRAFT", lines: q.lines.map(() => emptySaleLine()) };
}

/**
 * An open Reserve line → a From Reserve row (P-01, Q-SL-05/08): Stock ID, lot, location, stone and certificate copied and
 * locked; Pcs and Weight start at the open quantity (the cap); Sale Price starts at the Reserve's net unit price (after
 * its line discount) at 2 dp.
 */
export function reserveLineToSaleLine(row: SaleReserveLineRef): SaleLine {
  return {
    ...emptySaleLine(),
    key: newKey(),
    source: "STOCK",
    stockId: row.stockId,
    lot: row.lot,
    stoneCode: row.stoneCode,
    locationId: row.location,
    stone: row.stone,
    shape: row.shape,
    size: row.size,
    color: row.color,
    clarity: row.clarity,
    cutting: row.cutting,
    quality: row.quality,
    cerType: row.cerType,
    cerNo: row.cerNo,
    pcs: String(row.openPcs),
    weightCt: toFixed(dec(row.openWeightCt), 3),
    priceUnit: row.priceUnit,
    unitPrice: toFixed(dec(row.netUnitPrice), 2),
    saleSource: "RESERVE",
    reserveLineId: row.reserveLineId,
    memoStockId: row.memoStockId,
    sourceDocNo: row.reserveNo,
    stockPendingPcs: String(row.openPcs),
    stockPendingWeightCt: row.openWeightCt,
  };
}

/**
 * A Memo Stock item → a From Stock row (P-02 phase 1, as Reserve / Memo Out): the full pending as the starting quantity
 * (the cap), location Memo, and an empty Sale Price the user must type (TC-SL-05).
 */
export function memoStockToSaleLine(item: MemoStockItem): SaleLine {
  return {
    ...emptySaleLine(),
    key: newKey(),
    source: "STOCK",
    stockId: item.stockId,
    lot: item.lot,
    locationId: item.location,
    stone: item.stone,
    shape: item.shape,
    size: item.size,
    color: item.color,
    clarity: item.clarity,
    cutting: item.cutting,
    quality: item.quality,
    cerType: item.cerType,
    cerNo: item.cerNo,
    pcs: String(item.pendingPcs),
    weightCt: toFixed(dec(item.pendingWeightCt), 3),
    priceUnit: item.priceUnit === "PCS" ? "PER_PCS" : "PER_CT",
    unitPrice: "",
    saleSource: "STOCK",
    memoStockId: item.id,
    sourceDocNo: item.memoReceive.docNo,
    stockPendingPcs: String(item.pendingPcs),
    stockPendingWeightCt: item.pendingWeightCt,
  };
}

/**
 * From Reserve is blocked with a toast until a customer and a currency are chosen (T-02). From Stock is not tied to
 * either (T-03, Q-RS-06 rule).
 */
export function salePickerBlocked(values: Pick<SaleFormValues, "customerId" | "currency">): string | null {
  if (!values.customerId) return "Choose a customer first";
  if (!values.currency) return "Choose a currency first";
  return null;
}

const asSale = (line: QuotationLine) => line as Partial<SaleLine>;

/** Reserve lines already on the form (Add From Reserve leaves them out). */
export const pickedReserveLineIds = (lines: readonly QuotationLine[]) =>
  new Set(lines.flatMap((line) => (asSale(line).saleSource === "RESERVE" && asSale(line).reserveLineId ? [asSale(line).reserveLineId!] : [])));

/** Memo Stock items already on the form as From Stock rows (Add From Stock leaves them out; Reserve rows don't count). */
export const pickedStockIds = (lines: readonly QuotationLine[]) =>
  new Set(lines.flatMap((line) => (asSale(line).saleSource === "STOCK" && asSale(line).memoStockId ? [asSale(line).memoStockId!] : [])));

/** From Reserve rows on the form. */
export const reserveRowCount = (lines: readonly QuotationLine[]) => lines.filter((line) => asSale(line).saleSource === "RESERVE").length;

/**
 * Q-SL-05: a new customer or currency empties the From Reserve rows (they belong to that customer's reserve in that
 * currency); From Stock rows stay. null when there is nothing to clear.
 */
export function clearReserveRows(lines: readonly SaleLine[]): SaleLine[] | null {
  if (reserveRowCount(lines) === 0) return null;
  return lines.map((line) => (line.saleSource === "RESERVE" ? emptySaleLine() : line));
}

/** TC-SL-07: asked before a customer / currency change removes From Reserve rows. */
export function saleHeaderChangeConfirm(count: number, field: "customer" | "currency") {
  const rows = `${count} ${count === 1 ? "row" : "rows"}`;
  return {
    title: `Change the ${field}?`,
    body: `This removes the ${rows} taken From Reserve. Rows taken From Stock stay.`,
    cancelLabel: `Keep ${field}`,
    confirmLabel: `Change ${field}`,
  };
}

/** Row panel note under Pcs / Weight (T-09): "Reserved x pcs / y ct · {Reserve No.}" or "Available x pcs / y ct". */
export function saleStockNote(line: Partial<SaleLine>): string | null {
  const cap = `${line.stockPendingPcs || "0"} pcs / ${line.stockPendingWeightCt || "0"} ct`;
  if (line.saleSource === "RESERVE") return `Reserved ${cap}${line.sourceDocNo ? ` · ${line.sourceDocNo}` : ""}`;
  if (line.saleSource === "STOCK") return `Available ${cap}`;
  return null;
}

/** The table's first column (T-06): the Stock ID with "from {Reserve No. / Memo Receive No.}". Display only. */
export function saleTableLine<T extends QuotationLine>(line: T): T {
  const row = line as T & Partial<SaleLine>;
  if (!isFilledLine(line) || !row.sourceDocNo) return line;
  return { ...line, stockId: `${line.stockId} · from ${row.sourceDocNo}` };
}

/**
 * Form values → `SaleInput` (api-contract): the shared header and summary mapping (as Reserve), the customer and
 * addresses, and per filled row only the contract `LineInput` fields.
 */
export function toSaleInput(values: SaleFormValues) {
  const { lines: sharedLines, ...header } = toTradeDocumentInput(values);
  const filled = values.lines.filter(isFilledLine);
  return {
    ...header,
    customerId: values.customerId,
    shippingAddressId: values.shippingAddressId,
    invoiceAddressId: values.invoiceAddressId,
    lines: filled.map((line, index) => {
      const shared = sharedLines[index]!;
      const source = line.saleSource as SaleLineSource;
      return {
        ...(line.lineId ? { id: line.lineId } : {}),
        source,
        ...(source === "RESERVE" ? { reserveLineId: line.reserveLineId } : { memoStockId: line.memoStockId }),
        pcs: shared.pcs,
        weightCt: shared.weightCt,
        unitPrice: shared.unitPrice,
        discount: shared.discount,
        itemNote: shared.itemNote,
        photoIds: shared.photoIds,
      };
    }),
  };
}
export type SaleInput = ReturnType<typeof toSaleInput>;
