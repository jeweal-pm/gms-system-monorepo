"use client";

import { skipToken } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import type { ReactNode } from "react";
import { useNumberFormat, type NumberFormat } from "@/features/decimal-setup/number-format-provider";
import { Badge, cx } from "@/features/quotation/components/ui";
import { dec } from "@/features/quotation/lib/decimal";
import { formatMoneyText, formatUnitPrice, formatWeight } from "@/features/quotation/lib/format";
import { documentLoadError } from "@/features/trade-document/document-api";
import { memoStockLoadError } from "@/features/trade-document/memo-stock-api";
import { masterTrpc } from "@/lib/master-trpc";
import { retryTransient } from "@/lib/trpc-error";
import type { PurchaseMemoStockRow, PurchaseOrderLineRow } from "../form";
import { PurchasePicker, usePickerFilters, type PickerColumn, type PickerData, type PickerFilter, type PickerGroup, type PickerTab, type PurchasePickerProps } from "./purchase-picker";

/**
 * The two Purchase pickers on the shared shell (FE-PU-004 / FE-PU-009): "Add Memo Stock" (`purchase.memoStock`, R2-MS)
 * and "Add Purchase Order" (`purchase.purchaseOrderLines`, R2-PO). Both are scoped to the document's vendor + currency,
 * 50 rows a page, with the server's counts. Loaded lazily when a dialog opens.
 */

export const PICKER_PAGE_SIZE = 50;
export type MemoTab = "ALL" | "SOLD" | "IN_STOCK";
export type PurchaseOrderTab = "ALL" | "OPEN" | "PARTLY_PURCHASED";

/** Picker input: the scope, the tab as `status`, and only the filters that are set. */
export function pickerInput<S extends string>(vendorId: string, currency: string, filter: PickerFilter<S>) {
  return {
    vendorId,
    currency,
    status: filter.status,
    limit: PICKER_PAGE_SIZE,
    ...(filter.q ? { q: filter.q } : {}),
    ...(filter.from ? { from: filter.from } : {}),
    ...(filter.to ? { to: filter.to } : {}),
  };
}

type Infinite<T> = {
  data?: { pages: { items: T[] }[] };
  isPending: boolean;
  isError: boolean;
  error: unknown;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
};
const pickerData = <T,>(query: Infinite<T>): PickerData<T> => ({
  rows: (query.data?.pages ?? []).flatMap((page) => page.items),
  isPending: query.isPending,
  isError: query.isError,
  error: query.error,
  hasNextPage: query.hasNextPage,
  isFetchingNextPage: query.isFetchingNextPage,
  fetchNextPage: () => void query.fetchNextPage(),
});
const lastCounts = <C,>(query: { data?: { pages: { counts: C }[] } }): C | undefined => query.data?.pages.at(-1)?.counts;
const pageOptions = { getNextPageParam: (page: { nextCursor: string | null }) => page.nextCursor ?? undefined, staleTime: 10_000, retry: retryTransient };

export function usePurchaseMemoStock(vendorId: string, currency: string, filter: PickerFilter<MemoTab>) {
  const query = masterTrpc.purchase.memoStock.useInfiniteQuery(vendorId && currency ? pickerInput(vendorId, currency, filter) : skipToken, pageOptions);
  return { data: pickerData<PurchaseMemoStockRow>(query), counts: lastCounts(query) };
}

export function usePurchaseOrderLines(vendorId: string, currency: string, filter: PickerFilter<PurchaseOrderTab>) {
  const query = masterTrpc.purchase.purchaseOrderLines.useInfiniteQuery(vendorId && currency ? pickerInput(vendorId, currency, filter) : skipToken, pageOptions);
  return { data: pickerData<PurchaseOrderLineRow>(query), counts: lastCounts(query) };
}

// ---- shared cells ----

