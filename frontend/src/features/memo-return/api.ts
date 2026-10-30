"use client";

import { skipToken } from "@tanstack/react-query";
import type { InferQueryLikeData } from "@trpc/react-query/shared";
import { z } from "zod";
import { fromTradeDocument, toTradeDocumentInput } from "@/features/quotation/api";
import { dec, toFixed } from "@/features/quotation/lib/decimal";
import { emptyQuotation, newKey } from "@/features/quotation/lib/defaults";
import { isFilledLine, lineSchema, tradeDocumentRules, tradeDocumentShape, type QuotationLine } from "@/features/quotation/schema";
import { documentLoadError, mapDocumentSaveError } from "@/features/trade-document/document-api";
import type { DocumentApi } from "@/features/trade-document/document-form";
import { masterTrpc } from "@/lib/master-trpc";
import { readDomainError, retryTransient } from "@/lib/trpc-error";

/**
 * Memo Return data access (memo-return SA rev 2, owner 2026-10-29): `memoReturn.*` with a vendor and one address,
 * numbers from Document Setup `memo-return`, rows picked from the vendor's Memo Stock (`memoStock.list`, items of
 * approved memo receives with something still pending). Saving waits for approval; approval reduces pending.
 */
export type MemoReturnDetail = InferQueryLikeData<typeof masterTrpc.memoReturn.get>;
export type MemoReturnOptions = InferQueryLikeData<typeof masterTrpc.memoReturn.options>;
export type MemoStockItem = InferQueryLikeData<typeof masterTrpc.memoStock.list>["items"][number];
export type MemoReturnInput = ReturnType<typeof toMemoReturnInput>;

export const MEMO_RETURN_HREF = "/memo/memo-return";
export const memoReturnHref = (id: string) => `${MEMO_RETURN_HREF}/${id}`;
/** The design shows a 250-character Document Note counter. */
export const MEMO_RETURN_NOTE_MAX = 250;
const HEADER_FIELDS = ["docDate", "dueDate", "vendorId", "addressId", "currency", "exchangeRate", "ref", "documentNote"] as const;

/**
 * A row keeps the Memo Stock item it came from and the Outstanding (pending) quantity it was picked with; its pcs /
 * weightCt are the Return quantity (the only part keyed in), > 0 and ≤ Outstanding. Empty rows have none of these yet.
 */
const memoReturnLineSchema = lineSchema.extend({
  memoStockId: z.string().default(""),
  outstandingPcs: z.string().default(""),
  outstandingWeightCt: z.string().default(""),
});
export type MemoReturnLine = z.infer<typeof memoReturnLineSchema>;
/** Saving sends it to approval; Approve makes it read-only and takes the items off Memo Stock (Q-MR-15). */
export const MEMO_RETURN_STATUSES = ["PENDING_APPROVAL", "APPROVED"] as const;

export const memoReturnSchema = z
  .object({
    ...tradeDocumentShape,
    lines: z.array(memoReturnLineSchema),
    documentNote: z.string().max(MEMO_RETURN_NOTE_MAX),
    status: z.enum(MEMO_RETURN_STATUSES),
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
    status: "PENDING_APPROVAL",
    docDate: q.docDate,
    dueDate: q.dueDate,
    vendorId: "",
    addressId: "",
    currency: q.currency,
    exchangeRate: q.exchangeRate,
    ref: q.ref,
    lines: q.lines.map((line) => ({ ...line, memoStockId: "", outstandingPcs: "", outstandingWeightCt: "" })),
    discount: q.discount,
    tax: q.tax,
    serviceCharges: q.serviceCharges,
    labor: q.labor,
    documentNote: q.documentNote,
  };
}

/**
 * A Memo Stock row → a return row with an empty Return (placeholder 0 / 0.00, owner 2026-10-29). The price is the item's price after the line
 * discount (Q-MR-13) at 2 dp, as the server stores it; Memo Stock has no stone code.
 */
export function memoStockToLine(item: MemoStockItem): MemoReturnLine {
  return {
    key: newKey(),
    source: "MANUAL",
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
    pcs: "",
    weightCt: "",
    priceUnit: item.priceUnit === "PCS" ? "PER_PCS" : "PER_CT",
    unitPrice: toFixed(dec(item.netUnitPrice), 2),
    discountType: "PERCENT",
    discountValue: "",
    stonePartOrder: [],
    photos: [],
    itemNote: item.itemNote,
    memoStockId: item.id,
    outstandingPcs: String(item.pendingPcs),
    outstandingWeightCt: item.pendingWeightCt,
  };
}

/** Form values → contract input: each filled row names its Memo Stock item; no photos yet. */
export function toMemoReturnInput(values: MemoReturnFormValues) {
  const shared = toTradeDocumentInput(values);
  const filled = values.lines.filter(isFilledLine);
  return {
    ...shared,
    lines: shared.lines.map((line, index) => ({
      ...line,
      photoIds: [] as string[],
      memoStockId: filled[index]?.memoStockId ?? "",
      outstandingPcs: Number.parseInt(filled[index]?.outstandingPcs || "0", 10),
      outstandingWeightCt: filled[index]?.outstandingWeightCt || "0",
    })),
    vendorId: values.vendorId,
    addressId: values.addressId,
  };
}

