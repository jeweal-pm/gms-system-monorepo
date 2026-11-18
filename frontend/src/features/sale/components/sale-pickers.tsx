"use client";

import { Badge } from "@/features/quotation/components/ui";
import { StockPicker, usePickerFilters, type PickerColumn, type PickerData, type PickerGroup, type StockPickerProps } from "@/features/trade-document/stock-picker";
import type { MemoStockItem } from "@/features/trade-document/memo-stock-api";
import type { SaleReserveLineRef } from "../form";

/**
 * P-01 "Add From Reserve" and P-02 "Add From Stock" on the shared stock picker shell (sale FE-SL-004/005 UI, owner
 * 2026-11-18 "ทำแค่ ui พอ ยังไม่ต้องต่อ api"). The dialogs take their rows as `data`; until the Sale API is connected the
 * page passes `NOT_CONNECTED_DATA` (no rows, no request) and the empty text says so. FE-SL-004 / FE-SL-005 pass their
 * query results instead.
 */

export const NOT_CONNECTED = "Not connected yet";
type Tab = "ALL";

/** No rows and no request: the dialogs' state while Sale has no API (no mock data, Q-PU-01 rule). */
export const NOT_CONNECTED_DATA: PickerData<never> = {
  rows: [], isPending: false, isError: false, error: null, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: () => undefined,
};

const flat = <R,>(rows: R[]): PickerGroup<R>[] => [{ id: "ALL", label: "", tone: "neutral", count: rows.length, rows }];
const sub = "text-xs text-[#6B7480]";

/** P-01 columns (ui-spec): Reserve No. · Stone Code / Stock ID · lot … Open Pcs / Weight · Sale Price · Amount. */
export const RESERVE_LINE_COLUMNS: PickerColumn[] = [
  { title: "Reserve No.", sub: "Reserve date · Due date", className: "w-[170px]" },
  { title: "Stone Code", sub: "Stock ID · Lot", className: "w-[200px]" },
  { title: "Location" },
  { title: "Stone", sub: "Shape · Size" },
  { title: "Color" },
  { title: "Clarity", sub: "Cutting · Quality" },
  { title: "Cer Type", sub: "Cer No." },
  { title: "Open Pcs", right: true, divider: true },
  { title: "Open Weight", sub: "ct", right: true },
  { title: "Sale Price", right: true, divider: true },
  { title: "Amount", right: true },
];

/** P-02 columns (phase 1, as the Reserve / Memo Out From Stock dialog): no price columns. */
export const STOCK_COLUMNS: PickerColumn[] = [
  { title: "Stock ID", sub: "Lot", className: "w-[180px]" },
  { title: "Ref.", sub: "Memo Receive No. · date", className: "w-[170px]" },
  { title: "Location" },
  { title: "Stone", sub: "Shape · Size" },
  { title: "Color" },
  { title: "Clarity", sub: "Cutting · Quality" },
  { title: "Cer Type", sub: "Cer No." },
  { title: "Pending Pcs", right: true, divider: true },
  { title: "Pending Weight", sub: "ct", right: true },
];

function StoneCells({ row }: { row: Pick<SaleReserveLineRef, "location" | "stone" | "shape" | "size" | "color" | "clarity" | "cutting" | "quality" | "cerType" | "cerNo"> }) {
  return (
    <>
      <td className="px-3 py-4">{row.location || "—"}</td>
      <td className="px-3 py-4">
        <div>{row.stone || "—"}</div>
        <div className={sub}>{[row.shape, row.size].filter(Boolean).join(" · ") || "—"}</div>
      </td>
      <td className="px-3 py-4">{row.color || "—"}</td>
      <td className="px-3 py-4">
        <div>{row.clarity || "—"}</div>
        <div className={sub}>{[row.cutting, row.quality].filter(Boolean).join(" · ") || "—"}</div>
      </td>
      <td className="px-3 py-4">
        <div>{row.cerType || "—"}</div>
        <div className={sub}>{row.cerNo || "—"}</div>
      </td>
    </>
  );
}

export function ReserveLineCells({ row }: { row: SaleReserveLineRef }) {
  return (
    <>
      <td className="px-3 py-4">
        <div className="font-medium">{row.reserveNo}</div>
        <div className={sub}>{`${row.reserveDate} · ${row.dueDate}`}</div>
      </td>
      <td className="px-3 py-4">
        <div className="font-medium">{row.stoneCode || "—"}</div>
        <div className={`${sub} flex flex-wrap items-center gap-2`}>
          <span>{row.stockId}</span>
          {row.lot && <Badge variant="lot">{row.lot}</Badge>}
        </div>
      </td>
      <StoneCells row={row} />
      <td className="border-l border-[#EDEDED] px-3 py-4 text-right">{row.openPcs}</td>
      <td className="px-3 py-4 text-right">{row.openWeightCt}</td>
      <td className="border-l border-[#EDEDED] px-3 py-4 text-right">{`${row.netUnitPrice} / ${row.priceUnit === "PER_PCS" ? "pcs" : "ct"}`}</td>
      <td className="px-3 py-4 text-right">{row.openAmount}</td>
    </>
  );
}

