"use client";

import { skipToken } from "@tanstack/react-query";
import type { InferQueryLikeData } from "@trpc/react-query/shared";
import { fromTradeDocument, toTradeDocumentInput } from "@/features/quotation/api";
import type { QuotationFormValues } from "@/features/quotation/schema";
import { documentLoadError, mapDocumentSaveError } from "@/features/trade-document/document-api";
import type { DocumentApi } from "@/features/trade-document/document-form";
import { masterTrpc } from "@/lib/master-trpc";
import { retryTransient } from "@/lib/trpc-error";

/** Memo Out data access (memo-out SA rev 1 / ADR-0033): `memoOut.*`, numbers from Document Setup `memo-out`. */
export type MemoOutDetail = InferQueryLikeData<typeof masterTrpc.memoOut.get>;
export type MemoOutOptions = InferQueryLikeData<typeof masterTrpc.memoOut.options>;
export type MemoOutInput = ReturnType<typeof toMemoOutInput>;

export const MEMO_OUT_HREF = "/memo/memo-out";
export const memoOutHref = (id: string) => `${MEMO_OUT_HREF}/${id}`;
const HEADER_FIELDS = ["docDate", "dueDate", "customerId", "shippingAddressId", "invoiceAddressId", "currency", "exchangeRate", "ref", "documentNote"] as const;

/** Form values (the quotation form shape) → contract input; memo documents have no photos yet. */
export function toMemoOutInput(values: QuotationFormValues) {
  return {
    ...toTradeDocumentInput(values),
    lines: toTradeDocumentInput(values).lines.map((line) => ({ ...line, photoIds: [] as string[] })),
    customerId: values.customerId,
    shippingAddressId: values.shippingAddressId,
    invoiceAddressId: values.invoiceAddressId,
  };
}

export function fromMemoOut(detail: MemoOutDetail): QuotationFormValues {
  return {
    ...fromTradeDocument(detail, (id) => id),
    status: "DRAFT",
    customerId: detail.customerId,
    shippingAddressId: detail.shippingAddressId ?? "",
    invoiceAddressId: detail.invoiceAddressId ?? "",
  };
}

export const mapMemoOutSaveError = (error: unknown) => mapDocumentSaveError(error, "MEMO_OUT", "memo out", HEADER_FIELDS);
export const memoOutLoadError = (error: unknown) => documentLoadError(error, "MEMO_OUT", "memo out", "memo outs");

export function useMemoOutDetail(id: string | null) {
  return masterTrpc.memoOut.get.useQuery(id === null ? skipToken : { id }, { staleTime: 30_000, retry: retryTransient });
}

export function useMemoOutDaybook() {
  return masterTrpc.memoOut.list.useQuery({ limit: 50 }, { staleTime: 15_000, retry: retryTransient });
}

/** Options, number preview and writes for the shared document form. */
export function useMemoOutApi(customerId: string | undefined, docDate: string, isNew: boolean): DocumentApi<MemoOutInput, MemoOutOptions> {
  const utils = masterTrpc.useUtils();
  const options = masterTrpc.memoOut.options.useQuery(customerId ? { customerId } : {}, { staleTime: 60_000, retry: retryTransient });
  const next = masterTrpc.memoOut.nextNumber.useQuery(isNew && /^\d{4}-\d{2}-\d{2}$/.test(docDate) ? { docDate } : skipToken, { staleTime: 10_000, retry: retryTransient });
  const writes = { retry: false, gcTime: 0 } as const;
  const create = masterTrpc.memoOut.create.useMutation(writes);
  const update = masterTrpc.memoOut.update.useMutation(writes);
  const remove = masterTrpc.memoOut.delete.useMutation(writes);
  return {
    options: options.data,
    companyCurrency: options.data?.companyCurrency,
    nextDocNo: next.data?.docNo,
    create: (input) => create.mutateAsync(input),
    update: (args) => update.mutateAsync(args),
    remove: (args) => remove.mutateAsync(args),
    invalidate: () => Promise.all([utils.memoOut.list.invalidate(), utils.memoOut.get.invalidate(), utils.memoOut.nextNumber.invalidate()]),
    busy: create.isPending || update.isPending || remove.isPending,
  };
}
