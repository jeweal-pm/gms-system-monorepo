"use client";

import { useInfiniteQuery, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { PHOTO_MAX_BYTES, PHOTO_TYPES } from "@/features/quotation/api";
import { INVENTORY_QUERY_KEY } from "@/features/inventory/query-keys";
import { inventoryRequest, inventoryUrl, isInventoryApiError, type InventoryClientDeps } from "@/lib/inventory-client";
import { isCallerLicenseCode, readDomainError, retryTransient } from "@/lib/trpc-error";
import type { LoadFormValues, LoadInput } from "./form";
import {
  deleteResultSchema,
  listPageSchema,
  loadOutSchema,
  nextNumberSchema,
  optionsSchema,
  photoIdSchema,
  photoIdsSchema,
  reviewResultSchema,
  searchOutputSchema,
  submitResultSchema,
  vendorsPageSchema,
  writeResultSchema,
  type LoadOut,
  type LoadStatus,
} from "./types";

export * from "./form";

/**
 * load-to-stock FE-LS-010 / FE-LS-016 (SA rev 1 api-contract, ADR-0052): the Load to Stock calls on the inventory REST
 * client and their TanStack Query hooks. Components use only this module. No mock data: until the service runs, every
 * hook shows its loading / error state.
 */

export const LOAD_TO_STOCK_HREF = "/inventory/load-to-stock";
export const loadToStockHref = (id: string) => `${LOAD_TO_STOCK_HREF}/${encodeURIComponent(id)}`;
export const PICKER_PAGE_SIZE = 50;
export const DAYBOOK_PAGE_SIZE = 50;

const KEY = [...INVENTORY_QUERY_KEY, "load-to-stock"] as const;
export const loadKeys = {
  all: KEY,
  options: () => [...KEY, "options"] as const,
  vendors: (q: string) => [...KEY, "vendors", q] as const,
  nextNumber: (docDate: string) => [...KEY, "next-number", docDate] as const,
  search: (input: SearchInput) => [...KEY, "search", input] as const,
  list: () => [...KEY, "list"] as const,
  get: (id: string) => [...KEY, "get", id] as const,
};

export type SearchInput = {
  vendorId?: string;
  q?: string;
  from?: string;
  to?: string;
  excludeLineIds?: string[];
  excludeAllocationOf?: string;
};

const path = (id: string) => `/load-to-stock/${encodeURIComponent(id)}`;

/** The raw calls (one per contract route). `deps` lets the tests use a controlled fetch. */
export function loadToStockCalls(deps: InventoryClientDeps = {}) {
  return {
    options: () => inventoryRequest("/load-to-stock/options", { schema: optionsSchema }, deps),
    vendors: (q: string, cursor?: string | null) => inventoryRequest("/load-to-stock/vendors", { query: { q, cursor, limit: 50 }, schema: vendorsPageSchema }, deps),
    nextNumber: (docDate: string) => inventoryRequest("/load-to-stock/next-number", { query: { docDate }, schema: nextNumberSchema }, deps),
    search: (input: SearchInput, cursor?: string | null) =>
      inventoryRequest(
        "/load-to-stock/purchase-lines/search",
        { method: "POST", body: searchBody(input, cursor), schema: searchOutputSchema },
        deps,
      ),
    list: (input: { status?: LoadStatus; deleted?: boolean; q?: string; cursor?: string | null; limit?: number }) =>
      inventoryRequest("/load-to-stock", { query: { status: input.status, deleted: input.deleted ?? false, q: input.q, cursor: input.cursor, limit: input.limit ?? DAYBOOK_PAGE_SIZE }, schema: listPageSchema }, deps),
    get: (id: string) => inventoryRequest(path(id), { schema: loadOutSchema }, deps),
    create: (input: LoadInput) => inventoryRequest("/load-to-stock", { method: "POST", body: input, schema: writeResultSchema }, deps),
    update: (id: string, input: LoadInput & { expectedVersion: number }) => inventoryRequest(path(id), { method: "PUT", body: input, schema: writeResultSchema }, deps),
    submit: (id: string, expectedVersion: number) => inventoryRequest(`${path(id)}/submit`, { method: "POST", body: { expectedVersion }, schema: submitResultSchema }, deps),
    approve: (id: string, expectedVersion: number) => inventoryRequest(`${path(id)}/approve`, { method: "POST", body: { expectedVersion }, schema: reviewResultSchema }, deps),
    requestRevision: (id: string, expectedVersion: number, note: string) =>
      inventoryRequest(`${path(id)}/request-revision`, { method: "POST", body: { expectedVersion, note }, schema: reviewResultSchema }, deps),
    reject: (id: string, expectedVersion: number, reason: string) => inventoryRequest(`${path(id)}/reject`, { method: "POST", body: { expectedVersion, reason }, schema: reviewResultSchema }, deps),
    remove: (id: string, expectedVersion: number) => inventoryRequest(`${path(id)}/delete`, { method: "POST", body: { expectedVersion }, schema: deleteResultSchema }, deps),
    photosFromPurchaseLine: (purchaseLineId: string) =>
      inventoryRequest("/load-to-stock/photos/from-purchase-line", { method: "POST", body: { purchaseLineId }, schema: photoIdsSchema }, deps),
    uploadPhoto: (file: File) => {
      const form = new FormData();
      form.set("file", file);
      return inventoryRequest("/load-to-stock/photos", { method: "POST", form, schema: photoIdSchema }, deps);
    },
  };
}

export const loadToStockApi = loadToStockCalls();

/** Strict body (unknown/empty keys left out): the contract refuses unknown keys. */
export function searchBody(input: SearchInput, cursor?: string | null) {
  return {
    ...(input.vendorId ? { vendorId: input.vendorId } : {}),
    ...(input.q?.trim() ? { q: input.q.trim().slice(0, 100) } : {}),
    ...(input.from ? { from: input.from } : {}),
    ...(input.to ? { to: input.to } : {}),
    ...(input.excludeLineIds?.length ? { excludeLineIds: [...new Set(input.excludeLineIds)].slice(0, 200) } : {}),
    ...(input.excludeAllocationOf ? { excludeAllocationOf: input.excludeAllocationOf } : {}),
    ...(cursor ? { cursor } : {}),
    limit: PICKER_PAGE_SIZE,
  };
}

/** Photo read link (`GET /load-to-stock/photos/{id}`, same origin, cookie auth). */
export const loadPhotoUrl = (id: string) => inventoryUrl(`/load-to-stock/photos/${encodeURIComponent(id)}`);

export class PhotoUploadError extends Error {}

/** One JPEG/PNG ≤ 5 MiB (ADR-0048 rules), multipart `file`; returns its photo id. */
export async function uploadLoadPhoto(file: File, calls = loadToStockApi): Promise<string> {
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) throw new PhotoUploadError("Use a JPEG or PNG photo.");
  if (file.size > PHOTO_MAX_BYTES) throw new PhotoUploadError("Photos can be up to 5 MB.");
  try {
    return (await calls.uploadPhoto(file)).id;
  } catch (error) {
    const code = isInventoryApiError(error) ? error.code : null;
    if (code === "PHOTO_TOO_LARGE" || code === "PHOTO_TYPE_INVALID") throw new PhotoUploadError("This file isn't a supported photo (JPEG or PNG, up to 5 MB).");
    if (code === "RATE_LIMITED") throw new PhotoUploadError("The server is busy. Wait a moment and add the photo again.");
    if (code === "PERMISSION_DENIED") throw new PhotoUploadError("You don't have permission to add photos.");
    if (code === "UNAUTHENTICATED") throw new PhotoUploadError("Your session has ended. Sign in again, then add the photo.");
    throw new PhotoUploadError("Couldn't upload the photo. Try again.");
  }
}