export function fromMemoReturn(detail: MemoReturnDetail): MemoReturnFormValues {
  // Memo Stock items have no stone code (memo-receive rev 2).
  const shared = fromTradeDocument({ ...detail, lines: detail.lines.map((line) => ({ ...line, stoneCodeId: null })) }, (id) => id);
  return {
    ...shared,
    lines: shared.lines.map((line, index) => ({
      ...line,
      stockId: detail.lines[index]?.stockId ?? "",
      memoStockId: detail.lines[index]?.memoStockId ?? "",
      outstandingPcs: String(detail.lines[index]?.outstandingPcs ?? 0),
      outstandingWeightCt: detail.lines[index]?.outstandingWeightCt ?? "0",
    })),
    status: detail.status,
    vendorId: detail.vendorId,
    addressId: detail.addressId ?? "",
  };
}

/** Memo Stock items already on the form (the picker leaves them out). */
export const pickedStockIds = (lines: QuotationLine[]) => new Set(lines.flatMap((line) => ((line as Partial<MemoReturnLine>).memoStockId ? [(line as MemoReturnLine).memoStockId] : [])));

export function mapMemoReturnSaveError(error: unknown) {
  // Approval found less pending than a row returns: another memo return took it first.
  if (readDomainError(error).domainCode === "MEMO_RETURN_PENDING_SHORT") {
    return { fieldErrors: [], message: "Some items no longer have enough pending. Edit the Return quantity and approve again." };
  }
  return mapDocumentSaveError(error, "MEMO_RETURN", "memo return", HEADER_FIELDS);
}
export const memoReturnLoadError = (error: unknown) => documentLoadError(error, "MEMO_RETURN", "memo return", "memo returns");

export function useMemoReturnDetail(id: string | null) {
  return masterTrpc.memoReturn.get.useQuery(id === null ? skipToken : { id }, { staleTime: 30_000, retry: retryTransient });
}

export function useMemoReturnDaybook() {
  return masterTrpc.memoReturn.list.useQuery({ limit: 50 }, { staleTime: 15_000, retry: retryTransient });
}

export type MemoStockFilter = { vendorId: string; currency: string; q: string; from: string; to: string };
export const MEMO_STOCK_PAGE_SIZE = 50;

/**
 * The vendor's Memo Stock in the return's currency, newest receipt first, 50 a page (SA-MR-11). Pending is what
 * approved memo returns left; an unapproved return doesn't hold items (approval re-checks).
 */
export function useMemoStock(filter: MemoStockFilter) {
  const input = {
    vendorId: filter.vendorId,
    currency: filter.currency,
    limit: MEMO_STOCK_PAGE_SIZE,
    ...(filter.q.trim() ? { q: filter.q.trim() } : {}),
    ...(filter.from ? { from: filter.from } : {}),
    ...(filter.to ? { to: filter.to } : {}),
  };
  return masterTrpc.memoStock.list.useInfiniteQuery(filter.vendorId && filter.currency ? input : skipToken, {
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 10_000,
    retry: retryTransient,
  });
}

export function useMemoReturnApi(vendorId: string | undefined, docDate: string, isNew: boolean): DocumentApi<MemoReturnInput, MemoReturnOptions> {
  const utils = masterTrpc.useUtils();
  const options = masterTrpc.memoReturn.options.useQuery(vendorId ? { vendorId } : {}, { staleTime: 60_000, retry: retryTransient });
  const next = masterTrpc.memoReturn.nextNumber.useQuery(isNew && /^\d{4}-\d{2}-\d{2}$/.test(docDate) ? { docDate } : skipToken, { staleTime: 10_000, retry: retryTransient });
  const writes = { retry: false, gcTime: 0 } as const;
  const create = masterTrpc.memoReturn.create.useMutation(writes);
  const update = masterTrpc.memoReturn.update.useMutation(writes);
  const remove = masterTrpc.memoReturn.delete.useMutation(writes);
  const approve = masterTrpc.memoReturn.approve.useMutation(writes);
  return {
    options: options.data,
    companyCurrency: options.data?.companyCurrency,
    nextDocNo: next.data?.docNo,
    create: (input) => create.mutateAsync(input),
    update: (args) => update.mutateAsync(args),
    remove: (args) => remove.mutateAsync(args),
    approve: (args) => approve.mutateAsync(args),
    invalidate: () =>
      Promise.all([utils.memoReturn.list.invalidate(), utils.memoReturn.get.invalidate(), utils.memoReturn.nextNumber.invalidate(), utils.memoStock.list.invalidate()]),
    busy: create.isPending || update.isPending || remove.isPending || approve.isPending,
  };
}
