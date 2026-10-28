"use client";

import { skipToken } from "@tanstack/react-query";
import type { InferQueryLikeData } from "@trpc/react-query/shared";
import { z } from "zod";
import { fromTradeDocument, toTradeDocumentInput } from "@/features/quotation/api";
import { emptyQuotation } from "@/features/quotation/lib/defaults";
import { tradeDocumentRules, tradeDocumentShape } from "@/features/quotation/schema";
import { documentLoadError, mapDocumentSaveError } from "@/features/trade-document/document-api";
import type { DocumentApi } from "@/features/trade-document/document-form";
import { masterTrpc } from "@/lib/master-trpc";
import { retryTransient } from "@/lib/trpc-error";

/**
 * Memo Out Return data access (memo-out-return SA rev 1 / ADR-0033): `memoOutReturn.*` with a vendor and one
 * address (owner 2026-10-28), numbers from Document Setup `memo-out-return`.
 */
export type MemoOutReturnDetail = InferQueryLikeData<typeof masterTrpc.memoOutReturn.get>;
export type MemoOutReturnOptions = InferQueryLikeData<typeof masterTrpc.memoOutReturn.options>;
export type MemoOutReturnInput = ReturnType<typeof toMemoOutReturnInput>;

export const MEMO_OUT_RETURN_HREF = "/memo/memo-out-return";
export const memoOutReturnHref = (id: string) => `${MEMO_OUT_RETURN_HREF}/${id}`;
/** Source 01 shows a 250-character Document Note counter. */
export const MEMO_OUT_RETURN_NOTE_MAX = 250;
const HEADER_FIELDS = ["docDate", "dueDate", "vendorId", "addressId", "currency", "exchangeRate", "ref", "documentNote"] as const;

export const memoOutReturnSchema = z
  .object({
    ...tradeDocumentShape,
    documentNote: z.string().max(MEMO_OUT_RETURN_NOTE_MAX),
    status: z.enum(["DRAFT"]),
    vendorId: z.string().min(1, "Required"),
    addressId: z.string().min(1, "Required"),
  })
  .superRefine(tradeDocumentRules);

export type MemoOutReturnFormValues = z.infer<typeof memoOutReturnSchema>;

/** A new memo out return: today, no due date yet, five empty rows, the company currency once options load. */
export function emptyMemoOutReturn(): MemoOutReturnFormValues {
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
    lines: q.lines,
    discount: q.discount,
    tax: q.tax,
    serviceCharges: q.serviceCharges,
    labor: q.labor,
    documentNote: q.documentNote,
  };
}

/** Form values → contract input; memo documents have no photos yet. */
export function toMemoOutReturnInput(values: MemoOutReturnFormValues) {
  const shared = toTradeDocumentInput(values);
  return { ...shared, lines: shared.lines.map((line) => ({ ...line, photoIds: [] as string[] })), vendorId: values.vendorId, addressId: values.addressId };
}

export function fromMemoOutReturn(detail: MemoOutReturnDetail): MemoOutReturnFormValues {
  return { ...fromTradeDocument(detail, (id) => id), status: "DRAFT", vendorId: detail.vendorId, addressId: detail.addressId ?? "" };
}

export const mapMemoOutReturnSaveError = (error: unknown) => mapDocumentSaveError(error, "MEMO_OUT_RETURN", "memo out return", HEADER_FIELDS);
export const memoOutReturnLoadError = (error: unknown) => documentLoadError(error, "MEMO_OUT_RETURN", "memo out return", "memo out returns");

export function useMemoOutReturnDetail(id: string | null) {
  return masterTrpc.memoOutReturn.get.useQuery(id === null ? skipToken : { id }, { staleTime: 30_000, retry: retryTransient });
}

export function useMemoOutReturnDaybook() {
  return masterTrpc.memoOutReturn.list.useQuery({ limit: 50 }, { staleTime: 15_000, retry: retryTransient });
}

export function useMemoOutReturnApi(vendorId: string | undefined, docDate: string, isNew: boolean): DocumentApi<MemoOutReturnInput, MemoOutReturnOptions> {
  const utils = masterTrpc.useUtils();
  const options = masterTrpc.memoOutReturn.options.useQuery(vendorId ? { vendorId } : {}, { staleTime: 60_000, retry: retryTransient });
  const next = masterTrpc.memoOutReturn.nextNumber.useQuery(isNew && /^\d{4}-\d{2}-\d{2}$/.test(docDate) ? { docDate } : skipToken, { staleTime: 10_000, retry: retryTransient });
  const writes = { retry: false, gcTime: 0 } as const;
  const create = masterTrpc.memoOutReturn.create.useMutation(writes);
  const update = masterTrpc.memoOutReturn.update.useMutation(writes);
  const remove = masterTrpc.memoOutReturn.delete.useMutation(writes);
  return {
    options: options.data,
    companyCurrency: options.data?.companyCurrency,
    nextDocNo: next.data?.docNo,
    create: (input) => create.mutateAsync(input),
    update: (args) => update.mutateAsync(args),
    remove: (args) => remove.mutateAsync(args),
    invalidate: () => Promise.all([utils.memoOutReturn.list.invalidate(), utils.memoOutReturn.get.invalidate(), utils.memoOutReturn.nextNumber.invalidate()]),
    busy: create.isPending || update.isPending || remove.isPending,
  };
}