// ---------- hooks ----------

export function useLoadOptions(enabled = true) {
  return useQuery({ queryKey: loadKeys.options(), queryFn: () => loadToStockApi.options(), staleTime: 5 * 60_000, retry: retryTransient, enabled });
}

export function useLoadVendors(q: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: loadKeys.vendors(q),
    queryFn: ({ pageParam }) => loadToStockApi.vendors(q, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 60_000,
    retry: retryTransient,
    enabled,
  });
}

/** H-01: number preview of a new document (not reserved), 10 s fresh. */
export function useNextNumber(docDate: string, enabled: boolean) {
  return useQuery({ queryKey: loadKeys.nextNumber(docDate), queryFn: () => loadToStockApi.nextNumber(docDate), staleTime: 10_000, retry: retryTransient, enabled: enabled && Boolean(docDate) });
}

/** P-01: loadable PU lines, 50 a page with Load more. */
export function usePurchaseLineSearch(input: SearchInput, enabled = true) {
  return useInfiniteQuery({
    queryKey: loadKeys.search(input),
    queryFn: ({ pageParam }) => loadToStockApi.search(input, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 10_000,
    retry: retryTransient,
    enabled,
  });
}

/** R-01 Daybook: saved loads newest first, deleted ones left out. */
export function useLoadDaybook() {
  return useInfiniteQuery({
    queryKey: loadKeys.list(),
    queryFn: ({ pageParam }) => loadToStockApi.list({ cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 15_000,
    retry: retryTransient,
  });
}

export function useLoadDetail(id: string | null) {
  return useQuery({ queryKey: loadKeys.get(id ?? ""), queryFn: () => loadToStockApi.get(id ?? ""), enabled: id !== null, retry: retryTransient, staleTime: 0 });
}

/** After a write: the document, its list, the picker (remaining changed), the number preview and the Approve views. */
export function invalidateLoadToStock(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: loadKeys.all }),
    queryClient.invalidateQueries({ queryKey: [...INVENTORY_QUERY_KEY, "approval"] }),
    queryClient.invalidateQueries({ queryKey: [...INVENTORY_QUERY_KEY, "approval-settings"] }),
  ]);
}

