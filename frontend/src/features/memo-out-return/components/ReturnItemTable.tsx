"use client";

import { ChevronsUpDown, CircleMinus, Ellipsis, Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ItemTable } from "@/features/quotation/components/items/ItemTable";
import { Badge, Button, cx } from "@/features/quotation/components/ui";
import { lineAmount } from "@/features/quotation/lib/calculate";
import { formatMoney, formatMoneyText, formatWeight } from "@/features/quotation/lib/format";
import { dec, toFixed } from "@/features/quotation/lib/decimal";
import { visibleRowsHeight } from "@/features/quotation/lib/table-scroll";
import { isFilledLine, type QuotationLine } from "@/features/quotation/schema";

/** Same props as the Quotation item table, so the shared document preview frame can use either. */
export type ReturnItemTableProps = Parameters<typeof ItemTable>[0];

type Column = { title: string; sub?: string; className: string };

/** memo-out-return source 01: item columns, then the Pending and Return groups (Pcs, Weight), then price. */
const LEFT: Column[] = [
  { title: "Stone Code", sub: "STOCK ID · LOT", className: "w-[180px]" },
  { title: "LOCATION", className: "w-[110px]" },
  { title: "STONE", sub: "SHAPE · SIZE", className: "w-[136px]" },
  { title: "COLOR · CLARITY", sub: "CUTTING · QUALITY", className: "w-[150px]" },
  { title: "CER TYPE", sub: "CER NO.", className: "w-[120px]" },
];
/** The Return group is tinted (source 01) so the quantity being returned stands out. */
const RETURN_TINT = "bg-[#E3F0F0]";
const QTY = "w-[108px] px-3 text-right";

/**
 * Memo Out Return item table (memo-out-return UI rev 2, source 01). Rows are picked from Memo Outstanding:
 * Pending = what is still out on the memo, Return = what comes back now. Five rows show; the rest scroll.
 */
