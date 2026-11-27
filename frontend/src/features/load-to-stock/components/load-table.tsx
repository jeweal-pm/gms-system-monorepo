"use client";

import { CircleMinus, Merge, Minus, MoreHorizontal, Split } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";
import { useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import { cx, NumberInput, SelectMenu, type Option } from "@/features/quotation/components/ui";
import { toFixed } from "@/features/quotation/lib/decimal";
import { loadTotals, refsById, rowCost, splitGroups, unitLabel, UNIT_COST_PLACES, type LoadFormValues, type LoadRowValues } from "../form";
import type { LoadMode, PurchaseLineRef } from "../types";
import { CerCell, GradeCell, HeaderCell, StoneCell, StoneCodeCell } from "./cells";
import { SplitGroupRow } from "./split-group-row";
import { rowState, TABLE_HEAD, TABLE_ROW } from "@/features/trade-document/table-row";

export const EMPTY_LOAD_TEXT = "No load rows yet · click here or use From Purchase to pick PU lines";

/** Location choices (ADR-0053): active names, plus the row's stored name when it is no longer active (FE-LS-017). */
export function rowLocationOptions(names: readonly string[], current: string): Option[] {
  const options = names.map((name) => ({ value: name, label: name }));
  if (current && !names.some((name) => name.toLowerCase() === current.toLowerCase())) options.unshift({ value: current, label: current });
  return options;
}

/** "From PU2610-031" / Merge "From PU2610-031 + PU2610-038" (distinct PU numbers, pick order). */
export function fromText(row: Pick<LoadRowValues, "sources">, refs: ReadonlyMap<string, PurchaseLineRef>): string {
  const numbers = [...new Set(row.sources.map((id) => refs.get(id)?.purchase.docNo).filter((value): value is string => Boolean(value)))];
  return numbers.length ? `From ${numbers.join(" + ")}` : "";
}

const MODE_CHIPS: Record<LoadMode, { label: string; hint: string; icon: ReactNode; tone: string }> = {
  NONE: { label: "None", hint: "as it is, one load row per PU line", icon: <Minus className="size-3" />, tone: "bg-[#EEF0F2] text-[#637381]" },
  SPLIT: { label: "Split", hint: "one load row per PU line", icon: <Split className="size-3 rotate-90" />, tone: "bg-[#E8EEFB] text-[#3A4FA0]" },
  MERGE: { label: "Merge", hint: "all picked PU lines into one load", icon: <Merge className="size-3 rotate-180" />, tone: "bg-[#E3F1F0] text-[#0E5E63]" },
};

/** The document's mode beside the Load title (owner design 2026-11-24): icon, name and what it does. */
export function LoadModeChip({ mode }: { mode: LoadMode | "" }) {
  if (!mode) return null;
  const chip = MODE_CHIPS[mode];
  return (
    <span data-load-mode={mode} className="inline-flex items-center gap-1.5 rounded-full border border-[#E3E6EA] bg-white py-0.5 pr-3 pl-1 text-xs text-[#6B7480]">
      <span aria-hidden className={cx("flex size-5 items-center justify-center rounded-full", chip.tone)}>{chip.icon}</span>
      <span className="font-medium text-[#1C252E]">{chip.label}</span>
      <span>· {chip.hint}</span>
    </span>
  );
}

export type LoadTableProps = {
  values: Pick<LoadFormValues, "mode" | "rows" | "sources">;
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
  onChange: (index: number, patch: Partial<LoadRowValues>) => void;
  onSplit: (purchaseLineId: string) => void;
  onRemoveGroup: (purchaseLineId: string) => void;
  onPickEmpty: () => void;
};

const COLUMNS = 13;

/**
 * L-03…L-08 Load table (FE-LS-006…008, sources 03–05). None: one row per PU line, Pcs / Weight editable ≤ remaining.
 * Split: group rows S-01 with their children. Merge: the one merged row, Pcs / Weight locked. Location is a required
 * select that starts empty (FE-LS-017), its list portalled so the table's scroll box never clips the last row's menu,
 * and no Parcel caption (owner 2026-11-24); Price / Amount are read-only costs in the company currency (DV-02); Totals are
 * computed (DV-05). No empty rows (Q-LS-15): the empty table opens the picker.
 */
export function LoadTable(props: LoadTableProps) {
  const { values, currency, readOnly, checkedKeys, onToggleAll, onPickEmpty } = props;
  const nf = useNumberFormat();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const totals = loadTotals(values);
  const allChecked = values.rows.length > 0 && values.rows.every((row) => checkedKeys.has(row.key));
  const refs = refsById(values.sources);

  let body: ReactNode;
  if (values.rows.length === 0) {
    body = (
      <tr>
        <td colSpan={COLUMNS} className="p-0">
          <button type="button" disabled={readOnly} onClick={onPickEmpty} className="w-full py-12 text-center text-sm text-[#6B7480] enabled:hover:bg-[#FAFBFB] disabled:cursor-default">
            {readOnly ? "No load rows." : EMPTY_LOAD_TEXT}
          </button>
        </td>
      </tr>
    );
  } else if (values.mode === "SPLIT") {
    body = splitGroups(values).map((group, groupIndex) => {
      const id = group.ref.purchaseLineId;
      const closed = collapsed.has(id);
      return (
        <Fragment key={id}>
          <SplitGroupRow
            group={group}
            number={groupIndex + 1}
            collapsed={closed}
            readOnly={readOnly}
            currency={currency}
            columns={COLUMNS}
            onToggle={() =>
              setCollapsed((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            onSplit={() => props.onSplit(id)}
            onRemove={() => props.onRemoveGroup(id)}
          />
          {!closed && group.rows.map(({ row, index }, childIndex) => <LoadRow key={row.key} {...props} row={row} index={index} number={childIndex + 1} refs={refs} />)}
        </Fragment>
      );
    });
  } else {
    body = values.rows.map((row, index) => <LoadRow key={row.key} {...props} row={row} index={index} number={index + 1} refs={refs} />);
  }

  return (
    <div className="overflow-x-auto rounded-lg">
      <table className="w-full min-w-[1180px] border-collapse text-sm text-[#1C252E]" aria-label="Load rows">
        <thead className={cx("text-left", TABLE_HEAD)}>
          <tr>
            <th scope="col" className="w-10 px-3 py-3">
              <input type="checkbox" aria-label="Select all load rows" className="size-4 accent-[#0E5E63]" checked={allChecked} disabled={readOnly || values.rows.length === 0} onChange={() => onToggleAll(!allChecked)} />
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

function LoadRow({ row, index, number, refs, values, currency, locations, readOnly, selectedKey, checkedKeys, rowErrors, onSelect, onOpenPanel, onToggleCheck, onRemove, onChange }: LoadTableProps & {
  row: LoadRowValues;
  index: number;
  number: number;
  refs: ReadonlyMap<string, PurchaseLineRef>;
}) {
  const nf = useNumberFormat();
  const merge = values.mode === "MERGE";
  const cost = rowCost(row, values.mode, refs);
  const error = rowErrors.get(index);
  const locked = readOnly || merge;
  return (
    <>
      <tr
        onClick={() => onSelect(index)}
        aria-selected={selectedKey === row.key}
        className={TABLE_ROW}
        {...rowState({ active: selectedKey === row.key, checked: checkedKeys.has(row.key), error: Boolean(error) })}
      >
        <td className="px-3 py-4" onClick={(event) => event.stopPropagation()}>
          <input type="checkbox" aria-label={`Select load row ${index + 1}`} className="size-4 accent-[#0E5E63]" checked={checkedKeys.has(row.key)} disabled={readOnly} onChange={() => onToggleCheck(row.key)} />
        </td>
        <td className="px-1 py-3.5" onClick={(event) => event.stopPropagation()}>
          <button type="button" aria-label={`Remove load row ${index + 1}`} disabled={readOnly} onClick={() => onRemove(row.key)} className="text-[#E74C50] disabled:text-[#F3A5A7]">
            <CircleMinus className="size-5" />
          </button>
        </td>
        <td className="px-2 py-4 text-[#6B7480]">{number}</td>
        <td className="px-3 py-4">
          <StoneCodeCell code={row.attrs.stoneCode} label={row.stockId ? "Stock ID" : "Stock ID on save"} stockId={row.stockId} lot={row.attrs.lot} note={fromText(row, refs)} />
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
          <NumberInput compact decimals={0} aria-label={`Pcs of load row ${index + 1}`} value={row.pcs} readOnly={locked} onChange={(event) => onChange(index, { pcs: event.target.value })} />
        </td>
        <td className="px-3 py-3 text-right" onClick={(event) => event.stopPropagation()}>
          <NumberInput compact decimals={nf.weightInputDecimals} aria-label={`Weight of load row ${index + 1}`} value={row.weightCt} readOnly={locked} onChange={(event) => onChange(index, { weightCt: event.target.value })} />
        </td>
        <td className="px-3 py-4 text-right tabular-nums">
          {nf.money(toFixed(cost.unitCost, UNIT_COST_PLACES))} {currency}
          <div className="mt-1 text-xs text-[#6B7480]">{merge ? `average ${unitLabel(cost.unit)}` : unitLabel(cost.unit)}</div>
        </td>
        <td className="px-3 py-4 text-right font-medium tabular-nums">{nf.money(toFixed(cost.cost, 2))}</td>
        <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
          <button type="button" aria-label={`More details of load row ${index + 1}`} onClick={() => onOpenPanel(index)} className="rounded p-1 hover:bg-[#F3F4F5]">
            <MoreHorizontal className="size-5" />
          </button>
        </td>
      </tr>
      {error && (
        <tr className="bg-white">
          <td colSpan={COLUMNS} className="px-12 pb-2 shadow-[inset_3px_0_0_#D9535C] text-xs text-[#E5484D]" role="alert">
            Row {index + 1}: {error}
          </td>
        </tr>
      )}
    </>
  );
}
