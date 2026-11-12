"use client";

import { skipToken } from "@tanstack/react-query";
import type { InferQueryLikeData } from "@trpc/react-query/shared";
import {
  CUSTOMER_STOCK_STATUSES,
  customerStockSaveError,
  customerStockSchema,
  emptyCustomerStock,
  fromCustomerStock,
  memoStockToStockLine,
  toCustomerStockInput,
  type CustomerStockFormValues,
  type CustomerStockLine,
} from "@/features/trade-document/customer-stock";
import { documentLoadError, daybookInput, daybookQueryOptions, mapDocumentRestoreError } from "@/features/trade-document/document-api";
import type { DocumentApi } from "@/features/trade-document/document-form";
import { masterTrpc } from "@/lib/master-trpc";
import { retryTransient } from "@/lib/trpc-error";

export { pickedStockIds } from "@/features/trade-document/customer-stock";

/**
 * Memo Out data access (memo-out SA rev 2 / ADR-0033 rev 2, owner 2026-10-31): `memoOut.*`, numbers from Document Setup
 * `memo-out`. Rows picked From Stock name a Memo Stock item and are cut into Reserve at Approve; rows typed by hand cut
 * nothing (Q-MO-09). Saving waits for approval. The form values, rules and mapping are shared with Reserve.
 */
export type MemoOutDetail = InferQueryLikeData<typeof masterTrpc.memoOut.get>;
export type MemoOutOptions = InferQueryLikeData<typeof masterTrpc.memoOut.options>;
export type MemoOutInput = ReturnType<typeof toMemoOutInput>;
export type MemoOutLine = CustomerStockLine;
export type MemoOutFormValues = CustomerStockFormValues;

export const MEMO_OUT_HREF = "/memo/memo-out";
export const memoOutHref = (id: string) => `${MEMO_OUT_HREF}/${id}`;
export const MEMO_OUT_STATUSES = CUSTOMER_STOCK_STATUSES;

export const memoOutSchema = customerStockSchema;
export const emptyMemoOut = emptyCustomerStock;
export const memoStockToOutLine = memoStockToStockLine;
export const toMemoOutInput = toCustomerStockInput;
export const fromMemoOut = (detail: MemoOutDetail) => fromCustomerStock(detail);

export const mapMemoOutSaveError = customerStockSaveError("MEMO_OUT", "memo out");
export const memoOutLoadError = (error: unknown) => documentLoadError(error, "MEMO_OUT", "memo out", "memo outs");

/** transaction-soft-delete FE-SD-003: Restore errors (not deleted any more, changed, gone). */
export const memoOutRestoreError = (error: unknown) => mapDocumentRestoreError(error, "MEMO_OUT", "memo out");

export function useMemoOutDetail(id: string | null) {
  return masterTrpc.memoOut.get.useQuery(id === null ? skipToken : { id }, { staleTime: 30_000, retry: retryTransient });
}

/** FE-SD-001: the daybook's active or deleted memo outs, newest first, 50 a page; a new view starts on page one. */
export function useMemoOutDaybook() {
  return masterTrpc.memoOut.list.useInfiniteQuery(daybookInput(), daybookQueryOptions);
}

/** Options, number preview, writes and approval for the shared document form. */
export function useMemoOutApi(customerId: string | undefined, docDate: string, isNew: boolean): DocumentApi<MemoOutInput, MemoOutOptions> {
  const utils = masterTrpc.useUtils();
  const options = masterTrpc.memoOut.options.useQuery(customerId ? { customerId } : {}, { staleTime: 60_000, retry: retryTransient });
  const next = masterTrpc.memoOut.nextNumber.useQuery(isNew && /^\d{4}-\d{2}-\d{2}$/.test(docDate) ? { docDate } : skipToken, { staleTime: 10_000, retry: retryTransient });
  const writes = { retry: false, gcTime: 0 } as const;
  const create = masterTrpc.memoOut.create.useMutation(writes);
  const update = masterTrpc.memoOut.update.useMutation(writes);
  const remove = masterTrpc.memoOut.delete.useMutation(writes);
  const submit = masterTrpc.memoOut.submit.useMutation(writes);
  const restore = masterTrpc.memoOut.restore.useMutation(writes);
  return {
    options: options.data,
    companyCurrency: options.data?.companyCurrency,
    nextDocNo: next.data?.docNo,
    create: (input) => create.mutateAsync(input),
    update: (args) => update.mutateAsync(args),
    remove: (args) => remove.mutateAsync(args),
    submit: (args) => submit.mutateAsync(args),
    restore: (args) => restore.mutateAsync(args),
    invalidate: () =>
      Promise.all([utils.memoOut.list.invalidate(), utils.memoOut.get.invalidate(), utils.memoOut.nextNumber.invalidate(), utils.memoStock.list.invalidate()]),
    busy: create.isPending || update.isPending || remove.isPending || submit.isPending || restore.isPending,
  };
}