export function ReturnItemTable({ lines, currency, totals, selectedIndex, checkedKeys, readOnly, emptyRowText, onSelectRow, onToggleCheck, onToggleAll, onRowAction, onAddRow }: ReturnItemTableProps) {
  const allChecked = lines.length > 0 && lines.every((l) => checkedKeys.has(l.key));
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fixed at 5 rows, the rest scroll (same rule as the Quotation table).
  useEffect(() => {
    const box = scrollRef.current;
    const table = box?.querySelector("table");
    if (!box || !table) return;
    const fit = () => {
      const height = visibleRowsHeight(
        table.tHead?.offsetHeight ?? 0,
        Array.from(table.tBodies[0]?.rows ?? [], (row) => row.offsetHeight),
        table.tFoot?.offsetHeight ?? 0,
        box.offsetHeight - box.clientHeight,
      );
      box.style.maxHeight = height === null ? "" : `${height}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(table);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-w-0 flex-1">
      <div ref={scrollRef} className="overflow-auto rounded-lg">
        <table className="w-full min-w-[1400px] border-collapse text-sm text-[#1C252E]">
          <thead className="sticky top-0 z-10 bg-[#F6F7F8] text-left">
            <tr>
              <th rowSpan={2} className="w-10 px-3 py-3">
                <input type="checkbox" aria-label="Select all rows" className="size-5 accent-[#0E5E63]" checked={allChecked} disabled={readOnly} onChange={(e) => onToggleAll(e.target.checked)} />
              </th>
              <th rowSpan={2} className="w-9" />
              <th rowSpan={2} className="w-8 px-2 text-center font-normal text-[#6B7480]">#</th>
              {LEFT.map((c) => (
                <th key={c.title} rowSpan={2} className={cx("px-3 py-3 font-medium", c.className)}>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="leading-tight">
                      <span className="block">{c.title}</span>
                      {c.sub && <span className="block text-[11px] font-normal text-[#6B7480]">{c.sub}</span>}
                    </span>
                    <ChevronsUpDown className="size-3 text-[#95A0A9]" />
                  </span>
                </th>
              ))}
              <th colSpan={2} className="border-b border-l border-[#E3E6EA] px-3 py-3 text-center font-medium">Pending</th>
              <th colSpan={2} className={cx("border-b border-[#E3E6EA] px-3 py-3 text-center font-medium", RETURN_TINT)}>Return</th>
              <th rowSpan={2} className="w-[130px] border-l border-[#E3E6EA] px-3 py-3 text-right font-medium">
                <span className="inline-flex flex-row-reverse items-center gap-1.5">
                  <span className="leading-tight">
                    <span className="block whitespace-nowrap">SALE PRICE</span>
                    <span className="block text-[11px] font-normal text-[#6B7480]">UNIT</span>
                  </span>
                  <ChevronsUpDown className="size-3 text-[#95A0A9]" />
                </span>
              </th>
              <th rowSpan={2} className="w-[120px] px-3 py-3 text-right font-medium">Amount</th>
              <th rowSpan={2} className="w-14 px-3 font-medium">More</th>
            </tr>
            <tr>
              <th className={cx("border-l border-[#E3E6EA] py-2.5 font-medium", QTY)}>Pcs</th>
              <th className={cx("py-2.5 font-medium", QTY)}>Weight</th>
              <th className={cx("py-2.5 font-medium", QTY, RETURN_TINT)}>Pcs</th>
              <th className={cx("py-2.5 font-medium", QTY, RETURN_TINT)}>Weight</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const filled = isFilledLine(line);
              return (
                <tr
                  key={line.key}
                  onClick={() => onSelectRow(index)}
                  className={cx("cursor-pointer border-b border-[#EEF0F2] align-top", index === selectedIndex ? "bg-[#E6F1F1]" : "hover:bg-[#FAFBFB]")}
                >
                  <td className="px-3 py-4" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label={`Select row ${index + 1}`} className="size-5 accent-[#0E5E63]" checked={checkedKeys.has(line.key)} disabled={readOnly} onChange={() => onToggleCheck(line.key)} />
                  </td>
                  <td className="py-4">
                    <button
                      type="button"
                      aria-label={`Remove row ${index + 1}`}
                      disabled={readOnly}
                      className="text-[#E5484D] disabled:text-[#F3A5A7]"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRowAction(index, "remove");
                      }}
                    >
                      <CircleMinus className="size-5" />
                    </button>
                  </td>
                  <td className="px-2 py-4 text-center text-[#6B7480]">{index + 1}</td>
                  {filled ? (
                    <FilledCells line={line} />
                  ) : (
                    <td colSpan={LEFT.length} className="px-3 py-4 text-[#A9B1B9]">
                      {emptyRowText}
                    </td>
                  )}
                  {/* Pending comes from Memo Outstanding (not available yet); Return = the row pieces/weight. */}
                  <td className={cx("border-l border-[#E3E6EA] py-4 text-[#A9B1B9]", QTY)}>{filled ? "—" : ""}</td>
                  <td className={cx("py-4 text-[#A9B1B9]", QTY)}>{filled ? "—" : ""}</td>
                  <td className={cx("py-4", QTY, RETURN_TINT)}>{filled ? line.pcs || "0" : ""}</td>
                  <td className={cx("py-4", QTY, RETURN_TINT)}>{filled ? formatWeight(dec(line.weightCt)) : ""}</td>
                  <td className="border-l border-[#E3E6EA] px-3 py-4 text-right">{filled ? `${formatMoneyText(line.unitPrice)} ${currency}` : ""}</td>
                  <td className="px-3 py-4 text-right">{filled ? formatMoney(lineAmount(line)) : ""}</td>
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <button type="button" aria-label="More" disabled={readOnly} className="rounded p-1 hover:bg-[#EEF0F2]" onClick={() => onRowAction(index, "edit")}>
                      <Ellipsis className="size-5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="sticky bottom-0 z-10">
            <tr className="bg-[#F6F7F8] font-medium">
              <td colSpan={3} />
              <td className="px-3 py-3">Totals</td>
              <td colSpan={LEFT.length - 1} />
              <td colSpan={2} className="border-l border-[#E3E6EA]" />
              <td className={cx("border-l border-[#E3E6EA] py-3", QTY)}>{toFixed(totals.totalPcs, 0)}</td>
              <td className={cx("py-3", QTY)}>{formatWeight(totals.totalWeight)}</td>
              <td className="border-l border-[#E3E6EA]" />
              <td className="px-3 py-3 text-right">
                {formatMoney(totals.subtotal)} {currency}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {!readOnly && (
        <Button size="sm" className="mt-3 bg-[#F6F7F8]" onClick={onAddRow}>
          <Plus className="size-4" /> Add row
        </Button>
      )}
    </div>
  );
}

function FilledCells({ line }: { line: QuotationLine }) {
  return (
    <>
      <td className="px-3 py-4">
        <div className="font-medium">{line.stoneCode || "—"}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#6B7480]">
          {line.stockId && <span>{line.stockId}</span>}
          {line.lot && <Badge variant="lot">{line.lot}</Badge>}
        </div>
      </td>
      <td className="px-3 py-4">{line.locationId}</td>
      <td className="px-3 py-4">
        <div className="font-medium">{line.stone}</div>
        <div className="mt-1 text-xs text-[#6B7480]">{[line.shape, line.size].filter(Boolean).join(" · ")}</div>
      </td>
      <td className="px-3 py-4">
        <div>{[line.color, line.clarity].filter(Boolean).join(" · ")}</div>
        <div className="mt-1 text-xs text-[#6B7480]">{[line.cutting, line.quality].filter(Boolean).join(" · ")}</div>
      </td>
      <td className="px-3 py-4">
        {line.cerType && <Badge>{line.cerType}</Badge>}
        <div className="mt-1 text-xs text-[#6B7480]">{line.cerNo}</div>
      </td>
    </>
  );
}