export function StockItemCells({ row }: { row: MemoStockItem }) {
  return (
    <>
      <td className="px-3 py-4">
        <div className="font-medium">{row.stockId}</div>
        <div className={sub}>{row.lot ? <Badge variant="lot">{row.lot}</Badge> : "—"}</div>
      </td>
      <td className="px-3 py-4">
        <div>{row.memoReceive.docNo}</div>
        <div className={sub}>{row.memoReceive.docDate}</div>
      </td>
      <StoneCells row={row} />
      <td className="border-l border-[#EDEDED] px-3 py-4 text-right">{row.pendingPcs}</td>
      <td className="px-3 py-4 text-right">{row.pendingWeightCt}</td>
    </>
  );
}

type Scope<R> = { excluded: ReadonlySet<string>; onCancel: () => void; onConfirm: (rows: R[]) => void };

/** P-01 settings: title, search, Start → Due on the Reserve Doc Date, flat list. */
export function reserveLinePickerProps({ currency, excluded, onCancel, onConfirm, connected = false }: Scope<SaleReserveLineRef> & { currency: string; connected?: boolean }): StockPickerProps<SaleReserveLineRef, Tab> {
  return {
    title: "Add From Reserve",
    tabs: [],
    flat: true,
    searchPlaceholder: "Search Reserve No., Stock ID, Lot, Stone, Cer No.",
    searchLabel: "Search reserve lines",
    dateLabels: { from: "Start", to: "Due" },
    columns: RESERVE_LINE_COLUMNS,
    groups: flat,
    rowKey: (row) => row.reserveLineId,
    rowLabel: (row) => `Select ${row.stockId} of ${row.reserveNo}`,
    cells: (row) => <ReserveLineCells row={row} />,
    emptyText: (_tab, filtered) =>
      !connected ? `${NOT_CONNECTED}. Open reserve lines appear here once Sale is connected.` : filtered ? "Nothing matches your search." : `No open reservations for this customer in ${currency}.`,
    loadError: () => "Couldn't load the reserve lines. Try again.",
    excluded,
    onCancel,
    onConfirm,
  };
}

/** P-02 settings: title, search, Start → Due on the Memo Receive date, flat list. */
export function stockPickerProps({ excluded, onCancel, onConfirm, connected = false }: Scope<MemoStockItem> & { connected?: boolean }): StockPickerProps<MemoStockItem, Tab> {
  return {
    title: "Add From Stock",
    tabs: [],
    flat: true,
    searchPlaceholder: "Search Stock ID, Lot, Stone, Cer No.",
    searchLabel: "Search stock",
    dateLabels: { from: "Start", to: "Due" },
    columns: STOCK_COLUMNS,
    groups: flat,
    rowKey: (row) => row.id,
    rowLabel: (row) => `Select ${row.stockId}`,
    cells: (row) => <StockItemCells row={row} />,
    emptyText: (_tab, filtered) => (!connected ? `${NOT_CONNECTED}. Stock appears here once Sale is connected.` : filtered ? "Nothing matches your search." : "No stock with anything pending."),
    loadError: () => "Couldn't load the stock. Try again.",
    excluded,
    onCancel,
    onConfirm,
  };
}

/** P-01 dialog. Without `data` (no API yet) it shows its empty, not-connected state. */
export function ReserveLinePickerDialog({ data, ...scope }: Scope<SaleReserveLineRef> & { currency: string; data?: PickerData<SaleReserveLineRef> }) {
  const filters = usePickerFilters<Tab>("ALL");
  return <StockPicker {...reserveLinePickerProps({ ...scope, connected: Boolean(data) })} filters={filters} data={data ?? NOT_CONNECTED_DATA} />;
}

/** P-02 dialog. Without `data` (no API yet) it shows its empty, not-connected state. */
export function StockPickerDialog({ data, ...scope }: Scope<MemoStockItem> & { data?: PickerData<MemoStockItem> }) {
  const filters = usePickerFilters<Tab>("ALL");
  return <StockPicker {...stockPickerProps({ ...scope, connected: Boolean(data) })} filters={filters} data={data ?? NOT_CONNECTED_DATA} />;
}
