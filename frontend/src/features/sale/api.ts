"use client";

import { useInfiniteQuery, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { PHOTO_MAX_BYTES, PHOTO_TYPES, PhotoUploadError, type QuotationOptions } from "@/features/quotation/api";
import { emptyLine } from "@/features/quotation/lib/defaults";
import type { PhotoRef } from "@/features/quotation/schema";
import { INVENTORY_QUERY_KEY } from "@/features/inventory/query-keys";
import { deletedMessage, type DeletedInfo, type RestoreOutcome, mapDocumentRestoreError } from "@/features/trade-document/document-api";
import type { DocumentApi, SaveOutcome } from "@/features/trade-document/document-form";
import type { DocumentPhotos } from "@/features/trade-document/document-photos";
import type { DocFlow } from "@/features/trade-document/flow-status";
import { inventoryRequest, inventoryUrl, isInventoryApiError, type InventoryClientDeps } from "@/lib/inventory-client";
import { isCallerLicenseCode, readDomainError, retryTransient } from "@/lib/trpc-error";
import { isFilledLine } from "@/features/quotation/schema";
import { SALE_HREF, saleHref, type SaleFormValues, type SaleInput, type SaleLine, type SaleReserveLineRef } from "./form";
import {
  createResultSchema,
  nextNumberSchema,
  photoIdSchema,
  reserveLinesPageSchema,
  saleListPageSchema,
  saleOptionsSchema,
  saleOutSchema,
  writeResultSchema,
  type SaleListItem,
  type SaleOut,
} from "./types";

/**
 * sale FE-SL-004/006/007 (SA rev 1 + ADR-0054; verified contract, "Implementation notes" 2026-11-19/20): the Sale calls
 * on the inventory REST client (`/api/inventory/v1/sale*`) and their TanStack Query hooks, the mapping between the
 * server shapes and the form, and the error mapping of error-handling.md.
 */

export { SALE_HREF, saleHref };
export type { SaleOut, SaleListItem };
export type SaleOptions = QuotationOptions;

export const SALE_PAGE_SIZE = 50;
const KEY = [...INVENTORY_QUERY_KEY, "sale"] as const;
export type ReserveLineFilter = { customerId: string; currency: string; q: string; from: string; to: string; exclude: string[] };
export const saleKeys = {
  all: KEY,
  options: (customerId: string | undefined) => [...KEY, "options", customerId ?? ""] as const,
  nextNumber: (docDate: string) => [...KEY, "next-number", docDate] as const,
  list: () => [...KEY, "list"] as const,
  get: (id: string) => [...KEY, "get", id] as const,
  reserveLines: (filter: ReserveLineFilter) => [...KEY, "reserve-lines", filter] as const,
};

const path = (id: string) => `/sale/${encodeURIComponent(id)}`;
const versionBody = (expectedVersion: number) => ({ expectedVersion });

/** The raw calls (one per contract route). `deps` lets the tests use a controlled fetch. */
export function saleCalls(deps: InventoryClientDeps = {}) {
  return {
    options: (customerId?: string) => inventoryRequest("/sale/options", { query: { customerId }, schema: saleOptionsSchema }, deps),
    nextNumber: (docDate: string) => inventoryRequest("/sale/next-number", { query: { docDate }, schema: nextNumberSchema }, deps),
    list: (cursor?: string | null) => inventoryRequest("/sale", { query: { deleted: false, cursor, limit: SALE_PAGE_SIZE }, schema: saleListPageSchema }, deps),
    get: (id: string) => inventoryRequest(path(id), { schema: saleOutSchema }, deps),
    reserveLines: (filter: ReserveLineFilter, cursor?: string | null) =>
      inventoryRequest(
        "/sale/reserve-lines",
        {
          query: {
            customerId: filter.customerId,
            currency: filter.currency,
            q: filter.q.trim().slice(0, 100),
            from: filter.from,
            to: filter.to,
            exclude: [...new Set(filter.exclude)].slice(0, 200).join(","),
            cursor,
            limit: SALE_PAGE_SIZE,
          },
          schema: reserveLinesPageSchema,
        },
        deps,
      ),
    create: (input: SaleInput) => inventoryRequest("/sale", { method: "POST", body: input, schema: createResultSchema }, deps),
    update: (id: string, input: SaleInput & { expectedVersion: number }) => inventoryRequest(path(id), { method: "PUT", body: input, schema: writeResultSchema }, deps),
    submit: (id: string, expectedVersion: number) => inventoryRequest(`${path(id)}/submit`, { method: "POST", body: versionBody(expectedVersion), schema: writeResultSchema }, deps),
    approve: (id: string, expectedVersion: number) => inventoryRequest(`${path(id)}/approve`, { method: "POST", body: versionBody(expectedVersion), schema: writeResultSchema }, deps),
    requestRevision: (id: string, expectedVersion: number, note: string) =>
      inventoryRequest(`${path(id)}/request-revision`, { method: "POST", body: { expectedVersion, note }, schema: writeResultSchema }, deps),
    reject: (id: string, expectedVersion: number, reason: string) => inventoryRequest(`${path(id)}/reject`, { method: "POST", body: { expectedVersion, reason }, schema: writeResultSchema }, deps),
    remove: (id: string, expectedVersion: number) => inventoryRequest(`${path(id)}/delete`, { method: "POST", body: versionBody(expectedVersion), schema: writeResultSchema }, deps),
    restore: (id: string, expectedVersion: number) => inventoryRequest(`${path(id)}/restore`, { method: "POST", body: versionBody(expectedVersion), schema: writeResultSchema }, deps),
    uploadPhoto: (file: File) => {
      const form = new FormData();
      form.set("file", file);
      return inventoryRequest("/sale/photos", { method: "POST", form, schema: photoIdSchema }, deps);
    },
  };
}

export const saleApi = saleCalls();

// ---------- photos (FE-SL-007, ADR-0048) ----------

export const salePhotoUrl = (id: string) => inventoryUrl(`/sale/photos/${encodeURIComponent(id)}`);

/** One JPEG/PNG ≤ 5 MiB, multipart `file`; returns its photo id. */
export async function uploadSalePhoto(file: File, calls: Pick<ReturnType<typeof saleCalls>, "uploadPhoto"> = saleApi): Promise<string> {
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) throw new PhotoUploadError("Use a JPEG or PNG photo.");
  if (file.size > PHOTO_MAX_BYTES) throw new PhotoUploadError("Photos can be up to 5 MB.");
  try {
    return (await calls.uploadPhoto(file)).id;
  } catch (error) {
    const code = isInventoryApiError(error) ? error.code : null;
    if (code === "SALE_PHOTO_INVALID" || code === "PHOTO_TOO_LARGE" || code === "PHOTO_TYPE_INVALID" || code === "PAYLOAD_TOO_LARGE") throw new PhotoUploadError("This file isn't a supported photo (JPEG or PNG, up to 5 MB).");
    if (code === "RATE_LIMITED") throw new PhotoUploadError("The server is busy. Wait a moment and add the photo again.");
    if (code === "PERMISSION_DENIED") throw new PhotoUploadError("You don't have permission to add photos.");
    if (code === "UNAUTHENTICATED") throw new PhotoUploadError("Your session has ended. Sign in again, then add the photo.");
    throw new PhotoUploadError("Couldn't upload the photo. Try again.");
  }
}

