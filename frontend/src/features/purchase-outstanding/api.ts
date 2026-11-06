/**
 * Purchase Outstanding data access (purchase-outstanding SA revision 1 / ADR-0044): the read-only `purchaseOutstanding.*`
 * procedures, mapped into the shared report shapes so the Memo Outstanding components render them. The document is a
 * Memo Receive; the shared number groups carry Purchase (in `sold`), Sale = sold − purchased (in `reserve`) and
 * Balance = Memo − Return − Purchase (in `outstanding`), under this report's own column names.
 */
import { keepPreviousData } from "@tanstack/react-query";
import type { InferQueryLikeData } from "@trpc/react-query/shared";
import { useCallback, useMemo } from "react";
import type { OutstandingReport } from "@/features/memo-outstanding-vendor/api";
import {
  memoReceiveHref,
  toFilterInput,
  toListInput,
  type FetchItems,
  type ListState,
  type ReportSpec,
  type SortKey,
  type VendorItem,
  type VendorListRow,
} from "@/features/memo-outstanding-vendor/model";
import { masterTrpc } from "@/lib/master-trpc";
import { retryTransient } from "@/lib/trpc-error";

export type PurchaseOutstandingRow = InferQueryLikeData<typeof masterTrpc.purchaseOutstanding.list>["items"][number];
export type PurchaseOutstandingItem = InferQueryLikeData<typeof masterTrpc.purchaseOutstanding.items>["items"][number];

export const MENU_KEY = "purchase-outstanding";
export const PAGE_HREF = "/purchase-order/purchase-outstanding";

export const PURCHASE_OUTSTANDING_SPEC: ReportSpec = {
  key: MENU_KEY,
  menuKey: MENU_KEY,
  title: "Purchase Outstanding",
  party: "Vendor",
  partyParam: "vendor",
  docHref: memoReceiveHref,
  buckets: ["memo", "return", "sold", "reserve", "outstanding"],
  // Owner 2026-11-06: Balance = Memo − Return − Purchase; Sale = sold, waiting to move to Purchase.
  bucketLabels: { sold: "Purchase", reserve: "Sale", outstanding: "Balance Outstanding" },
  sortKeys: ["docNo", "dueDate", "vendorName", "memoPcs", "returnPcs", "soldPcs", "reservePcs", "outstandingPcs", "openValue"],
  openValueCaption: "balance value",
  emptyText: "Nothing outstanding to purchase from vendors.",
  noAccess: "You don't have permission to view purchase outstanding.",
  tableCaption: "Purchase outstanding from vendors",
};

/** A Purchase Outstanding row → the shared report row (purchase → sold, sale → reserve, balance → outstanding). */
export function toReportRow({ purchase, sale, balance, ...row }: PurchaseOutstandingRow): VendorListRow {
  return { ...row, sold: purchase, reserve: sale, outstanding: balance };
}

/** A Purchase Outstanding item → the shared report item. */
export function toReportItem({ purchase, sale, balance, ...item }: PurchaseOutstandingItem): VendorItem {
  return { ...item, sold: purchase, reserve: sale, outstanding: balance };
}

type PurchaseSort = Exclude<SortKey, "soldPcs" | "reservePcs" | "outstandingPcs"> | "purchasePcs" | "salePcs" | "balancePcs";
const SORT: Partial<Record<SortKey, PurchaseSort>> = { soldPcs: "purchasePcs", reservePcs: "salePcs", outstandingPcs: "balancePcs" };

/** Shared list state → this contract: the shared group sort keys name Purchase, Sale and Balance here. */
export function purchaseOutstandingListInput(state: ListState) {
  const { sort, dir, ...rest } = toListInput(state);
  const mapped: PurchaseSort | undefined = sort ? (SORT[sort] ?? (sort as PurchaseSort)) : undefined;
  return { ...rest, ...(mapped ? { sort: mapped, dir } : {}) };
}

const reads = { retry: retryTransient } as const;

function useSummary(state: ListState, enabled: boolean) {
  return masterTrpc.purchaseOutstanding.summary.useQuery(toFilterInput(state), { ...reads, enabled, staleTime: 15_000 });
}

function useList(state: ListState, enabled: boolean) {
  const list = masterTrpc.purchaseOutstanding.list.useQuery(purchaseOutstandingListInput(state), { ...reads, enabled, staleTime: 15_000, placeholderData: keepPreviousData });
  const data = useMemo(() => (list.data ? { ...list.data, items: list.data.items.map(toReportRow) } : undefined), [list.data]);
  return { data, isPending: list.isPending, isError: list.isError, error: list.error, isFetching: list.isFetching };
}

function useOptions(enabled: boolean) {
  return masterTrpc.purchaseOutstanding.options.useQuery({}, { ...reads, enabled, staleTime: 60_000 });
}

/** Items through the typed master client (one batched call per ≤ 25 Memo Receives). */
function useFetchItems(): FetchItems {
  const utils = masterTrpc.useUtils();
  return useCallback(
    async (memoReceiveIds) => {
      const { items } = await utils.client.purchaseOutstanding.items.query({ memoReceiveIds });
      return { items: items.map(toReportItem) };
    },
    [utils],
  );
}

export const PURCHASE_OUTSTANDING_REPORT: OutstandingReport = {
  spec: PURCHASE_OUTSTANDING_SPEC,
  useSummary,
  useList,
  useOptions,
  useFetchItems,
};
