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
export const CUSTOMER_STOCK_STATUSES = ["PENDING_APPROVAL", "APPROVED"] as const;
const HEADER_FIELDS = ["docDate", "dueDate", "customerId", "shippingAddressId", "invoiceAddressId", "currency", "exchangeRate", "ref", "documentNote"] as const;

/**
 * A From Stock row keeps its Memo Stock item and the pending it was picked with (its maximum). Manual rows and empty
 * rows have none of these.
 */
const customerStockLineSchema = lineSchema.extend({
  memoStockId: z.string().default(""),
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
  return { ...q, status: "PENDING_APPROVAL", lines: q.lines.map((line) => ({ ...line, memoStockId: "", stockPendingPcs: "", stockPendingWeightCt: "" })) };
}

/**
 * A Memo Stock item → a From Stock row: its Stock ID, lot, location Memo, stone and certificate (read-only), the full
 * pending as the starting quantity (Q-MO-15), and an empty Sale Price (Q-MO-11). Memo Stock has no stone code.
 */
export function memoStockToStockLine(item: MemoStockItem): CustomerStockLine {
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
    memoStockId: item.id,
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
    lines: shared.lines.map((line, index) => ({ ...line, memoStockId: filled[index]?.memoStockId || null })),
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
        source: saved?.source ?? "MANUAL",
        stockId: saved?.stockId ?? "",
        memoStockId: saved?.memoStockId ?? "",
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

/** Memo Stock items already on the form (From Stock leaves them out). */
export const pickedStockIds = (lines: QuotationLine[]) => new Set(lines.flatMap((line) => ((line as Partial<CustomerStockLine>).memoStockId ? [(line as CustomerStockLine).memoStockId] : [])));

/** Rows that came From Stock (the approval message counts them). */
export const stockRowCount = (lines: readonly unknown[]) => lines.filter((line) => Boolean((line as Partial<CustomerStockLine>).memoStockId)).length;

/** `<CODE>_*` save errors; a short approval (another document took the stock first) has its own message. */
export function customerStockSaveError(code: string, noun: string) {
  return (error: unknown) => {
    if (readDomainError(error).domainCode === `${code}_PENDING_SHORT`) {
      return { fieldErrors: [], message: "Some stock items no longer have enough pending. Edit the row and approve again." };
    }
    return mapDocumentSaveError(error, code, noun, HEADER_FIELDS);
  };
}