export const SALE_PHOTOS: DocumentPhotos = {
  route: inventoryUrl("/sale/photos"),
  url: salePhotoUrl,
  target: { upload: (file) => uploadSalePhoto(file), url: salePhotoUrl },
  uploadPhoto: async (file): Promise<PhotoRef> => {
    const id = await uploadSalePhoto(file);
    return { id, name: file.name, url: salePhotoUrl(id) };
  },
};

// ---------- server → form ----------

/** `GET /sale/{id}` → the form: picked rows keep their source, reference, caption "from {No.}" and live cap. */
export function fromSale(detail: SaleOut): SaleFormValues {
  const lines = [...detail.lines].sort((a, b) => a.position - b.position).map((line): SaleLine => ({
    ...emptyLine(),
    key: line.id,
    source: "STOCK",
    stockId: line.stockId,
    lot: line.lot,
    stoneCodeId: "",
    stoneCode: line.stoneCode,
    locationId: line.location,
    stone: line.stone,
    shape: line.shape,
    size: line.size,
    color: line.color,
    clarity: line.clarity,
    cutting: line.cutting,
    quality: line.quality,
    cerType: line.cerType,
    cerNo: line.cerNo,
    pcs: String(line.pcs),
    weightCt: line.weightCt,
    priceUnit: line.priceUnit,
    unitPrice: line.unitPrice,
    discountType: line.discount.type === "AMOUNT" ? "AMOUNT" : "PERCENT",
    discountValue: line.discount.type === "NONE" ? "" : line.discount.value,
    photos: line.photoIds.map((id, index) => ({ id, name: `Photo ${index + 1}`, url: salePhotoUrl(id) })),
    itemNote: line.itemNote,
    lineId: line.id,
    saleSource: line.source,
    reserveLineId: line.reserveLineId ?? "",
    memoStockId: line.memoStockId,
    sourceDocNo: line.sourceDoc.docNo,
    stockPendingPcs: String(line.capPcs),
    stockPendingWeightCt: line.capWeightCt,
  }));
  return {
    id: detail.id,
    docNo: detail.docNo,
    version: detail.version,
    status: detail.status,
    docDate: detail.docDate,
    dueDate: detail.dueDate,
    customerId: detail.customerId,
    shippingAddressId: detail.shippingAddressId ?? "",
    invoiceAddressId: detail.invoiceAddressId ?? "",
    currency: detail.currency,
    exchangeRate: detail.exchangeRate ?? "",
    ref: detail.ref,
    lines,
    discount: detail.discount.type === "NONE" ? { enabled: false, type: "PERCENT", value: "" } : { enabled: true, type: detail.discount.type, value: detail.discount.value },
    tax: detail.tax,
    serviceCharges: detail.serviceCharges.map((charge) => ({ chargeId: charge.type, amount: charge.amount })),
    labor: detail.labor ? { enabled: true, ...detail.labor } : { enabled: false, work: "", basis: "PCS", qty: "", rate: "" },
    documentNote: detail.documentNote,
  };
}

