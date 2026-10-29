"use client";

import { skipToken } from "@tanstack/react-query";
import type { InferQueryLikeData } from "@trpc/react-query/shared";
import { z } from "zod";
import { fromTradeDocument, toTradeDocumentInput } from "@/features/quotation/api";
import { emptyQuotation, newKey } from "@/features/quotation/lib/defaults";
import { isFilledLine, lineSchema, tradeDocumentRules, tradeDocumentShape, type QuotationLine } from "@/features/quotation/schema";
import { documentLoadError, mapDocumentSaveError } from "@/features/trade-document/document-api";
import type { DocumentApi } from "@/features/trade-document/document-form";
import { masterTrpc } from "@/lib/master-trpc";
import { retryTransient } from "@/lib/trpc-error";

/**
 * Memo Return data access (memo-return SA rev 1, owner 2026-10-29): `memoReturn.*` with a vendor and one address,
 * numbers from Document Setup `memo-return`, rows picked from the vendor's Memo Stock (memo receive lines with a
 * quantity still out).
 */
export type MemoReturnDetail = InferQueryLikeData<typeof masterTrpc.memoReturn.get>;
export type MemoReturnOptions = InferQueryLikeData<typeof masterTrpc.memoReturn.options>;
export type MemoStockItem = InferQueryLikeData<typeof masterTrpc.memoReturn.memoStock>["items"][number];
export type MemoReturnInput = ReturnType<typeof toMemoReturnInput>;

export const MEMO_RETURN_HREF = "/memo/memo-return";
export const memoReturnHref = (id: string) => `${MEMO_RETURN_HREF}/${id}`;
/** The design shows a 250-character Document Note counter. */
export const MEMO_RETURN_NOTE_MAX = 250;
const HEADER_FIELDS = ["docDate", "dueDate", "vendorId", "addressId", "currency", "exchangeRate", "ref", "documentNote"] as const;

/**
 * A row keeps the memo receive line it came from and the Outstanding quantity it was picked with; its pcs / weightCt
 * are the Return quantity (the only part keyed in), > 0 and ≤ Outstanding. Empty rows have none of these yet.
 */
const memoReturnLineSchema = lineSchema.extend({
  sourceLineId: z.string().default(""),
  outstandingPcs: z.string().default(""),
  outstandingWeightCt: z.string().default(""),
});
export type MemoReturnLine = z.infer<typeof memoReturnLineSchema>;

export const memoReturnSchema = z
  .object({
    ...tradeDocumentShape,
    lines: z.array(memoReturnLineSchema),
    documentNote: z.string().max(MEMO_RETURN_NOTE_MAX),
    status: z.enum(["DRAFT"]),
    vendorId: z.string().min(1, "Required"),
    addressId: z.string().min(1, "Required"),
  })
  .superRefine((value, ctx) => {
    tradeDocumentRules(value, ctx);
    value.lines.forEach((line, index) => {
      if (!isFilledLine(line)) return;
      const issue = (field: "pcs" | "weightCt", message: string) => ctx.addIssue({ code: "custom", path: ["lines", index, field], message });
      if (Number(line.pcs || 0) <= 0 && Number(line.weightCt || 0) <= 0) issue("pcs", "Enter the return quantity");
      if (Number(line.pcs || 0) > Number(line.outstandingPcs || 0)) issue("pcs", "More than outstanding");
      if (Number(line.weightCt || 0) > Number(line.outstandingWeightCt || 0)) issue("weightCt", "More than outstanding");
    });
  });

export type MemoReturnFormValues = z.infer<typeof memoReturnSchema>;

/** A new memo return: today, five empty rows, the company currency once options load. */
export function emptyMemoReturn(): MemoReturnFormValues {
  const q = emptyQuotation();
  return {
    status: "DRAFT",
    docDate: q.docDate,
    dueDate: q.dueDate,
    vendorId: "",
    addressId: "",
    currency: q.currency,
    exchangeRate: q.exchangeRate,
    ref: q.ref,
    lines: q.lines.map((line) => ({ ...line, sourceLineId: "", outstandingPcs: "", outstandingWeightCt: "" })),
    discount: q.discount,
    tax: q.tax,
    serviceCharges: q.serviceCharges,
    labor: q.labor,
    documentNote: q.documentNote,
  };
}

/** A Memo Stock row → a return row with Return 0 / 0.00 (design); the item and price come from the memo receive line. */
export function memoStockToLine(item: MemoStockItem): MemoReturnLine {
  return {
    key: newKey(),
    source: "MANUAL",
    stockId: "",
    lot: item.lot,
    stoneCodeId: item.stoneCodeId ?? "",
    stoneCode: item.stoneCode,
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
    pcs: "0",
    weightCt: "0.00",
    priceUnit: item.priceUnit,
    unitPrice: item.unitPrice,
    discountType: "PERCENT",
    discountValue: "",
    stonePartOrder: [],
    photos: [],
    itemNote: item.itemNote,
    sourceLineId: item.sourceLineId,
    outstandingPcs: String(item.pendingPcs),
    outstandingWeightCt: item.pendingWeightCt,
  };
}

