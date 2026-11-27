"use client";

import { ChevronsUpDown, CircleMinus, MessageSquare } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import { cx, TextInput } from "@/features/quotation/components/ui";
import { diff, nextStoneSort, sanitize, sortByStoneCode, type AdjustmentLine, type StoneSort } from "../form";

export const EMPTY_ROW_TEXT = "Empty row · click to pick from stock";
export type PhysicalField = "physicalPcs" | "physicalWeightCt" | "physicalPrice" | "remark";

/** Row backgrounds (owner image 03, same as the transfer grid): default white, hover light grey, selected light teal. */
export const ROW_TONE = { base: "bg-white hover:bg-[#F6F7F8]", selected: "bg-[#E6F2F2]", error: "bg-[#FFF6F6]" } as const;

/** Group colors (owner images 01–03): strong header, lighter sub-header, light body. */
export const GROUP_TONE = {
  stock: { head: "bg-[#A8CFCF]", sub: "bg-[#D3E3E2]", body: "bg-[#E1EBEA]" },
  physical: { head: "bg-[#F2A7AA]", sub: "bg-[#F3D5D6]", body: "bg-[#FBE6E6]" },
  diff: { head: "bg-[#B5D3FA]", sub: "bg-[#DCE6F6]", body: "bg-[#EDF2FB]" },
} as const;
const GROUPS = ["stock", "physical", "diff"] as const;
const GROUP_LABEL = { stock: "Stock", physical: "Physical", diff: "Diff" } as const;
const SUBS = ["Pcs", "Cts", "Price"] as const;
const COLUMNS = 14;
const cellInput = "h-10 rounded-lg border-[#E3E6EA] bg-white px-3 text-sm";

