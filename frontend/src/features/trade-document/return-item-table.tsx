"use client";

import { ChevronsUpDown, CircleMinus, Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import { useFormContext, type FieldError } from "react-hook-form";
import type { ItemTable } from "@/features/quotation/components/items/ItemTable";
import { Badge, Button, cx } from "@/features/quotation/components/ui";
import { lineAmount } from "@/features/quotation/lib/calculate";
import { add, dec, div, mul, toFixed, ZERO } from "@/features/quotation/lib/decimal";
import { formatMoney, formatMoneyText, formatWeight } from "@/features/quotation/lib/format";
import { sanitizeQuantity } from "@/features/quotation/lib/number";
import { visibleRowsHeight } from "@/features/quotation/lib/table-scroll";
import { isFilledLine, type QuotationLine } from "@/features/quotation/schema";

/** Same props as the Quotation item table, so the shared document form can use either. */
export type ReturnItemTableProps = Parameters<typeof ItemTable>[0];

/** A row that came from memo stock: pcs / weightCt are the Return quantity, ≤ the Outstanding one. */
export type ReturnLine = QuotationLine & { outstandingPcs: string; outstandingWeightCt: string };

export type ReturnTableOptions = {
  /** Checkbox, remove button and "Selected" bulk remove (memo return design); memo out return has none. */
  rowControls: boolean;
  /** "+ Add row" under the table (memo return design). */
  addRow: boolean;
  /** Typing Return Pcs fills Return Weight in proportion to the Outstanding one (memo return design: 7 of 10 pcs, 3.20 ct → 2.24). */
  autoWeight: boolean;
  /** A saved document in view mode leads with "Stone Code · Stock ID · Lot" (memo return design, view). */
  viewStoneCode: boolean;
};

type Column = { title: string; sub?: string; className: string };

const REST: Column[] = [
  { title: "Location", className: "w-[120px]" },
  { title: "Stone", sub: "Shape · Size", className: "w-[140px]" },
  { title: "Color · Clarity", sub: "Cutting · Quality", className: "w-[150px]" },
  { title: "Cer Type", sub: "Cer No.", className: "w-[120px]" },
];
const QTY = "w-[108px] px-3 text-right";
const DIVIDER = "border-l border-[#E3E6EA]";

/**
 * Return item table shared by memo out return (UI rev 3) and memo return (memo-return UI rev 1): item columns,
 * Outstanding and Return (Pcs, Weight), Memo PRICE and Amount. Rows come from memo stock; only the Return Pcs /
 * Weight are keyed in (owner 2026-10-28: "สามารถแก้ไขได้แค่ column return"). Five rows show; the rest scroll.
 */
export function returnItemTable(options: ReturnTableOptions) {
  return function ReturnItemTable({ lines, currency, totals, selectedIndex, checkedKeys, readOnly, emptyRowText, onSelectRow, onToggleCheck, onToggleAll, onRowAction, onAddRow }: ReturnItemTableProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const returnLines = lines as ReturnLine[];
    const filledLines = returnLines.filter(isFilledLine);
    const outstandingPcs = add(ZERO, ...filledLines.map((line) => dec(line.outstandingPcs)));
    const outstandingWeight = add(ZERO, ...filledLines.map((line) => dec(line.outstandingWeightCt)));
    const controls = options.rowControls && !readOnly;
    const stoneCodeFirst = options.viewStoneCode && readOnly;
    const first: Column = stoneCodeFirst ? { title: "Stone Code", sub: "Stock ID · Lot", className: "w-[200px]" } : { title: "Stock ID", sub: "Lot", className: "w-[180px]" };
    const left = [first, ...REST];
    const allChecked = returnLines.length > 0 && returnLines.every((line) => checkedKeys.has(line.key));
    const lead = controls ? 3 : 1;

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
                {controls && (
                  <>
                    <th rowSpan={2} className="w-10 px-3">
                      <input type="checkbox" aria-label="Select all rows" className="size-5 accent-[#0E5E63]" checked={allChecked} onChange={(e) => onToggleAll(e.target.checked)} />
                    </th>
                    <th rowSpan={2} className="w-9" />
                  </>
                )}
                <th rowSpan={2} className="w-10 px-3 text-center font-normal text-[#6B7480]">#</th>
                {left.map((c) => (
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
                      <span className="block whitespace-nowrap">Memo Price</span>
                      <span className="block text-[11px] font-normal text-[#6B7480]">Unit</span>
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
                const editable = filled && !readOnly;
                return (
                  <tr
                    key={line.key}
                    onClick={() => onSelectRow(index)}
                    className={cx("cursor-pointer border-b border-[#EEF0F2] align-top", index === selectedIndex ? "bg-[#E6F1F1]" : "hover:bg-[#FAFBFB]")}
                  >
                    {controls && (
                      <>
                        <td className="px-3 py-4" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" aria-label={`Select row ${index + 1}`} className="size-5 accent-[#0E5E63]" checked={checkedKeys.has(line.key)} onChange={() => onToggleCheck(line.key)} />
                        </td>
                        <td className="py-4">
                          <button
                            type="button"
                            aria-label={`Remove row ${index + 1}`}
                            className="text-[#E5484D]"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRowAction(index, "remove");
                            }}
                          >
                            <CircleMinus className="size-5" />
                          </button>
                        </td>
                      </>
                    )}
                    <td className="px-3 py-4 text-center text-[#6B7480]">{index + 1}</td>
                    {filled ? (
                      <FilledCells line={line} stoneCodeFirst={stoneCodeFirst} />
                    ) : (
                      <td colSpan={left.length} className="px-3 py-4 text-[#A9B1B9]">
                        {emptyRowText}
                      </td>
                    )}
                    <td className={cx("py-4", QTY, DIVIDER)}>{filled ? line.outstandingPcs || "0" : ""}</td>
                    <td className={cx("py-4", QTY)}>{filled ? formatWeight(dec(line.outstandingWeightCt)) : ""}</td>
                    <td className={cx(editable ? "py-2" : "py-4", QTY, DIVIDER)} onClick={(e) => editable && e.stopPropagation()}>
                      {editable ? <ReturnInput index={index} field="pcs" label={`Return pcs, row ${index + 1}`} line={line} autoWeight={options.autoWeight} /> : filled ? line.pcs || "0" : ""}
                    </td>
                    <td className={cx(editable ? "py-2" : "py-4", QTY)} onClick={(e) => editable && e.stopPropagation()}>
                      {editable ? <ReturnInput index={index} field="weightCt" label={`Return weight, row ${index + 1}`} line={line} autoWeight={false} /> : filled ? formatWeight(dec(line.weightCt)) : ""}
                    </td>
                    <td className={cx("px-3 py-4 text-right", DIVIDER)}>
                      {filled && (
                        <>
                          {formatMoneyText(line.unitPrice)} {currency}
                          <div className="mt-1 text-xs text-[#6B7480]">{line.priceUnit === "PER_PCS" ? "per pcs" : "per cts"}</div>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-4 text-right">{filled ? formatMoney(lineAmount(line)) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 z-10">
              <tr className="bg-[#F6F7F8] font-medium">
                <td colSpan={lead + 1} className="px-3 py-3">Totals</td>
                <td colSpan={left.length - 1} />
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
        {options.addRow && !readOnly && (
          <Button size="sm" className="mt-3 bg-[#F6F7F8]" onClick={onAddRow}>
            <Plus className="size-4" /> Add row
          </Button>
        )}
      </div>
    );
  };
}

/** Return cell limits (server): pcs a whole number ≤ 999,999; weight 5 whole digits + 3 decimals. */
const RETURN_LIMITS = { pcs: { whole: 6, decimals: 0, placeholder: "0" }, weightCt: { whole: 5, decimals: 3, placeholder: "0.00" } } as const;

/**
 * Return Pcs / Weight of one row — the only editable cells (≤ Outstanding, checked by the form schema). Numbers only,
 * empty with a "0" placeholder (owner 2026-10-29); the row is checked as you type. With `autoWeight`, a new pcs
 * value also fills the weight in proportion: Outstanding weight × pcs ÷ Outstanding pcs.
 */
function ReturnInput({ index, field, label, line, autoWeight }: { index: number; field: "pcs" | "weightCt"; label: string; line: ReturnLine; autoWeight: boolean }) {
  const { register, setValue, trigger, clearErrors, getValues, formState } = useFormContext();
  const limits = RETURN_LIMITS[field];
  const error = (formState.errors.lines as unknown as Record<string, FieldError | undefined>[] | undefined)?.[index]?.[field] as FieldError | undefined;
  const rowFields = [`lines.${index}.pcs`, `lines.${index}.weightCt`];
  const registered = register(`lines.${index}.${field}`, {
    onChange: autoWeight
      ? (event: { target: { value: string } }) => {
          const outstanding = dec(line.outstandingPcs);
          if (outstanding <= ZERO) return;
          // An emptied pcs empties the weight too (back to its placeholder).
          if (event.target.value === "") return setValue(`lines.${index}.weightCt`, "", { shouldDirty: true });
          // Two decimals, as the design shows (7 of 10 pcs, 3.20 ct → 2.24); the weight stays editable.
          const weight = div(mul(dec(line.outstandingWeightCt), dec(event.target.value)), outstanding);
          setValue(`lines.${index}.weightCt`, toFixed(weight, 2), { shouldDirty: true });
        }
      : undefined,
  });
  return (
    <input
      {...registered}
      onChange={(event) => {
        event.target.value = sanitizeQuantity(event.target.value, limits.whole, limits.decimals);
        void registered.onChange(event).then(() => {
          // "More than outstanding" shows as you type; an empty row is reported on Save ("Enter the return quantity").
          const empty = rowFields.every((name) => !getValues(name));
          if (empty && !formState.isSubmitted) clearErrors(rowFields);
          else void trigger(rowFields);
        });
      }}
      aria-label={label}
      aria-invalid={error ? true : undefined}
      title={error?.message}
      placeholder={limits.placeholder}
      autoComplete="off"
      inputMode={limits.decimals === 0 ? "numeric" : "decimal"}
      className={cx("h-9 w-full rounded-md border bg-white px-2 text-right outline-none placeholder:text-gms-text-placeholder focus:border-[#0E5E63]", error ? "border-[#E5484D]" : "border-[#DFE3E8]")}
    />
  );
}

function FilledCells({ line, stoneCodeFirst }: { line: QuotationLine; stoneCodeFirst: boolean }) {
  return (
    <>
      <td className="px-3 py-4">
        {stoneCodeFirst ? (
          <>
            <div className="font-medium">{line.stoneCode || "—"}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#6B7480]">
              {line.stockId && <span>{line.stockId}</span>}
              {line.lot && <Badge variant="lot">{line.lot}</Badge>}
            </div>
          </>
        ) : (
          <>
            <div className="font-medium">{line.stockId || line.stoneCode || "—"}</div>
            {line.lot && <div className="mt-1 text-xs text-[#6B7480]">{line.lot}</div>}
          </>
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
