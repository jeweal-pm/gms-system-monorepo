import type { InferQueryLikeData } from "@trpc/react-query/shared";
import { z } from "zod";
import { dec, toFixed } from "@/features/quotation/lib/decimal";
import { emptyLine, emptyQuotation, newKey } from "@/features/quotation/lib/defaults";
import { isFilledLine, lineSchema, tradeDocumentRules, tradeDocumentShape, type QuotationLine } from "@/features/quotation/schema";
import type { masterTrpc } from "@/lib/master-trpc";

/**
 * Purchase (PU) form: UI rev 1 + rev 2 (owner 2026-11-04) on SA rev 1 (ADR-0042). A row is keyed in (MANUAL), picked from
 * the vendor's Memo Stock or picked from an approved Purchase Order line. Picked rows are `source: "STOCK"` in the form,
 * so the shared row panel locks every copied field (R2-03) and only Pcs, Weight, Price and the Item Note stay editable.
 */

export const PURCHASE_HREF = "/purchase-order/purchase";
export const purchaseHref = (id: string) => `${PURCHASE_HREF}/${id}`;
/** The design shows a 250-character Document Note counter (S-01). */
export const PURCHASE_NOTE_MAX = 250;
/** A document holds at most 200 lines (C `LINES_MAX`). */
export const PURCHASE_LINES_MAX = 200;
/** Q-PU-06: a saved purchase waits as Pending Approval; Approve makes it read-only. */
export const PURCHASE_STATUSES = ["PENDING_APPROVAL", "APPROVED"] as const;

/** `purchase.memoStock` row (SA-PU-12): SOLD rows first, then IN_STOCK; `sale` / `locationType` are null (D6). */
export type PurchaseMemoStockRow = InferQueryLikeData<typeof masterTrpc.purchase.memoStock>["items"][number];
/** `purchase.purchaseOrderLines` row (SA-PU-13): an approved PO line with an open quantity. */
export type PurchaseOrderLineRow = InferQueryLikeData<typeof masterTrpc.purchase.purchaseOrderLines>["items"][number];
export type MemoGroup = PurchaseMemoStockRow["status"];
export type PurchaseLineSource = "STOCK" | "PURCHASE_ORDER" | "MANUAL";

/**
 * A picked row keeps its source and its cap (`stockPendingPcs` / `stockPendingWeightCt`: the Memo Stock quantity or the
 * PO line's open quantity, R2-03), which the shared row panel reads for "Pcs fills Weight". `sourceDocNo` is the Memo
 * No. or PO No., shown only. Manual and empty rows have none of these.
 */
const purchaseLineSchema = lineSchema.extend({
  memoStockId: z.string().default(""),
  memoGroup: z.enum(["", "IN_STOCK", "SOLD"]).default(""),
  purchaseOrderLineId: z.string().default(""),
  sourceDocNo: z.string().default(""),
  stockPendingPcs: z.string().default(""),
  stockPendingWeightCt: z.string().default(""),
});
export type PurchaseLine = z.infer<typeof purchaseLineSchema>;

/** Where a row comes from, as the contract names it. */
export function purchaseLineSource(line: Partial<Pick<PurchaseLine, "memoStockId" | "purchaseOrderLineId">>): PurchaseLineSource {
  if (line.memoStockId) return "STOCK";
  if (line.purchaseOrderLineId) return "PURCHASE_ORDER";
  return "MANUAL";
}

/**
 * Row rules (form-guidelines, R2-03, api-contract "Input rules"): every filled row needs Pcs or Weight > 0 and a Price
 * > 0; a picked row stays within its cap.
 */
