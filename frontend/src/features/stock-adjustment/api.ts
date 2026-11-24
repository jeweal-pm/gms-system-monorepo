import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { INVENTORY_QUERY_KEY } from "@/features/inventory/query-keys";
import { inventoryRequest, type InventoryClientDeps } from "@/lib/inventory-client";
import { retryTransient } from "@/lib/trpc-error";
import type { AdjustmentForm } from "./form";
import { toAdjustmentInput } from "./form";

const attrs = z.object({ stoneCode: z.string(), stone: z.string(), shape: z.string(), size: z.string(), color: z.string(), clarity: z.string(), cutting: z.string(), quality: z.string(), lot: z.string(), location: z.string(), cerType: z.string(), cerNo: z.string() });
const status = z.enum(["DRAFT", "PENDING_APPROVAL", "REVISION_REQUESTED", "APPROVED", "REJECTED"]);
export const adjustmentLineSchema = z.object({ id: z.string().uuid(), position: z.number(), stockUuid: z.string().uuid(), stockId: z.string(), lotKey: z.string(), refDocNo: z.string(), stockPcs: z.number(), stockWeightCt: z.string(), stockPrice: z.string(), physicalPcs: z.number(), physicalWeightCt: z.string(), physicalPrice: z.string().nullable(), remark: z.string(), priceUnit: z.enum(["PER_CT", "PER_PCS"]), diffPcs: z.number(), diffWeightCt: z.string(), diffPrice: z.string(), attrs });
const review = z.object({ action: z.enum(["REVISE", "REJECT"]), note: z.string(), at: z.string().nullable(), by: z.string().nullable(), byName: z.string().nullable() }).nullable();
export const adjustmentOutSchema = z.object({
  id: z.string().uuid(), docNo: z.string().nullable(), docDate: z.string(), location: z.string(), ref: z.string(), note: z.string(), status,
  autoApproved: z.boolean(), version: z.number().int(), deleted: z.object({ at: z.string(), by: z.string().nullable() }).nullable(), lines: z.array(adjustmentLineSchema),
  approval: z.object({ requireApproval: z.boolean(), autoApproved: z.boolean(), revisionCount: z.number(), submitted: z.unknown().nullable(), review }),
  flow: z.object({ canEdit: z.boolean(), canDelete: z.boolean(), canSubmit: z.boolean(), canRestore: z.boolean(), usedBy: z.unknown().nullable() }),
  updatedAt: z.string(), approvedAt: z.string().nullable(), approvedBy: z.string().nullable(),
});
export type AdjustmentOut = z.output<typeof adjustmentOutSchema>;
export const stockLotSchema = z.object({ stockUuid: z.string().uuid(), stockId: z.string(), lotKey: z.string(), refDocNo: z.string(), refDocDate: z.string(), priceUnit: z.enum(["PER_CT", "PER_PCS"]), onHandPcs: z.number().int(), onHandWeightCt: z.string(), stockPrice: z.string(), attrs });
export type StockLot = z.output<typeof stockLotSchema>;
const writeSchema = z.object({ id: z.string().uuid(), docNo: z.string().nullable(), version: z.number().int(), status });
const actionSchema = z.object({ id: z.string().uuid(), version: z.number().int(), status: status.optional() });
const listSchema = z.object({ items: z.array(z.object({ id: z.string().uuid(), docNo: z.string().nullable(), docDate: z.string(), location: z.string(), status, lineCount: z.number(), autoApproved: z.boolean(), deleted: z.boolean() })), nextCursor: z.string().nullable() });
const optionsSchema = z.object({ locations: z.array(z.string()), numbering: z.object({ configured: z.boolean() }) });
const numberSchema = z.object({ docNo: z.string() });
const stockPageSchema = z.object({ items: z.array(stockLotSchema), nextCursor: z.string().nullable() });

const KEY = [...INVENTORY_QUERY_KEY, "stock-adjustment"] as const;
export const adjustmentKeys = { all: KEY, options: [...KEY, "options"] as const, number: (date: string) => [...KEY, "number", date] as const, list: [...KEY, "list"] as const, detail: (id: string) => [...KEY, "detail", id] as const, stock: (location: string, q: string, exclude: string[]) => [...KEY, "stock", location, q, exclude] as const };
const base = "/stock-adjustment";
const url = (id: string) => `${base}/${encodeURIComponent(id)}`;

