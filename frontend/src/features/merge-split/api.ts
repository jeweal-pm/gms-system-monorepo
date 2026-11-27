"use client";

import { useInfiniteQuery, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { INVENTORY_QUERY_KEY } from "@/features/inventory/query-keys";
import { PHOTO_MAX_BYTES, PHOTO_TYPES } from "@/features/quotation/api";
import { inventoryRequest, inventoryUrl, isInventoryApiError, type InventoryClientDeps } from "@/lib/inventory-client";
import { isCallerLicenseCode, readDomainError, retryTransient } from "@/lib/trpc-error";
import type { MergeSplitInput, MsFormValues } from "./form";
import {
  msActionResultSchema,
  msFileIdsSchema,
  msListPageSchema,
  msNextNumberSchema,
  msOptionsSchema,
  msOutSchema,
  msPhotoIdSchema,
  msWriteResultSchema,
  ownStockPageSchema,
  type MsStatus,
} from "./types";

export * from "./form";

/**
 * merge-split FE-MS-003 / FE-MS-006 (SA rev 1 api-contract, ADR-0060): the Merge/Split calls on the inventory REST
 * client and their TanStack Query hooks. Components use only this module. No mock data in the app.
 */

export const MERGE_SPLIT_HREF = "/inventory/merge-split";
export const mergeSplitHref = (id: string) => `${MERGE_SPLIT_HREF}/${encodeURIComponent(id)}`;
export const STOCK_PAGE_SIZE = 50;
export const DAYBOOK_PAGE_SIZE = 50;
/** Exclude list bound (contract: ≤ 200 stockUuid). */
export const EXCLUDE_MAX = 200;

const KEY = [...INVENTORY_QUERY_KEY, "merge-split"] as const;
export const mergeSplitKeys = {
  all: KEY,
  options: () => [...KEY, "options"] as const,
  nextNumber: (docDate: string) => [...KEY, "next-number", docDate] as const,
  stock: (input: StockInput) => [...KEY, "stock", input] as const,
  list: () => [...KEY, "list"] as const,
  get: (id: string) => [...KEY, "get", id] as const,
};

export type StockInput = { q?: string; location?: string; exclude?: readonly string[]; excludeDocId?: string };

const base = "/merge-split";
const path = (id: string) => `${base}/${encodeURIComponent(id)}`;

/** `GET /merge-split/stock` query (empty keys left out). */
export function stockQuery(input: StockInput, cursor?: string | null) {
  const exclude = [...new Set(input.exclude ?? [])].slice(0, EXCLUDE_MAX);
  return {
    q: input.q?.trim() ? input.q.trim().slice(0, 100) : undefined,
    location: input.location || undefined,
    exclude: exclude.length ? exclude.join(",") : undefined,
    excludeDocId: input.excludeDocId || undefined,
    cursor: cursor || undefined,
    limit: STOCK_PAGE_SIZE,
  };
}

export function mergeSplitCalls(deps: InventoryClientDeps = {}) {
  return {
    options: () => inventoryRequest(`${base}/options`, { schema: msOptionsSchema }, deps),
    nextNumber: (docDate: string) => inventoryRequest(`${base}/next-number`, { query: { docDate }, schema: msNextNumberSchema }, deps),
    list: (input: { status?: MsStatus; q?: string; cursor?: string | null } = {}) =>
      inventoryRequest(base, { query: { status: input.status, deleted: false, q: input.q, cursor: input.cursor, limit: DAYBOOK_PAGE_SIZE }, schema: msListPageSchema }, deps),
    get: (id: string) => inventoryRequest(path(id), { schema: msOutSchema }, deps),
    stock: (input: StockInput, cursor?: string | null) => inventoryRequest(`${base}/stock`, { query: stockQuery(input, cursor), schema: ownStockPageSchema }, deps),
    stockPhotos: (stockUuid: string) => inventoryRequest(`${base}/stock/${encodeURIComponent(stockUuid)}/photos`, { schema: msFileIdsSchema }, deps),
    uploadPhoto: (file: File) => {
      const form = new FormData();
      form.set("file", file);
      return inventoryRequest(`${base}/photos`, { method: "POST", form, schema: msPhotoIdSchema }, deps);
    },
    create: (input: MergeSplitInput) => inventoryRequest(base, { method: "POST", body: input, schema: msWriteResultSchema }, deps),
    update: (id: string, input: MergeSplitInput & { expectedVersion: number }) => inventoryRequest(path(id), { method: "PUT", body: input, schema: msWriteResultSchema }, deps),
    submit: (id: string, expectedVersion: number) => inventoryRequest(`${path(id)}/submit`, { method: "POST", body: { expectedVersion }, schema: msActionResultSchema }, deps),
    approve: (id: string, expectedVersion: number) => inventoryRequest(`${path(id)}/approve`, { method: "POST", body: { expectedVersion }, schema: msActionResultSchema }, deps),
    requestRevision: (id: string, expectedVersion: number, note: string) =>
      inventoryRequest(`${path(id)}/request-revision`, { method: "POST", body: { expectedVersion, note }, schema: msActionResultSchema }, deps),
    reject: (id: string, expectedVersion: number, reason: string) => inventoryRequest(`${path(id)}/reject`, { method: "POST", body: { expectedVersion, reason }, schema: msActionResultSchema }, deps),
    remove: (id: string, expectedVersion: number) => inventoryRequest(`${path(id)}/delete`, { method: "POST", body: { expectedVersion }, schema: msActionResultSchema }, deps),
    restore: (id: string, expectedVersion: number) => inventoryRequest(`${path(id)}/restore`, { method: "POST", body: { expectedVersion }, schema: msActionResultSchema }, deps),
  };
}

export const mergeSplitApi = mergeSplitCalls();

/** Photo read link (`GET /merge-split/photos/{fileId}`, same origin, cookie auth). */
export const mergeSplitPhotoUrl = (id: string) => inventoryUrl(`${base}/photos/${encodeURIComponent(id)}`);

export class MsPhotoUploadError extends Error {}

/** One JPEG/PNG ≤ 5 MiB, multipart `file`; returns its file id. */
export async function uploadMergeSplitPhoto(file: File, calls: Pick<ReturnType<typeof mergeSplitCalls>, "uploadPhoto"> = mergeSplitApi): Promise<string> {
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) throw new MsPhotoUploadError("Use a JPEG or PNG photo.");
  if (file.size > PHOTO_MAX_BYTES) throw new MsPhotoUploadError("Photos can be up to 5 MB.");
  try {
    return (await calls.uploadPhoto(file)).fileId;
  } catch (error) {
    const code = isInventoryApiError(error) ? error.code : null;
    if (code === "PAYLOAD_TOO_LARGE" || code === "UNSUPPORTED_MEDIA_TYPE") throw new MsPhotoUploadError("This file isn't a supported photo (JPEG or PNG, up to 5 MB).");
    if (code === "FORBIDDEN" || code === "PERMISSION_DENIED") throw new MsPhotoUploadError("You don't have permission to add photos.");
    throw new MsPhotoUploadError("Couldn't upload the photo. Try again.");
  }
}