const sub = "mt-1 text-xs text-[#656B71]";
const shortDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y.slice(2)}` : iso;
};
const unitText = (currency: string, perCt: boolean) => `${currency} per ${perCt ? "cts" : "pcs"}`;

function StoneCells({ row }: { row: Pick<PurchaseMemoStockRow, "location" | "stone" | "shape" | "size" | "color" | "clarity" | "cutting" | "quality" | "cerType" | "cerNo"> }) {
  return (
    <>
      <td className="px-3 py-4">{row.location || "—"}</td>
      <td className="px-3 py-4">
        <div className="font-medium">{row.stone}</div>
        <div className={sub}>{[row.shape, row.size].filter(Boolean).join(" · ")}</div>
      </td>
      <td className="px-3 py-4">
        <div>{[row.color, row.clarity].filter(Boolean).join(" · ")}</div>
        <div className={sub}>{[row.cutting, row.quality].filter(Boolean).join(" · ")}</div>
      </td>
      <td className="px-3 py-4">
        {row.cerType && <Badge>{row.cerType}</Badge>}
        <div className={sub}>{row.cerNo}</div>
      </td>
    </>
  );
}

function QuantityPriceCells({ pcs, weightCt, price, perCt, amount, currency, nf }: { pcs: number; weightCt: string; price: string; perCt: boolean; amount: string; currency: string; nf: NumberFormat }) {
  return (
    <>
      <td className="px-3 py-4 text-right">
        <div>{pcs}</div>
        <div className={sub}>{formatWeight(dec(weightCt), nf.weightPlaces)} cts</div>
      </td>
      <td className="border-l border-[#EDEDED] px-3 py-4 text-right">
        <div>{formatUnitPrice(price, nf.pricePlaces)}</div>
        <div className={sub}>{unitText(currency, perCt)}</div>
      </td>
      <td className="px-3 py-4 text-right">{formatMoneyText(amount, nf.pricePlaces)}</td>
    </>
  );
}

const Note = ({ text }: { text: string }) =>
  text ? (
    <div className={cx(sub, "flex items-center gap-1.5")}>
      <MessageSquare className="size-3" aria-hidden /> {text}
    </div>
  ) : null;

/** Status badge (DV-09): the design's fills with darker text for WCAG AA; the status is always given as text. */
export function StatusBadge({ tone, children }: { tone: "sold" | "inStock" | "open" | "partly"; children: ReactNode }) {
  const tones = {
    sold: "bg-[#FAE6E4] text-[#C2141A]",
    inStock: "bg-[#C1EFD2] text-[#166534]",
    open: "bg-[#EEF0F2] text-[#1C252E]",
    partly: "bg-[#FDF1DC] text-[#B4540A]",
  };
  return <span className={cx("inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

const columns = (first: PickerColumn, status: PickerColumn): PickerColumn[] => [
  first,
  { title: "Location" },
  { title: "Stone", sub: "Shape · Size" },
  { title: "Color · Clarity", sub: "Cutting · Quality" },
  { title: "Cer Type", sub: "Cer No." },
  status,
  { title: "Pcs", sub: "Weight", right: true },
  { title: "Price", sub: "Unit", right: true, divider: true },
  { title: "Amount", right: true },
];

// ---- Add Memo Stock (R2-MS) ----

export const MEMO_STOCK_COLUMNS = columns({ title: "Stock ID", sub: "Lot · Memo No.", className: "w-[240px]" }, { title: "Status", sub: "Sale Invoice · Customer" });
export const SOLD_GROUP_LABEL = "Sold to customers · must be purchased";
export const IN_STOCK_GROUP_LABEL = "Still in stock on memo · buy now or return later";
type MemoCounts = { all: number; sold: number; inStock: number };

export function memoStockTabs(counts: MemoCounts | undefined): PickerTab<MemoTab>[] {
  return [
    { id: "ALL", label: "All", count: counts?.all },
    { id: "SOLD", label: "Sold", count: counts?.sold },
    { id: "IN_STOCK", label: "In stock", count: counts?.inStock },
  ];
}

/** Sold first, then In stock (source 05). A group's count is the server's for the current search and dates. */
export function memoStockGroups(rows: readonly PurchaseMemoStockRow[], counts: MemoCounts | undefined): PickerGroup<PurchaseMemoStockRow>[] {
  const sold = rows.filter((row) => row.status === "SOLD");
  const inStock = rows.filter((row) => row.status !== "SOLD");
  return [
    { id: "SOLD", label: SOLD_GROUP_LABEL, tone: "sold", count: counts?.sold ?? sold.length, rows: sold },
    { id: "IN_STOCK", label: IN_STOCK_GROUP_LABEL, tone: "neutral", count: counts?.inStock ?? inStock.length, rows: inStock },
  ];
}

export function memoStockEmptyText(currency: string) {
  return (tab: MemoTab, filtered: boolean) => {
    if (filtered) return "Nothing matches your search.";
    if (tab === "SOLD") return "No sold items waiting to be purchased.";
    if (tab === "IN_STOCK") return "No items in stock on memo.";
    return `No memo stock from this vendor in ${currency}.`;
  };
}

/** api-contract `PurchaseMemoStockRow.sale`: always null in SA rev 1 (no Sale entity, D6 / Q-PU-16). */
type SaleInfo = { invoiceNo: string; invoiceDate: string; customerName: string } | null;

/** One Memo Stock row's cells after the checkbox and # (columns 3–11 of R2-MS). */
export function MemoStockCells({ row, currency }: { row: PurchaseMemoStockRow; currency: string }) {
  const nf = useNumberFormat();
  const sale = row.sale as SaleInfo;
  return (
    <>
      <td className="px-3 py-4">
        <div className="font-medium">{row.stockId}</div>
        <div className={sub}>{[row.lot, row.memoReceive.docNo].filter(Boolean).join(" · ")}</div>
        <Note text={row.itemNote} />
      </td>
      <StoneCells row={row} />
      <td className="px-3 py-4">
        {row.status === "SOLD" ? (
          <>
            <StatusBadge tone="sold">Sold</StatusBadge>
            {/* Q-PU-16 / SA D6: the sale data comes from the Sale page, which doesn't exist yet; shown only when given. */}
            {sale && (
              <>
                <div className={sub}>{`${sale.invoiceNo} · ${shortDate(sale.invoiceDate)}`}</div>
                <div className={sub}>{sale.customerName}</div>
              </>
            )}
          </>
        ) : (
          <>
            <StatusBadge tone="inStock">In stock</StatusBadge>
            <div className={sub}>with us since memo</div>
          </>
        )}
      </td>
      <QuantityPriceCells pcs={row.availablePcs} weightCt={row.availableWeightCt} price={row.netUnitPrice} perCt={row.priceUnit !== "PCS"} amount={row.amount} currency={currency} nf={nf} />
    </>
  );
}

type PickerScope<R> = { currency: string; excluded: ReadonlySet<string>; onCancel: () => void; onConfirm: (rows: R[]) => void };

/** The Add Memo Stock settings on the shell (R2-MS). */
export function memoStockPickerProps({ currency, counts, excluded, onCancel, onConfirm }: PickerScope<PurchaseMemoStockRow> & { counts: MemoCounts | undefined }): PurchasePickerProps<PurchaseMemoStockRow, MemoTab> {
  return {
    title: "Add Memo Stock",
    tabs: memoStockTabs(counts),
    searchPlaceholder: "Search Stock ID, lot, memo, invoice",
    searchLabel: "Search memo stock",
    dateLabels: { from: "Received from", to: "Received to" },
    columns: MEMO_STOCK_COLUMNS,
    groups: (rows) => memoStockGroups(rows, counts),
    rowKey: (row) => row.key,
    rowLabel: (row) => `Select ${row.stockId} from ${row.memoReceive.docNo}`,
    rowMarked: (row) => row.status === "SOLD",
    cells: (row) => <MemoStockCells row={row} currency={currency} />,
    emptyText: memoStockEmptyText(currency),
    loadError: memoStockLoadError,
    excluded,
    onCancel,
    onConfirm,
  };
}

export function MemoStockPicker({ vendorId, ...scope }: PickerScope<PurchaseMemoStockRow> & { vendorId: string }) {
  const filters = usePickerFilters<MemoTab>("ALL");
  const { data, counts } = usePurchaseMemoStock(vendorId, scope.currency, filters.filter);
  return <PurchasePicker {...memoStockPickerProps({ ...scope, counts })} filters={filters} data={data} />;
}

// ---- Add Purchase Order (R2-PO) ----

export const PURCHASE_ORDER_COLUMNS = columns({ title: "PO Line", sub: "Lot", className: "w-[200px]" }, { title: "Status", sub: "Ordered" });
type PurchaseOrderCounts = { all: number; open: number; partlyPurchased: number };

export function purchaseOrderTabs(counts: PurchaseOrderCounts | undefined): PickerTab<PurchaseOrderTab>[] {
  return [
    { id: "ALL", label: "All", count: counts?.all },
    { id: "OPEN", label: "Open", count: counts?.open },
    { id: "PARTLY_PURCHASED", label: "Partly purchased", count: counts?.partlyPurchased },
  ];
}

/** One group per PO, in the server's order (newest PO first, lines by position): "{PO No.} · {date} · Due {date}". */
export function purchaseOrderGroups(rows: readonly PurchaseOrderLineRow[]): PickerGroup<PurchaseOrderLineRow>[] {
  const groups = new Map<string, PickerGroup<PurchaseOrderLineRow>>();
  for (const row of rows) {
    const po = row.purchaseOrder;
    const group = groups.get(po.id) ?? { id: po.id, label: `${po.docNo} · ${shortDate(po.docDate)} · Due ${shortDate(po.dueDate)}`, tone: "neutral" as const, count: 0, rows: [] };
    group.rows.push(row);
    group.count = group.rows.length;
    groups.set(po.id, group);
  }
  return [...groups.values()];
}

export function purchaseOrderEmptyText(currency: string) {
  return (_tab: PurchaseOrderTab, filtered: boolean) => (filtered ? "Nothing matches your search." : `No open purchase order lines from this vendor in ${currency}.`);
}

export const purchaseOrderLinesLoadError = (error: unknown) => documentLoadError(error, "PURCHASE", "purchase order lines", "purchase order lines");

/** One PO line's cells after the checkbox and # (R2-PO). */
export function PurchaseOrderLineCells({ row, currency }: { row: PurchaseOrderLineRow; currency: string }) {
  const nf = useNumberFormat();
  return (
    <>
      <td className="px-3 py-4">
        <div className="font-medium">Line {row.position}</div>
        {row.lot && <div className={sub}>{row.lot}</div>}
        <Note text={row.itemNote} />
      </td>
      <StoneCells row={row} />
      <td className="px-3 py-4">
        {row.status === "OPEN" ? <StatusBadge tone="open">Open</StatusBadge> : <StatusBadge tone="partly">Partly purchased</StatusBadge>}
        <div className={sub}>{`Ordered ${row.orderedPcs} pcs · ${formatWeight(dec(row.orderedWeightCt), nf.weightPlaces)} cts`}</div>
      </td>
      <QuantityPriceCells pcs={row.availablePcs} weightCt={row.availableWeightCt} price={row.netUnitPrice} perCt={row.priceUnit === "PER_CT"} amount={row.amount} currency={currency} nf={nf} />
    </>
  );
}

/** The Add Purchase Order settings on the shell (R2-PO). */
export function purchaseOrderPickerProps({ currency, counts, excluded, onCancel, onConfirm }: PickerScope<PurchaseOrderLineRow> & { counts: PurchaseOrderCounts | undefined }): PurchasePickerProps<PurchaseOrderLineRow, PurchaseOrderTab> {
  return {
    title: "Add Purchase Order",
    tabs: purchaseOrderTabs(counts),
    searchPlaceholder: "Search PO No., lot, stone, cer no.",
    searchLabel: "Search purchase order lines",
    dateLabels: { from: "Ordered from", to: "Ordered to" },
    columns: PURCHASE_ORDER_COLUMNS,
    groups: purchaseOrderGroups,
    rowKey: (row) => row.purchaseOrderLineId,
    rowLabel: (row) => `Select line ${row.position} of ${row.purchaseOrder.docNo}`,
    cells: (row) => <PurchaseOrderLineCells row={row} currency={currency} />,
    emptyText: purchaseOrderEmptyText(currency),
    loadError: purchaseOrderLinesLoadError,
    excluded,
    onCancel,
    onConfirm,
  };
}

export function PurchaseOrderPicker({ vendorId, ...scope }: PickerScope<PurchaseOrderLineRow> & { vendorId: string }) {
  const filters = usePickerFilters<PurchaseOrderTab>("ALL");
  const { data, counts } = usePurchaseOrderLines(vendorId, scope.currency, filters.filter);
  return <PurchasePicker {...purchaseOrderPickerProps({ ...scope, counts })} filters={filters} data={data} />;
}
