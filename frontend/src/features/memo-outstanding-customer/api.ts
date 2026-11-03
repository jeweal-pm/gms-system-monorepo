/**
 * Memo Outstanding › From Customer data access (memo-outstanding-customer SA revision 1 / ADR-0039): the read-only
 * `memoOutstanding.customer*` procedures, mapped into the shared report shapes so the From Vendor components render
 * them. A Memo Out is the document (`memoReceiveId` holds its id), the customer is the party (`vendor`), and Reserve is
 * always 0 (stones with a customer can't be reserved; the column isn't shown).
 */
import { keepPreviousData } from "@tanstack/react-query";
import type { InferQueryLikeData } from "@trpc/react-query/shared";
import { useCallback, useMemo } from "react";
import type { OutstandingReport } from "@/features/memo-outstanding-vendor/api";
import {
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

export type CustomerListRow = InferQueryLikeData<typeof masterTrpc.memoOutstanding.customerList>["items"][number];
export type CustomerItem = InferQueryLikeData<typeof masterTrpc.memoOutstanding.customerItems>["items"][number];

export const MENU_KEY = "memo-outstanding-customer";
export const PAGE_HREF = "/memo/memo-outstanding/customer";
export const memoOutHref = (id: string) => `/memo/memo-out/${encodeURIComponent(id)}`;

export const CUSTOMER_SPEC: ReportSpec = {
  key: MENU_KEY,
  menuKey: MENU_KEY,
  title: "From Customer",
  party: "Customer",
  partyParam: "customer",
  docHref: memoOutHref,
  buckets: ["memo", "return", "sold", "outstanding"],
  // "vendorName" is the shared party-name sort key; it is sent as customerName.
  sortKeys: ["docNo", "dueDate", "vendorName", "memoPcs", "returnPcs", "soldPcs", "outstandingPcs", "openValue"],
  openValueCaption: "open value (outstanding)",
  emptyText: "No memo items outstanding at customers.",
  noAccess: "You don't have permission to view memo outstanding from customers.",
  tableCaption: "Memo outstanding at customers",
};

const NONE = { pcs: 0, weightCt: "0.000" };

/** A Memo Out row → the shared report row. */
export function toReportRow({ memoOutId, customer, ...row }: CustomerListRow): VendorListRow {
  return { ...row, memoReceiveId: memoOutId, vendor: customer, reserve: NONE };
}

/** A Memo Out stock line → the shared report item (Memo Out lines have no photos). */
export function toReportItem({ memoOutId, location, ...item }: CustomerItem): VendorItem {
  return { ...item, memoReceiveId: memoOutId, location: location as VendorItem["location"], photoCount: 0, reserve: NONE };
}

/** Shared filters → the customer contract (`vendorIds` holds the chosen customers). */
export function customerFilterInput(state: ListState) {
  const { vendorIds, ...rest } = toFilterInput(state);
  return { ...rest, ...(vendorIds ? { customerIds: vendorIds } : {}) };
}

type CustomerSort = Exclude<SortKey, "vendorName" | "reservePcs"> | "customerName";

/** Shared list state → the customer contract: party filter, party-name sort, no Reserve sort. */
export function customerListInput(state: ListState) {
  const { vendorIds, sort, dir, ...rest } = toListInput(state);
  const customerSort: CustomerSort | undefined = sort === "vendorName" ? "customerName" : sort === "reservePcs" ? undefined : sort;
  return { ...rest, ...(vendorIds ? { customerIds: vendorIds } : {}), ...(customerSort ? { sort: customerSort, dir } : {}) };
}

const reads = { retry: retryTransient } as const;

function useCustomerSummary(state: ListState, enabled: boolean) {
  return masterTrpc.memoOutstanding.customerSummary.useQuery(customerFilterInput(state), { ...reads, enabled, staleTime: 15_000 });
}

function useCustomerList(state: ListState, enabled: boolean) {
  const list = masterTrpc.memoOutstanding.customerList.useQuery(customerListInput(state), { ...reads, enabled, staleTime: 15_000, placeholderData: keepPreviousData });
  const data = useMemo(() => (list.data ? { ...list.data, items: list.data.items.map(toReportRow) } : undefined), [list.data]);
  return { data, isPending: list.isPending, isError: list.isError, error: list.error, isFetching: list.isFetching };
}

function useCustomerOptions(enabled: boolean) {
  return masterTrpc.memoOutstanding.customerOptions.useQuery({}, { ...reads, enabled, staleTime: 60_000, select: (data) => ({ vendors: data.customers }) });
}

/** Items through the typed master client (one batched call per ≤ 25 Memo Outs). */
function useFetchCustomerItems(): FetchItems {
  const utils = masterTrpc.useUtils();
  return useCallback(
    async (memoOutIds) => {
      const { items } = await utils.client.memoOutstanding.customerItems.query({ memoOutIds });
      return { items: items.map(toReportItem) };
    },
    [utils],
  );
}

export const CUSTOMER_REPORT: OutstandingReport = {
  spec: CUSTOMER_SPEC,
  useSummary: useCustomerSummary,
  useList: useCustomerList,
  useOptions: useCustomerOptions,
  useFetchItems: useFetchCustomerItems,
};
