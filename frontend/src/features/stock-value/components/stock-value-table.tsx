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
  pickerPurpleTicked,
  pickerRowClass,
  pickerSub,
  PickerGroupTh,
} from "@/features/trade-document/picker-ui";
import { GroupSortTh, PlainTh, SortTh } from "@/features/stock-card/components/parts";
import { cardName, detailLine, formatPcs, formatWeight, noCostNote, rowNumber, stockValueHref, unpricedNote, type ListSortKey, type SortDir } from "../model";
import type { ValueRow, ValueTotals } from "../types";
import { isShown, type ViewPrefs } from "../view-prefs";
import { AmountText, PriceBlock, ProfitLossText, UnitText } from "./value-cells";

type TableProps = {
  rows: readonly ValueRow[];
  /** Server totals of the whole filtered set (never the sum of the page rows). */
  totals: ValueTotals;
  page: number;
  pageSize: number;
  prefs: ViewPrefs;
  sort: { key: ListSortKey; dir: SortDir };
  onSort: (key: ListSortKey) => void;
  selected: ReadonlySet<string>;
  onToggle: (row: ValueRow) => void;
  /** Opens the card (route push); the stone code is also a real link, so Enter on it works without this. */
  onOpen: (cardKey: string) => void;
};

const balanceTone = pickerGroupTone.purple;
const numCell = "px-3 py-2 text-right align-top tabular-nums whitespace-nowrap";

/** A press on a control or link inside the row never opens the card twice. */
const fromControl = (event: MouseEvent) => (event.target as HTMLElement).closest("a, button, input, label") !== null;

/**
 * The list table (V1 / V4): 66 px rows on the picker table kit, a checkbox for Print, LOCATION, STONE CODE, LOT NO., the
 * purple BALANCE group (Pcs, Weight, Price with its source, Unit, Amount) and Profit/Loss. The whole row opens the card;
 * the checkbox does not. The Total row comes from the server.
 */
export function StockValueTable({ rows, totals, page, pageSize, prefs, sort, onSort, selected, onToggle, onOpen }: TableProps) {
  const nf = useNumberFormat();
  const showLocation = isShown(prefs, "location");
  const showLot = isShown(prefs, "lot");
  const showUnit = isShown(prefs, "unit");
  const showSource = isShown(prefs, "priceSource");
  const labelSpan = 3 + (showLocation ? 1 : 0) + (showLot ? 1 : 0);
  return (
    <div className="overflow-x-auto rounded-gms-md border border-gms-border">
      <table className="w-full min-w-[1200px] border-collapse text-sm text-gms-text-heading">
        <caption className="sr-only">Stock value: balance valued at the current price, by stone code, location and lot</caption>
        <thead className={pickerHead}>
          <tr>
            <PlainTh rowSpan={2} className="w-14">
              <span className="sr-only">Select</span>
            </PlainTh>
            <PlainTh rowSpan={2} className="w-8 text-right">
              #
            </PlainTh>
            {showLocation && <SortTh label="LOCATION" sortKey="location" sort={sort} onSort={onSort} rowSpan={2} />}
            <SortTh label="STONE CODE" sortKey="stoneCode" sort={sort} onSort={onSort} rowSpan={2} />
            {showLot && <SortTh label="LOT NO." sortKey="lot" sort={sort} onSort={onSort} rowSpan={2} />}
            <PickerGroupTh title="Balance" span={showUnit ? 5 : 4} tone="purple" />
            <SortTh label="Profit/Loss" sortKey="profitLoss" sort={sort} onSort={onSort} rowSpan={2} align="right" className="w-40" />
          </tr>
          <tr>
            <GroupSortTh label="Pcs" tone="purple" sort={sort} onSort={onSort} />
            <GroupSortTh label="Weight" tone="purple" sort={sort} onSort={onSort} />
            <GroupSortTh label="Price" tone="purple" sort={sort} onSort={onSort} />
            {showUnit && <GroupSortTh label="Unit" tone="purple" sort={sort} onSort={onSort} />}
            <GroupSortTh label="Amount" tone="purple" sort={sort} onSort={onSort} title="Balance weight x price, rounded by the system" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const checked = selected.has(row.cardKey);
            const name = cardName(row);
            const details = isShown(prefs, "details") ? detailLine(row) : "";
            const group = checked ? pickerPurpleTicked : cx(balanceTone.cell, pickerGroupHover.purple);
            return (
              <tr
                key={row.cardKey}
                data-state={checked ? "selected" : undefined}
                onClick={(event) => {
                  if (!fromControl(event)) onOpen(row.cardKey);
                }}
                className={cx(pickerRowClass(checked), "group/row h-[66px]")}
              >
                <td className={pickerCheckCell}>
                  <input type="checkbox" aria-label={`Select ${name}`} checked={checked} onChange={() => onToggle(row)} className={cx(pickerCheckbox, "cursor-pointer", focusRing)} />
                </td>
                <td className={cx(pickerIndexCell, "pr-3 text-right")}>{rowNumber(page, pageSize, index)}</td>
                {showLocation && (
                  <td className={pickerCell}>
                    <span className="font-medium">{row.location || "—"}</span>
                  </td>
                )}
                <td className={pickerCell}>
                  <Link href={stockValueHref(row.cardKey)} className={cx("font-medium hover:underline", focusRing)}>
                    {name}
                  </Link>
                  {details && <div className={pickerSub}>{details}</div>}
                </td>
                {showLot && (
                  <td className={pickerCell}>
                    <span>{row.lot || "—"}</span>
                  </td>
                )}
                <td className={cx(numCell, group)}>{formatPcs(row.balancePcs)}</td>
                <td className={cx(numCell, group, "font-semibold")}>{formatWeight(row.balanceWeightCt, nf.weightPlaces)}</td>
                <td className={cx(numCell, group)}>
                  <PriceBlock price={row.price} source={row.priceSource} label={row.priceSourceLabel} priceRef={row.priceRef} showCaption={showSource} />
                </td>
                {showUnit && (
                  <td className={cx(pickerCell, group, "whitespace-nowrap")}>
                    <UnitText unit={row.priceUnit} />
                  </td>
                )}
                <td className={cx(numCell, group, "font-semibold")}>
                  <AmountText value={row.amount} />
                </td>
                <td className={cx(numCell)}>
                  <ProfitLossText value={row.profitLoss} />
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-gms-border bg-gms-table-total font-semibold">
            <th scope="row" colSpan={labelSpan} className="px-3 py-2 text-left align-top">
              <span className="pl-[60px]">Total</span>
            </th>
            <td className={numCell}>{formatPcs(totals.balancePcs)}</td>
            <td className={numCell}>{formatWeight(totals.balanceWeightCt, nf.weightPlaces)}</td>
            <td />
            {showUnit && <td />}
            <td className={numCell}>
              <AmountText value={totals.amount} />
              {totals.unpricedCards > 0 && <div className={cx(pickerSub, "font-normal")}>{unpricedNote(totals.unpricedCards)}</div>}
            </td>
            <td className={numCell}>
              <ProfitLossText value={totals.profitLoss} />
              {totals.noCostCards > 0 && <div className={cx(pickerSub, "font-normal")}>{noCostNote(totals.noCostCards)}</div>}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
