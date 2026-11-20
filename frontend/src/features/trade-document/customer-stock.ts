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
import type { MemoStockItem } from "./memo-stock-api";
import { isOwnStockItem, ownPickKey, type FromStockItem } from "./from-stock-api";
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
  return { ...q, status: "DRAFT", lines: q.lines.map((line) => ({ ...line, memoStockId: "", ownStockId: "", stockPendingPcs: "", stockPendingWeightCt: "" })) };
}

/**
 * A Memo Stock item → a From Stock row: its Stock ID, lot, location Memo, stone and certificate (read-only), the full
 * pending as the starting quantity (Q-MO-15), and an empty Sale Price (Q-MO-11). Memo Stock has no stone code.
 */
/**
 * Phase 2 (quotation ui-spec Revision 3): an our-stock item becomes the same kind of row with its Location name, its
 * available as the starting quantity and cap, and `ownStockId`; Sale Price still starts empty (Q-LS-P2-03).
 */
export function memoStockToStockLine(item: MemoStockItem | FromStockItem): CustomerStockLine {
  const own = isOwnStockItem(item);
  return {
    key: newKey(),
    source: "STOCK",
    stockId: item.stockId,
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
    priceUnit: item.priceUnit === "PCS" ? "PER_PCS" : "PER_CT",
    unitPrice: "",
    discountType: "PERCENT",
    discountValue: "",
    stonePartOrder: [],
    photos: [],
    itemNote: "",
    memoStockId: own ? "" : item.id,
    ownStockId: own ? item.id : "",
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
    lines: shared.lines.map((line, index) => {
      const memoStockId = filled[index]?.memoStockId || null;
      return { ...line, memoStockId, ownStockId: memoStockId ? null : filled[index]?.ownStockId || null };
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
        stockId: saved?.stockId ?? "",
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

/** Stock items already on the form (From Stock leaves them out), keyed by source + id (`pickKey`). */
export const pickedStockIds = (lines: QuotationLine[]) =>
  new Set(lines.flatMap((line) => {
    const stock = line as Partial<CustomerStockLine>;
    if (stock.memoStockId) return [stock.memoStockId];
    return stock.ownStockId ? [ownPickKey(stock.ownStockId)] : [];
  }));

/** Rows that came From Stock (the approval message counts them). */
export const stockRowCount = (lines: readonly unknown[]) =>
  lines.filter((line) => Boolean((line as Partial<CustomerStockLine>).memoStockId || (line as Partial<CustomerStockLine>).ownStockId)).length;

/** `<CODE>_*` save errors; a short approval (another document took the stock first) has its own message. */
export function customerStockSaveError(code: string, noun: string) {
  return (error: unknown) => {
    const { domainCode, fieldErrors } = readDomainError(error);
    if (domainCode === `${code}_PENDING_SHORT`) {
      return { fieldErrors: [], message: "Some stock items no longer have enough pending. Edit the row and save again. Nothing was saved." };
    }
    // Phase 2 (reserve Revision 2, memo-out Revision 4): inventory down → nothing changes; a hold still syncing → retry.
    if (domainCode === "INVENTORY_UNAVAILABLE") return { fieldErrors: [], message: INVENTORY_UNAVAILABLE_TEXT };
    if (isStockBusyCode(domainCode, code)) return { fieldErrors: [], message: STOCK_BUSY_TEXT };
    const outcome = mapDocumentSaveError(error, code, noun, HEADER_FIELDS);
    const row = domainCode === "VALIDATION_ERROR" || domainCode === `${code}_REFERENCE_INVALID` ? stockRowMessage(fieldErrors, noun, onlyLeftText) : undefined;
    return row ? { ...outcome, message: row } : outcome;
  };
}