/** Form values → contract input: each filled row names its memo receive line; no photos yet. */
export function toMemoReturnInput(values: MemoReturnFormValues) {
  const shared = toTradeDocumentInput(values);
  const filled = values.lines.filter(isFilledLine);
  return {
    ...shared,
    lines: shared.lines.map((line, index) => ({
      ...line,
      photoIds: [] as string[],
      sourceLineId: filled[index]?.sourceLineId ?? "",
      outstandingPcs: Number.parseInt(filled[index]?.outstandingPcs || "0", 10),
      outstandingWeightCt: filled[index]?.outstandingWeightCt || "0",
    })),
    vendorId: values.vendorId,
    addressId: values.addressId,
  };
}

export function fromMemoReturn(detail: MemoReturnDetail): MemoReturnFormValues {
  const shared = fromTradeDocument(detail, (id) => id);
  return {
    ...shared,
    lines: shared.lines.map((line, index) => ({
      ...line,
      sourceLineId: detail.lines[index]?.sourceLineId ?? "",
      outstandingPcs: String(detail.lines[index]?.outstandingPcs ?? 0),
      outstandingWeightCt: detail.lines[index]?.outstandingWeightCt ?? "0",
    })),
    status: "DRAFT",
    vendorId: detail.vendorId,
    addressId: detail.addressId ?? "",
  };
}

/** Memo receive lines already on the form (the picker leaves them out). */
export const pickedSourceIds = (lines: QuotationLine[]) => new Set(lines.flatMap((line) => ((line as Partial<MemoReturnLine>).sourceLineId ? [(line as MemoReturnLine).sourceLineId] : [])));

export const mapMemoReturnSaveError = (error: unknown) => mapDocumentSaveError(error, "MEMO_RETURN", "memo return", HEADER_FIELDS);
export const memoReturnLoadError = (error: unknown) => documentLoadError(error, "MEMO_RETURN", "memo return", "memo returns");

export function useMemoReturnDetail(id: string | null) {
  return masterTrpc.memoReturn.get.useQuery(id === null ? skipToken : { id }, { staleTime: 30_000, retry: retryTransient });
}

export function useMemoReturnDaybook() {
  return masterTrpc.memoReturn.list.useQuery({ limit: 50 }, { staleTime: 15_000, retry: retryTransient });
}

export type MemoStockFilter = { vendorId: string; currency: string; q: string; from: string; to: string; excludeReturnId?: string };

/** The vendor's Memo Stock in the return's currency (server limit 200, newest receipt first). */
export function useMemoStock(filter: MemoStockFilter) {
  const input = {
    vendorId: filter.vendorId,
    currency: filter.currency,
    ...(filter.q.trim() ? { q: filter.q.trim() } : {}),
    ...(filter.from ? { from: filter.from } : {}),
    ...(filter.to ? { to: filter.to } : {}),
    ...(filter.excludeReturnId ? { excludeReturnId: filter.excludeReturnId } : {}),
  };
  return masterTrpc.memoReturn.memoStock.useQuery(filter.vendorId && filter.currency ? input : skipToken, { staleTime: 10_000, retry: retryTransient });
}

export function useMemoReturnApi(vendorId: string | undefined, docDate: string, isNew: boolean): DocumentApi<MemoReturnInput, MemoReturnOptions> {
  const utils = masterTrpc.useUtils();
  const options = masterTrpc.memoReturn.options.useQuery(vendorId ? { vendorId } : {}, { staleTime: 60_000, retry: retryTransient });
  const next = masterTrpc.memoReturn.nextNumber.useQuery(isNew && /^\d{4}-\d{2}-\d{2}$/.test(docDate) ? { docDate } : skipToken, { staleTime: 10_000, retry: retryTransient });
  const writes = { retry: false, gcTime: 0 } as const;
  const create = masterTrpc.memoReturn.create.useMutation(writes);
  const update = masterTrpc.memoReturn.update.useMutation(writes);
  const remove = masterTrpc.memoReturn.delete.useMutation(writes);
  return {
    options: options.data,
    companyCurrency: options.data?.companyCurrency,
    nextDocNo: next.data?.docNo,
    create: (input) => create.mutateAsync(input),
    update: (args) => update.mutateAsync(args),
    remove: (args) => remove.mutateAsync(args),
    invalidate: () =>
      Promise.all([utils.memoReturn.list.invalidate(), utils.memoReturn.get.invalidate(), utils.memoReturn.nextNumber.invalidate(), utils.memoReturn.memoStock.invalidate()]),
    busy: create.isPending || update.isPending || remove.isPending,
  };
}