function purchaseLineRules(lines: readonly PurchaseLine[], ctx: z.RefinementCtx) {
  lines.forEach((line, index) => {
    if (!isFilledLine(line)) return;
    const issue = (field: "pcs" | "weightCt" | "unitPrice", message: string) => ctx.addIssue({ code: "custom", path: ["lines", index, field], message });
    const pcs = dec(line.pcs);
    const weight = dec(line.weightCt);
    if (pcs <= dec(0) && weight <= dec(0)) issue("pcs", "Enter the quantity");
    const source = purchaseLineSource(line);
    if (source !== "MANUAL") {
      const word = source === "STOCK" ? "pending" : "open";
      const capPcs = line.stockPendingPcs || "0";
      const capWeight = line.stockPendingWeightCt || "0";
      if (pcs > dec(capPcs)) issue("pcs", `More than the ${word} ${capPcs} pcs`);
      if (weight > dec(capWeight)) issue("weightCt", `More than the ${word} ${capWeight} ct`);
    }
    if (dec(line.unitPrice) <= dec(0)) issue("unitPrice", "Enter the price");
  });
}

export const purchaseSchema = z
  .object({
    ...tradeDocumentShape,
    lines: z.array(purchaseLineSchema).max(PURCHASE_LINES_MAX, `Up to ${PURCHASE_LINES_MAX} rows`),
    documentNote: z.string().max(PURCHASE_NOTE_MAX, `Up to ${PURCHASE_NOTE_MAX} characters`),
    status: z.enum(PURCHASE_STATUSES),
    vendorId: z.string().min(1, "Required"),
    addressId: z.string().min(1, "Required"),
  })
  .superRefine((value, ctx) => {
    tradeDocumentRules(value, ctx);
    purchaseLineRules(value.lines, ctx);
  });

export type PurchaseFormValues = z.infer<typeof purchaseSchema>;

const NO_SOURCE = { memoStockId: "", memoGroup: "", purchaseOrderLineId: "", sourceDocNo: "", stockPendingPcs: "", stockPendingWeightCt: "" } as const;
export const emptyPurchaseLine = (): PurchaseLine => ({ ...emptyLine(), ...NO_SOURCE });

/** A new purchase: today, five empty rows, the company currency once it loads. */
export function emptyPurchase(): PurchaseFormValues {
  const q = emptyQuotation();
  return {
    status: "PENDING_APPROVAL",
    docDate: q.docDate,
    dueDate: q.dueDate,
    vendorId: "",
    addressId: "",
    currency: q.currency,
    exchangeRate: q.exchangeRate,
    ref: q.ref,
    lines: q.lines.map(() => emptyPurchaseLine()),
    discount: q.discount,
    tax: q.tax,
    serviceCharges: q.serviceCharges,
    labor: q.labor,
    documentNote: q.documentNote,
  };
}

type Copied = Pick<PurchaseLine, "stone" | "shape" | "size" | "color" | "clarity" | "cutting" | "quality" | "cerType" | "cerNo" | "lot" | "itemNote">;
const copied = (row: Copied): Copied => ({
  stone: row.stone, shape: row.shape, size: row.size, color: row.color, clarity: row.clarity, cutting: row.cutting, quality: row.quality,
  cerType: row.cerType, cerNo: row.cerNo, lot: row.lot, itemNote: row.itemNote,
});

/**
 * A Memo Stock row → a purchase row (R2-03, Q-PU-04): Stock ID, lot, location, stone and certificate copied and locked;
 * Pcs and Weight start at the row's available quantity (its cap); Price starts at the net unit price after the memo line
 * discount (Q-MR-13) at 2 dp. The row's group is sent back as `memoGroup`. Memo Stock has no stone code.
 */
export function memoStockToPurchaseLine(row: PurchaseMemoStockRow): PurchaseLine {
  return {
    ...emptyPurchaseLine(),
    ...copied(row),
    key: newKey(),
    source: "STOCK",
    stockId: row.stockId,
    locationId: row.location,
    pcs: String(row.availablePcs),
    weightCt: toFixed(dec(row.availableWeightCt), 3),
    priceUnit: row.priceUnit === "PCS" ? "PER_PCS" : "PER_CT",
    unitPrice: toFixed(dec(row.netUnitPrice), 2),
    memoStockId: row.memoStockId,
    memoGroup: row.status,
    sourceDocNo: row.memoReceive.docNo,
    stockPendingPcs: String(row.availablePcs),
    stockPendingWeightCt: row.availableWeightCt,
  };
}