/** Relinks the photos of picked stocks, ≤ 3 at a time; a stock whose read fails starts without photos (Q-MS-11). */
export async function relinkStockPhotos(stockUuids: readonly string[], read: (stockUuid: string) => Promise<{ fileIds: string[] }>, limit = 3) {
  const photos = new Map<string, string[]>();
  let failed = 0;
  for (let start = 0; start < stockUuids.length; start += limit) {
    const batch = stockUuids.slice(start, start + limit);
    const settled = await Promise.allSettled(batch.map((id) => read(id)));
    settled.forEach((outcome, offset) => {
      if (outcome.status === "fulfilled") photos.set(batch[offset]!, outcome.value.fileIds);
      else failed += 1;
    });
  }
  return { photos, failed };
}

// ---------- hooks ----------

export function useMergeSplitOptions(enabled = true) {
  return useQuery({ queryKey: mergeSplitKeys.options(), queryFn: () => mergeSplitApi.options(), staleTime: 5 * 60_000, retry: retryTransient, enabled });
}

export function useMergeSplitNumber(docDate: string, enabled: boolean) {
  return useQuery({ queryKey: mergeSplitKeys.nextNumber(docDate), queryFn: () => mergeSplitApi.nextNumber(docDate), staleTime: 10_000, retry: retryTransient, enabled: enabled && Boolean(docDate) });
}

