"use client";

import { skipToken } from "@tanstack/react-query";
import type { InferQueryLikeData } from "@trpc/react-query/shared";
import { fromTradeDocument, toTradeDocumentInput, type TradeDocumentDetail } from "@/features/quotation/api";
import { isFilledLine } from "@/features/quotation/schema";
import { documentLoadError, mapDocumentSaveError } from "@/features/trade-document/document-api";
import type { DocumentApi, SaveOutcome } from "@/features/trade-document/document-form";
import { masterTrpc } from "@/lib/master-trpc";
import { readDomainError, retryTransient } from "@/lib/trpc-error";
import { purchaseLineSource, type PurchaseFormValues } from "./form";

export * from "./form";

/**
 * Purchase (PU) data access on SA rev 1 (ADR-0042, approved 2026-11-04): `purchase.*` on the master tRPC router.
 * Save checks the sources' availability and moves no stock; Approve cuts Memo Stock and the PO lines (SA D2). Components
 * use only this module.
 */
export type PurchaseDetail = InferQueryLikeData<typeof masterTrpc.purchase.get>;
/** `purchase.options`: vendors + addresses, company currency, stone lists with codes, `numbering`. */
export type PurchaseOptions = InferQueryLikeData<typeof masterTrpc.purchase.options>;
export type PurchaseInput = ReturnType<typeof toPurchaseInput>;

const HEADER_FIELDS = ["docDate", "dueDate", "vendorId", "addressId", "currency", "exchangeRate", "ref", "documentNote"] as const;
/** Server line ids are UUIDs; rows added on the page have `line-…` keys (`newKey`). */
const SERVER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_DISCOUNT = { type: "NONE" as const, value: "0" };

/**
 * Form values → `PurchaseInput` (api-contract): empty rows dropped; each row names its source. A picked row sends
 * `memoStockId` + `memoGroup` (STOCK) or `purchaseOrderLineId` (PURCHASE_ORDER), no line discount (D8) and no stone code
 * id (the server copies every source field, SA-PU-14). On update a saved row sends its line `id`, so it keeps its Stock
 * ID. No photos (Q-PU-11).
 */
export function toPurchaseInput(values: PurchaseFormValues) {
  const shared = toTradeDocumentInput(values);
  const filled = values.lines.filter(isFilledLine);
  const saved = Boolean(values.id);
  return {
    ...shared,
    lines: shared.lines.map((line, index) => {
      const row = filled[index]!;
      const id = saved && SERVER_ID.test(row.key) ? { id: row.key } : {};
      const base = { ...line, ...id, photoIds: [] as string[] };
      const source = purchaseLineSource(row);
      if (source === "STOCK") {
        return { ...base, source, stoneCodeId: null, discount: NO_DISCOUNT, memoStockId: row.memoStockId, memoGroup: row.memoGroup || null, purchaseOrderLineId: null };
      }
      if (source === "PURCHASE_ORDER") {
        return { ...base, source, stoneCodeId: null, discount: NO_DISCOUNT, memoStockId: null, memoGroup: null, purchaseOrderLineId: row.purchaseOrderLineId };
      }
      return { ...base, source, memoStockId: null, memoGroup: null, purchaseOrderLineId: null };
    }),
    vendorId: values.vendorId,
    addressId: values.addressId,
  };
}

/**
 * Saved purchase → form values. Rows keep their server line id as their key and show their Stock ID. A picked row keeps
 * its source, Memo No. / PO No. and, while pending, its cap from `limitPcs` / `limitWeightCt` (SA-PU-16).
 */
export function fromPurchase(detail: PurchaseDetail): PurchaseFormValues {
  const shared = fromTradeDocument(detail as unknown as TradeDocumentDetail, (id) => id);
  return {
    ...shared,
    lines: shared.lines.map((line, index) => {
      const saved = detail.lines[index]!;
      const picked = saved.source !== "MANUAL";
      return {
        ...line,
        source: picked ? ("STOCK" as const) : ("MANUAL" as const),
        stockId: saved.stockId,
        stoneCodeId: picked ? "" : line.stoneCodeId,
        memoStockId: saved.memoStockId ?? "",
        memoGroup: saved.memoGroup ?? "",
        purchaseOrderLineId: saved.purchaseOrderLineId ?? "",
        sourceDocNo: saved.memoReceive?.docNo ?? saved.purchaseOrder?.docNo ?? "",
        stockPendingPcs: saved.limitPcs === null ? "" : String(saved.limitPcs),
        stockPendingWeightCt: saved.limitWeightCt ?? "",
      };
    }),
    status: detail.status,
    vendorId: detail.vendorId,
    addressId: detail.addressId ?? "",
  };
}

// ---- errors (error-handling, SA error table) ----

export const PURCHASE_CHANGED_MESSAGE = "This purchase was changed by someone else. Refresh to see the latest.";
export const PURCHASE_APPROVED_MESSAGE = "This purchase is approved and can no longer be changed.";
export const PURCHASE_AVAILABLE_SHORT = "More than the available quantity";

type FieldError = { path: string; code: string };
const rowOf = (path: string) => Number(path.split(".")[1] ?? 0) + 1;
const rowsText = (errors: readonly FieldError[]) => {
  const rows = [...new Set(errors.map((entry) => rowOf(entry.path)))].sort((a, b) => a - b);
  return rows.length === 1 ? `Row ${rows[0]}` : `Rows ${rows.join(", ")}`;
};
const isQuantityShort = (entry: FieldError) => /^lines\.\d+\.(pcs|weightCt)$/.test(entry.path) && entry.code === "exceeds_available";
const isRowReference = (entry: FieldError) => /^lines\.\d+\.(memoStockId|purchaseOrderLineId|stoneCodeId)$/.test(entry.path);

