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
import { readDomainError, retryTransient } from "@/lib/trpc-error";

/**
 * Memo Out Return data access (memo-out-return UI rev 4 + SA rev 2 / ADR-0033 rev 3, owner 2026-10-31): the customer
 * brings back what a Memo Out lent. `memoOutReturn.*` with the customer + Shipping / Invoice address of Memo Out,
 * numbers from Document Setup `memo-out-return`, rows picked with Memo Outstanding (`memoOutReturn.outstanding`, the
 * customer's approved Memo Out From Stock lines not fully returned). Saving waits for approval; Approve brings the
 * stones back to Memo Stock.
 */
export type MemoOutReturnDetail = InferQueryLikeData<typeof masterTrpc.memoOutReturn.get>;
export type MemoOutReturnOptions = InferQueryLikeData<typeof masterTrpc.memoOutReturn.options>;
export type MemoOutstandingItem = InferQueryLikeData<typeof masterTrpc.memoOutReturn.outstanding>["items"][number];
export type MemoOutReturnInput = ReturnType<typeof toMemoOutReturnInput>;

export const MEMO_OUT_RETURN_HREF = "/memo/memo-out-return";
export const memoOutReturnHref = (id: string) => `${MEMO_OUT_RETURN_HREF}/${id}`;
/** Source 01 shows a 250-character Document Note counter. */
export const MEMO_OUT_RETURN_NOTE_MAX = 250;
export const MEMO_OUTSTANDING_PAGE_SIZE = 50;
const HEADER_FIELDS = ["docDate", "dueDate", "customerId", "shippingAddressId", "invoiceAddressId", "currency", "exchangeRate", "ref", "documentNote"] as const;

/** Saving sends it to approval; Approve makes it read-only and brings the stones back (Q-MOR-14). */
export const MEMO_OUT_RETURN_STATUSES = ["PENDING_APPROVAL", "APPROVED"] as const;

/**
 * A row keeps the Memo Out line it came from and the Outstanding quantity it was picked with; its pcs / weightCt are
 * the Return quantity (the only part keyed in), > 0 and ≤ Outstanding. Empty rows have none of these yet.
 */
const returnLineSchema = lineSchema.extend({
  memoOutLineId: z.string().default(""),
  memoOutNo: z.string().default(""),
  outstandingPcs: z.string().default(""),
  outstandingWeightCt: z.string().default(""),
});
export type MemoOutReturnLine = z.infer<typeof returnLineSchema>;

