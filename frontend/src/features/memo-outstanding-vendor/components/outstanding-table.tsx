"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronDown, ChevronRight, MessageSquare } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import { cx, focusRing } from "@/components/ui/button";
import {
  BUCKET_COLUMNS,
  BUCKET_LABEL,
  BUCKET_SORT,
  formatDate,
  formatDecimal,
  formatMoney,
  formatPcs,
  formatWeight,
  isShown,
  itemSpecParts,
  memoReceiveHref,
  unitCaption,
  type Bucket,
  type SortDir,
  type SortKey,
  type VendorItem,
  type VendorListRow,
  type ViewPrefs,
} from "../model";
import { DueLabel } from "./parts";

export type TableEntry = { row: VendorListRow; items: readonly VendorItem[] | undefined };

type TableProps = {
  entries: readonly TableEntry[];
  prefs: ViewPrefs;
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
  isOpen: (id: string) => boolean;
  onToggleOpen: (id: string) => void;
  /** Items of an open document are still loading / failed. */
  itemsLoading: boolean;
  itemsError: boolean;
  onRetryItems: () => void;
  selected: ReadonlySet<string>;
  onToggleItem: (item: VendorItem) => void;
};

// Frozen left part (expand · Doc · Due · Vendor); the bucket groups scroll sideways on narrow screens.
const sticky = ["sticky left-0 w-10 min-w-10", "sticky left-10 w-[124px] min-w-[124px]", "sticky left-[164px] w-[112px] min-w-[112px]", "sticky left-[276px] w-[190px] min-w-[190px] border-r border-gms-border"];
const headCell = "px-3 py-2 text-left text-gms-label font-semibold text-gms-text";
const numCell = "px-3 py-2.5 text-right tabular-nums whitespace-nowrap";

function SortButton({ label, sortKey, sort, onSort, sub }: { label: string; sortKey: SortKey; sort: TableProps["sort"]; onSort: (key: SortKey) => void; sub?: string }) {
  const active = sort.key === sortKey;
  const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button type="button" onClick={() => onSort(sortKey)} className={cx("inline-flex items-center gap-1 rounded text-left", focusRing)} aria-label={`Sort by ${label}`}>
      <span>
        <span className="block">{label}</span>
        {sub && <span className="block text-gms-label font-normal text-gms-text-secondary">{sub}</span>}
      </span>
      <Icon size={12} className={active ? "text-gms-primary" : "text-gms-text-placeholder"} aria-hidden />
    </button>
  );
}

const ariaSort = (sort: TableProps["sort"], key: SortKey) => (sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined);

function BucketCells({ value, buckets }: { value: Pick<VendorListRow, Bucket>; buckets: readonly Bucket[] }) {
  return (
    <>
      {buckets.map((bucket) => (
        <Fragment key={bucket}>
          <td className={cx(numCell, "border-l border-gms-border")}>{formatPcs(value[bucket].pcs)}</td>
          <td className={numCell}>{formatWeight(value[bucket].weightCt)}</td>
        </Fragment>
      ))}
    </>
  );
}