/** ADR-0050 `Flow` of a sale: the caller's flags from the server; a syncing sale can't be changed. */
export function saleFlow(detail: SaleOut): DocFlow {
  const review = detail.approval.review;
  return {
    status: detail.status,
    autoApproved: detail.approval.autoApproved,
    revisionCount: detail.approval.revisionCount,
    canEdit: detail.flow.canEdit && !detail.syncing,
    canDelete: detail.flow.canDelete && !detail.syncing,
    canSubmit: detail.flow.canSubmit,
    usedBy: detail.flow.usedBy ? { docNo: detail.flow.usedBy } : null,
    review: review ? { action: review.action, note: review.note, at: review.at ?? "", byName: review.byName } : null,
  };
}

export const saleDeleted = (detail: SaleOut): DeletedInfo | null => (detail.deleted ? { at: detail.deleted.at, by: detail.deleted.by || null } : null);

// ---------- hooks ----------

/** After a write: every Sale read, the inventory Approve views, and the stock lists the sale holds or releases. */
export function invalidateSale(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: KEY }),
    queryClient.invalidateQueries({ queryKey: [...INVENTORY_QUERY_KEY, "approval"] }),
    queryClient.invalidateQueries({ queryKey: [...INVENTORY_QUERY_KEY, "approval-settings"] }),
    queryClient.invalidateQueries({ queryKey: [["memoStock"]] }),
    queryClient.invalidateQueries({ queryKey: [["reserve"]] }),
  ]);
}

/** Options, number preview and writes for the shared document form (`DocumentApi`). */
export function useSaleApi(customerId: string | undefined, docDate: string, isNew: boolean): DocumentApi<SaleInput, SaleOptions> {
  const queryClient = useQueryClient();
  const options = useQuery({ queryKey: saleKeys.options(customerId), queryFn: () => saleApi.options(customerId), staleTime: 60_000, retry: retryTransient });
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(docDate);
  const next = useQuery({ queryKey: saleKeys.nextNumber(docDate), queryFn: () => saleApi.nextNumber(docDate), staleTime: 10_000, retry: retryTransient, enabled: isNew && validDate });
  const [busy, setBusy] = useState(false);
  const run = useCallback(<T,>(call: () => Promise<T>) => {
    setBusy(true);
    return call().finally(() => setBusy(false));
  }, []);
  return {
    options: options.data as unknown as SaleOptions | undefined,
    companyCurrency: options.data?.companyCurrency,
    nextDocNo: next.data?.docNo,
    create: (input) => run(() => saleApi.create(input)),
    update: ({ id, ...input }) => run(() => saleApi.update(id, input)),
    remove: ({ id, expectedVersion }) => run(() => saleApi.remove(id, expectedVersion)),
    submit: ({ id, expectedVersion }) => run(() => saleApi.submit(id, expectedVersion)),
    restore: ({ id, expectedVersion }) => run(() => saleApi.restore(id, expectedVersion)),
    invalidate: () => invalidateSale(queryClient),
    busy,
  };
}

