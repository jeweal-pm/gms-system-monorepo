"use client";

import { useInfiniteQuery, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { INVENTORY_QUERY_KEY } from "@/features/inventory/query-keys";
import type { DocFlow } from "@/features/trade-document/flow-status";
import { inventoryRequest, isInventoryApiError, type InventoryClientDeps } from "@/lib/inventory-client";
import { isCallerLicenseCode, readDomainError, retryTransient } from "@/lib/trpc-error";
import { STOCK_TRANSFER_HREF, stockTransferHref, type TransferFormValues, type TransferInput } from "./form";
import {
  createResultSchema,
  listPageSchema,
  nextNumberSchema,
  optionsSchema,
  stockLotPageSchema,
  transferOutSchema,
  writeResultSchema,
  type StockLot,
  type TransferOut,
  type TransferStatus,
} from "./types";

/**
 * stock-transfer-location FE-STL-004 (ADR-0060, SA rev 1 api-contract): the calls on the inventory REST client
 * (`/api/inventory/v1/stock-transfer-location*`), their TanStack Query hooks and the error mapping. Components use
 * only this module.
 */

export { STOCK_TRANSFER_HREF, stockTransferHref };
export type { TransferOut, StockLot };

export const PAGE_SIZE = 50;
export const EXCLUDE_MAX = 200;
const KEY = [...INVENTORY_QUERY_KEY, "stock-transfer-location"] as const;

export type StockFilter = { q: string; location?: string; exclude: readonly string[] };

export const transferKeys = {
  all: KEY,
  options: () => [...KEY, "options"] as const,
  nextNumber: (docDate: string) => [...KEY, "next-number", docDate] as const,
  list: () => [...KEY, "list"] as const,
  get: (id: string) => [...KEY, "get", id] as const,
  stock: (filter: StockFilter) => [...KEY, "stock", { q: filter.q.trim(), location: filter.location ?? "", exclude: [...filter.exclude] }] as const,
};

const path = (id: string) => `/stock-transfer-location/${encodeURIComponent(id)}`;
const versionBody = (expectedVersion: number) => ({ expectedVersion });

/** `exclude`: distinct stock UUIDs, ≤ 200, as a comma list (contract: "comma list or repeated"). */
export const excludeParam = (exclude: readonly string[]) => [...new Set(exclude.filter(Boolean))].slice(0, EXCLUDE_MAX).join(",");

/** The raw calls (one per contract route). `deps` lets the tests use a controlled fetch. */
export function stockTransferCalls(deps: InventoryClientDeps = {}) {
  return {
    options: () => inventoryRequest("/stock-transfer-location/options", { schema: optionsSchema }, deps),
    nextNumber: (docDate: string) => inventoryRequest("/stock-transfer-location/next-number", { query: { docDate }, schema: nextNumberSchema }, deps),
    list: (input: { status?: TransferStatus; q?: string; cursor?: string | null } = {}) =>
      inventoryRequest("/stock-transfer-location", { query: { status: input.status, deleted: false, q: input.q, cursor: input.cursor, limit: PAGE_SIZE }, schema: listPageSchema }, deps),
    get: (id: string) => inventoryRequest(path(id), { schema: transferOutSchema }, deps),
    stock: (filter: StockFilter, cursor?: string | null, limit = PAGE_SIZE) =>
      inventoryRequest(
        "/stock-transfer-location/stock",
        { query: { q: filter.q.trim().slice(0, 100), location: filter.location, exclude: excludeParam(filter.exclude), cursor, limit }, schema: stockLotPageSchema },
        deps,
      ),
    create: (input: TransferInput) => inventoryRequest("/stock-transfer-location", { method: "POST", body: input, schema: createResultSchema }, deps),
    update: (id: string, input: TransferInput & { expectedVersion: number }) => inventoryRequest(path(id), { method: "PUT", body: input, schema: writeResultSchema }, deps),
    submit: (id: string, expectedVersion: number) => inventoryRequest(`${path(id)}/submit`, { method: "POST", body: versionBody(expectedVersion), schema: writeResultSchema }, deps),
    approve: (id: string, expectedVersion: number) => inventoryRequest(`${path(id)}/approve`, { method: "POST", body: versionBody(expectedVersion), schema: writeResultSchema }, deps),
    requestRevision: (id: string, expectedVersion: number, note: string) =>
      inventoryRequest(`${path(id)}/request-revision`, { method: "POST", body: { expectedVersion, note }, schema: writeResultSchema }, deps),
    reject: (id: string, expectedVersion: number, reason: string) => inventoryRequest(`${path(id)}/reject`, { method: "POST", body: { expectedVersion, reason }, schema: writeResultSchema }, deps),
    remove: (id: string, expectedVersion: number) => inventoryRequest(`${path(id)}/delete`, { method: "POST", body: versionBody(expectedVersion), schema: writeResultSchema }, deps),
    restore: (id: string, expectedVersion: number) => inventoryRequest(`${path(id)}/restore`, { method: "POST", body: versionBody(expectedVersion), schema: writeResultSchema }, deps),
  };
}

export const stockTransferApi = stockTransferCalls();

// ---------- barcode ----------

export type ScanResult = { kind: "found"; lot: StockLot } | { kind: "none" } | { kind: "many"; count: number } | { kind: "picked" };

/**
 * Barcode scan: the same `/stock` lookup with `q = code`. Adds the lot only when exactly one lot matches the code
 * exactly (Stock ID, lot or stone code, any case); several or none → a toast.
 */
export async function lookupScan(code: string, exclude: readonly string[], calls: Pick<ReturnType<typeof stockTransferCalls>, "stock"> = stockTransferApi): Promise<ScanResult> {
  const needle = code.trim();
  if (!needle) return { kind: "none" };
  const page = await calls.stock({ q: needle, exclude: [] }, null, 10);
  const lower = needle.toLowerCase();
  const exact = page.items.filter((lot) => [lot.stockId, lot.attrs.lot, lot.attrs.stoneCode, lot.lotKey].some((value) => value && value.toLowerCase() === lower));
  const matches = exact.length > 0 ? exact : page.items;
  if (matches.length === 0) return { kind: "none" };
  if (matches.length > 1) return { kind: "many", count: matches.length };
  const lot = matches[0]!;
  return exclude.includes(lot.stockUuid) ? { kind: "picked" } : { kind: "found", lot };
}

export function scanMessage(code: string, result: ScanResult): string | null {
  switch (result.kind) {
    case "none":
      return `No stock found for ${code.trim()}`;
    case "many":
      return `${code.trim()} matches ${result.count} lots. Use From Stock to pick one.`;
    case "picked":
      return `${code.trim()} is already on this transfer`;
    default:
      return null;
  }
}

// ---------- server → page ----------

/** ADR-0050 `Flow`: the status rule decides Edit / Delete (D9 checks in-use on the server); Send needs the setting. */
export function transferFlow(detail: TransferOut): DocFlow {
  const review = detail.approval.review;
  return {
    status: detail.status,
    autoApproved: detail.autoApproved || detail.approval.autoApproved,
    revisionCount: detail.approval.revisionCount,
    canEdit: !detail.deleted,
    canDelete: !detail.deleted,
    canSubmit: detail.approval.requireApproval,
    usedBy: null,
    review: review ? { action: review.action, note: review.note, at: review.at, byName: review.byName } : null,
  };
}

// ---------- hooks ----------

export function useTransferOptions(enabled = true) {
  return useQuery({ queryKey: transferKeys.options(), queryFn: () => stockTransferApi.options(), staleTime: 5 * 60_000, retry: retryTransient, enabled });
}

/** Number preview of a new document (nothing reserved), 10 s fresh. */
export function useTransferNextNumber(docDate: string, enabled: boolean) {
  return useQuery({
    queryKey: transferKeys.nextNumber(docDate),
    queryFn: () => stockTransferApi.nextNumber(docDate),
    staleTime: 10_000,
    retry: retryTransient,
    enabled: enabled && /^\d{4}-\d{2}-\d{2}$/.test(docDate),
  });
}

export function useTransferDaybook() {
  return useInfiniteQuery({
    queryKey: transferKeys.list(),
    queryFn: ({ pageParam }) => stockTransferApi.list({ cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 15_000,
    retry: retryTransient,
  });
}

export function useTransferDetail(id: string | null) {
  return useQuery({ queryKey: transferKeys.get(id ?? ""), queryFn: () => stockTransferApi.get(id ?? ""), enabled: id !== null, retry: retryTransient, staleTime: 0 });
}

/** From Stock picker: own lots with on hand > 0, 50 a page, lots on the document excluded on the server. */
export function useTransferStock(filter: StockFilter, enabled = true) {
  return useInfiniteQuery({
    queryKey: transferKeys.stock(filter),
    queryFn: ({ pageParam }) => stockTransferApi.stock(filter, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 10_000,
    retry: retryTransient,
    enabled,
  });
}

/** Query keys refreshed after a write: the document, its list and picker, the Approve views, Stock Card and Stock Value. */
export const AFTER_WRITE_KEYS = [
  KEY,
  [...INVENTORY_QUERY_KEY, "approval"],
  [...INVENTORY_QUERY_KEY, "approval-settings"],
  [...INVENTORY_QUERY_KEY, "stock-card"],
  [...INVENTORY_QUERY_KEY, "stock-value"],
] as const;

export function invalidateTransfer(queryClient: QueryClient) {
  return Promise.all(AFTER_WRITE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

/** Save / Send / Delete / Restore with one busy flag (prevents a double submit). */
export function useTransferWrites() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = useCallback(<T,>(call: () => Promise<T>) => {
    setBusy(true);
    return call().finally(() => setBusy(false));
  }, []);
  return {
    busy,
    create: (input: TransferInput) => run(() => stockTransferApi.create(input)),
    update: (id: string, input: TransferInput & { expectedVersion: number }) => run(() => stockTransferApi.update(id, input)),
    submit: (args: { id: string; expectedVersion: number }) => run(() => stockTransferApi.submit(args.id, args.expectedVersion)),
    remove: (args: { id: string; expectedVersion: number }) => run(() => stockTransferApi.remove(args.id, args.expectedVersion)),
    restore: (args: { id: string; expectedVersion: number }) => run(() => stockTransferApi.restore(args.id, args.expectedVersion)),
    invalidate: () => invalidateTransfer(queryClient),
  };
}

// ---------- errors (contract "Errors") ----------

export type TransferSaveOutcome = {
  /** Row messages by row key (shown under the row). */
  rowErrors: { key: string; message: string }[];
  /** Header field errors. */
  fieldErrors: { name: "docDate" | "ref" | "note"; message: string }[];
  message: string;
  /** Reload the document (its state changed on the server). */
  refetch?: boolean;
  /** The picker's on-hand changed. */
  refetchStock?: boolean;
};

const amount = (value: unknown) => (typeof value === "string" || typeof value === "number" ? String(value) : "?");

/**
 * Server `lineId` → the form row: the saved line id, else the stock UUID (a new document's lines have no id yet;
 * the backend may report the source stock instead).
 */
function rowKeyOf(values: Pick<TransferFormValues, "rows"> | undefined, lineId: unknown): { key: string; index: number } | null {
  if (typeof lineId !== "string" || !values) return null;
  const index = values.rows.findIndex((row) => (row.id && row.id === lineId) || row.stockUuid === lineId);
  return index >= 0 ? { key: values.rows[index]!.key, index } : null;
}

const lineIndexOf = (path: string): number | null => {
  const match = /^lines\.(\d+)/.exec(path);
  return match ? Number(match[1]) : null;
};

function rowsOutcome(entries: ({ key: string; index: number; message: string } | null)[], fallback: string, extra: Partial<TransferSaveOutcome> = {}): TransferSaveOutcome {
  const rows = entries.filter((entry): entry is { key: string; index: number; message: string } => entry !== null).sort((a, b) => a.index - b.index);
  const first = rows[0];
  return { rowErrors: rows.map(({ key, message }) => ({ key, message })), fieldErrors: [], message: first ? `Row ${first.index + 1}: ${first.message}` : fallback, ...extra };
}

const HEADER_FIELDS = new Set(["docDate", "ref", "note"]);

/** A refused Save / Send / Delete / Restore → row errors, header errors and one toast; edits are kept. */
export function mapTransferSaveError(error: unknown, values?: Pick<TransferFormValues, "rows">): TransferSaveOutcome {
  const { domainCode } = readDomainError(error);
  const details = isInventoryApiError(error) ? error.details : null;
  const fieldErrors = isInventoryApiError(error) ? error.fieldErrors : [];
  const lineIds = Array.isArray(details?.lineIds) ? (details.lineIds as unknown[]) : [];
  const none: TransferSaveOutcome = { rowErrors: [], fieldErrors: [], message: "" };
  switch (domainCode) {
    case "STOCK_TRANSFER_EXCEEDS_ON_HAND": {
      const lines = Array.isArray(details?.lines) ? (details.lines as { lineId?: unknown; onHandPcs?: unknown; onHandWeightCt?: unknown }[]) : [];
      return rowsOutcome(
        lines.map((line) => {
          const row = rowKeyOf(values, line.lineId);
          return row ? { ...row, message: `Only ${amount(line.onHandPcs)} pcs / ${amount(line.onHandWeightCt)} ct on hand now` } : null;
        }),
        "Some lots have less on hand now. Lower the amounts and save again.",
        { refetchStock: true },
      );
    }
    case "STOCK_TRANSFER_LINE_UNAVAILABLE":
      return rowsOutcome(
        lineIds.map((lineId) => {
          const row = rowKeyOf(values, lineId);
          return row ? { ...row, message: "This lot can no longer be moved. Remove the row." } : null;
        }),
        "Some lots can no longer be moved. Remove those rows.",
        { refetchStock: true },
      );
    case "LOCATION_INVALID":
      return rowsOutcome(
        lineIds.map((lineId) => {
          const row = rowKeyOf(values, lineId);
          return row ? { ...row, message: "Choose another new location" } : null;
        }),
        "A new location is no longer valid. Choose another location.",
      );
    case "STOCK_TRANSFER_IN_USE": {
      const ids = Array.isArray(details?.stockIds) ? (details.stockIds as unknown[]).filter((id): id is string => typeof id === "string") : [];
      return { ...none, message: ids.length ? `Stock ${ids.slice(0, 5).join(", ")} from this transfer is already used; it can't be changed.` : "Stock from this transfer is already used; it can't be changed.", refetch: true };
    }
    case "VERSION_CONFLICT":
    case "STOCK_TRANSFER_CHANGED":
      return { ...none, message: "Someone else changed this transfer. Refresh to see the latest." };
    case "STOCK_TRANSFER_NOT_FOUND":
      return { ...none, message: "This transfer no longer exists." };
    case "STOCK_TRANSFER_STATUS":
    case "STOCK_TRANSFER_STATUS_INVALID":
      return { ...none, message: "This transfer can't be changed in its current status.", refetch: true };
    case "NUMBERING_NOT_CONFIGURED":
      return { ...none, message: "Numbering for Stock Transfer Location isn't set. Set it in Setup › Document Setup, then save again." };
    case "VALIDATION_FAILED":
    case "VALIDATION_ERROR": {
      const rows = fieldErrors.map((entry) => {
        const index = lineIndexOf(entry.path);
        const row = index !== null ? values?.rows[index] : undefined;
        if (index === null || !row) return null;
        const field = entry.path.split(".")[2] ?? "";
        const label = field === "toLocation" ? "New Location" : field === "pcs" ? "Pcs" : field === "weightCt" ? "Weight" : "";
        return { key: row.key, index, message: `${label ? `${label} — ` : ""}${entry.code === "required" ? "required" : "check this value"}` };
      });
      const header = fieldErrors.filter((entry) => HEADER_FIELDS.has(entry.path)).map((entry) => ({ name: entry.path as "docDate" | "ref" | "note", message: entry.code === "required" ? "Required" : "Check this field" }));
      const outcome = rowsOutcome(rows, "Some details couldn't be saved. Check the form and try again.");
      return { ...outcome, fieldErrors: header };
    }
    case "MASTER_UNAVAILABLE":
      return { ...none, message: "Stock numbering can't be reached right now. Nothing was saved. Try again in a moment." };
    case "SERVICE_UNAVAILABLE":
    case "NETWORK_ERROR":
    case "DB_UNAVAILABLE":
      return { ...none, message: "The inventory service can't be reached. Try again in a moment." };
    case "PAYLOAD_TOO_LARGE":
      return { ...none, message: "This transfer is too large to save. Remove some rows and try again." };
    case "PERMISSION_DENIED":
    case "FORBIDDEN":
      return { ...none, message: "You don't have permission to do this. Nothing was saved." };
    case "CSRF_INVALID":
      return { ...none, message: "Your session needs a refresh. Reload the page and try again." };
    case "UNAUTHORIZED":
      return { ...none, message: "Your session has ended. Sign in again." };
    default:
      if (isCallerLicenseCode(domainCode)) return { ...none, message: "Your license doesn't allow this right now. Nothing was saved." };
      return { ...none, message: "Couldn't save. Try again." };
  }
}

/** Page / picker load errors. */
export function transferLoadError(error: unknown, what = "this transfer"): string {
  const { domainCode } = readDomainError(error);
  if (domainCode === "STOCK_TRANSFER_NOT_FOUND" || domainCode === "NOT_FOUND") return "Stock Transfer Location not found.";
  if (domainCode === "PERMISSION_DENIED" || domainCode === "FORBIDDEN") return "You don't have permission to view Stock Transfer Location.";
  if (isCallerLicenseCode(domainCode)) return "Your license doesn't allow opening Stock Transfer Location right now.";
  if (domainCode === "UNAUTHORIZED") return "Your session has ended. Sign in again.";
  if (domainCode === "MASTER_UNAVAILABLE") return "Master data can't be reached right now. Try again.";
  if (domainCode === "SERVICE_UNAVAILABLE" || domainCode === "NETWORK_ERROR") return "The inventory service can't be reached. Try again.";
  return `Couldn't load ${what}. Try again.`;
}