function ItemRow({ item, prefs, buckets, showPrice, checked, onToggle }: { item: VendorItem; prefs: ViewPrefs; buckets: readonly Bucket[]; showPrice: boolean; checked: boolean; onToggle: () => void }) {
  const spec = itemSpecParts(item, { colorClarity: isShown(prefs, "colorClarity"), cerType: isShown(prefs, "cerType") });
  const stockLot = [item.stockId, item.lot].filter(Boolean).join(" · ");
  return (
    <tr className={cx("border-t border-gms-border", checked ? "bg-gms-surface-sunken" : "bg-gms-surface-muted")}>
      <td className={cx(sticky[0], "bg-inherit px-2 py-2.5 align-top")}>
        <span className="relative inline-flex h-5 w-5 items-center justify-center" title="Show selected rows only.">
          <input
            type="checkbox"
            aria-label={`Select ${item.stockId || item.stone || "item"}`}
            checked={checked}
            onChange={onToggle}
            className={cx("h-5 w-5 cursor-pointer appearance-none rounded-gms-sm border", checked ? "border-gms-primary bg-gms-primary" : "border-gms-border bg-gms-surface", focusRing)}
          />
          {checked && <Check size={14} strokeWidth={3} className="pointer-events-none absolute text-gms-on-primary" aria-hidden />}
        </span>
      </td>
      <th scope="row" colSpan={3} className={cx(sticky[1], "w-auto bg-inherit py-2.5 pr-3 pl-1 text-left align-top font-normal")}>
        {isShown(prefs, "stone") && <p className="text-gms-body font-semibold">{item.stone || "-"}</p>}
        <p className="text-gms-label text-gms-text-secondary">
          {[spec.shapeSize, spec.grading].filter(Boolean).join(" · ")}
          {spec.cert && <span className="ml-1.5 font-medium text-gms-text">{spec.cert}</span>}
        </p>
        {(isShown(prefs, "stockLot") || isShown(prefs, "location")) && (
          <p className="text-gms-label text-gms-text-secondary">
            {isShown(prefs, "stockLot") && stockLot}
            {isShown(prefs, "stockLot") && isShown(prefs, "location") && stockLot && " · "}
            {isShown(prefs, "location") && `Location ${item.location}`}
          </p>
        )}
        {isShown(prefs, "remark") && item.itemNote.trim() && (
          <p className="mt-0.5 flex items-center gap-1 text-gms-label text-gms-text-secondary">
            <MessageSquare size={12} aria-hidden />
            {item.itemNote}
          </p>
        )}
      </th>
      <BucketCells value={item} buckets={buckets} />
      {showPrice && (
        <td className={cx(numCell, "border-l border-gms-border")}>
          <span className="block font-medium">{`${formatDecimal(item.netUnitPrice)} ${item.currency}`}</span>
          <span className="block text-gms-label text-gms-text-secondary">{unitCaption(item.priceUnit)}</span>
        </td>
      )}
    </tr>
  );
}

/** Skeleton for the first load: 5 rows (ui-spec States). */
export function TableSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading documents">
      {[0, 1, 2, 3, 4].map((index) => <div key={index} className="h-11 animate-pulse rounded-gms-md bg-gms-surface-sunken" />)}
    </div>
  );
}

/**
 * Document rows with their item rows (subtasks). Header: Doc Number / Doc Date, Due Date / Overdue, Vendor Name, then
 * the shown Memo · Return · Sold · Reserve · Outstanding groups (Pcs, Weight) and PRICE / UNIT, as in D 01 / D 04.
 */