/** Save / Send / Delete with one busy flag (prevents a double submit). */
export function useLoadWrites() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = useCallback(<T,>(call: () => Promise<T>) => {
    setBusy(true);
    return call().finally(() => setBusy(false));
  }, []);
  return {
    busy,
    create: (input: LoadInput) => run(() => loadToStockApi.create(input)),
    update: (id: string, input: LoadInput & { expectedVersion: number }) => run(() => loadToStockApi.update(id, input)),
    submit: (args: { id: string; expectedVersion: number }) => run(() => loadToStockApi.submit(args.id, args.expectedVersion)),
    remove: (args: { id: string; expectedVersion: number }) => run(() => loadToStockApi.remove(args.id, args.expectedVersion)),
    invalidate: () => invalidateLoadToStock(queryClient),
  };
}

// ---------- errors (backend error-handling, frontend error-handling) ----------

export type LoadSaveOutcome = {
  fieldErrors: { name: string; message: string }[];
  message: string;
  /** Reload the document (it changed state on the server). */
  refetch?: boolean;
  /** The picker's remaining changed. */
  refetchPicker?: boolean;
  /** SYNC_PENDING on a new document: its id, to open it (read-only while syncing). */
  pendingId?: string;
};

export const NO_COMPANY_CURRENCY = "The company currency isn't set. Set it in Setup › Company Profile, then save again.";

const rowIndexOf = (rowPath: unknown): number | null => {
  const match = typeof rowPath === "string" ? /^rows\.(\d+)/.exec(rowPath) : null;
  return match ? Number(match[1]) : null;
};

const FIELD_MESSAGES: Record<string, string> = {
  required: "Required",
  too_small: "Too small",
  too_big: "Too large",
  invalid: "Check this value",
  duplicate: "Used twice",
  mode_shape: "Doesn't match the document's mode",
  vendor_mismatch: "Belongs to another vendor",
  unknown_row: "This row no longer exists",
  merge_qty_locked: "Merged quantities come from the PU lines",
};

const ROW_FIELD_LABEL: Record<string, string> = {
  location: "Location",
  stockPrice: "Stock Price",
  salePrice: "Sale Price",
  pcs: "Pcs",
  weightCt: "Weight",
  parcel: "Parcel",
  itemNote: "Note",
  photoIds: "Photos",
};

function weightText(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "?";
}

