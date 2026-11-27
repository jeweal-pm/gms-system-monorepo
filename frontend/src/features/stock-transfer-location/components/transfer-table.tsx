"use client";

import { ChevronsUpDown, CircleMinus } from "lucide-react";
import { useState } from "react";
import { useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import { cx, NumberInput, SelectMenu } from "@/features/quotation/components/ui";
import { formatUnitPrice } from "@/features/quotation/lib/format";
import { emptyRowCount, newLocationOptions, nextSort, sortedRows, unitText, type SortKey, type SortState, type TransferRow } from "../form";
import { COLUMN_TONE, rowState, TABLE_HEAD, TABLE_ROW } from "@/features/trade-document/table-row";

export const EMPTY_ROW_TEXT = "Empty row · click to pick from stock";

/** Row backgrounds (owner image 03): default white, hover light grey, selected (checked) light teal. */
const TEAL_HEAD = cx(COLUMN_TONE.teal.head, "text-[#0E5E63]");
const DIVIDER = "border-l border-[#D5DADF]";

export type TransferTableProps = {
  rows: readonly TransferRow[];
  locations: readonly string[];
  readOnly: boolean;
  checkedKeys: ReadonlySet<string>;
  /** Row messages by row key (validation or server). */
  rowErrors: ReadonlyMap<string, string>;
  onToggleCheck: (key: string) => void;
  onToggleAll: (checked: boolean) => void;
  onRemove: (key: string) => void;
  onLocation: (key: string, location: string) => void;
  onPcs: (key: string, text: string) => void;
  onWeight: (key: string, text: string) => void;
  onPickEmpty: () => void;
};

const COLUMNS = 12;

function SortTh({ title, sub, sortKey, sort, onSort, right, className }: { title: string; sub?: string; sortKey: SortKey; sort: SortState; onSort: (key: SortKey) => void; right?: boolean; className?: string }) {
  const active = sort?.key === sortKey;
  return (
    <th scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={cx("px-3 py-3 font-medium", right && "text-right", className)}>
      <button type="button" onClick={() => onSort(sortKey)} className={cx("inline-flex items-center gap-1.5", right && "flex-row-reverse")}>
        <span className="leading-tight">
          <span className="block">{title}</span>
          {sub && <span className="block text-[11px] font-normal text-[#6B7480]">{sub}</span>}
        </span>
        <ChevronsUpDown aria-hidden className={cx("size-3", active ? "text-[#1C252E]" : "text-[#95A0A9]")} />
      </button>
    </th>
  );
}

/**
 * FE-STL-002 grid (ADR-0060 D12, owner images 01–03). Left part read-only: checkbox, ⊖, #, Stone Code, LOCATION, LOT,
 * PCS / WEIGHT on hand, PRICE (amount + currency, per cts / per pcs). Right part (teal group): NEW LOCATION (active
 * locations except the row's own), PCS / WEIGHT inputs with placeholder 0. At least five rows: empty rows open From Stock.
 */
export function TransferTable(props: TransferTableProps) {
  const { rows, locations, readOnly, checkedKeys, rowErrors, onToggleCheck, onToggleAll, onRemove, onLocation, onPcs, onWeight, onPickEmpty } = props;
  const nf = useNumberFormat();
  const [sort, setSort] = useState<SortState>(null);
  const onSort = (key: SortKey) => setSort((current) => nextSort(current, key));
  const allChecked = rows.length > 0 && rows.every((row) => checkedKeys.has(row.key));
  const numberOf = new Map(rows.map((row, index) => [row.key, index + 1]));
  const view = sortedRows(rows, sort);
  const empties = emptyRowCount(rows.length);

  return (
    <div className="overflow-x-auto rounded-lg">
      <table className="w-full min-w-[1280px] border-collapse text-sm text-[#1C252E]" aria-label="Transfer rows">
        <thead className={cx("text-left", TABLE_HEAD)}>
          <tr>
            <th scope="col" className="w-10 px-3 py-3">
              <input type="checkbox" aria-label="Select all rows" className="size-4 accent-[#0E5E63]" checked={allChecked} disabled={readOnly || rows.length === 0} onChange={() => onToggleAll(!allChecked)} />
            </th>
            <th scope="col" className="w-8 px-1 py-3"><span className="sr-only">Remove</span></th>
            <th scope="col" className="w-8 px-2 py-3 font-normal text-[#6B7480]">#</th>
            <SortTh title="Stone Code" sortKey="stoneCode" sort={sort} onSort={onSort} />
            <SortTh title="LOCATION" sortKey="location" sort={sort} onSort={onSort} />
            <SortTh title="LOT" sortKey="lot" sort={sort} onSort={onSort} />
            <SortTh title="PCS" sortKey="pcs" sort={sort} onSort={onSort} right className="w-[90px]" />
            <SortTh title="WEIGHT" sortKey="weight" sort={sort} onSort={onSort} right className="w-[110px]" />
            <SortTh title="PRICE" sub="UNIT" sortKey="price" sort={sort} onSort={onSort} right className="w-[160px]" />
            <th scope="col" className={cx("min-w-[260px] px-6 py-3 font-medium", TEAL_HEAD, DIVIDER)}>NEW LOCATION</th>
            <th scope="col" className={cx("w-[110px] px-3 py-3 text-right font-medium", TEAL_HEAD)}>PCS</th>
            <th scope="col" className={cx("w-[150px] px-3 py-3 text-right font-medium", TEAL_HEAD)}>WEIGHT</th>
          </tr>
        </thead>
        <tbody>
          {view.map((row) => {
            const number = numberOf.get(row.key) ?? 0;
            const checked = checkedKeys.has(row.key);
            const error = rowErrors.get(row.key);
            return (
              <RowView
                key={row.key}
                row={row}
                number={number}
                checked={checked}
                error={error}
                locations={locations}
                readOnly={readOnly}
                weightDecimals={nf.weightInputDecimals}
                priceText={`${formatUnitPrice(row.stockPrice, nf.pricePlaces)} ${row.currency}`.trim()}
                weightText={nf.weight(row.onHandWeightCt)}
                onToggleCheck={onToggleCheck}
                onRemove={onRemove}
                onLocation={onLocation}
                onPcs={onPcs}
                onWeight={onWeight}
              />
            );
          })}
          {Array.from({ length: empties }, (_, offset) => {
            const number = rows.length + offset + 1;
            return (
              <tr key={`empty-${number}`} className={TABLE_ROW} data-empty-row="">
                <td className="px-3 py-4">
                  <input type="checkbox" aria-label={`Select empty row ${number}`} className="size-4 accent-[#0E5E63]" disabled checked={false} readOnly />
                </td>
                <td className="px-1 py-3.5">
                  <span aria-hidden className="text-[#E74C50]"><CircleMinus className="size-5" /></span>
                </td>
                <td className="px-2 py-4 text-[#6B7480]">{number}</td>
                <td colSpan={6} className="p-0">
                  {readOnly ? (
                    <span className="block h-14" />
                  ) : (
                    <button type="button" onClick={onPickEmpty} className="block h-14 w-full px-3 text-left text-sm text-[#95A0A9]">
                      {EMPTY_ROW_TEXT}
                    </button>
                  )}
                </td>
                <td colSpan={3} className={DIVIDER} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RowView({
  row,
  number,
  checked,
  error,
  locations,
  readOnly,
  weightDecimals,
  priceText,
  weightText,
  onToggleCheck,
  onRemove,
  onLocation,
  onPcs,
  onWeight,
}: {
  row: TransferRow;
  number: number;
  checked: boolean;
  error: string | undefined;
  locations: readonly string[];
  readOnly: boolean;
  weightDecimals: number;
  priceText: string;
  weightText: string;
} & Pick<TransferTableProps, "onToggleCheck" | "onRemove" | "onLocation" | "onPcs" | "onWeight">) {
  return (
    <>
      <tr className={TABLE_ROW} {...rowState({ checked, error: Boolean(error) })} aria-selected={checked} data-row-key={row.key}>
        <td className="px-3 py-4">
          <input type="checkbox" aria-label={`Select row ${number}`} className="size-4 accent-[#0E5E63]" checked={checked} disabled={readOnly} onChange={() => onToggleCheck(row.key)} />
        </td>
        <td className="px-1 py-3.5">
          <button type="button" aria-label={`Remove row ${number}`} disabled={readOnly} onClick={() => onRemove(row.key)} className="text-[#E74C50] disabled:text-[#F3A5A7]">
            <CircleMinus className="size-5" />
          </button>
        </td>
        <td className="px-2 py-4 text-[#6B7480]">{number}</td>
        <td className="px-3 py-4">
          <div className="font-medium">{row.attrs.stoneCode || "—"}</div>
          {row.stockId && <div className="mt-1 text-xs text-[#6B7480]">Stock ID {row.stockId}{row.newStockId ? ` → ${row.newStockId}` : ""}</div>}
        </td>
        <td className="px-3 py-4">{row.fromLocation || "—"}</td>
        <td className="px-3 py-4">{row.attrs.lot || "—"}</td>
        <td className="px-3 py-4 text-right font-medium tabular-nums">{row.onHandPcs}</td>
        <td className="px-3 py-4 text-right font-medium tabular-nums">{weightText}</td>
        <td className="px-3 py-4 text-right tabular-nums">
          {priceText}
          <div className="mt-1 text-xs text-[#6B7480]">{unitText(row.priceUnit)}</div>
        </td>
        <td className={cx("px-6 py-3", DIVIDER)}>
          <SelectMenu
            compact
            value={row.toLocation}
            placeholder="Select Location"
            options={newLocationOptions(locations, row.fromLocation, row.toLocation)}
            disabled={readOnly}
            invalid={error !== undefined && !row.toLocation ? true : undefined}
            onChange={(location) => onLocation(row.key, location)}
          />
        </td>
        <td className="px-3 py-3">
          <NumberInput compact decimals={0} placeholder="0" aria-label={`Pcs to move, row ${number}`} value={row.pcs} readOnly={readOnly} onChange={(event) => onPcs(row.key, event.target.value)} />
        </td>
        <td className="px-3 py-3">
          <NumberInput compact decimals={weightDecimals} placeholder="0" aria-label={`Weight to move, row ${number}`} value={row.weightCt} readOnly={readOnly} onChange={(event) => onWeight(row.key, event.target.value)} />
        </td>
      </tr>
      {error && (
        <tr className="bg-white">
          <td colSpan={COLUMNS} className="px-12 pb-2 shadow-[inset_3px_0_0_#D9535C] text-xs text-[#E5484D]" role="alert">
            Row {number}: {error}
          </td>
        </tr>
      )}
    </>
  );
}
