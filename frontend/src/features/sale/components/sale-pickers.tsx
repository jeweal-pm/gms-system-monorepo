"use client";

import { PickerChip, PickerLot, pickerCell, pickerSub } from "@/features/trade-document/picker-ui";
import { formatDate } from "@/features/quotation/lib/format";
import { StockPicker, usePickerFilters, type PickerColumn, type PickerGroup, type StockPickerProps } from "@/features/trade-document/stock-picker";
import { reserveLinePickerData, saleLoadError, useReserveLines } from "../api";
import type { SaleReserveLineRef } from "../form";

/**
 * P-01 "Add From Reserve" (sale FE-SL-004) on the shared stock picker shell: the open lines of the customer's approved
 * Reserves in the document currency (`GET /sale/reserve-lines`), oldest Reserve first, 50 a page with Load more, search
 * (250 ms debounce) and Start → Due on the Reserve date. Lines already on the document are left out (server `exclude`
 * and the shell's own check). P-02 "Add From Stock" reuses `MemoStockModal` (phase 1, Q-SL-01).
 */

type Tab = "ALL";

const flat = <R,>(rows: R[]): PickerGroup<R>[] => [{ id: "ALL", label: "", tone: "neutral", count: rows.length, rows }];
const sub = pickerSub;

/** P-01 columns (ui-spec): Reserve No. · Stone Code / Stock ID · lot … Open Pcs / Weight · Sale Price · Amount. */
export const RESERVE_LINE_COLUMNS: PickerColumn[] = [
  { title: "Reserve No.", sub: "Reserve date · Due date", plainSub: true, className: "w-[170px]" },
  { title: "Stone Code", sub: "Stock ID · Lot", className: "w-[200px]" },
  { title: "Location", upper: true },
  { title: "Stone", sub: "Shape · Size", upper: true },
  { title: "Color", upper: true },
  { title: "Clarity", sub: "Cutting · Quality", upper: true },
  { title: "Cer Type", sub: "Cer No.", upper: true },
  { title: "Open Pcs", right: true, upper: true },
  { title: "Open Weight", sub: "ct", plainSub: true, right: true, upper: true },
  { title: "Sale Price", right: true, upper: true },
  { title: "Amount", right: true },
];

const dash = (value: string) => value || "—";
const joined = (...parts: string[]) => parts.filter(Boolean).join(" · ") || "—";

export function ReserveLineCells({ row }: { row: SaleReserveLineRef }) {
  return (
    <>
      <td className={pickerCell}>
        <div className="font-medium">{row.reserveNo}</div>
        <div className={sub}>{`${formatDate(row.reserveDate)} · ${formatDate(row.dueDate)}`}</div>
      </td>
      <td className={pickerCell}>
        <div className="font-medium">{dash(row.stoneCode)}</div>
        <div className={`${sub} flex flex-wrap items-center gap-2`}>
          <span>{row.stockId}</span>
          {row.lot && <PickerLot>{row.lot}</PickerLot>}
        </div>
      </td>
      <td className={pickerCell}>{dash(row.location)}</td>
      <td className={pickerCell}>
        <div>{dash(row.stone)}</div>
        <div className={sub}>{joined(row.shape, row.size)}</div>
      </td>
      <td className={pickerCell}>{dash(row.color)}</td>
      <td className={pickerCell}>
        <div>{dash(row.clarity)}</div>
        <div className={sub}>{joined(row.cutting, row.quality)}</div>
      </td>
      <td className={pickerCell}>
        {row.cerType ? <PickerChip>{row.cerType}</PickerChip> : <div>—</div>}
        <div className={sub}>{dash(row.cerNo)}</div>
      </td>
      <td className={`${pickerCell} text-right`}>{row.openPcs}</td>
      <td className={`${pickerCell} text-right`}>{row.openWeightCt}</td>
      <td className={`${pickerCell} text-right`}>{`${row.netUnitPrice} / ${row.priceUnit === "PER_PCS" ? "pcs" : "ct"}`}</td>
      <td className={`${pickerCell} text-right`}>{row.openAmount}</td>
    </>
  );
}

type Scope = { currency: string; excluded: ReadonlySet<string>; onCancel: () => void; onConfirm: (rows: SaleReserveLineRef[]) => void };

/** P-01 settings: title, search, Start → Due on the Reserve date, flat list. */
export function reserveLinePickerProps({ currency, excluded, onCancel, onConfirm }: Scope): StockPickerProps<SaleReserveLineRef, Tab> {
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
    emptyText: (_tab, filtered) => (filtered ? "Nothing matches your search." : `No open reservations for this customer in ${currency}.`),
    loadError: (error) => saleLoadError(error, "the reserve lines"),
    excluded,
    onCancel,
    onConfirm,
  };
}

/** P-01 dialog with its live query. */
export function ReserveLinePicker({ customerId, ...scope }: Scope & { customerId: string }) {
  const filters = usePickerFilters<Tab>("ALL");
  const query = useReserveLines({ customerId, currency: scope.currency, q: filters.filter.q, from: filters.filter.from, to: filters.filter.to, exclude: [...scope.excluded] });
  return <StockPicker {...reserveLinePickerProps(scope)} filters={filters} data={reserveLinePickerData(query)} />;
}
