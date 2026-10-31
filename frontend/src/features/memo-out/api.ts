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
import type { MemoStockItem } from "@/features/trade-document/memo-stock-api";
import { masterTrpc } from "@/lib/master-trpc";
import { readDomainError, retryTransient } from "@/lib/trpc-error";

/**
 * Memo Out data access (memo-out SA rev 2 / ADR-0033 rev 2, owner 2026-10-31): `memoOut.*`, numbers from Document Setup
 * `memo-out`. Rows picked From Stock name a Memo Stock item and are cut into Reserve at Approve; rows typed by hand cut
 * nothing (Q-MO-09). Saving waits for approval.
 */
export type MemoOutDetail = InferQueryLikeData<typeof masterTrpc.memoOut.get>;
export type MemoOutOptions = InferQueryLikeData<typeof masterTrpc.memoOut.options>;
export type MemoOutInput = ReturnType<typeof toMemoOutInput>;

export const MEMO_OUT_HREF = "/memo/memo-out";
export const memoOutHref = (id: string) => `${MEMO_OUT_HREF}/${id}`;
const HEADER_FIELDS = ["docDate", "dueDate", "customerId", "shippingAddressId", "invoiceAddressId", "currency", "exchangeRate", "ref", "documentNote"] as const;

/** Saving sends a memo out to approval; Approve cuts its stock rows and makes it read-only (SA-MO-11). */
export const MEMO_OUT_STATUSES = ["PENDING_APPROVAL", "APPROVED"] as const;

/**
 * A From Stock row keeps its Memo Stock item and the pending it was picked with (its maximum, Q-MO-10). Manual rows
 * and empty rows have none of these.
 */
const memoOutLineSchema = lineSchema.extend({
  memoStockId: z.string().default(""),
  stockPendingPcs: z.string().default(""),
  stockPendingWeightCt: z.string().default(""),
});
export type MemoOutLine = z.infer<typeof memoOutLineSchema>;

export const memoOutSchema = z
  .object({
    ...tradeDocumentShape,
    lines: z.array(memoOutLineSchema),
    statusReason: z.string().optional(),
    status: z.enum(MEMO_OUT_STATUSES),
    customerId: z.string().min(1, "Required"),
    shippingAddressId: z.string().min(1, "Required"),
    invoiceAddressId: z.string().min(1, "Required"),
  })
  .superRefine((value, ctx) => {
    tradeDocumentRules(value, ctx);
    value.lines.forEach((line, index) => {
      if (!isFilledLine(line) || !line.memoStockId) return;
      const issue = (field: "pcs" | "weightCt" | "unitPrice", message: string) => ctx.addIssue({ code: "custom", path: ["lines", index, field], message });
      const pcs = Number(line.pcs || 0);
      const weight = Number(line.weightCt || 0);
      if (pcs <= 0 && weight <= 0) issue("pcs", "Enter the quantity");
      if (pcs > Number(line.stockPendingPcs || 0)) issue("pcs", "More than pending");
      if (weight > Number(line.stockPendingWeightCt || 0)) issue("weightCt", "More than pending");
      if (Number(line.unitPrice || 0) <= 0) issue("unitPrice", "Enter the sale price");
    });
  });

export type MemoOutFormValues = z.infer<typeof memoOutSchema>;

/** A new memo out: today, five empty rows, the company currency once options load. */
export function emptyMemoOut(): MemoOutFormValues {
  const q = emptyQuotation();
  return { ...q, status: "PENDING_APPROVAL", lines: q.lines.map((line) => ({ ...line, memoStockId: "", stockPendingPcs: "", stockPendingWeightCt: "" })) };
}

/**
 * A Memo Stock item → a From Stock row: its Stock ID, lot, location Memo, stone and certificate (read-only), the full
 * pending as the starting quantity (Q-MO-15), and an empty Sale Price (Q-MO-11). Memo Stock has no stone code.
 */
export function memoStockToOutLine(item: MemoStockItem): MemoOutLine {
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

/** Form values → contract input: a From Stock row names its Memo Stock item; manual rows don't; no photos yet. */
export function toMemoOutInput(values: MemoOutFormValues) {
  const shared = toTradeDocumentInput(values);
  const filled = values.lines.filter(isFilledLine);
  return {
    ...shared,
    lines: shared.lines.map((line, index) => ({ ...line, photoIds: [] as string[], memoStockId: filled[index]?.memoStockId || null })),
    customerId: values.customerId,
    shippingAddressId: values.shippingAddressId,
    invoiceAddressId: values.invoiceAddressId,
  };
}

export function fromMemoOut(detail: MemoOutDetail): MemoOutFormValues {
  // The shared mapping reads manual lines; the stock fields are added back per line below.
  const shared = fromTradeDocument({ ...detail, lines: detail.lines.map((line) => ({ ...line, source: "MANUAL" as const })) }, (id) => id);
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
export const pickedStockIds = (lines: QuotationLine[]) => new Set(lines.flatMap((line) => ((line as Partial<MemoOutLine>).memoStockId ? [(line as MemoOutLine).memoStockId] : [])));

export function mapMemoOutSaveError(error: unknown) {
  // Approval found less pending than a row takes: another document took it first (SA-MO-14).
  if (readDomainError(error).domainCode === "MEMO_OUT_PENDING_SHORT") {
    return { fieldErrors: [], message: "Some stock items no longer have enough pending. Edit the row and approve again." };
  }
  return mapDocumentSaveError(error, "MEMO_OUT", "memo out", HEADER_FIELDS);
}
export const memoOutLoadError = (error: unknown) => documentLoadError(error, "MEMO_OUT", "memo out", "memo outs");

export function useMemoOutDetail(id: string | null) {
  return masterTrpc.memoOut.get.useQuery(id === null ? skipToken : { id }, { staleTime: 30_000, retry: retryTransient });
}

export function useMemoOutDaybook() {
  return masterTrpc.memoOut.list.useQuery({ limit: 50 }, { staleTime: 15_000, retry: retryTransient });
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
  const approve = masterTrpc.memoOut.approve.useMutation(writes);
  return {
    options: options.data,
    companyCurrency: options.data?.companyCurrency,
    nextDocNo: next.data?.docNo,
    create: (input) => create.mutateAsync(input),
    update: (args) => update.mutateAsync(args),
    remove: (args) => remove.mutateAsync(args),
    approve: (args) => approve.mutateAsync(args),
    invalidate: () =>
      Promise.all([utils.memoOut.list.invalidate(), utils.memoOut.get.invalidate(), utils.memoOut.nextNumber.invalidate(), utils.memoStock.list.invalidate()]),
    busy: create.isPending || update.isPending || remove.isPending || approve.isPending,
  };
}
