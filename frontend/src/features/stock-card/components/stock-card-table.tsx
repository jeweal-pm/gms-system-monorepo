"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { cx, focusRing } from "@/components/ui/button";
import { useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import {
  pickerCell,
  pickerCheckbox,
  pickerCheckCell,
  pickerGroupHover,
  pickerGroupTone,
  pickerHead,
  pickerIndexCell,
  pickerRowClass,
  pickerSub,
  PickerGroupTh,
} from "@/features/trade-document/picker-ui";
import { cardName, detailLine, formatPcs, formatWeight, rowNumber, stockCardHref, vendorLine, type ListSortKey, type SortDir } from "../model";
import type { CardRow } from "../types";
import { isShown, type ViewPrefs } from "../view-prefs";
import { GroupSortTh, PlainTh, SortTh } from "./parts";

type TableProps = {
  rows: readonly CardRow[];
  page: number;
  pageSize: number;
  prefs: ViewPrefs;
  sort: { key: ListSortKey; dir: SortDir };
  onSort: (key: ListSortKey) => void;
  selected: ReadonlySet<string>;
  onToggle: (row: CardRow) => void;
  /** Opens the card (route push); the stone code is also a real link, so Enter on it works without this. */
  onOpen: (cardKey: string) => void;
};

const balanceTone = pickerGroupTone.purple;
const numCell = "px-3 py-2 text-right align-middle tabular-nums whitespace-nowrap";

/** A press on a control or link inside the row never opens the card twice. */
const fromControl = (event: MouseEvent) => (event.target as HTMLElement).closest("a, button, input, label") !== null;

/**
 * The list table (S5 / S2): 56 px rows on the picker table kit, a checkbox for Print, STONE CODE, LOCATION, LOT and the
 * purple BALANCE group (Pcs, Cts). The whole row opens the card; the checkbox does not.
 */
export function StockCardTable({ rows, page, pageSize, prefs, sort, onSort, selected, onToggle, onOpen }: TableProps) {
  const nf = useNumberFormat();
  const showLocation = isShown(prefs, "location");
  const showLot = isShown(prefs, "lot");
  return (
    <div className="overflow-x-auto rounded-gms-md border border-gms-border">
      <table className="w-full min-w-[1100px] border-collapse text-sm text-gms-text-heading">
        <caption className="sr-only">Stock card: balance by stone code, location and lot</caption>
        <thead className={pickerHead}>
          <tr>
            <PlainTh rowSpan={2} className="w-14">
              <span className="sr-only">Select</span>
            </PlainTh>
            <PlainTh rowSpan={2} className="w-8 text-right">
              #
            </PlainTh>
            <SortTh label="STONE CODE" sortKey="stoneCode" sort={sort} onSort={onSort} rowSpan={2} />
            {showLocation && <SortTh label="LOCATION" sortKey="location" sort={sort} onSort={onSort} rowSpan={2} />}
            {showLot && <SortTh label="LOT" sortKey="lot" sort={sort} onSort={onSort} rowSpan={2} />}
            <PickerGroupTh title="Balance" span={2} tone="purple" />
          </tr>
          <tr>
            <GroupSortTh label="Pcs" tone="purple" sortKey="balancePcs" sort={sort} onSort={onSort} />
            <GroupSortTh label="Cts" tone="purple" sortKey="balanceWeightCt" sort={sort} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const checked = selected.has(row.cardKey);
            const name = cardName(row);
            const details = isShown(prefs, "details") ? detailLine(row) : "";
            const vendor = isShown(prefs, "vendor") ? vendorLine(row.vendorName, row.vendorCount) : "";
            return (
              <tr
                key={row.cardKey}
                data-state={checked ? "selected" : undefined}
                onClick={(event) => {
                  if (!fromControl(event)) onOpen(row.cardKey);
                }}
                className={cx(pickerRowClass(checked), "group/row h-14")}
              >
                <td className={pickerCheckCell}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${name}`}
                    checked={checked}
                    onChange={() => onToggle(row)}
                    className={cx(pickerCheckbox, "cursor-pointer", focusRing)}
                  />
                </td>
                <td className={cx(pickerIndexCell, "pr-3 text-right")}>{rowNumber(page, pageSize, index)}</td>
                <td className={pickerCell}>
                  <Link href={stockCardHref(row.cardKey)} className={cx("font-medium hover:underline", focusRing)}>
                    {name}
                  </Link>
                  {details && <div className={pickerSub}>{details}</div>}
                </td>
                {showLocation && (
                  <td className={pickerCell}>
                    <span className="font-medium">{row.location || "—"}</span>
                  </td>
                )}
                {showLot && (
                  <td className={pickerCell}>
                    <span>{row.lot || "—"}</span>
                    {vendor && <div className={pickerSub}>{vendor}</div>}
                  </td>
                )}
                <td className={cx(numCell, balanceTone.cell, pickerGroupHover.purple)}>{formatPcs(row.balancePcs)}</td>
                <td className={cx(numCell, balanceTone.cell, pickerGroupHover.purple, "font-semibold")}>{formatWeight(row.balanceWeightCt, nf.weightPlaces)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