/** A refused Save / Send / Delete → field errors and one toast ("Row n: …" for row problems). */
export function mapLoadSaveError(error: unknown, values?: Pick<LoadFormValues, "sources">): LoadSaveOutcome {
  const docNoOf = (purchaseLineId: unknown) => values?.sources.find((ref) => ref.purchaseLineId === purchaseLineId)?.purchase.docNo ?? "the PU";
  const { domainCode, fieldErrors } = readDomainError(error);
  const details = isInventoryApiError(error) ? error.details : null;
  switch (domainCode) {
    case "LOAD_TO_STOCK_CHANGED":
      return { fieldErrors: [], message: "Someone else changed this Load to Stock. Refresh to see the latest." };
    case "LOAD_TO_STOCK_NOT_FOUND":
      return { fieldErrors: [], message: "This Load to Stock no longer exists." };
    case "LOAD_TO_STOCK_IN_USE":
      return { fieldErrors: [], message: "Some stock from this load is already used; it can't be changed.", refetch: true };
    case "LOAD_TO_STOCK_BUSY":
      return { fieldErrors: [], message: "Saving in progress — refreshing.", refetch: true };
    case "SYNC_PENDING": {
      // Backend: 503 with details.id; the load shows `syncing` until the change is re-driven to master.
      const id = typeof details?.id === "string" ? details.id : undefined;
      return { fieldErrors: [], message: "Saving in progress — refreshing.", refetch: true, ...(id ? { pendingId: id } : {}) };
    }
    case "LOAD_TO_STOCK_EXCEEDS_REMAINING": {
      const lines = Array.isArray(details?.lines) ? (details.lines as { purchaseLineId?: unknown; rowPaths?: unknown; remainingPcs?: unknown; remainingWeightCt?: unknown }[]) : [];
      const entries = lines.flatMap((line) => {
        const text = `only ${weightText(line.remainingPcs)} pcs / ${weightText(line.remainingWeightCt)} ct left on ${docNoOf(line.purchaseLineId)}`;
        const rows = (Array.isArray(line.rowPaths) ? line.rowPaths : []).map(rowIndexOf).filter((index): index is number => index !== null);
        return rows.map((index) => ({ index, text }));
      });
      entries.sort((a, b) => a.index - b.index);
      const first = entries[0];
      return {
        fieldErrors: entries.map(({ index, text }) => ({ name: `rows.${index}.pcs`, message: text.charAt(0).toUpperCase() + text.slice(1) })),
        message: first ? `Row ${first.index + 1}: ${first.text}` : "Some PU lines have less left to load. Reduce or remove those rows.",
        refetchPicker: true,
      };
    }
    case "LOAD_TO_STOCK_LINE_UNAVAILABLE": {
      const rows = (Array.isArray(details?.rowPaths) ? details.rowPaths : []).map(rowIndexOf).filter((index): index is number => index !== null).sort((a, b) => a - b);
      return {
        fieldErrors: [],
        message: rows.length ? `Row ${rows[0]! + 1}: this PU line can no longer be loaded. Remove the row.` : "A PU line can no longer be loaded. Remove its rows.",
        refetchPicker: true,
      };
    }
    case "LOCATION_INACTIVE": {
      const rows = (Array.isArray(details?.rowPaths) ? details.rowPaths : []).map(rowIndexOf).filter((index): index is number => index !== null).sort((a, b) => a - b);
      return {
        fieldErrors: rows.map((index) => ({ name: `rows.${index}.location`, message: "Choose another location" })),
        message: rows.length ? `Row ${rows[0]! + 1}: the location is no longer active. Choose another location.` : "A location is no longer active. Choose another location.",
      };
    }
    case "LOAD_TO_STOCK_PHOTO_INVALID":
      return { fieldErrors: [], message: "A photo couldn't be used. Remove it and add it again." };
    case "LOAD_TO_STOCK_STATUS_INVALID":
      return { fieldErrors: [], message: "This Load to Stock can't be changed in its current status.", refetch: true };
    case "VALIDATION_ERROR": {
      if (fieldErrors.some((entry) => entry.path === "currency")) {
        return { fieldErrors: [], message: NO_COMPANY_CURRENCY };
      }
      const mapped = fieldErrors.map((entry) => {
        const message = entry.code === "exceeds_remaining" ? "More than is left on the PU line" : (FIELD_MESSAGES[entry.code] ?? "Check this value");
        return { name: entry.path, message };
      });
      const row = fieldErrors.map((entry) => ({ entry, index: rowIndexOf(entry.path) })).find((item) => item.index !== null);
      if (row && row.index !== null) {
        const field = row.entry.path.split(".")[2] ?? "";
        const label = ROW_FIELD_LABEL[field];
        const text = row.entry.code === "exceeds_remaining" ? "more than is left on the PU line" : (FIELD_MESSAGES[row.entry.code] ?? "check this value").toLowerCase();
        return { fieldErrors: mapped, message: `Row ${row.index + 1}: ${label ? `${label} — ` : ""}${text}` };
      }
      return { fieldErrors: mapped, message: "Some details couldn't be saved. Check the form and try again." };
    }
    case "MASTER_UNAVAILABLE":
      return { fieldErrors: [], message: "Purchase data can't be reached right now. Try again in a moment." };
    case "SERVICE_UNAVAILABLE":
    case "NETWORK_ERROR":
    case "DB_UNAVAILABLE":
    case "AUTH_UNAVAILABLE":
      return { fieldErrors: [], message: "The inventory service can't be reached. Try again in a moment." };
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

/** Page / picker load errors. */
export function loadLoadError(error: unknown, what = "this Load to Stock"): string {
  const { domainCode } = readDomainError(error);
  if (domainCode === "LOAD_TO_STOCK_NOT_FOUND" || domainCode === "NOT_FOUND") return "Load to Stock not found.";
  if (domainCode === "PERMISSION_DENIED") return "You don't have permission to view Load to Stock.";
  if (isCallerLicenseCode(domainCode)) return "Your license doesn't allow opening Load to Stock right now.";
  if (domainCode === "UNAUTHORIZED") return "Your session has ended. Sign in again.";
  if (domainCode === "MASTER_UNAVAILABLE") return "Purchase data can't be reached right now. Try again.";
  if (domainCode === "SERVICE_UNAVAILABLE" || domainCode === "NETWORK_ERROR") return "The inventory service can't be reached. Try again.";
  return `Couldn't load ${what}. Try again.`;
}

export type { LoadOut };
