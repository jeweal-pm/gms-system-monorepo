"use client";

import type { InferQueryLikeData } from "@trpc/react-query/shared";
import { z } from "zod";
import { fromTradeDocument, toTradeDocumentInput } from "@/features/quotation/api";
import { dec, toFixed } from "@/features/quotation/lib/decimal";
import { emptyQuotation, newKey } from "@/features/quotation/lib/defaults";
import { isFilledLine, lineSchema, stockLineRules, tradeDocumentRules, tradeDocumentShape, type QuotationLine } from "@/features/quotation/schema";
import type { masterTrpc } from "@/lib/master-trpc";
import { readDomainError } from "@/lib/trpc-error";
import { mapDocumentSaveError } from "./document-api";
import type { FromStockItem } from "./from-stock-api";
import { lotPendingShortText, lotTooLargeMessage, sentLotLines } from "./lot-stock";
import { INVENTORY_UNAVAILABLE_TEXT, isStockBusyCode, onlyLeftText, STOCK_BUSY_TEXT, stockRowMessage } from "./stock-row-errors";
import { APPROVAL_DOC_STATUSES } from "@/features/trade-document/flow-status";

/**
 * Customer documents whose rows may come From Stock (memo-out rev 2, reserve rev 1). They share the form values, rules
 * and mapping; only their routes, wording and API differ.
 * - From Stock rows name a Memo Stock item, take part or all of its pending and need a typed Sale Price.
 * - Approval holds them in Memo Stock Reserve.
 * - Rows keyed in by hand hold nothing.
 */
export type CustomerStockDetail = InferQueryLikeData<typeof masterTrpc.memoOut.get>;
export type CustomerStockOptions = InferQueryLikeData<typeof masterTrpc.memoOut.options>;

/** Saving sends the document to approval; Approve holds its stock rows and makes it read-only. */
/** ADR-0050: Draft, Pending Approval, Approved, Revise, Rejected. */
export const CUSTOMER_STOCK_STATUSES = APPROVAL_DOC_STATUSES;
const HEADER_FIELDS = ["docDate", "dueDate", "customerId", "shippingAddressId", "invoiceAddressId", "currency", "exchangeRate", "ref", "documentNote"] as const;

/**
 * A From Stock row keeps its Memo Stock item and the pending it was picked with (its maximum). Manual rows and empty
 * rows have none of these.
 */
const customerStockLineSchema = lineSchema.extend({
  memoStockId: z.string().default(""),
  /** load-to-stock phase 2 (ADR-0052 D20): our stock's UUID instead of a Memo Stock item. */
  ownStockId: z.string().default(""),
  /** lot-based-stock (ADR-0055 D4): the lot a From Stock row was picked from; saved as `lotKey` (no item id). */
  lotKey: z.string().default(""),
  stockPendingPcs: z.string().default(""),
  stockPendingWeightCt: z.string().default(""),
});
export type CustomerStockLine = z.infer<typeof customerStockLineSchema>;

export const customerStockSchema = z
  .object({
    ...tradeDocumentShape,
    lines: z.array(customerStockLineSchema),
    statusReason: z.string().optional(),
    status: z.enum(CUSTOMER_STOCK_STATUSES),
    customerId: z.string().min(1, "Required"),
    shippingAddressId: z.string().min(1, "Required"),
    invoiceAddressId: z.string().min(1, "Required"),
  })
  .superRefine((value, ctx) => {
    tradeDocumentRules(value, ctx);
    stockLineRules(value.lines, ctx);
  });

export type CustomerStockFormValues = z.infer<typeof customerStockSchema>;

/** A new document: today, five empty rows, the company currency once options load. */
export function emptyCustomerStock(): CustomerStockFormValues {
  const q = emptyQuotation();
  return { ...q, status: "DRAFT", lines: q.lines.map((line) => ({ ...line, memoStockId: "", ownStockId: "", lotKey: "", stockPendingPcs: "", stockPendingWeightCt: "" })) };
}

/**
 * lot-based-stock round 1 (FE-LOT-002/007): a picked lot (`fromStock.lots`) becomes a From Stock row: its lot and
 * details (read-only), location, the lot's pending / available as the starting quantity and cap, `lotKey` and no Stock ID
 * (owner Q-LOT-10); Sale Price still starts empty (Q-MO-11). The server copies the details on save.
 */
export function lotToStockLine(item: FromStockItem): CustomerStockLine {
  return {
    key: newKey(),
    source: "STOCK",
    stockId: "",
    lot: item.lot,
    stoneCodeId: "",
    stoneCode: "",
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
    priceUnit: item.priceUnit === "PER_PCS" ? "PER_PCS" : "PER_CT",
    unitPrice: "",
    discountType: "PERCENT",
    discountValue: "",
    stonePartOrder: [],
    photos: [],
    // The vendor / load note stays on the lot (shown in the picker); the line starts without one (Q-MO-11 style).
    itemNote: "",
    memoStockId: "",
    ownStockId: "",
    lotKey: item.lotKey,
    stockPendingPcs: String(item.pendingPcs),
    stockPendingWeightCt: item.pendingWeightCt,
  };
}

