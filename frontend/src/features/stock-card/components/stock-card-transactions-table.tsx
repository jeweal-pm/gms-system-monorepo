"use client";

import Link from "next/link";
import { cx, focusRing } from "@/components/ui/button";
import { useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import { pickerCell, pickerGroupHover, pickerGroupTone, pickerHead, pickerSub, PickerGroupTh } from "@/features/trade-document/picker-ui";
import { docHref, formatPcs, formatShortDate, formatWeight, pcsCell, rowNumber, stockIdText, weightCell, type SortDir, type TxnSortKey } from "../model";
import type { Totals, Txn } from "../types";
import { GroupSortTh, PlainTh, SortTh } from "./parts";

type TableProps = {
  rows: readonly Txn[];
  /** Server totals of the whole filtered card (Q-SC-07), never the sum of the page. */
  totals: Totals;
  page: number;
  pageSize: number;
  sort: { key: TxnSortKey; dir: SortDir };
  onSort: (key: TxnSortKey) => void;
};

const numCell = "px-3 py-2 text-right align-middle tabular-nums whitespace-nowrap";
const tones = { in: pickerGroupTone.green, out: pickerGroupTone.orange, balance: pickerGroupTone.purple } as const;
const hovers = { in: pickerGroupHover.green, out: pickerGroupHover.orange, balance: pickerGroupHover.purple } as const;

/**
 * The transactions table (S6 / S4): two-tier header with the IN (green), OUT (orange) and BALANCE (purple) groups, 56 px
 * rows with the DOC NO link and its document type caption, the other direction blank, and the Total row from the
 * server. The DOC NO link opens the document and not the row (S7).
 */
export function StockCardTransactionsTable({ rows, totals, page, pageSize, sort, onSort }: TableProps) {
  const nf = useNumberFormat();
  const places = nf.weightPlaces;
  return (
    <div className="overflow-x-auto rounded-gms-md border border-gms-border">
      <table className="w-full min-w-[1100px] border-collapse text-sm text-gms-text-heading">
        <caption className="sr-only">Stock card transactions with running balance</caption>
        <thead className={pickerHead}>
          <tr>
            <PlainTh rowSpan={2} className="w-12 text-right">
              #
            </PlainTh>
            <SortTh label="DOC NO" sortKey="docNo" sort={sort} onSort={onSort} rowSpan={2} className="w-[200px]" />
            <SortTh label="DATE" sortKey="date" sort={sort} onSort={onSort} rowSpan={2} className="w-32" />
            <SortTh label="STOCK ID" sortKey="stockId" sort={sort} onSort={onSort} rowSpan={2} className="w-[200px]" />
            <SortTh label="Account" sortKey="account" sort={sort} onSort={onSort} rowSpan={2} />
            <PickerGroupTh title="In" span={2} tone="green" />
            <PickerGroupTh title="Out" span={2} tone="orange" />
            <PickerGroupTh title="Balance" span={2} tone="purple" />
          </tr>
          <tr>
            {(["green", "orange", "purple"] as const).flatMap((tone) => [
              <GroupSortTh<TxnSortKey> key={`${tone}-pcs`} label="Pcs" tone={tone} sort={sort} onSort={onSort} />,
              <GroupSortTh<TxnSortKey> key={`${tone}-weight`} label="Weight" tone={tone} sort={sort} onSort={onSort} />,
            ])}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const href = docHref(row.docType, row.docId);
            const number = row.docNo || "—";
            return (
              <tr key={row.id} className={"group/row h-14 border-b border-gms-border bg-white hover:bg-gms-row-hover"}>
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
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Pcs and Weight cells of one group: tinted (8 %), darker on row hover; blank when the line is the other direction. */
function GroupCells({ tone, pcs, weight, bold = false }: { tone: keyof typeof tones; pcs: string; weight: string; bold?: boolean }) {
  const cell = cx(numCell, tones[tone].cell, hovers[tone]);
  return (
    <>
      <td className={cell}>{pcs}</td>
      <td className={cx(cell, bold && "font-semibold")}>{weight}</td>
    </>
  );
}
