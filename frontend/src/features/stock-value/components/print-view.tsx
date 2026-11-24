"use client";

import { useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import { PrintFrame } from "@/features/stock-card/components/print-view";
import { asOfNote, cardName, detailLine, formatPcs, formatShortDate, formatWeight, noCostNote, pcsCell, priceCaption, stockIdText, unitLabel, unpricedNote, weightCell, moneyText } from "../model";
import type { ValueHeader, ValueRow, ValueTotals, ValueTxn, ValueTxnTotals } from "../types";
import { isShown, type ViewPrefs } from "../view-prefs";

export { StockCardPrintView as StockValuePrintView } from "@/features/stock-card/components/print-view";

/**
 * Print views of Stock Value (FE-SV-011, Q-SV-18): Stock Card's frame and print isolation, with the value columns and the
 * Total row. Only the server's figures are printed; no money is calculated here.
 */
const cell = "border border-black px-1.5 py-1 text-left align-top";
const num = `${cell} text-right`;

type PriceFields = { price: string | null; priceSource: string; priceSourceLabel: string | null };

/** Price and, under it, its source (printed as text; no tooltip on paper). */
function PrintPrice({ valued, showCaption = true, money }: { valued: PriceFields; showCaption?: boolean; money: (value: string) => string }) {
  const caption = showCaption ? priceCaption(valued.priceSource, valued.priceSourceLabel) : "";
  return (
    <>
      {moneyText(valued.price, money)}
      {caption && <span className="block">{caption}</span>}
    </>
  );
}

/** The list as printed: the selected rows, or the current page when none is selected, then the Total row. */
export function ListPrintContent({
  rows,
  totals,
  prefs,
  scope,
  asOf,
  filters,
  printedAt,
}: {
  rows: readonly ValueRow[];
  totals: ValueTotals;
  prefs: ViewPrefs;
  scope: string;
  asOf: string | null;
  filters: readonly string[];
  printedAt: string;
}) {
  const nf = useNumberFormat();
  const showLocation = isShown(prefs, "location");
  const showLot = isShown(prefs, "lot");
  const showUnit = isShown(prefs, "unit");
  const showSource = isShown(prefs, "priceSource");
  const lead = 1 + (showLocation ? 1 : 0) + (showLot ? 1 : 0);
  return (
    <PrintFrame title="Stock Value" scope={scope} filters={asOf ? [...filters, asOfNote(asOf)] : filters} printedAt={printedAt}>
      <table className="mt-3 w-full border-collapse text-gms-label">
        <thead>
          <tr>
            {showLocation && <th className={cell}>Location</th>}
            <th className={cell}>Stone Code</th>
            {showLot && <th className={cell}>Lot No.</th>}
            <th className={num}>Pcs</th>
            <th className={num}>Weight</th>
            <th className={num}>Price</th>
            {showUnit && <th className={cell}>Unit</th>}
            <th className={num}>Amount</th>
            <th className={num}>Profit/Loss</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const details = isShown(prefs, "details") ? detailLine(row) : "";
            return (
              <tr key={row.cardKey} className="break-inside-avoid">
                {showLocation && <td className={cell}>{row.location || "—"}</td>}
                <td className={cell}>
                  <span className="font-semibold">{cardName(row)}</span>
                  {details && <span className="block">{details}</span>}
                </td>
                {showLot && <td className={cell}>{row.lot || "—"}</td>}
                <td className={num}>{formatPcs(row.balancePcs)}</td>
                <td className={num}>{formatWeight(row.balanceWeightCt, nf.weightPlaces)}</td>
                <td className={num}>
                  <PrintPrice valued={row} showCaption={showSource} money={nf.money} />
                </td>
                {showUnit && <td className={cell}>{unitLabel(row.priceUnit)}</td>}
                <td className={num}>{moneyText(row.amount, nf.money)}</td>
                <td className={num}>{moneyText(row.profitLoss, nf.money)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <td className={cell} colSpan={lead}>
              Total
            </td>
            <td className={num}>{formatPcs(totals.balancePcs)}</td>
            <td className={num}>{formatWeight(totals.balanceWeightCt, nf.weightPlaces)}</td>
            <td className={num} />
            {showUnit && <td className={cell} />}
            <td className={num}>
              {nf.money(totals.amount)}
              {totals.unpricedCards > 0 && <span className="block font-normal">{unpricedNote(totals.unpricedCards)}</span>}
            </td>
            <td className={num}>
              {moneyText(totals.profitLoss, nf.money)}
              {totals.noCostCards > 0 && <span className="block font-normal">{noCostNote(totals.noCostCards)}</span>}
            </td>
          </tr>
        </tfoot>
      </table>
    </PrintFrame>
  );
}

/** The detail page as printed: the card header, the current page of transactions with the value columns and the totals. */
export function DetailPrintContent({ header, rows, totals, filters, printedAt }: { header: ValueHeader; rows: readonly ValueTxn[]; totals: ValueTxnTotals; filters: readonly string[]; printedAt: string }) {
  const nf = useNumberFormat();
  const places = nf.weightPlaces;
  const description = detailLine(header);
  return (
    <PrintFrame title={`Stock Value – ${cardName(header)}`} scope="Current page" filters={filters} printedAt={printedAt}>
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
            <th className={cell} colSpan={2}>Current value</th>
            <th className={num} rowSpan={2}>Profit &amp; Loss</th>
          </tr>
          <tr>
            {["Pcs", "Weight", "Pcs", "Weight", "Pcs", "Weight", "Price", "Amount"].map((name, index) => (
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
              <td className={num}>
                <PrintPrice valued={row} money={nf.money} />
              </td>
              <td className={num}>{moneyText(row.amount, nf.money)}</td>
              <td className={num}>{moneyText(row.profitLoss, nf.money)}</td>
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
            <td className={num}>
              <PrintPrice valued={totals} money={nf.money} />
            </td>
            <td className={num}>{moneyText(totals.amount, nf.money)}</td>
            <td className={num}>{moneyText(totals.profitLoss, nf.money)}</td>
          </tr>
        </tfoot>
      </table>
    </PrintFrame>
  );
}