export function useSaleDetail(id: string | null) {
  return useQuery({ queryKey: saleKeys.get(id ?? ""), queryFn: () => saleApi.get(id ?? ""), enabled: id !== null, retry: retryTransient, staleTime: 0 });
}

export function useSaleDaybook() {
  return useInfiniteQuery({
    queryKey: saleKeys.list(),
    queryFn: ({ pageParam }) => saleApi.list(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 15_000,
    retry: retryTransient,
  });
}

/** P-01: open Reserve lines of the customer in the currency, 50 a page with Load more. */
export function useReserveLines(filter: ReserveLineFilter, enabled = true) {
  return useInfiniteQuery({
    queryKey: saleKeys.reserveLines(filter),
    queryFn: ({ pageParam }) => saleApi.reserveLines(filter, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 10_000,
    retry: retryTransient,
    enabled: enabled && Boolean(filter.customerId && filter.currency),
  });
}

/** Rows of the infinite query as the picker shell's data. */
export function reserveLinePickerData(query: ReturnType<typeof useReserveLines>) {
  return {
    rows: (query.data?.pages ?? []).flatMap((page) => page.items) as SaleReserveLineRef[],
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: () => void query.fetchNextPage(),
  };
}

// ---------- errors (error-handling.md, backend error-handling) ----------

const HEADER_FIELDS = ["docDate", "dueDate", "customerId", "shippingAddressId", "invoiceAddressId", "currency", "exchangeRate", "ref", "documentNote"] as const;
const HEADER_MESSAGES: Record<string, string> = {
  required: "Required",
  invalid_reference: "Choose an active option",
  before_doc_date: "Due date must be on or after doc date",
  too_big: "Too large",
  too_small: "Too small",
};

/** Input line index (filled rows only, as `toSaleInput` sends them) → the form row index. */
function formRowOf(values: SaleFormValues | undefined, inputIndex: number): number {
  if (!values) return inputIndex;
  let seen = -1;
  for (let index = 0; index < values.lines.length; index += 1) {
    if (isFilledLine(values.lines[index]!)) seen += 1;
    if (seen === inputIndex) return index;
  }
  return inputIndex;
}

const lineIndexOf = (path: string): number | null => {
  const match = /^lines\.(\d+)/.exec(path);
  return match ? Number(match[1]) : null;
};

const amount = (value: unknown) => (typeof value === "string" || typeof value === "number" ? String(value) : "?");

/** A refused Save / Send / Delete → field and row errors plus one toast ("Row n: …"); edits are always kept. */
export function mapSaleSaveError(error: unknown, values?: SaleFormValues): SaveOutcome {
  const { domainCode, fieldErrors } = readDomainError(error);
  const detailed = isInventoryApiError(error) ? error.fieldErrors : [];
  const details = isInventoryApiError(error) ? error.details : null;
  const rowError = (path: string, message: string) => {
    const input = lineIndexOf(path);
    if (input === null) return null;
    const row = formRowOf(values, input);
    const field = path.split(".")[2] === "weightCt" ? "weightCt" : path.split(".")[2] === "unitPrice" ? "unitPrice" : "pcs";
    return { row, name: `lines.${row}.${field}`, message };
  };
  const rowsOutcome = (entries: ({ row: number; name: string; message: string } | null)[], fallback: string): SaveOutcome => {
    const rows = entries.filter((entry): entry is { row: number; name: string; message: string } => entry !== null).sort((a, b) => a.row - b.row);
    const first = rows[0];
    return { fieldErrors: rows.map(({ name, message }) => ({ name, message })), message: first ? `Row ${first.row + 1}: ${first.message}` : fallback };
  };
  const exceeds = (entry: { path: string; code: string; params?: Record<string, unknown> }) =>
    rowError(entry.path, `Only ${amount(entry.params?.availablePcs)} pcs / ${amount(entry.params?.availableWeightCt)} ct are available`);
  switch (domainCode) {
    case "SALE_SOURCE_SHORT":
      return rowsOutcome(detailed.filter((entry) => entry.code === "exceeds_open" || entry.code === "exceeds_pending").map(exceeds), "Some items no longer have enough available. Lower the quantity and save again.");
    case "SALE_REFERENCE_INVALID":
      return rowsOutcome(detailed.map((entry) => rowError(entry.path, "This item is no longer available. Remove the row.")), "Some items are no longer available. Remove those rows.");
    case "SALE_DELETED":
      return { fieldErrors: [], message: deletedMessage("sale"), deleted: true };
    case "SALE_CHANGED":
      return { fieldErrors: [], message: "This sale was changed by someone else. Refresh to see the latest." };
    case "SALE_NOT_FOUND":
      return { fieldErrors: [], message: "This sale no longer exists." };
    case "SALE_STATUS_INVALID":
      return { fieldErrors: [], message: "This sale can't be changed in its current status." };
    case "SALE_BUSY":
    case "SYNC_PENDING":
      return { fieldErrors: [], message: typeof details?.id === "string" && !values?.id ? "Saving in progress. Open the sale from the Daybook in a moment." : "Saving in progress. Refresh in a moment." };
    case "SALE_IN_USE":
      return { fieldErrors: [], message: "This sale can't be changed: its items are already used." };
    case "SALE_PHOTO_INVALID":
      return { fieldErrors: [], message: "A photo couldn't be used. Remove it and add it again." };
    case "VALIDATION_ERROR": {
      const rows = detailed.flatMap((entry) => {
        if (entry.code === "exceeds_open" || entry.code === "exceeds_pending") return [exceeds(entry)];
        if (entry.code === "invalid_reference" && lineIndexOf(entry.path) !== null) return [rowError(entry.path, "This item is no longer available. Remove the row.")];
        if (lineIndexOf(entry.path) !== null) return [rowError(entry.path, entry.code === "required" ? "Required" : "Check this value")];
        return [];
      });
      const header = fieldErrors.filter((entry) => (HEADER_FIELDS as readonly string[]).includes(entry.path)).map((entry) => ({ name: entry.path, message: HEADER_MESSAGES[entry.code] ?? "Check this field" }));
      const outcome = rowsOutcome(rows, header.length ? "Some details couldn't be saved. Check the form and try again." : "Some details couldn't be saved. Check the form and try again.");
      return { fieldErrors: [...header, ...outcome.fieldErrors], message: outcome.message };
    }
    case "MASTER_UNAVAILABLE":
      return { fieldErrors: [], message: "Stock data can't be reached right now. Nothing was saved. Try again in a moment." };
    case "SERVICE_UNAVAILABLE":
    case "NETWORK_ERROR":
      return { fieldErrors: [], message: "The inventory service can't be reached. Try again in a moment." };
    case "PAYLOAD_TOO_LARGE":
      return { fieldErrors: [], message: "This sale is too large to save. Remove some rows and try again." };
    case "PERMISSION_DENIED":
      return { fieldErrors: [], message: "You don't have permission to do this. Nothing was saved." };
    case "CSRF_INVALID":
      return { fieldErrors: [], message: "Your session needs a refresh. Reload the page and try again." };
    case "UNAUTHORIZED":
      return { fieldErrors: [], message: "Your session has ended. Sign in again." };
    default:
      if (isCallerLicenseCode(domainCode)) return { fieldErrors: [], message: "Your license doesn't allow this right now. Nothing was saved." };
      return { fieldErrors: [], message: "Couldn't save. Try again." };
  }
}

export const saleRestoreError = (error: unknown): RestoreOutcome => mapDocumentRestoreError(error, "SALE", "sale");

export function saleLoadError(error: unknown, what = "this sale"): string {
  const { domainCode } = readDomainError(error);
  if (domainCode === "SALE_NOT_FOUND" || domainCode === "NOT_FOUND") return "Sale not found.";
  if (domainCode === "PERMISSION_DENIED") return "You don't have permission to view sales.";
  if (isCallerLicenseCode(domainCode)) return "Your license doesn't allow opening sales right now.";
  if (domainCode === "UNAUTHORIZED") return "Your session has ended. Sign in again.";
  if (domainCode === "MASTER_UNAVAILABLE") return "Stock data can't be reached right now. Try again.";
  if (domainCode === "SERVICE_UNAVAILABLE" || domainCode === "NETWORK_ERROR") return "The inventory service can't be reached. Try again.";
  return `Couldn't load ${what}. Try again.`;
}