/** P-01: own stock with available on hand, 50 a page. */
export function useOwnStock(input: StockInput, enabled = true) {
  return useInfiniteQuery({
    queryKey: mergeSplitKeys.stock(input),
    queryFn: ({ pageParam }) => mergeSplitApi.stock(input, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 10_000,
    retry: retryTransient,
    enabled,
  });
}

export function useMergeSplitDaybook() {
  return useInfiniteQuery({
    queryKey: mergeSplitKeys.list(),
    queryFn: ({ pageParam }) => mergeSplitApi.list({ cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 15_000,
    retry: retryTransient,
  });
}

export function useMergeSplitDetail(id: string | null) {
  return useQuery({ queryKey: mergeSplitKeys.get(id ?? ""), queryFn: () => mergeSplitApi.get(id ?? ""), enabled: id !== null, retry: retryTransient, staleTime: 0 });
}

/** After a write: the document, list, picker, number preview, Approve views and the stock reports it moves. */
export function invalidateMergeSplit(queryClient: QueryClient) {
  return Promise.all(
    [mergeSplitKeys.all, [...INVENTORY_QUERY_KEY, "approval"], [...INVENTORY_QUERY_KEY, "approval-settings"], [...INVENTORY_QUERY_KEY, "stock-card"], [...INVENTORY_QUERY_KEY, "stock-value"]].map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );
}

export function useMergeSplitWrites() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = useCallback(<T,>(call: () => Promise<T>) => {
    setBusy(true);
    return call().finally(() => setBusy(false));
  }, []);
  return {
    busy,
    create: (input: MergeSplitInput) => run(() => mergeSplitApi.create(input)),
    update: (id: string, input: MergeSplitInput & { expectedVersion: number }) => run(() => mergeSplitApi.update(id, input)),
    submit: (args: { id: string; expectedVersion: number }) => run(() => mergeSplitApi.submit(args.id, args.expectedVersion)),
    remove: (args: { id: string; expectedVersion: number }) => run(() => mergeSplitApi.remove(args.id, args.expectedVersion)),
    restore: (args: { id: string; expectedVersion: number }) => run(() => mergeSplitApi.restore(args.id, args.expectedVersion)),
    invalidate: () => invalidateMergeSplit(queryClient),
  };
}

// ---------- errors (backend error-handling) ----------

export type MsSaveOutcome = {
  fieldErrors: { name: string; message: string }[];
  message: string;
  /** Reload the document (it changed on the server). */
  refetch?: boolean;
  /** The picker's available changed. */
  refetchPicker?: boolean;
};

const ROW_PATH = /^results\.(\d+)\.?(.*)$/;
const FIELD_MESSAGES: Record<string, string> = { required: "Required", too_small: "Too small", too_big: "Too large", invalid: "Check this value", duplicate: "Used twice" };
const FIELD_LABEL: Record<string, string> = { location: "Location", stockPrice: "Stock Price", salePrice: "Sale Price", pcs: "Pcs", weightCt: "Weight", lot: "Lot", itemNote: "Note", photoIds: "Photos" };

const arrayOf = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const textOf = (value: unknown) => (typeof value === "string" || typeof value === "number" ? String(value) : "?");

/** A refused Save / Send / Delete / Restore → field errors and one toast ("Row n: …" for row problems); edits are kept. */
export function mapMergeSplitError(error: unknown, values?: Pick<MsFormValues, "sources" | "rows" | "mode">): MsSaveOutcome {
  const { domainCode, fieldErrors } = readDomainError(error);
  const details = isInventoryApiError(error) ? error.details : null;
  const rowOfSource = (match: { sourceId?: unknown; stockId?: unknown }) => {
    if (!values) return -1;
    const source = values.sources.find((candidate) => candidate.stockId === match.stockId);
    if (!source) return -1;
    return values.mode === "MERGE" ? 0 : values.rows.findIndex((row) => row.sourceKey === source.key);
  };
  switch (domainCode) {
    case "VERSION_CONFLICT":
      return { fieldErrors: [], message: "Someone else changed this Merge/Split. Refresh to see the latest.", refetch: false };
    case "MERGE_SPLIT_NOT_FOUND":
      return { fieldErrors: [], message: "This Merge/Split no longer exists." };
    case "MERGE_SPLIT_STATUS":
      return { fieldErrors: [], message: "This Merge/Split can't be changed in its current status.", refetch: true };
    case "MERGE_SPLIT_IN_USE":
      return { fieldErrors: [], message: "A new stock is already used — cannot edit or delete.", refetch: true };
    case "MERGE_SPLIT_BUSY":
      return { fieldErrors: [], message: "A picked stock is still being saved. Try again in a few seconds." };
    case "MERGE_SPLIT_STOCK_CHANGED": {
      const changed = arrayOf<{ sourceId?: unknown; stockId?: unknown; availPcs?: unknown; availWeightCt?: unknown }>(details?.sources);
      const entries = changed.map((item) => ({ index: rowOfSource(item), text: `${textOf(item.stockId)} changed, available now ${textOf(item.availPcs)} pcs · ${textOf(item.availWeightCt)} ct` }));
      const rows = entries.filter((entry) => entry.index >= 0).sort((a, b) => a.index - b.index);
      const first = rows[0] ?? entries[0];
      return {
        fieldErrors: rows.map((entry) => ({ name: `rows.${entry.index}.pcs`, message: entry.text })),
        message: first ? (first.index >= 0 ? `Row ${first.index + 1}: ${first.text}` : first.text) : "A picked stock changed. Remove it and pick it again.",
        refetchPicker: true,
      };
    }
    case "MERGE_SPLIT_SOURCE_PENDING": {
      const docs = arrayOf<string>(details?.docNos).filter((value) => typeof value === "string");
      return { fieldErrors: [], message: `A picked stock is on another pending Merge/Split${docs.length ? ` (${docs.join(", ")})` : ""}. Remove it and pick again.`, refetchPicker: true };
    }
    case "MERGE_SPLIT_SOURCE_UNAVAILABLE":
      return { fieldErrors: [], message: "A picked stock can no longer be converted. Remove it and pick again.", refetchPicker: true };
    case "MERGE_SPLIT_CURRENCY_MIXED":
      return { fieldErrors: [], message: "Stocks in different currencies can't be merged." };
    case "LOCATION_INVALID":
    case "MASTER_DATA_INVALID": {
      const rows = fieldErrors.map((entry) => ROW_PATH.exec(entry.path)).filter((match): match is RegExpExecArray => match !== null);
      const what = domainCode === "LOCATION_INVALID" ? "the location is no longer active" : "a stone detail is no longer active";
      return {
        fieldErrors: rows.map((match) => ({ name: `rows.${match[1]}.${match[2] || "location"}`, message: "Choose another value" })),
        message: rows[0] ? `Row ${Number(rows[0][1]) + 1}: ${what}.` : `Some rows can't be saved: ${what}.`,
      };
    }
    case "NUMBERING_NOT_CONFIGURED":
      return { fieldErrors: [], message: "Set up the Merge/Split document number in Document Setup first." };
    case "STOCK_ID_ISSUE_CONFLICT":
    case "MEMO_RECEIVE_STOCK_ID_EXHAUSTED":
      return { fieldErrors: [], message: "New Stock IDs couldn't be issued. Contact your administrator." };
    case "PAYLOAD_TOO_LARGE":
      return { fieldErrors: [], message: "This document is too large. Remove some rows and save again." };
    case "VALIDATION_FAILED":
    case "VALIDATION_ERROR": {
      const mapped = fieldErrors.map((entry) => {
        const match = ROW_PATH.exec(entry.path);
        return { name: match ? `rows.${match[1]}.${match[2]}` : entry.path, message: FIELD_MESSAGES[entry.code] ?? "Check this value", match, code: entry.code };
      });
      const row = mapped.find((entry) => entry.match);
      if (row?.match) {
        const label = FIELD_LABEL[row.match[2] ?? ""];
        return { fieldErrors: mapped, message: `Row ${Number(row.match[1]) + 1}: ${label ? `${label} — ` : ""}${(FIELD_MESSAGES[row.code] ?? "check this value").toLowerCase()}` };
      }
      return { fieldErrors: mapped, message: "Some details couldn't be saved. Check the form and try again." };
    }
    case "MASTER_UNAVAILABLE":
      return { fieldErrors: [], message: "Master data can't be reached right now. Try again in a moment." };
    case "SERVICE_UNAVAILABLE":
    case "NETWORK_ERROR":
    case "INTERNAL_ERROR":
      return { fieldErrors: [], message: "The inventory service can't be reached. Try again in a moment." };
    case "FORBIDDEN":
    case "PERMISSION_DENIED":
      return { fieldErrors: [], message: "You don't have permission. Nothing was saved." };
    case "CSRF_INVALID":
      return { fieldErrors: [], message: "Your session needs a refresh. Reload the page and try again." };
    case "UNAUTHORIZED":
      return { fieldErrors: [], message: "Your session has ended. Sign in again." };
    default:
      if (isCallerLicenseCode(domainCode)) return { fieldErrors: [], message: "Your license doesn't allow this right now. Nothing was saved." };
      return { fieldErrors: [], message: "Couldn't save. Try again." };
  }
}

export const MS_DENIED = "You don't have permission to view Merge/Split.";
export const MS_NOT_FOUND = "Merge/Split not found.";

/** Page / picker read errors. */
export function mergeSplitLoadError(error: unknown, what = "this Merge/Split"): string {
  const { domainCode } = readDomainError(error);
  if (domainCode === "MERGE_SPLIT_NOT_FOUND" || domainCode === "NOT_FOUND") return MS_NOT_FOUND;
  if (domainCode === "FORBIDDEN" || domainCode === "PERMISSION_DENIED") return MS_DENIED;
  if (domainCode === "UNAUTHORIZED") return "Your session has ended. Sign in again.";
  if (domainCode === "SERVICE_UNAVAILABLE" || domainCode === "NETWORK_ERROR") return "The inventory service can't be reached. Try again.";
  return `Couldn't load ${what}. Try again.`;
}