export type AdjustmentTableProps = {
  lines: readonly AdjustmentLine[];
  editable: boolean;
  selected: ReadonlySet<string>;
  rowErrors?: Readonly<Record<string, string>>;
  onSelect: (key: string, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  onChange: (key: string, field: PhysicalField, value: string) => void;
  onRemove: (key: string) => void;
  onPick: () => void;
};

/**
 * Stock Adjustment grid (owner images 01–03, transfer-grid look): checkbox, ⊖, #, Stone Code (sortable), Stock /
 * Physical / Diff groups with Pcs / Cts / Price each (owner 2026-11-24: Price in all three) and REMARK. At least five
 * rows; empty rows open From Stock.
 */
export function AdjustmentTable({ lines, editable, selected, rowErrors = {}, onSelect, onSelectAll, onChange, onRemove, onPick }: AdjustmentTableProps) {
  const nf = useNumberFormat();
  const [sort, setSort] = useState<StoneSort>(null);
  const numberOf = new Map(lines.map((line, index) => [line.key, index + 1]));
  const view = sortByStoneCode(lines, sort);
  const empties = Math.max(0, 5 - lines.length);
  const allChecked = lines.length > 0 && lines.every((line) => selected.has(line.key));

  return (
    <div className="overflow-x-auto rounded-lg">
      <table className="w-full min-w-[1400px] border-collapse text-sm text-[#1C252E]" aria-label="Adjustment rows">
        <thead className="bg-[#E9EDEE] text-left">
          <tr>
            <th rowSpan={2} scope="col" className="w-10 px-3 py-3">
              <input type="checkbox" aria-label="Select all adjustment rows" className="size-4 accent-[#0E5E63]" checked={allChecked} disabled={!editable || lines.length === 0} onChange={() => onSelectAll(!allChecked)} />
            </th>
            <th rowSpan={2} scope="col" className="w-8 px-1 py-3"><span className="sr-only">Remove</span></th>
            <th rowSpan={2} scope="col" className="w-8 px-2 py-3 font-normal text-[#6B7480]">#</th>
            <th rowSpan={2} scope="col" aria-sort={sort === "asc" ? "ascending" : sort === "desc" ? "descending" : "none"} className="min-w-[300px] px-3 py-3 font-medium">
              <button type="button" onClick={() => setSort(nextStoneSort)} className="inline-flex items-center gap-2 text-left">
                <span className="leading-tight">
                  <span className="block">Stone Code</span>
                  <span className="block text-[11px] font-normal text-[#6B7480]">STOCK ID · LOT</span>
                </span>
                <ChevronsUpDown aria-hidden className={cx("size-3", sort ? "text-[#1C252E]" : "text-[#95A0A9]")} />
              </button>
            </th>
            {GROUPS.map((group) => (
              <th key={group} colSpan={3} scope="colgroup" className={cx("px-3 py-4 text-center font-medium", GROUP_TONE[group].head)}>
                {GROUP_LABEL[group]}
              </th>
            ))}
            <th rowSpan={2} scope="col" className="min-w-[220px] px-2 py-3 font-medium">REMARK</th>
          </tr>
          <tr>
            {GROUPS.flatMap((group) =>
              SUBS.map((label) => (
                <th key={`${group}-${label}`} scope="col" className={cx("px-2 py-3 text-right font-medium", GROUP_TONE[group].sub, label === "Price" ? "w-[130px]" : "w-[90px]")}>
                  {label}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {view.map((line) => (
            <AdjustmentRow
              key={line.key}
              line={line}
              number={numberOf.get(line.key) ?? 0}
              checked={selected.has(line.key)}
              error={rowErrors[line.key]}
              editable={editable}
              nf={nf}
              onSelect={onSelect}
              onChange={onChange}
              onRemove={onRemove}
            />
          ))}
          {Array.from({ length: empties }, (_, offset) => {
            const number = lines.length + offset + 1;
            return (
              <tr key={`empty-${number}`} className={cx("border-b border-[#EEF0F2]", ROW_TONE.base)} data-empty-row="">
                <td className="px-3 py-4">
                  <input type="checkbox" aria-label={`Select empty row ${number}`} className="size-4 accent-[#0E5E63]" disabled checked={false} readOnly />
                </td>
                <td className="px-1 py-3.5">
                  <span aria-hidden className="text-[#E74C50]"><CircleMinus className="size-5" /></span>
                </td>
                <td className="px-2 py-4 text-[#6B7480]">{number}</td>
                <td colSpan={COLUMNS - 3} className="p-0">
                  {editable ? (
                    <button type="button" onClick={onPick} className="block h-14 w-full px-3 text-left text-sm text-[#95A0A9]">
                      {EMPTY_ROW_TEXT}
                    </button>
                  ) : (
                    <span className="block h-14" />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const diffTone = (value: string | null) =>
  value === null || /^-?0(\.0+)?$/.test(value) ? "text-[#6B7480]" : value.startsWith("-") ? "text-[#E5484D]" : "text-[#15803D]";

function AdjustmentRow({
  line,
  number,
  checked,
  error,
  editable,
  nf,
  onSelect,
  onChange,
  onRemove,
}: {
  line: AdjustmentLine;
  number: number;
  checked: boolean;
  error: string | undefined;
  editable: boolean;
  nf: ReturnType<typeof useNumberFormat>;
} & Pick<AdjustmentTableProps, "onSelect" | "onChange" | "onRemove">) {
  const tone = error ? ROW_TONE.error : checked ? ROW_TONE.selected : ROW_TONE.base;
  const dPcs = diff(line.physicalPcs, line.stockPcs, 0);
  const dCts = diff(line.physicalWeightCt, line.stockWeightCt, 3);
  const dPrice = diff(line.physicalPrice, line.stockPrice, 2);
  const unit = line.priceUnit === "PER_PCS" ? "pcs" : "ct";
  const details = [line.attrs.stone, line.attrs.shape, line.attrs.size, line.attrs.location].filter(Boolean).join(" · ");
  const edit = (field: PhysicalField, decimals: number) => (event: ChangeEvent<HTMLInputElement>) =>
    onChange(line.key, field, field === "remark" ? event.target.value.slice(0, 250) : sanitize(event.target.value, decimals));
  const stock = cx("px-3 py-4 text-right tabular-nums", GROUP_TONE.stock.body);
  const physical = cx("px-1.5 py-3", GROUP_TONE.physical.body);
  const diffCell = (value: string | null, text: string) => <td className={cx("px-3 py-4 text-right tabular-nums", GROUP_TONE.diff.body, diffTone(value))}>{value === null ? "–" : text}</td>;

  return (
    <>
      <tr className={cx("border-b border-[#EEF0F2] align-top", tone)} aria-selected={checked} data-row-key={line.key}>
        <td className="px-3 py-4">
          <input type="checkbox" aria-label={`Select ${line.stockId}`} className="size-4 accent-[#0E5E63]" checked={checked} disabled={!editable} onChange={(event) => onSelect(line.key, event.target.checked)} />
        </td>
        <td className="px-1 py-3.5">
          <button type="button" aria-label={`Remove ${line.stockId}`} disabled={!editable} onClick={() => onRemove(line.key)} className="text-[#E74C50] disabled:text-[#F3A5A7]">
            <CircleMinus className="size-5" />
          </button>
        </td>
        <td className="px-2 py-4 text-[#6B7480]">{number}</td>
        <td className="px-3 py-4">
          <div className="font-medium">{line.attrs.stoneCode || line.stockId}</div>
          <div className="mt-1 text-xs text-[#6B7480]">{[line.attrs.lot, line.refDocNo].filter(Boolean).join(" · ") || line.stockId}</div>
          {details && (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-[#6B7480]">
              <MessageSquare aria-hidden className="size-3.5 shrink-0" />
              <span>{details}</span>
            </div>
          )}
        </td>
        <td className={stock}>{line.stockPcs}</td>
        <td className={stock}>{nf.weight(line.stockWeightCt)} cts</td>
        <td className={stock}>
          {nf.unitPrice(line.stockPrice)}
          <div className="mt-1 text-xs text-[#6B7480]">per {unit}</div>
        </td>
        <td className={physical}>
          <TextInput compact aria-label={`${line.stockId} Physical Pcs`} inputMode="numeric" autoComplete="off" placeholder="0" value={line.physicalPcs} readOnly={!editable} onChange={edit("physicalPcs", 0)} className={cx(cellInput, "text-right tabular-nums")} />
        </td>
        <td className={physical}>
          <TextInput compact aria-label={`${line.stockId} Physical Cts`} inputMode="decimal" autoComplete="off" placeholder="0" value={line.physicalWeightCt} readOnly={!editable} onChange={edit("physicalWeightCt", 3)} className={cx(cellInput, "text-right tabular-nums")} />
        </td>
        <td className={physical}>
          <TextInput compact aria-label={`${line.stockId} Physical Price`} inputMode="decimal" autoComplete="off" placeholder="0" value={line.physicalPrice} readOnly={!editable} onChange={edit("physicalPrice", 2)} className={cx(cellInput, "text-right tabular-nums")} />
        </td>
        {diffCell(dPcs, dPcs ?? "")}
        {diffCell(dCts, dCts === null ? "" : nf.weight(dCts))}
        {diffCell(dPrice, dPrice === null ? "" : nf.unitPrice(dPrice))}
        <td className="px-2 py-3">
          <TextInput compact aria-label={`${line.stockId} Remark`} maxLength={250} autoComplete="off" placeholder="Remark" value={line.remark} readOnly={!editable} onChange={edit("remark", 0)} className={cellInput} />
        </td>
      </tr>
      {error && (
        <tr className={ROW_TONE.error}>
          <td colSpan={COLUMNS} className="px-12 pb-2 text-xs text-[#E5484D]" role="alert">
            Row {number}: {error}
          </td>
        </tr>
      )}
    </>
  );
}
