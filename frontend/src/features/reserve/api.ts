"use client";

import { skipToken } from "@tanstack/react-query";
import type { InferQueryLikeData } from "@trpc/react-query/shared";
import { customerStockSaveError, fromCustomerStock, type toCustomerStockInput } from "@/features/trade-document/customer-stock";
import { documentLoadError } from "@/features/trade-document/document-api";
import type { DocumentApi } from "@/features/trade-document/document-form";
import { masterTrpc } from "@/lib/master-trpc";
import { retryTransient } from "@/lib/trpc-error";

/**
 * Reserve data access (reserve SA rev 1 / ADR-0036, owner 2026-11-02): `reserve.*`, numbers from Document Setup
 * `reserve`. Rows picked From Stock name a Memo Stock item and are held in Reserve at Approve, for a later Sale; rows
 * typed by hand hold nothing (Q-RS-04). The form values, rules and mapping are shared with Memo Out.
 */
export type ReserveDetail = InferQueryLikeData<typeof masterTrpc.reserve.get>;
export type ReserveOptions = InferQueryLikeData<typeof masterTrpc.reserve.options>;
export type ReserveInput = ReturnType<typeof toCustomerStockInput>;

export const RESERVE_HREF = "/pre-sale/reserve";
export const reserveHref = (id: string) => `${RESERVE_HREF}/${id}`;

export const fromReserve = (detail: ReserveDetail) => fromCustomerStock(detail);
export const mapReserveSaveError = customerStockSaveError("RESERVE", "reserve");
export const reserveLoadError = (error: unknown) => documentLoadError(error, "RESERVE", "reserve", "reserves");

export function useReserveDetail(id: string | null) {
  return masterTrpc.reserve.get.useQuery(id === null ? skipToken : { id }, { staleTime: 30_000, retry: retryTransient });
}

export function useReserveDaybook() {
  return masterTrpc.reserve.list.useQuery({ limit: 50 }, { staleTime: 15_000, retry: retryTransient });
}

/** Options, number preview, writes and approval for the shared document form. */
export function useReserveApi(customerId: string | undefined, docDate: string, isNew: boolean): DocumentApi<ReserveInput, ReserveOptions> {
  const utils = masterTrpc.useUtils();
  const options = masterTrpc.reserve.options.useQuery(customerId ? { customerId } : {}, { staleTime: 60_000, retry: retryTransient });
  const next = masterTrpc.reserve.nextNumber.useQuery(isNew && /^\d{4}-\d{2}-\d{2}$/.test(docDate) ? { docDate } : skipToken, { staleTime: 10_000, retry: retryTransient });
  const writes = { retry: false, gcTime: 0 } as const;
  const create = masterTrpc.reserve.create.useMutation(writes);
  const update = masterTrpc.reserve.update.useMutation(writes);
  const remove = masterTrpc.reserve.delete.useMutation(writes);
  const approve = masterTrpc.reserve.approve.useMutation(writes);
  return {
    options: options.data,
    companyCurrency: options.data?.companyCurrency,
    nextDocNo: next.data?.docNo,
    create: (input) => create.mutateAsync(input),
    update: (args) => update.mutateAsync(args),
    remove: (args) => remove.mutateAsync(args),
    approve: (args) => approve.mutateAsync(args),
    invalidate: () =>
      Promise.all([utils.reserve.list.invalidate(), utils.reserve.get.invalidate(), utils.reserve.nextNumber.invalidate(), utils.memoStock.list.invalidate()]),
    busy: create.isPending || update.isPending || remove.isPending || approve.isPending,
  };
}
