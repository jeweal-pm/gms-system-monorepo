"use client";

import { ChevronDown, ChevronRight, CircleMinus, Merge, MoreHorizontal, Plus, Split, Trash2, X } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";
import { useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import { Button, cx, IconButton, NumberInput, SelectMenu } from "@/features/quotation/components/ui";
import { toFixed } from "@/features/quotation/lib/decimal";
import { CerCell, GradeCell, HeaderCell, StoneCell, StoneCodeCell } from "@/features/load-to-stock/components/cells";
import { rowLocationOptions } from "@/features/load-to-stock/components/load-table";
import {
  balanceText,
  fromText,
  groupBalance,
  resultTotals,
  rowCost,
  splitGroups,
  stoneLine,
  unitLabel,
  UNIT_COST_PLACES,
  type MsFormValues,
  type MsRowValues,
  type SplitGroup,
} from "../form";
import type { MsMode } from "../types";

export const EMPTY_RESULT_TEXT = "Use From Stock to pick stocks";
export const STOCK_ID_ON_SAVE = "Stock ID on save";

const MODE_CHIPS: Record<MsMode, { label: string; hint: string; icon: ReactNode; tone: string }> = {
  SPLIT: { label: "Split", hint: "one stock into several", icon: <Split className="size-3 rotate-90" />, tone: "bg-[#E8EEFB] text-[#3A4FA0]" },
  MERGE: { label: "Merge", hint: "stocks into one", icon: <Merge className="size-3 rotate-180" />, tone: "bg-[#E3F1F0] text-[#0E5E63]" },
};

/** R-01 mode chip beside the Result title. */
export function MergeSplitModeChip({ mode }: { mode: MsMode | "" }) {
  if (!mode) return null;
  const chip = MODE_CHIPS[mode];
  return (
    <span data-ms-mode={mode} className="inline-flex items-center gap-1.5 rounded-full border border-[#E3E6EA] bg-white py-0.5 pr-3 pl-1 text-xs text-[#6B7480]">
      <span aria-hidden className={cx("flex size-5 items-center justify-center rounded-full", chip.tone)}>{chip.icon}</span>
      <span className="font-medium text-[#1C252E]">{chip.label}</span>
      <span>· {chip.hint}</span>
    </span>
  );
}

const CHIP_TONE = { balanced: "bg-[#E7F7EE] text-[#15803D]", left: "bg-[#FFF4E0] text-[#B45309]", over: "bg-[#FDECEC] text-[#B42318]" } as const;

/** R-03 balance chip: Balanced / Left … / Over by …. */
export function BalanceChip({ group, rows }: { group: SplitGroup; rows: readonly MsRowValues[] }) {
  const balance = groupBalance(rows, group.source);
  return (
    <span data-balance={balance.state} className={cx("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", CHIP_TONE[balance.state])}>
      {balanceText(balance)}
    </span>
  );
}

/** "→ No location yet" / "→ 1 location" / "→ 3 locations". */
export function groupLocationText(group: SplitGroup): string {
  const count = new Set(group.rows.map(({ row }) => row.location.trim().toLowerCase()).filter(Boolean)).size;
  if (count === 0) return "→ No location yet";
  return `→ ${count} location${count === 1 ? "" : "s"}`;
}

export const groupStocksText = (group: SplitGroup) => `${group.rows.length} new stock${group.rows.length === 1 ? "" : "s"}`;

/** R-03 Split group row: one per source stock, "+ Split" adds a child with what is left, trash removes the source. */
export function MergeSplitGroupRow({ group, rows, number, collapsed, readOnly, columns, onToggle, onSplit, onRemove }: {
  group: SplitGroup;
  rows: readonly MsRowValues[];
  number: number;
  collapsed: boolean;
  readOnly: boolean;
  columns: number;
  onToggle: () => void;
  onSplit: () => void;
  onRemove: () => void;
}) {
  const nf = useNumberFormat();
  const { source } = group;
  const { attrs } = source;
  const sub = [attrs.color, attrs.clarity, attrs.cutting, attrs.quality, source.lot && `Lot ${source.lot}`, [attrs.cerType, attrs.cerNo].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
  return (
    <tr className="border-b border-[#EEF0F2] bg-[#F9F9F9] align-top" data-split-group={source.stockId}>
      <td colSpan={columns} className="px-3 py-3">
        <div className="flex flex-wrap items-start gap-3">
          <IconButton label={collapsed ? "Expand group" : "Collapse group"} aria-expanded={!collapsed} onClick={onToggle} className="size-7">
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
          </IconButton>
          <span className="pt-1 font-medium text-[#0E5E63]">{number}</span>
          <div className="min-w-[220px] flex-1">
            <div className="font-medium">{source.stockId} · {stoneLine(attrs)}</div>
            <div className="mt-1 text-xs text-[#6B7480]">{sub}</div>
          </div>
          <div className="min-w-[140px] text-sm">
            <div>{groupLocationText(group)}</div>
            <div className="mt-1 text-xs text-[#6B7480]">{groupStocksText(group)}</div>
          </div>
          <div className="min-w-[200px] text-right">
            <div className="font-medium">{source.availPcs} pcs · {nf.weight(source.availWeightCt)} cts</div>
            <div className="mt-1"><BalanceChip group={group} rows={rows} /></div>
          </div>
          {!readOnly && (
            <div className="flex items-center gap-1">
              <Button size="sm" onClick={onSplit} aria-label={`Split ${source.stockId}`}>
                <Plus className="size-4" /> Split
              </Button>
              <IconButton label={`Remove ${source.stockId}`} onClick={onRemove} className="text-[#EB8487]">
                <Trash2 className="size-4" />
              </IconButton>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

export type ResultTableProps = {
  values: Pick<MsFormValues, "mode" | "rows" | "sources">;
  currency: string;
  locations: readonly string[];
  readOnly: boolean;
  selectedKey: string | null;
  checkedKeys: ReadonlySet<string>;
  rowErrors: ReadonlyMap<number, string>;
  onSelect: (index: number) => void;
  onOpenPanel: (index: number) => void;
  onToggleCheck: (key: string) => void;
  onToggleAll: (checked: boolean) => void;
  onRemove: (key: string) => void;
  onChange: (index: number, patch: Partial<MsRowValues>) => void;
  onSplit: (sourceKey: string) => void;
  onRemoveSource: (sourceKey: string) => void;
  onPickEmpty: () => void;
};

const COLUMNS = 13;

/**
 * R-03…R-06 Result table (FE-MS-005). Split: group rows with their children (Pcs / Weight editable, ⊖ remove). Merge:
 * the one result row (Pcs / Weight locked) with its source chips (✕ removes a source). Location is a required portal
 * select; Price / Amount are read-only costs (C-01/C-02); Totals are computed.
 */
export function MergeSplitResultTable(props: ResultTableProps) {
  const { values, readOnly, checkedKeys, onToggleAll, onPickEmpty, onRemoveSource } = props;
  const nf = useNumberFormat();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const totals = resultTotals(values);
  const split = values.mode === "SPLIT";
  const allChecked = split && values.rows.length > 0 && values.rows.every((row) => checkedKeys.has(row.key));

  let body: ReactNode;
  if (values.rows.length === 0) {
    body = (
      <tr>
        <td colSpan={COLUMNS} className="p-0">
          <button type="button" disabled={readOnly} onClick={onPickEmpty} className="w-full py-12 text-center text-sm text-[#6B7480] enabled:hover:bg-[#FAFBFB] disabled:cursor-default">
            {readOnly ? "No result rows." : EMPTY_RESULT_TEXT}
          </button>
        </td>
      </tr>
    );
  } else if (split) {
    body = splitGroups(values).map((group, groupIndex) => {
      const key = group.source.key;
      const closed = collapsed.has(key);
      return (
        <Fragment key={key}>
          <MergeSplitGroupRow
            group={group}
            rows={values.rows}
            number={groupIndex + 1}
            collapsed={closed}
            readOnly={readOnly}
            columns={COLUMNS}
            onToggle={() =>
              setCollapsed((prev) => {
                const next = new Set(prev);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
              })
            }
            onSplit={() => props.onSplit(key)}
            onRemove={() => onRemoveSource(key)}
          />
          {!closed && group.rows.map(({ row, index }, childIndex) => <ResultRow key={row.key} {...props} row={row} index={index} number={childIndex + 1} />)}
        </Fragment>
      );
    });
  } else {
    body = (
      <>
        <tr className="border-b border-[#EEF0F2] bg-[#F9F9F9]">
          <td colSpan={COLUMNS} className="px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#6B7480]">
              <span>Merging {values.sources.length} stocks:</span>
              {values.sources.map((source) => (
                <span key={source.key} className="inline-flex items-center gap-1 rounded-full border border-[#E3E6EA] bg-white px-2 py-0.5 font-mono text-[#1C252E]">
                  {source.stockId}
                  {!readOnly && (
                    <button type="button" aria-label={`Remove ${source.stockId} from the merge`} onClick={() => onRemoveSource(source.key)} className="text-[#E74C50]">
                      <X className="size-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          </td>
        </tr>
        {values.rows.map((row, index) => <ResultRow key={row.key} {...props} row={row} index={index} number={index + 1} />)}
      </>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg">
      <table className="w-full min-w-[1180px] border-collapse text-sm text-[#1C252E]" aria-label="Result rows">
        <thead className="bg-[#F6F7F8] text-left">
          <tr>
            <th scope="col" className="w-10 px-3 py-3">
              <input type="checkbox" aria-label="Select all result rows" className="size-4 accent-[#0E5E63]" checked={allChecked} disabled={readOnly || !split || values.rows.length === 0} onChange={() => onToggleAll(!allChecked)} />
            </th>
            <th scope="col" className="w-8 px-1 py-3"><span className="sr-only">Remove</span></th>
            <th scope="col" className="w-8 px-2 py-3 font-normal text-[#6B7480]">#</th>
            <HeaderCell title="Stone Code" sub="Stock ID · Lot" />
            <HeaderCell title="Location" />
            <HeaderCell title="Stone" sub="Shape · Size" />
            <HeaderCell title="Color · Clarity" sub="Cutting · Quality" />
            <HeaderCell title="Cer Type" sub="Cer No." />
            <HeaderCell title="Pcs" right className="w-[90px]" />
            <HeaderCell title="Weight (ct)" right className="w-[120px]" />
            <HeaderCell title="Price" sub="Unit" right />
            <HeaderCell title="Amount" right />
            <th scope="col" className="w-14 px-3 py-3 font-medium">More</th>
          </tr>
        </thead>
        <tbody>{body}</tbody>
        {values.rows.length > 0 && (
          <tfoot>
            <tr className="bg-[#F6F7F8] font-medium">
              <td colSpan={8} className="px-3 py-3">Totals</td>
              <td className="px-3 py-3 text-right tabular-nums">{totals.pcs}</td>
              <td className="px-3 py-3 text-right tabular-nums">{nf.weight(toFixed(totals.weightCt, 3))}</td>
              <td />
              <td className="px-3 py-3 text-right tabular-nums">{nf.money(toFixed(totals.cost, 2))}</td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function ResultRow({ row, index, number, values, currency, locations, readOnly, selectedKey, checkedKeys, rowErrors, onSelect, onOpenPanel, onToggleCheck, onRemove, onChange }: ResultTableProps & {
  row: MsRowValues;
  index: number;
  number: number;
}) {
  const nf = useNumberFormat();
  const merge = values.mode === "MERGE";
  const cost = rowCost(values, index);
  const error = rowErrors.get(index);
  const locked = readOnly || merge;
  return (
    <>
      <tr
        onClick={() => onSelect(index)}
        aria-selected={selectedKey === row.key}
        className={cx("border-b border-[#EEF0F2] align-top", selectedKey === row.key ? "bg-[#F2F8F8]" : "hover:bg-[#FAFBFB]", error && "bg-[#FFF6F6]")}
      >
        <td className="px-3 py-4" onClick={(event) => event.stopPropagation()}>
          {!merge && <input type="checkbox" aria-label={`Select result row ${index + 1}`} className="size-4 accent-[#0E5E63]" checked={checkedKeys.has(row.key)} disabled={readOnly} onChange={() => onToggleCheck(row.key)} />}
        </td>
        <td className="px-1 py-3.5" onClick={(event) => event.stopPropagation()}>
          {!merge && (
            <button type="button" aria-label={`Remove result row ${index + 1}`} disabled={readOnly} onClick={() => onRemove(row.key)} className="text-[#E74C50] disabled:text-[#F3A5A7]">
              <CircleMinus className="size-5" />
            </button>
          )}
        </td>
        <td className="px-2 py-4 text-[#6B7480]">{number}</td>
        <td className="px-3 py-4">
          <StoneCodeCell code={row.attrs.stoneCode} label={row.stockId ? "Stock ID" : STOCK_ID_ON_SAVE} stockId={row.stockId} lot={row.lot} note={fromText(row, values) || undefined} />
        </td>
        <td className="min-w-[170px] px-3 py-3" onClick={(event) => event.stopPropagation()}>
          <SelectMenu
            compact
            portal
            value={row.location}
            placeholder="Select location"
            options={rowLocationOptions(locations, row.location)}
            disabled={readOnly}
            invalid={error !== undefined && !row.location ? true : undefined}
            onChange={(location) => onChange(index, { location })}
          />
        </td>
        <td className="px-3 py-4"><StoneCell attrs={row.attrs} /></td>
        <td className="px-3 py-4"><GradeCell attrs={row.attrs} /></td>
        <td className="px-3 py-4"><CerCell attrs={row.attrs} /></td>
        <td className="px-3 py-3 text-right" onClick={(event) => event.stopPropagation()}>
          <NumberInput compact decimals={0} aria-label={`Pcs of result row ${index + 1}`} value={row.pcs} readOnly={locked} onChange={(event) => onChange(index, { pcs: event.target.value })} />
        </td>
        <td className="px-3 py-3 text-right" onClick={(event) => event.stopPropagation()}>
          <NumberInput compact decimals={nf.weightInputDecimals} aria-label={`Weight of result row ${index + 1}`} value={row.weightCt} readOnly={locked} onChange={(event) => onChange(index, { weightCt: event.target.value })} />
        </td>
        <td className="px-3 py-4 text-right tabular-nums">
          {nf.money(toFixed(cost.unitCost, UNIT_COST_PLACES))} {currency}
          <div className="mt-1 text-xs text-[#6B7480]">{merge ? `average of ${values.sources.length} stocks · ${unitLabel(cost.unit)}` : unitLabel(cost.unit)}</div>
        </td>
        <td className="px-3 py-4 text-right font-medium tabular-nums">{nf.money(toFixed(cost.cost, 2))}</td>
        <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
          <button type="button" aria-label={`More details of result row ${index + 1}`} onClick={() => onOpenPanel(index)} className="rounded p-1 hover:bg-[#F3F4F5]">
            <MoreHorizontal className="size-5" />
          </button>
        </td>
      </tr>
      {error && (
        <tr className="bg-[#FFF6F6]">
          <td colSpan={COLUMNS} className="px-12 pb-2 text-xs text-[#E5484D]" role="alert">
            Row {index + 1}: {error}
          </td>
        </tr>
      )}
    </>
  );
}
