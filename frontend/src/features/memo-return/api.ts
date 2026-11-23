"use client";

import { skipToken } from "@tanstack/react-query";
import type { InferQueryLikeData } from "@trpc/react-query/shared";
import { z } from "zod";
import { fromTradeDocument, toTradeDocumentInput } from "@/features/quotation/api";
import { dec, toFixed } from "@/features/quotation/lib/decimal";
import { emptyQuotation, newKey } from "@/features/quotation/lib/defaults";
import { isFilledLine, lineSchema, tradeDocumentRules, tradeDocumentShape, type QuotationLine } from "@/features/quotation/schema";
import { documentLoadError, mapDocumentSaveError, daybookInput, daybookQueryOptions, mapDocumentRestoreError } from "@/features/trade-document/document-api";
import type { DocumentApi } from "@/features/trade-document/document-form";
import { lotPendingShortText, lotTooLargeMessage, sentLotLines } from "@/features/trade-document/lot-stock";
import type { MemoStockItem } from "@/features/trade-document/memo-stock-api";
import { stockRowMessage } from "@/features/trade-document/stock-row-errors";
import { masterTrpc } from "@/lib/master-trpc";
import { readDomainError, retryTransient } from "@/lib/trpc-error";
import { APPROVAL_DOC_STATUSES } from "@/features/trade-document/flow-status";
import { DOCUMENT_PHOTOS } from "@/features/trade-document/document-photos";

/**
 * Memo Return data access (memo-return SA rev 2, owner 2026-10-29): `memoReturn.*` with a vendor and one address,
 * numbers from Document Setup `memo-return`, rows picked from the vendor's Memo Stock lots (`memoStock.lots`, lot-based-stock round 2: one row per lot,
 * no Stock ID). Saving waits for approval; approval reduces pending.
 */
export type MemoReturnDetail = InferQueryLikeData<typeof masterTrpc.memoReturn.get>;
export type MemoReturnOptions = InferQueryLikeData<typeof masterTrpc.memoReturn.options>;
export type { MemoStockItem };
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
  /** Legacy lines (saved before lots, Q-LOT-09) keep their item id; a new pick names its lot. */
  memoStockId: z.string().default(""),
  lotKey: z.string().default(""),
  outstandingPcs: z.string().default(""),
  outstandingWeightCt: z.string().default(""),
});
export type MemoReturnLine = z.infer<typeof memoReturnLineSchema>;
/** Saving sends it to approval; Approve makes it read-only and takes the items off Memo Stock (Q-MR-15). */
/** ADR-0050: Draft, Pending Approval, Approved, Revise, Rejected. */
export const MEMO_RETURN_STATUSES = APPROVAL_DOC_STATUSES;

export const memoReturnSchema = z
  .object({
    ...tradeDocumentShape,
    lines: z.array(memoReturnLineSchema),
    documentNote: z.string().max(MEMO_RETURN_NOTE_MAX),
    status: z.enum(MEMO_RETURN_STATUSES),
    vendorId: z.string().min(1, "Required"),
    addressId: z.string().min(1, "Required"),
    // Owner 2026-11-16: no Due Date field on Memo Return. The API still requires one, so it is the Doc Date
    // (toMemoReturnInput); the form value is not validated, as nobody can see or fix it.
    dueDate: z.string(),
  })
  .superRefine((value, ctx) => {
    tradeDocumentRules({ ...value, dueDate: value.docDate }, ctx);
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
    lines: q.lines.map((line) => ({ ...line, memoStockId: "", lotKey: "", outstandingPcs: "", outstandingWeightCt: "" })),
    discount: q.discount,
    tax: q.tax,
    serviceCharges: q.serviceCharges,
    labor: q.labor,
    documentNote: q.documentNote,
  };
}

/**
 * A Memo Stock lot → a return row with an empty Return (placeholder 0 / 0.00, owner 2026-10-29). The price is the lot's
 * net unit price (the weighted average of its open items, owner 2026-11-21) at 2 dp; Memo Stock has no stone code and a
 * row never carries a Stock ID (owner Q-LOT-10).
 */
export function lotToLine(item: MemoStockItem): MemoReturnLine {
  return {
    key: newKey(),
    source: "MANUAL",
    stockId: "",
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
    priceUnit: item.priceUnit === "PER_PCS" ? "PER_PCS" : "PER_CT",
    unitPrice: toFixed(dec(item.netUnitPrice ?? "0"), 2),
    discountType: "PERCENT",
    discountValue: "",
    stonePartOrder: [],
    photos: [],
    itemNote: item.itemNote,
    memoStockId: "",
    lotKey: item.lotKey,
    outstandingPcs: String(item.pendingPcs),
    outstandingWeightCt: item.pendingWeightCt,
  };
}