/** Form values → contract input: a From Stock row names its Memo Stock item; manual rows don't; photos in order (ADR-0048). */
export function toCustomerStockInput(values: CustomerStockFormValues) {
  const shared = toTradeDocumentInput(values);
  const filled = values.lines.filter(isFilledLine);
  return {
    ...shared,
    // ADR-0052 D20: exactly one of `memoStockId` / `ownStockId` per From Stock row.
    // lot-based-stock: a lot pick sends `lotKey` alone (the old item ids stay for lines already stored).
    lines: shared.lines.map((line, index) => {
      const lotKey = filled[index]?.lotKey || null;
      if (lotKey) return { ...line, memoStockId: null, ownStockId: null, lotKey };
      const memoStockId = filled[index]?.memoStockId || null;
      return { ...line, memoStockId, ownStockId: memoStockId ? null : filled[index]?.ownStockId || null, lotKey: null };
    }),
    customerId: values.customerId,
    shippingAddressId: values.shippingAddressId,
    invoiceAddressId: values.invoiceAddressId,
  };
}

export function fromCustomerStock(detail: CustomerStockDetail, photoUrl: (id: string) => string): CustomerStockFormValues {
  // The shared mapping reads manual lines; the stock fields are added back per line below.
  const shared = fromTradeDocument({ ...detail, lines: detail.lines.map((line) => ({ ...line, source: "MANUAL" as const })) }, photoUrl);
  return {
    ...shared,
    lines: shared.lines.map((line, index) => {
      const saved = detail.lines[index];
      return {
        ...line,
        // An our-stock line is a From Stock row in the form (`ownStockId` tells the source); the API names it OWN_STOCK.
        source: saved?.source === "OWN_STOCK" ? ("STOCK" as const) : (saved?.source ?? "MANUAL"),
        // Q-LOT-10: the Stock ID is never read; the line shows its Lot.
        stockId: "",
        lotKey: saved?.lotKey ?? "",
        memoStockId: saved?.memoStockId ?? "",
        ownStockId: saved?.ownStockId ?? "",
        stockPendingPcs: saved?.stockPendingPcs === null || saved?.stockPendingPcs === undefined ? "" : String(saved.stockPendingPcs),
        stockPendingWeightCt: saved?.stockPendingWeightCt ?? "",
      };
    }),
    status: detail.status,
    customerId: detail.customerId,
    shippingAddressId: detail.shippingAddressId ?? "",
    invoiceAddressId: detail.invoiceAddressId ?? "",
  };
}

/** Lots already on the form (From Stock leaves them out), by `lotKey`. */
export const pickedStockIds = (lines: QuotationLine[]) =>
  new Set(lines.flatMap((line) => {
    const lotKey = (line as Partial<CustomerStockLine>).lotKey;
    return lotKey ? [lotKey] : [];
  }));

/** Rows that came From Stock (the approval message counts them). */
export const stockRowCount = (lines: readonly unknown[]) =>
  lines.filter((line) => {
    const stock = line as Partial<CustomerStockLine>;
    return Boolean(stock.lotKey || stock.memoStockId || stock.ownStockId);
  }).length;

/**
 * `<CODE>_*` save errors; a short approval (another document took the stock first) has its own message. lot-based-stock
 * (FE-LOT-007): with the form's `values` a short lot reads "Row n: only x pcs / y ct left in lot L", a refused lot
 * reference ("unavailable", duplicate, …) and `STOCK_LOT_TOO_LARGE` have their own texts.
 */
export function customerStockSaveError(code: string, noun: string) {
  return (error: unknown, values?: { lines: readonly QuotationLine[] }) => {
    const { domainCode, fieldErrors, details } = readDomainError(error);
    const lines = sentLotLines(values);
    if (domainCode === `${code}_PENDING_SHORT`) {
      const row = lotPendingShortText(details, fieldErrors, lines);
      return { fieldErrors: [], message: row ? `${row}. Nothing was saved.` : "Some stock items no longer have enough pending. Edit the row and save again. Nothing was saved." };
    }
    if (domainCode === "STOCK_LOT_TOO_LARGE") return { fieldErrors: [], message: lotTooLargeMessage(details, lines) };
    // Phase 2 (reserve Revision 2, memo-out Revision 4): inventory down → nothing changes; a hold still syncing → retry.
    if (domainCode === "INVENTORY_UNAVAILABLE") return { fieldErrors: [], message: INVENTORY_UNAVAILABLE_TEXT };
    if (isStockBusyCode(domainCode, code)) return { fieldErrors: [], message: STOCK_BUSY_TEXT };
    const outcome = mapDocumentSaveError(error, code, noun, HEADER_FIELDS);
    const lotRefused = domainCode === "STOCK_LOT_UNAVAILABLE";
    const row = lotRefused || domainCode === "VALIDATION_ERROR" || domainCode === `${code}_REFERENCE_INVALID` ? stockRowMessage(fieldErrors, noun, onlyLeftText, lines) : undefined;
    return row ? { ...outcome, message: row } : outcome;
  };
}
