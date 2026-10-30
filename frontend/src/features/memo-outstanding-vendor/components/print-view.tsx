"use client";

import { Fragment, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  BUCKET_COLUMNS,
  BUCKET_LABEL,
  dueLabel,
  formatDate,
  formatDecimal,
  formatMoney,
  formatPcs,
  formatWeight,
  isShown,
  itemSpecParts,
  PAGE_TITLE,
  unitCaption,
  type VendorItem,
  type VendorListRow,
  type ViewPrefs,
} from "../model";
import styles from "./print.module.css";

type PrintViewProps = {
  entries: readonly { row: VendorListRow; items: readonly VendorItem[] }[];
  prefs: ViewPrefs;
  /** Filter summary lines, e.g. "Vendor: Sapphire Gems". */
  filters: readonly string[];
  /** "Selected items" or "Current page". */
  scope: string;
  /** Print timestamp, set right before printing (after mount, Asia/Bangkok). */
  printedAt: string;
};

const cell = "border border-black px-1.5 py-1 text-left align-top";
const num = `${cell} text-right`;

/**
 * Print-only view (ui-spec "Behavior", same pattern as the vendor print view): title, filters, date printed and the
 * visible columns; the selected items, or the current page when nothing is selected. Portaled into <body>.
 */
export function OutstandingPrintView({ entries, prefs, filters, scope, printedAt }: PrintViewProps) {
  useEffect(() => {
    document.body.classList.add(styles.printScope);
    return () => document.body.classList.remove(styles.printScope);
  }, []);
  return createPortal(<PrintContent entries={entries} prefs={prefs} filters={filters} scope={scope} printedAt={printedAt} />, document.body);
}

/** The printed content (also rendered on its own by the unit tests). */
export function PrintContent({ entries, prefs, filters, scope, printedAt }: PrintViewProps) {
  const buckets = BUCKET_COLUMNS.filter((bucket) => isShown(prefs, bucket));
  const showPrice = isShown(prefs, "price");
  const view = { colorClarity: isShown(prefs, "colorClarity"), cerType: isShown(prefs, "cerType") };
  return (
    <div className={`${styles.printRoot} bg-white p-6 text-black`}>
      <header className="flex items-baseline justify-between border-b-2 border-black pb-2">
        <h1 className="text-gms-title font-semibold">{`Memo Outstanding – ${PAGE_TITLE}`}</h1>
        <p className="text-gms-label">{printedAt ? `Printed ${printedAt}` : ""}</p>
      </header>
      <p className="mt-2 text-gms-label">{[scope, ...(filters.length ? filters : ["No filters"])].join(" · ")}</p>
      <table className="mt-3 w-full border-collapse text-gms-label">
        <thead>
          <tr>
            <th className={cell}>Doc Number / Doc Date</th>
            <th className={cell}>Due Date / Overdue</th>
            <th className={cell}>Vendor Name</th>
            {buckets.map((bucket) => <th key={bucket} className={num} colSpan={2}>{`${BUCKET_LABEL[bucket]} Pcs / Weight`}</th>)}
            {showPrice && <th className={num}>Price</th>}
          </tr>
        </thead>
        <tbody>
          {entries.map(({ row, items }) => (
            <Fragment key={row.memoReceiveId}>
              <tr className="break-inside-avoid font-semibold">
                <td className={cell}>{`${row.docNo} · ${formatDate(row.docDate)}`}</td>
                <td className={cell}>{`${formatDate(row.dueDate)} · ${dueLabel(row.dueInDays).text}`}</td>
                <td className={cell}>{row.vendor.name}</td>
                {buckets.map((bucket) => (
                  <Fragment key={bucket}>
                    <td className={num}>{formatPcs(row[bucket].pcs)}</td>
                    <td className={num}>{formatWeight(row[bucket].weightCt)}</td>
                  </Fragment>
                ))}
                {showPrice && <td className={num}>{`${formatMoney(row.openValue)} ${row.currency} (open value)`}</td>}
              </tr>
              {items.map((item) => {
                const spec = itemSpecParts(item, view);
                const details = [
                  isShown(prefs, "stockLot") ? [item.stockId, item.lot].filter(Boolean).join(" · ") : "",
                  isShown(prefs, "stone") ? item.stone : "",
                  spec.shapeSize, spec.grading, spec.cert,
                  isShown(prefs, "location") ? `Location ${item.location}` : "",
                  isShown(prefs, "remark") ? item.itemNote : "",
                ].filter((part) => part.trim() !== "");
                return (
                  <tr key={item.id} className="break-inside-avoid">
                    <td className={`${cell} pl-4`} colSpan={3}>{details.join(" · ")}</td>
                    {buckets.map((bucket) => (
                      <Fragment key={bucket}>
                        <td className={num}>{formatPcs(item[bucket].pcs)}</td>
                        <td className={num}>{formatWeight(item[bucket].weightCt)}</td>
                      </Fragment>
                    ))}
                    {showPrice && <td className={num}>{`${formatDecimal(item.netUnitPrice)} ${item.currency} ${unitCaption(item.priceUnit)}`}</td>}
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
