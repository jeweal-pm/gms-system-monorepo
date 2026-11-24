"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import { cardName, detailLine, formatPcs, formatShortDate, formatWeight, pcsCell, stockIdText, vendorLine, weightCell } from "../model";
import type { CardHeader, CardRow, Totals, Txn } from "../types";
import { isShown, type ViewPrefs } from "../view-prefs";
import styles from "./print.module.css";

const cell = "border border-black px-1.5 py-1 text-left align-top";
const num = `${cell} text-right`;

type Frame = {
  title: string;
  /** "Selected rows" or "Current page". */
  scope: string;
  filters: readonly string[];
  /** Print timestamp, set right before printing (after mount, Asia/Bangkok). */
  printedAt: string;
  children: ReactNode;
};

export function PrintFrame({ title, scope, filters, printedAt, children }: Frame) {
  return (
    <div className={`${styles.printRoot} bg-white p-6 text-black`}>
      <header className="flex items-baseline justify-between border-b-2 border-black pb-2">
        <h1 className="text-gms-title font-semibold">{title}</h1>
        <p className="text-gms-label">{printedAt ? `Printed ${printedAt}` : ""}</p>
      </header>
      <p className="mt-2 text-gms-label">{[scope, ...(filters.length ? filters : ["No filters"])].join(" · ")}</p>
      {children}
    </div>
  );
}

/** Portal into <body> and the print-isolation class (see print.module.css). */
export function StockCardPrintView({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.body.classList.add(styles.printScope);
    return () => document.body.classList.remove(styles.printScope);
  }, []);
  return createPortal(children, document.body);
}

/** The list as printed: the selected rows, or the current page when none is selected (Q-SC-11). */
export function ListPrintContent({ rows, prefs, scope, filters, printedAt }: { rows: readonly CardRow[]; prefs: ViewPrefs; scope: string; filters: readonly string[]; printedAt: string }) {
  const nf = useNumberFormat();
  return (
    <PrintFrame title="Stock Card" scope={scope} filters={filters} printedAt={printedAt}>
      <table className="mt-3 w-full border-collapse text-gms-label">
        <thead>
          <tr>
            <th className={cell}>Stone Code</th>
            {isShown(prefs, "location") && <th className={cell}>Location</th>}
            {isShown(prefs, "lot") && <th className={cell}>Lot</th>}
            <th className={num}>Balance Pcs</th>
            <th className={num}>Balance Cts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const details = isShown(prefs, "details") ? detailLine(row) : "";
            const vendor = isShown(prefs, "vendor") ? vendorLine(row.vendorName, row.vendorCount) : "";
            return (
              <tr key={row.cardKey} className="break-inside-avoid">
                <td className={cell}>
                  <span className="font-semibold">{cardName(row)}</span>
                  {details && <span className="block">{details}</span>}
                </td>
                {isShown(prefs, "location") && <td className={cell}>{row.location || "—"}</td>}
                {isShown(prefs, "lot") && (
                  <td className={cell}>
                    {row.lot || "—"}
                    {vendor && <span className="block">{vendor}</span>}
                  </td>
                )}
                <td className={num}>{formatPcs(row.balancePcs)}</td>
                <td className={num}>{formatWeight(row.balanceWeightCt, nf.weightPlaces)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </PrintFrame>
  );
}

/** The detail page as printed: the card header, the current page of transactions and the totals. */
export function DetailPrintContent({ header, rows, totals, filters, printedAt }: { header: CardHeader; rows: readonly Txn[]; totals: Totals; filters: readonly string[]; printedAt: string }) {
  const nf = useNumberFormat();
  const places = nf.weightPlaces;
  const description = detailLine(header);
  return (
    <PrintFrame title={`Stock Card – ${cardName(header)}`} scope="Current page" filters={filters} printedAt={printedAt}>
      <p className="mt-1 text-gms-label">{[`Location ${header.location || "—"}`, `Lot ${header.lot || "—"}`, description].filter(Boolean).join(" · ")}</p>
      <table className="mt-3 w-full border-collapse text-gms-label">
        <thead>
          <tr>
            <th className={cell} rowSpan={2}>Doc No</th>
            <th className={cell} rowSpan={2}>Date</th>
            <th className={cell} rowSpan={2}>Stock ID</th>
            <th className={cell} rowSpan={2}>Account</th>
            <th className={cell} colSpan={2}>In</th>
            <th className={cell} colSpan={2}>Out</th>
            <th className={cell} colSpan={2}>Balance</th>
          </tr>
          <tr>
            {["Pcs", "Weight", "Pcs", "Weight", "Pcs", "Weight"].map((name, index) => (
              <th key={index} className={num}>
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="break-inside-avoid">
              <td className={cell}>
                <span className="font-semibold">{row.docNo || "—"}</span>
                {row.docTypeLabel && <span className="block">{row.docTypeLabel}</span>}
              </td>
              <td className={cell}>{formatShortDate(row.docDate)}</td>
              <td className={cell}>{stockIdText(row.stockId, row.stockIdExtra)}</td>
              <td className={cell}>{row.accountName || "—"}</td>
              <td className={num}>{pcsCell(row.inPcs)}</td>
              <td className={num}>{weightCell(row.inWeightCt, places)}</td>
              <td className={num}>{pcsCell(row.outPcs)}</td>
              <td className={num}>{weightCell(row.outWeightCt, places)}</td>
              <td className={num}>{formatPcs(row.balancePcs)}</td>
              <td className={num}>{formatWeight(row.balanceWeightCt, places)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <td className={cell} colSpan={4}>
              Total
            </td>
            <td className={num}>{formatPcs(totals.inPcs)}</td>
            <td className={num}>{formatWeight(totals.inWeightCt, places)}</td>
            <td className={num}>{formatPcs(totals.outPcs)}</td>
            <td className={num}>{formatWeight(totals.outWeightCt, places)}</td>
            <td className={num}>{formatPcs(totals.balancePcs)}</td>
            <td className={num}>{formatWeight(totals.balanceWeightCt, places)}</td>
          </tr>
        </tfoot>
      </table>
    </PrintFrame>
  );
}
