"use client";

import Link from "next/link";
import { cx, focusRing } from "@/components/ui/button";
import { useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import { pickerCell, pickerGroupHover, pickerGroupTone, pickerHead, pickerSub, PickerGroupTh } from "@/features/trade-document/picker-ui";
import { GroupSortTh, PlainTh, SortTh } from "@/features/stock-card/components/parts";
import { docHref, formatPcs, formatShortDate, formatWeight, pcsCell, rowNumber, stockIdText, weightCell, type SortDir, type TxnSortKey } from "../model";
import type { ValueTxn, ValueTxnTotals } from "../types";
import { AmountText, PriceBlock, ProfitLossText } from "./value-cells";

type TableProps = {
  rows: readonly ValueTxn[];
  /** Server totals of the whole filtered card, closing balance valued (never the sum of the page). */
  totals: ValueTxnTotals;
  page: number;
  pageSize: number;
  sort: { key: TxnSortKey; dir: SortDir };
  onSort: (key: TxnSortKey) => void;
};

const numCell = "px-3 py-2 text-right align-middle tabular-nums whitespace-nowrap";
const tones = { in: pickerGroupTone.green, out: pickerGroupTone.orange, balance: pickerGroupTone.purple, value: pickerGroupTone.blue } as const;
const hovers = { in: pickerGroupHover.green, out: pickerGroupHover.orange, balance: pickerGroupHover.purple, value: pickerGroupHover.blue } as const;

/**
 * The transactions table (V2 / V5): the Stock Card ledger with a fourth group, "Current value" (blue: Price with its source
 * and Amount of the running balance), and PROFIT & LOSS spanning both header rows. 56 px rows; the DOC NO link opens the
 * document and not the row; the Total row comes from the server.
 */
export function StockValueTransactionsTable({ rows, totals, page, pageSize, sort, onSort }: TableProps) {
  const nf = useNumberFormat();
  const places = nf.weightPlaces;
  return (
    <div className="overflow-x-auto rounded-gms-md border border-gms-border">
      <table className="w-full min-w-[1500px] border-collapse text-sm text-gms-text-heading">
        <caption className="sr-only">Stock value transactions with running balance and current value</caption>
        <thead className={pickerHead}>
          <tr>
            <PlainTh rowSpan={2} className="w-12 text-right">
              #
            </PlainTh>
            <SortTh label="DOC NO" sortKey="docNo" sort={sort} onSort={onSort} rowSpan={2} className="w-[140px]" />
            <SortTh label="DATE" sortKey="date" sort={sort} onSort={onSort} rowSpan={2} className="w-[100px]" />
            <SortTh label="STOCK ID" sortKey="stockId" sort={sort} onSort={onSort} rowSpan={2} className="w-32" />
            <SortTh label="Account" sortKey="account" sort={sort} onSort={onSort} rowSpan={2} />
            <PickerGroupTh title="In" span={2} tone="green" />
            <PickerGroupTh title="Out" span={2} tone="orange" />
            <PickerGroupTh title="Balance" span={2} tone="purple" />
            <PickerGroupTh title="Current value" span={2} tone="blue" />
            <SortTh label="PROFIT & LOSS" sortKey="profitLoss" sort={sort} onSort={onSort} rowSpan={2} align="right" className="w-[150px]" />
          </tr>
          <tr>
            {(["green", "orange", "purple"] as const).flatMap((tone) => [
              <GroupSortTh<TxnSortKey> key={`${tone}-pcs`} label="Pcs" tone={tone} sort={sort} onSort={onSort} />,
              <GroupSortTh<TxnSortKey> key={`${tone}-weight`} label="Weight" tone={tone} sort={sort} onSort={onSort} />,
            ])}
            <GroupSortTh<TxnSortKey> label="Price" tone="blue" sort={sort} onSort={onSort} />
            <GroupSortTh<TxnSortKey> label="Amount" tone="blue" sort={sort} onSort={onSort} title="Balance weight x price, rounded by the system" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const href = docHref(row.docType, row.docId);
            const number = row.docNo || "—";
            return (
              <tr key={row.id} className="group/row h-14 border-b border-gms-border bg-white hover:bg-gms-row-hover">
                <td className={cx(pickerCell, "text-right text-gms-text-muted")}>{rowNumber(page, pageSize, index)}</td>
                <td className={pickerCell}>
                  {href ? (
                    <Link href={href} className={cx("font-semibold hover:underline", focusRing)}>
                      {number}
                    </Link>
                  ) : (
                    <span className="font-semibold">{number}</span>
                  )}
                  {row.docTypeLabel && <div className={pickerSub}>{row.docTypeLabel}</div>}
                </td>
                <td className={pickerCell}>{formatShortDate(row.docDate)}</td>
                <td className={cx(pickerCell, row.stockId ? "" : "text-gms-text-muted")}>{stockIdText(row.stockId, row.stockIdExtra)}</td>
                <td className={pickerCell}>{row.accountName || "—"}</td>
                <GroupCells tone="in" pcs={pcsCell(row.inPcs)} weight={weightCell(row.inWeightCt, places)} />
                <GroupCells tone="out" pcs={pcsCell(row.outPcs)} weight={weightCell(row.outWeightCt, places)} />
                <GroupCells tone="balance" pcs={formatPcs(row.balancePcs)} weight={formatWeight(row.balanceWeightCt, places)} bold />
                <td className={cx(numCell, tones.value.cell, hovers.value)}>
                  <PriceBlock price={row.price} source={row.priceSource} label={row.priceSourceLabel} priceRef={row.priceRef} />
                </td>
                <td className={cx(numCell, tones.value.cell, hovers.value, "font-semibold")}>
                  <AmountText value={row.amount} />
                </td>
                <td className={numCell}>
                  <ProfitLossText value={row.profitLoss} />
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="h-10 border-t border-gms-border bg-gms-table-total font-semibold">
            <th scope="row" colSpan={5} className="px-3 py-2 text-left">
              <span className="pl-[60px]">Total</span>
            </th>
            <td className={numCell}>{formatPcs(totals.inPcs)}</td>
            <td className={numCell}>{formatWeight(totals.inWeightCt, places)}</td>
            <td className={numCell}>{formatPcs(totals.outPcs)}</td>
            <td className={numCell}>{formatWeight(totals.outWeightCt, places)}</td>
            <td className={numCell}>{formatPcs(totals.balancePcs)}</td>
            <td className={numCell}>{formatWeight(totals.balanceWeightCt, places)}</td>
            <td className={numCell}>
              <PriceBlock price={totals.price} source={totals.priceSource} label={totals.priceSourceLabel} priceRef={totals.priceRef} />
            </td>
            <td className={numCell}>
              <AmountText value={totals.amount} />
            </td>
            <td className={numCell}>
              <ProfitLossText value={totals.profitLoss} />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Pcs and Weight cells of one group: tinted (8 %), darker on row hover; blank when the line is the other direction. */
function GroupCells({ tone, pcs, weight, bold = false }: { tone: "in" | "out" | "balance"; pcs: string; weight: string; bold?: boolean }) {
  const cell = cx(numCell, tones[tone].cell, hovers[tone]);
  return (
    <>
      <td className={cell}>{pcs}</td>
      <td className={cx(cell, bold && "font-semibold")}>{weight}</td>
    </>
  );
}