/** Form values → contract input: each filled row names its Memo Stock lot; photos in order (ADR-0048). */
export function toMemoReturnInput(values: MemoReturnFormValues) {
  const shared = toTradeDocumentInput(values);
  const filled = values.lines.filter(isFilledLine);
  return {
    ...shared,
    // Owner 2026-11-16: Memo Return has no Due Date field; the required API value is the Doc Date.
    dueDate: values.docDate,
    lines: shared.lines.map((line, index) => ({
      ...line,
      // A lot pick sends `lotKey` alone; a legacy line (stored before lots) keeps its item id.
      memoStockId: filled[index]?.lotKey ? null : filled[index]?.memoStockId || null,
      lotKey: filled[index]?.lotKey || null,
      outstandingPcs: Number.parseInt(filled[index]?.outstandingPcs || "0", 10),
      outstandingWeightCt: filled[index]?.outstandingWeightCt || "0",
    })),
    vendorId: values.vendorId,
    addressId: values.addressId,
  };
}

export function fromMemoReturn(detail: MemoReturnDetail): MemoReturnFormValues {
  // Memo Stock items have no stone code (memo-receive rev 2).
  const shared = fromTradeDocument({ ...detail, lines: detail.lines.map((line) => ({ ...line, stoneCodeId: null })) }, DOCUMENT_PHOTOS.memoReturn.url);
  return {
    ...shared,
    lines: shared.lines.map((line, index) => ({
      ...line,
      // Q-LOT-10: the Stock ID is never read; the row shows its Lot.
      stockId: "",
      memoStockId: detail.lines[index]?.memoStockId ?? "",
      lotKey: detail.lines[index]?.lotKey ?? "",
      outstandingPcs: String(detail.lines[index]?.outstandingPcs ?? 0),
      outstandingWeightCt: detail.lines[index]?.outstandingWeightCt ?? "0",
    })),
    status: detail.status,
    vendorId: detail.vendorId,
    addressId: detail.addressId ?? "",
  };
}

/** Lots already on the form (the picker leaves them out), by `lotKey`. */
export const pickedStockIds = (lines: QuotationLine[]) => new Set(lines.flatMap((line) => ((line as Partial<MemoReturnLine>).lotKey ? [(line as MemoReturnLine).lotKey] : [])));

export function mapMemoReturnSaveError(error: unknown, values?: { lines: readonly QuotationLine[] }) {
  const { domainCode, fieldErrors, details } = readDomainError(error);
  const lines = sentLotLines(values);
  // Approval found less pending than a row returns: another memo return took it first.
  if (domainCode === "MEMO_RETURN_PENDING_SHORT") {
    const row = lotPendingShortText(details, fieldErrors, lines);
    return { fieldErrors: [], message: row ? `${row}. Nothing was saved.` : "Some items no longer have enough pending. Edit the Return quantity and save again. Nothing was saved." };
  }
  if (domainCode === "STOCK_LOT_TOO_LARGE") return { fieldErrors: [], message: lotTooLargeMessage(details, lines) };
  const outcome = mapDocumentSaveError(error, "MEMO_RETURN", "memo return", HEADER_FIELDS);
  const lotRefused = domainCode === "STOCK_LOT_UNAVAILABLE" || domainCode === "VALIDATION_ERROR" || domainCode === "MEMO_RETURN_REFERENCE_INVALID";
  const row = lotRefused ? stockRowMessage(fieldErrors, "memo return", () => "More than pending", lines) : undefined;
  return row ? { ...outcome, message: row } : outcome;
}
export const memoReturnLoadError = (error: unknown) => documentLoadError(error, "MEMO_RETURN", "memo return", "memo returns");

/** transaction-soft-delete FE-SD-003: Restore errors (not deleted any more, changed, gone). */
export const memoReturnRestoreError = (error: unknown) => mapDocumentRestoreError(error, "MEMO_RETURN", "memo return");

export function useMemoReturnDetail(id: string | null) {
  return masterTrpc.memoReturn.get.useQuery(id === null ? skipToken : { id }, { staleTime: 30_000, retry: retryTransient });
}

/** FE-SD-001: the daybook's active or deleted memo returns, newest first, 50 a page; a new view starts on page one. */
export function useMemoReturnDaybook() {
  return masterTrpc.memoReturn.list.useInfiniteQuery(daybookInput(), daybookQueryOptions);
}

export function useMemoReturnApi(vendorId: string | undefined, docDate: string, isNew: boolean): DocumentApi<MemoReturnInput, MemoReturnOptions> {
  const utils = masterTrpc.useUtils();
  const options = masterTrpc.memoReturn.options.useQuery(vendorId ? { vendorId } : {}, { staleTime: 60_000, retry: retryTransient });
  const next = masterTrpc.memoReturn.nextNumber.useQuery(isNew && /^\d{4}-\d{2}-\d{2}$/.test(docDate) ? { docDate } : skipToken, { staleTime: 10_000, retry: retryTransient });
  const writes = { retry: false, gcTime: 0 } as const;
  const create = masterTrpc.memoReturn.create.useMutation(writes);
  const update = masterTrpc.memoReturn.update.useMutation(writes);
  const remove = masterTrpc.memoReturn.delete.useMutation(writes);
  const submit = masterTrpc.memoReturn.submit.useMutation(writes);
  const restore = masterTrpc.memoReturn.restore.useMutation(writes);
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
      Promise.all([utils.memoReturn.list.invalidate(), utils.memoReturn.get.invalidate(), utils.memoReturn.nextNumber.invalidate(), utils.memoStock.lots.invalidate()]),
    busy: create.isPending || update.isPending || remove.isPending || submit.isPending || restore.isPending,
  };
}
