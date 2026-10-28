"use client";

import { ChevronsUpDown, Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import { useFormContext, type FieldError } from "react-hook-form";
import type { ItemTable } from "@/features/quotation/components/items/ItemTable";
import { Badge, Button, cx } from "@/features/quotation/components/ui";
import { lineAmount } from "@/features/quotation/lib/calculate";
import { formatMoney, formatMoneyText, formatWeight } from "@/features/quotation/lib/format";
import { add, dec, toFixed, ZERO } from "@/features/quotation/lib/decimal";
import { visibleRowsHeight } from "@/features/quotation/lib/table-scroll";
import { isFilledLine, type QuotationLine } from "@/features/quotation/schema";
import type { MemoOutReturnLine } from "../api";

/** Same props as the Quotation item table, so the shared document form can use either. */
export type ReturnItemTableProps = Parameters<typeof ItemTable>[0];

type Column = { title: string; sub?: string; className: string };

/** memo-out-return UI rev 3 (owner design 2026-10-28): item columns, Outstanding and Return (Pcs, Weight), price. */
const LEFT: Column[] = [
  { title: "STOCK ID", sub: "LOT", className: "w-[180px]" },
  { title: "LOCATION", className: "w-[120px]" },
  { title: "STONE", sub: "SHAPE · SIZE", className: "w-[140px]" },
  { title: "COLOR · CLARITY", sub: "CUTTING · QUALITY", className: "w-[150px]" },
  { title: "CER TYPE", sub: "CER NO.", className: "w-[120px]" },
];
const QTY = "w-[108px] px-3 text-right";
const DIVIDER = "border-l border-[#E3E6EA]";

/**
 * Memo Out Return item table (memo-out-return UI rev 3). Rows come from Memo Stock with their Outstanding
 * quantity; only the Return Pcs / Weight are keyed in here (owner 2026-10-28: "สามารถแก้ไขได้แค่ column return"),
 * so there is no row menu, checkbox or remove button. Five rows show; the rest scroll.
 */
export function ReturnItemTable({ lines, currency, totals, selectedIndex, readOnly, emptyRowText, onSelectRow, onAddRow }: ReturnItemTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const returnLines = lines as MemoOutReturnLine[];
  const filledLines = returnLines.filter(isFilledLine);
  const outstandingPcs = add(ZERO, ...filledLines.map((line) => dec(line.outstandingPcs)));
  const outstandingWeight = add(ZERO, ...filledLines.map((line) => dec(line.outstandingWeightCt)));

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
              <th rowSpan={2} className="w-10 px-3 text-center font-normal text-[#6B7480]">#</th>
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
              <th colSpan={2} className={cx("border-b border-[#E3E6EA] px-3 py-3 text-center font-medium", DIVIDER)}>Outstanding</th>
              <th colSpan={2} className={cx("border-b border-[#E3E6EA] px-3 py-3 text-center font-medium", DIVIDER)}>Return</th>
              <th rowSpan={2} className={cx("w-[130px] px-3 py-3 text-right font-medium", DIVIDER)}>
                <span className="inline-flex flex-row-reverse items-center gap-1.5">
                  <span className="leading-tight">
                    <span className="block whitespace-nowrap">Memo PRICE</span>
                    <span className="block text-[11px] font-normal text-[#6B7480]">UNIT</span>
                  </span>
                  <ChevronsUpDown className="size-3 text-[#95A0A9]" />
                </span>
              </th>
              <th rowSpan={2} className="w-[130px] px-3 py-3 text-right font-medium">Amount</th>
            </tr>
            <tr>
              <th className={cx("py-2.5 font-medium", QTY, DIVIDER)}>Pcs</th>
              <th className={cx("py-2.5 font-medium", QTY)}>Weight</th>
              <th className={cx("py-2.5 font-medium", QTY, DIVIDER)}>Pcs</th>
              <th className={cx("py-2.5 font-medium", QTY)}>Weight</th>
            </tr>
          </thead>
          <tbody>
            {returnLines.map((line, index) => {
              const filled = isFilledLine(line);
              return (
                <tr
                  key={line.key}
                  onClick={() => onSelectRow(index)}
                  className={cx("cursor-pointer border-b border-[#EEF0F2] align-top", index === selectedIndex ? "bg-[#E6F1F1]" : "hover:bg-[#FAFBFB]")}
                >
                  <td className="px-3 py-4 text-center text-[#6B7480]">{index + 1}</td>
                  {filled ? (
                    <FilledCells line={line} />
                  ) : (
                    <td colSpan={LEFT.length} className="px-3 py-4 text-[#A9B1B9]">
                      {emptyRowText}
                    </td>
                  )}
                  <td className={cx("py-4", QTY, DIVIDER)}>{filled ? line.outstandingPcs || "0" : ""}</td>
                  <td className={cx("py-4", QTY)}>{filled ? formatWeight(dec(line.outstandingWeightCt)) : ""}</td>
                  <td className={cx("py-2", QTY, DIVIDER)} onClick={(e) => filled && e.stopPropagation()}>
                    {filled && <ReturnInput index={index} field="pcs" label={`Return pcs, row ${index + 1}`} readOnly={readOnly} />}
                  </td>
                  <td className={cx("py-2", QTY)} onClick={(e) => filled && e.stopPropagation()}>
                    {filled && <ReturnInput index={index} field="weightCt" label={`Return weight, row ${index + 1}`} readOnly={readOnly} />}
                  </td>
                  <td className={cx("px-3 py-4 text-right", DIVIDER)}>{filled ? `${formatMoneyText(line.unitPrice)} ${currency}` : ""}</td>
                  <td className="px-3 py-4 text-right">{filled ? formatMoney(lineAmount(line)) : ""}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="sticky bottom-0 z-10">
            <tr className="bg-[#F6F7F8] font-medium">
              <td colSpan={2} className="px-3 py-3">Totals</td>
              <td colSpan={LEFT.length - 1} />
              <td className={cx("py-3", QTY, DIVIDER)}>{toFixed(outstandingPcs, 0)}</td>
              <td className={cx("py-3", QTY)}>{formatWeight(outstandingWeight)}</td>
              <td className={cx("py-3", QTY, DIVIDER)}>{toFixed(totals.totalPcs, 0)}</td>
              <td className={cx("py-3", QTY)}>{formatWeight(totals.totalWeight)}</td>
              <td className={DIVIDER} />
              <td className="px-3 py-3 text-right">
                {formatMoney(totals.subtotal)} {currency}
              </td>
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

/** Return Pcs / Weight of one row — the only editable cells (≤ Outstanding, checked by the form schema). */
function ReturnInput({ index, field, label, readOnly }: { index: number; field: "pcs" | "weightCt"; label: string; readOnly: boolean }) {
  const { register, formState } = useFormContext();
  const error = (formState.errors.lines as unknown as Record<string, FieldError | undefined>[] | undefined)?.[index]?.[field] as FieldError | undefined;
  return (
    <input
      {...register(`lines.${index}.${field}`)}
      aria-label={label}
      aria-invalid={error ? true : undefined}
      title={error?.message}
      inputMode="decimal"
      readOnly={readOnly}
      className={cx(
        "h-9 w-full rounded-md border bg-white px-2 text-right outline-none focus:border-[#0E5E63] read-only:border-transparent read-only:bg-transparent",
        error ? "border-[#E5484D]" : "border-[#DFE3E8]",
      )}
    />
  );
}

function FilledCells({ line }: { line: QuotationLine }) {
  return (
    <>
      <td className="px-3 py-4">
        <div className="font-medium">{line.stockId || line.stoneCode || "—"}</div>
        {line.lot && (
          <div className="mt-1">
            <Badge variant="lot">{line.lot}</Badge>
          </div>
        )}
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