/**
 * An approved PO line → a purchase row (R2-PO, R2-05): attributes, stone code, lot, location, certificate and note copied
 * and locked; Pcs and Weight start at the open quantity (ordered − purchased, the cap); Price starts at the PO net unit
 * price (D12). The Stock ID is "Auto" until the save issues one. PO photos are not copied (Q-PU-11).
 */
export function purchaseOrderLineToPurchaseLine(row: PurchaseOrderLineRow): PurchaseLine {
  return {
    ...emptyPurchaseLine(),
    ...copied(row),
    key: newKey(),
    source: "STOCK",
    stockId: "",
    stoneCode: row.stoneCode,
    locationId: row.location,
    pcs: String(row.availablePcs),
    weightCt: toFixed(dec(row.availableWeightCt), 3),
    priceUnit: row.priceUnit,
    unitPrice: toFixed(dec(row.netUnitPrice), 2),
    purchaseOrderLineId: row.purchaseOrderLineId,
    sourceDocNo: row.purchaseOrder.docNo,
    stockPendingPcs: String(row.availablePcs),
    stockPendingWeightCt: row.availableWeightCt,
  };
}

/** The picker key of a Memo Stock row (`purchase.memoStock` `key`). */
export const memoStockKey = (memoStockId: string, group: string) => `${memoStockId}:${group}`;

/** Sources already on the form; both pickers leave them out (Memo Stock by `key`, PO by line id). */
export function pickedSourceKeys(lines: readonly QuotationLine[]): Set<string> {
  return new Set(
    lines.flatMap((line) => {
      const row = line as Partial<PurchaseLine>;
      if (row.memoStockId) return [memoStockKey(row.memoStockId, row.memoGroup || "IN_STOCK")];
      if (row.purchaseOrderLineId) return [row.purchaseOrderLineId];
      return [];
    }),
  );
}

/**
 * A new vendor (R2-04): rows picked from Memo Stock **and** from a Purchase Order become empty rows; manual rows stay.
 * Returns null when nothing changes.
 */
export function clearPickedRows(lines: readonly PurchaseLine[]): PurchaseLine[] | null {
  if (!lines.some((line) => purchaseLineSource(line) !== "MANUAL")) return null;
  return lines.map((line) => (purchaseLineSource(line) !== "MANUAL" ? emptyPurchaseLine() : line));
}

/**
 * How a row reads in the page table (R2-05, FE-PU-005): a manual or PO row without a Stock ID yet shows "Auto", a PO row
 * adds "from {PO No.}", and a blank Location shows "—". Display only; the form keeps its values.
 */
export function purchaseTableLine<T extends QuotationLine>(line: T): T {
  if (!isFilledLine(line)) return line;
  const row = line as T & Partial<PurchaseLine>;
  const from = row.purchaseOrderLineId ? ` · from ${row.sourceDocNo}` : "";
  return { ...line, stockId: `${line.stockId || "Auto"}${from}`, locationId: line.locationId || "—" };
}

/**
 * Approve confirm (FE-PU-005, SA D2): names the stock effect of the rows. Memo Stock rows come off Memo Stock, PO rows
 * off the Purchase Orders' open quantity; manual rows move nothing.
 */
export function purchaseApproveText(lines: readonly QuotationLine[]): string {
  const count = lines.length;
  const sources = new Set(lines.map((line) => purchaseLineSource(line as Partial<PurchaseLine>)));
  const items = `${count} ${count === 1 ? "item is" : "items are"}`;
  const from = [sources.has("STOCK") && "Memo Stock", sources.has("PURCHASE_ORDER") && "the Purchase Orders"].filter(Boolean).join(" and ");
  return from
    ? `Approve this Purchase? Its ${items} taken off ${from}, and it can no longer be edited.`
    : `Approve this Purchase? Its ${items} recorded as bought, and it can no longer be edited.`;
}