/**
 * Domain codes → row / field errors and one toast. A source quantity that is no longer available is a row error: at
 * Save `VALIDATION_ERROR exceeds_available` (nothing saved), at Approve `PURCHASE_PENDING_SHORT` (nothing approved, every
 * short row listed). The conflict code is `PURCHASE_CHANGED`. Entered data is always kept.
 */
export function mapPurchaseSaveError(error: unknown): SaveOutcome {
  const { domainCode, fieldErrors } = readDomainError(error);
  const short = fieldErrors.filter(isQuantityShort);
  const references = fieldErrors.filter(isRowReference);
  const onRows = (entries: readonly FieldError[], message: string) => entries.map((entry) => ({ name: entry.path, message }));
  switch (domainCode) {
    case "PURCHASE_PENDING_SHORT": {
      const lost = fieldErrors.filter((entry) => entry.path.endsWith(".purchaseOrderLineId"));
      const all = [...short, ...lost];
      return {
        fieldErrors: [...onRows(short, PURCHASE_AVAILABLE_SHORT), ...onRows(lost, "No longer available")],
        message: `${all.length > 0 ? rowsText(all) : "Some rows"}: not enough is available any more. Lower the quantity or remove the row, then save and approve again.`,
      };
    }
    case "VALIDATION_ERROR":
      if (short.length > 0) return { fieldErrors: onRows(short, PURCHASE_AVAILABLE_SHORT), message: `${rowsText(short)}: more than the available quantity. Nothing was saved.` };
      break;
    case "PURCHASE_REFERENCE_INVALID":
      if (references.length > 0) return { fieldErrors: onRows(references, "No longer available"), message: `${rowsText(references)}: this item is no longer available. Remove the row and choose again.` };
      break;
    case "PURCHASE_CHANGED":
      return { fieldErrors: [], message: PURCHASE_CHANGED_MESSAGE };
    case "PURCHASE_STATUS_INVALID":
      return { fieldErrors: [], message: PURCHASE_APPROVED_MESSAGE };
    case "PURCHASE_STOCK_ID_EXHAUSTED":
      return { fieldErrors: [], message: "No more Stock IDs this year. Contact the administrator." };
    case "CSRF_INVALID":
      return { fieldErrors: [], message: "Please reload the page and try again." };
  }
  return mapDocumentSaveError(error, "PURCHASE", "purchase", HEADER_FIELDS);
}

/** Page and daybook load errors; a missing purchase reads "Purchase not found." (error-handling). */
export const purchaseLoadError = (error: unknown) =>
  readDomainError(error).domainCode === "PURCHASE_NOT_FOUND" ? "Purchase not found." : documentLoadError(error, "PURCHASE", "purchase", "purchases");

// ---- hooks ----

export function usePurchaseDetail(id: string | null) {
  return masterTrpc.purchase.get.useQuery(id === null ? skipToken : { id }, { staleTime: 30_000, retry: retryTransient });
}

/** Daybook: the newest 50 purchases. */
export function usePurchaseDaybook() {
  return masterTrpc.purchase.list.useQuery({ limit: 50 }, { staleTime: 15_000, retry: retryTransient });
}

type MasterUtils = ReturnType<typeof masterTrpc.useUtils>;
/**
 * After a write: every `purchase.*` query (daybook, document, number, both pickers), and, because Approve moves stock,
 * `purchaseOrder.get` (purchased quantities) and `memoOutstanding.*` (Sold figures).
 */
export const invalidateAfterPurchaseWrite = (utils: MasterUtils) =>
  Promise.all([utils.purchase.invalidate(), utils.purchaseOrder.get.invalidate(), utils.memoOutstanding.invalidate()]);

/** The shared document form's API for Purchase (FE-PU-003). */
export function usePurchaseApi(vendorId: string | undefined, docDate: string, isNew: boolean): DocumentApi<PurchaseInput, PurchaseOptions> {
  const utils = masterTrpc.useUtils();
  const options = masterTrpc.purchase.options.useQuery(vendorId ? { vendorId } : {}, { staleTime: 60_000, retry: retryTransient });
  const next = masterTrpc.purchase.nextNumber.useQuery(isNew && /^\d{4}-\d{2}-\d{2}$/.test(docDate) ? { docDate } : skipToken, { staleTime: 10_000, retry: retryTransient });
  const writes = { retry: false, gcTime: 0 } as const;
  const create = masterTrpc.purchase.create.useMutation(writes);
  const update = masterTrpc.purchase.update.useMutation(writes);
  const remove = masterTrpc.purchase.delete.useMutation(writes);
  const approve = masterTrpc.purchase.approve.useMutation(writes);
  return {
    options: options.data,
    companyCurrency: options.data?.companyCurrency,
    nextDocNo: next.data?.docNo,
    create: (input) => create.mutateAsync(input),
    update: (args) => update.mutateAsync(args),
    remove: (args) => remove.mutateAsync(args),
    approve: (args) => approve.mutateAsync(args),
    invalidate: () => invalidateAfterPurchaseWrite(utils),
    busy: create.isPending || update.isPending || remove.isPending || approve.isPending,
  };
}