export function OutstandingTable({ entries, prefs, sort, onSort, isOpen, onToggleOpen, itemsLoading, itemsError, onRetryItems, selected, onToggleItem }: TableProps) {
  const buckets = BUCKET_COLUMNS.filter((bucket) => isShown(prefs, bucket));
  const showPrice = isShown(prefs, "price");
  const columnCount = 4 + buckets.length * 2 + (showPrice ? 1 : 0);
  return (
    <div className="overflow-x-auto rounded-gms-md border border-gms-border bg-gms-surface">
      <table className="w-full border-collapse text-gms-body">
        <caption className="sr-only">Memo outstanding from vendors</caption>
        <thead className="bg-gms-surface">
          <tr className="border-b border-gms-border">
            <th rowSpan={2} className={cx(sticky[0], "bg-gms-surface")}><span className="sr-only">Expand</span></th>
            <th rowSpan={2} scope="col" aria-sort={ariaSort(sort, "docNo")} className={cx(sticky[1], headCell, "bg-gms-surface")}>
              <SortButton label="Doc Number" sub="Doc Date" sortKey="docNo" sort={sort} onSort={onSort} />
            </th>
            <th rowSpan={2} scope="col" aria-sort={ariaSort(sort, "dueDate")} className={cx(sticky[2], headCell, "bg-gms-surface")}>
              <SortButton label="Due Date" sub="Overdue" sortKey="dueDate" sort={sort} onSort={onSort} />
            </th>
            <th rowSpan={2} scope="col" aria-sort={ariaSort(sort, "vendorName")} className={cx(sticky[3], headCell, "bg-gms-surface")}>
              <SortButton label="Vendor Name" sortKey="vendorName" sort={sort} onSort={onSort} />
            </th>
            {buckets.map((bucket) => (
              <th key={bucket} colSpan={2} scope="colgroup" aria-sort={ariaSort(sort, BUCKET_SORT[bucket])} className={cx(headCell, "border-l border-gms-border text-center")}>
                <SortButton label={BUCKET_LABEL[bucket]} sortKey={BUCKET_SORT[bucket]} sort={sort} onSort={onSort} />
              </th>
            ))}
            {showPrice && (
              <th rowSpan={2} scope="col" aria-sort={ariaSort(sort, "openValue")} className={cx(headCell, "border-l border-gms-border text-right")}>
                <SortButton label="PRICE" sub="UNIT" sortKey="openValue" sort={sort} onSort={onSort} />
              </th>
            )}
          </tr>
          <tr className="border-b border-gms-border">
            {buckets.map((bucket) => (
              <Fragment key={bucket}>
                <th scope="col" className="border-l border-gms-border px-3 py-1.5 text-right text-gms-label font-normal text-gms-text-secondary">Pcs</th>
                <th scope="col" className="px-3 py-1.5 text-right text-gms-label font-normal text-gms-text-secondary">Weight</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map(({ row, items }) => {
            const open = isOpen(row.memoReceiveId);
            return (
              <Fragment key={row.memoReceiveId}>
                <tr className={cx("border-t border-gms-border", open ? "bg-gms-primary-subtle" : "bg-gms-surface")}>
                  <td className={cx(sticky[0], "bg-inherit px-1.5 py-2.5")}>
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-label={`View items in ${row.docNo}`}
                      title="View items in this document"
                      onClick={() => onToggleOpen(row.memoReceiveId)}
                      className={cx("inline-flex h-7 w-7 items-center justify-center rounded-gms-sm hover:bg-gms-surface-sunken", focusRing)}
                    >
                      {open ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
                    </button>
                  </td>
                  <th scope="row" className={cx(sticky[1], "bg-inherit px-3 py-2.5 text-left font-normal")}>
                    <Link href={memoReceiveHref(row.memoReceiveId)} className={cx("block font-semibold text-gms-primary hover:underline", focusRing)}>{row.docNo}</Link>
                    <span className="block text-gms-label text-gms-text-secondary">{formatDate(row.docDate)}</span>
                  </th>
                  <td className={cx(sticky[2], "bg-inherit px-3 py-2.5")}>
                    <span className="block">{formatDate(row.dueDate)}</span>
                    <DueLabel dueInDays={row.dueInDays} />
                  </td>
                  <td className={cx(sticky[3], "bg-inherit px-3 py-2.5")}>
                    <span className="block max-w-[166px] truncate" title={row.vendor.name}>{row.vendor.name}</span>
                  </td>
                  <BucketCells value={row} buckets={buckets} />
                  {showPrice && (
                    <td className={cx(numCell, "border-l border-gms-border")}>
                      <span className="block font-semibold">{`${formatMoney(row.openValue)} ${row.currency}`}</span>
                      <span className="block text-gms-label text-gms-text-secondary">open value (reserve + outstanding)</span>
                    </td>
                  )}
                </tr>
                {open && items === undefined && (
                  <tr className="border-t border-gms-border bg-gms-surface-muted">
                    <td colSpan={columnCount} className="px-12 py-2.5 text-gms-label text-gms-text-secondary">
                      {itemsError && !itemsLoading ? (
                        <span role="alert">
                          {"Couldn't load the items. "}
                          <button type="button" onClick={onRetryItems} className={cx("font-medium text-gms-primary underline", focusRing)}>Try again</button>
                        </span>
                      ) : (
                        <span aria-busy="true">Loading items…</span>
                      )}
                    </td>
                  </tr>
                )}
                {open && items?.length === 0 && (
                  <tr className="border-t border-gms-border bg-gms-surface-muted">
                    <td colSpan={columnCount} className="px-12 py-2.5 text-gms-label text-gms-text-secondary">No outstanding items in this document.</td>
                  </tr>
                )}
                {open && items?.map((item) => (
                  <ItemRow key={item.id} item={item} prefs={prefs} buckets={buckets} showPrice={showPrice} checked={selected.has(item.id)} onToggle={() => onToggleItem(item)} />
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