export const memoOutReturnSchema = z
  .object({
    ...tradeDocumentShape,
    lines: z.array(returnLineSchema),
    documentNote: z.string().max(MEMO_OUT_RETURN_NOTE_MAX),
    statusReason: z.string().optional(),
    status: z.enum(MEMO_OUT_RETURN_STATUSES),
    customerId: z.string().min(1, "Required"),
    shippingAddressId: z.string().min(1, "Required"),
    invoiceAddressId: z.string().min(1, "Required"),
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

export type MemoOutReturnFormValues = z.infer<typeof memoOutReturnSchema>;

/** A new memo out return: today, five empty rows, the company currency once options load. */
export function emptyMemoOutReturn(): MemoOutReturnFormValues {
  const q = emptyQuotation();
  return {
    ...q,
    status: "PENDING_APPROVAL",
    lines: q.lines.map((line) => ({ ...line, memoOutLineId: "", memoOutNo: "", outstandingPcs: "", outstandingWeightCt: "" })),
  };
}

/**
 * A Memo Outstanding row → a return row with an empty Return. Item fields and the Memo Out net price come from the Memo
 * Out line, as the server stores them; Memo Stock items have no stone code.
 */
export function outstandingToLine(item: MemoOutstandingItem): MemoOutReturnLine {
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
    priceUnit: item.priceUnit,
    unitPrice: item.unitPrice,
    discountType: "PERCENT",
    discountValue: "",
    stonePartOrder: [],
    photos: [],
    itemNote: item.itemNote,
    memoOutLineId: item.memoOutLineId,
    memoOutNo: item.memoOut.docNo,
    outstandingPcs: String(item.outstandingPcs),
    outstandingWeightCt: item.outstandingWeightCt,
  };
}

/** Form values → contract input: each filled row names its Memo Out line; no photos yet. */
export function toMemoOutReturnInput(values: MemoOutReturnFormValues) {
  const shared = toTradeDocumentInput(values);
  const filled = values.lines.filter(isFilledLine);
  return {
    ...shared,
    lines: shared.lines.map((line, index) => ({
      ...line,
      photoIds: [] as string[],
      memoOutLineId: filled[index]?.memoOutLineId ?? "",
      outstandingPcs: Number.parseInt(filled[index]?.outstandingPcs || "0", 10),
      outstandingWeightCt: filled[index]?.outstandingWeightCt || "0",
    })),
    customerId: values.customerId,
    shippingAddressId: values.shippingAddressId,
    invoiceAddressId: values.invoiceAddressId,
  };
}

export function fromMemoOutReturn(detail: MemoOutReturnDetail): MemoOutReturnFormValues {
  // Memo Out lines picked From Stock have no stone code.
  const shared = fromTradeDocument({ ...detail, lines: detail.lines.map((line) => ({ ...line, source: "MANUAL" as const, stoneCodeId: null })) }, (id) => id);
  return {
    ...shared,
    lines: shared.lines.map((line, index) => {
      const saved = detail.lines[index];
      return {
        ...line,
        stockId: saved?.stockId ?? "",
        memoOutLineId: saved?.memoOutLineId ?? "",
        memoOutNo: saved?.memoOut?.docNo ?? "",
        outstandingPcs: String(saved?.outstandingPcs ?? 0),
        outstandingWeightCt: saved?.outstandingWeightCt ?? "0",
      };
    }),
    status: detail.status,
    customerId: detail.customerId,
    shippingAddressId: detail.shippingAddressId ?? "",
    invoiceAddressId: detail.invoiceAddressId ?? "",
  };
}

/** Memo Out lines already on the form (the picker leaves them out). */
export const pickedOutLineIds = (lines: QuotationLine[]) =>
  new Set(lines.flatMap((line) => ((line as Partial<MemoOutReturnLine>).memoOutLineId ? [(line as MemoOutReturnLine).memoOutLineId] : [])));

export function mapMemoOutReturnSaveError(error: unknown) {
  // Approval found less outstanding than a row returns: another memo out return took it first.
  if (readDomainError(error).domainCode === "MEMO_OUT_RETURN_OUTSTANDING_SHORT") {
    return { fieldErrors: [], message: "Some items were already returned by another document. Edit the Return quantity and approve again." };
  }
  return mapDocumentSaveError(error, "MEMO_OUT_RETURN", "memo out return", HEADER_FIELDS);
}
export const memoOutReturnLoadError = (error: unknown) => documentLoadError(error, "MEMO_OUT_RETURN", "memo out return", "memo out returns");

export function useMemoOutReturnDetail(id: string | null) {
  return masterTrpc.memoOutReturn.get.useQuery(id === null ? skipToken : { id }, { staleTime: 30_000, retry: retryTransient });
}

export function useMemoOutReturnDaybook() {
  return masterTrpc.memoOutReturn.list.useQuery({ limit: 50 }, { staleTime: 15_000, retry: retryTransient });
}

export type MemoOutstandingFilter = { customerId: string; currency: string; q: string; from: string; to: string; excludeReturnId?: string };

/** Memo Outstanding input; null until both a customer and a currency are chosen. */
export function memoOutstandingInput(filter: MemoOutstandingFilter) {
  if (!filter.customerId || !filter.currency) return null;
  return {
    customerId: filter.customerId,
    currency: filter.currency,
    limit: MEMO_OUTSTANDING_PAGE_SIZE,
    ...(filter.q.trim() ? { q: filter.q.trim() } : {}),
    ...(filter.from ? { from: filter.from } : {}),
    ...(filter.to ? { to: filter.to } : {}),
    ...(filter.excludeReturnId ? { excludeReturnId: filter.excludeReturnId } : {}),
  };
}

export function useMemoOutstanding(filter: MemoOutstandingFilter) {
  return masterTrpc.memoOutReturn.outstanding.useInfiniteQuery(memoOutstandingInput(filter) ?? skipToken, {
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 10_000,
    retry: retryTransient,
  });
}

export const memoOutstandingLoadError = (error: unknown) => documentLoadError(error, "MEMO_OUT_RETURN", "memo outstanding", "memo outstanding");

export function useMemoOutReturnApi(customerId: string | undefined, docDate: string, isNew: boolean): DocumentApi<MemoOutReturnInput, MemoOutReturnOptions> {
  const utils = masterTrpc.useUtils();
  const options = masterTrpc.memoOutReturn.options.useQuery(customerId ? { customerId } : {}, { staleTime: 60_000, retry: retryTransient });
  const next = masterTrpc.memoOutReturn.nextNumber.useQuery(isNew && /^\d{4}-\d{2}-\d{2}$/.test(docDate) ? { docDate } : skipToken, { staleTime: 10_000, retry: retryTransient });
  const writes = { retry: false, gcTime: 0 } as const;
  const create = masterTrpc.memoOutReturn.create.useMutation(writes);
  const update = masterTrpc.memoOutReturn.update.useMutation(writes);
  const remove = masterTrpc.memoOutReturn.delete.useMutation(writes);
  const approve = masterTrpc.memoOutReturn.approve.useMutation(writes);
  return {
    options: options.data,
    companyCurrency: options.data?.companyCurrency,
    nextDocNo: next.data?.docNo,
    create: (input) => create.mutateAsync(input),
    update: (args) => update.mutateAsync(args),
    remove: (args) => remove.mutateAsync(args),
    approve: (args) => approve.mutateAsync(args),
    invalidate: () =>
      Promise.all([
        utils.memoOutReturn.list.invalidate(),
        utils.memoOutReturn.get.invalidate(),
        utils.memoOutReturn.nextNumber.invalidate(),
        utils.memoOutReturn.outstanding.invalidate(),
        utils.memoStock.list.invalidate(),
      ]),
    busy: create.isPending || update.isPending || remove.isPending || approve.isPending,
  };
}