export function adjustmentCalls(deps: InventoryClientDeps = {}) {
  return {
    options: () => inventoryRequest(`${base}/options`, { schema: optionsSchema }, deps),
    nextNumber: (docDate: string) => inventoryRequest(`${base}/next-number`, { query: { docDate }, schema: numberSchema }, deps),
    list: (cursor?: string | null) => inventoryRequest(base, { query: { deleted: false, cursor, limit: 50 }, schema: listSchema }, deps),
    get: (id: string) => inventoryRequest(url(id), { schema: adjustmentOutSchema }, deps),
    stock: (location: string, q: string, exclude: string[], cursor?: string | null) => inventoryRequest(`${base}/stock`, { query: { location, q: q.trim() || undefined, exclude: exclude.join(",") || undefined, cursor, limit: 50 }, schema: stockPageSchema }, deps),
    create: (value: AdjustmentForm) => inventoryRequest(base, { method: "POST", body: toAdjustmentInput(value), schema: writeSchema }, deps),
    update: (id: string, version: number, value: AdjustmentForm) => inventoryRequest(url(id), { method: "PUT", body: { ...toAdjustmentInput(value), expectedVersion: version }, schema: writeSchema }, deps),
    submit: (id: string, version: number) => inventoryRequest(`${url(id)}/submit`, { method: "POST", body: { expectedVersion: version }, schema: actionSchema }, deps),
    remove: (id: string, version: number) => inventoryRequest(`${url(id)}/delete`, { method: "POST", body: { expectedVersion: version }, schema: actionSchema }, deps),
    restore: (id: string, version: number) => inventoryRequest(`${url(id)}/restore`, { method: "POST", body: { expectedVersion: version }, schema: actionSchema }, deps),
    approve: (id: string, version: number) => inventoryRequest(`${url(id)}/approve`, { method: "POST", body: { expectedVersion: version }, schema: actionSchema }, deps),
    requestRevision: (id: string, version: number, note: string) => inventoryRequest(`${url(id)}/request-revision`, { method: "POST", body: { expectedVersion: version, note }, schema: actionSchema }, deps),
    reject: (id: string, version: number, reason: string) => inventoryRequest(`${url(id)}/reject`, { method: "POST", body: { expectedVersion: version, reason }, schema: actionSchema }, deps),
  };
}
export const stockAdjustmentApi = adjustmentCalls();

export function useAdjustmentOptions() { return useQuery({ queryKey: adjustmentKeys.options, queryFn: stockAdjustmentApi.options, retry: retryTransient, staleTime: 60_000 }); }
export function useAdjustmentNumber(date: string, enabled: boolean) { return useQuery({ queryKey: adjustmentKeys.number(date), queryFn: () => stockAdjustmentApi.nextNumber(date), enabled, retry: retryTransient, staleTime: 60_000 }); }
export function useAdjustmentDetail(id: string | null) { return useQuery({ queryKey: id ? adjustmentKeys.detail(id) : [...KEY, "detail", "disabled"], queryFn: () => stockAdjustmentApi.get(id!), enabled: Boolean(id), retry: retryTransient }); }
export function useAdjustmentList() { return useInfiniteQuery({ queryKey: adjustmentKeys.list, queryFn: ({ pageParam }) => stockAdjustmentApi.list(pageParam), initialPageParam: null as string | null, getNextPageParam: (page) => page.nextCursor ?? undefined, retry: retryTransient }); }
export function useStockLots(location: string, q: string, exclude: string[], enabled: boolean) {
  return useInfiniteQuery({ queryKey: adjustmentKeys.stock(location, q, exclude), queryFn: ({ pageParam }) => stockAdjustmentApi.stock(location, q, exclude, pageParam), initialPageParam: null as string | null, getNextPageParam: (page) => page.nextCursor ?? undefined, enabled: enabled && Boolean(location), retry: retryTransient, staleTime: 10_000 });
}

export function useAdjustmentInvalidation() {
  const client = useQueryClient();
  return async (id?: string, effective = false) => {
    await Promise.all([
      client.invalidateQueries({ queryKey: adjustmentKeys.list }),
      ...(id ? [client.invalidateQueries({ queryKey: adjustmentKeys.detail(id) })] : []),
      ...(effective ? [client.invalidateQueries({ queryKey: [...INVENTORY_QUERY_KEY, "stock-card"] }), client.invalidateQueries({ queryKey: [...INVENTORY_QUERY_KEY, "stock-value"] })] : []),
    ]);
  };
}
