"use client";

import { ChevronsUpDown, CircleMinus, Ellipsis, MessageSquare, Plus } from "lucide-react";
import { useState } from "react";
import { lineAmount, type QuotationTotals } from "../../lib/calculate";
import { dec, toFixed } from "../../lib/decimal";
import { formatMoney, formatMoneyText, formatWeight } from "../../lib/format";
import { isFilledLine, type QuotationLine } from "../../schema";
import { Badge, Button, cx } from "../ui";

type Column = { title: string; sub?: string; align?: "right"; className?: string };

const COLUMNS: Column[] = [
  { title: "Stone Code", sub: "STOCK ID · LOT", className: "w-[200px]" },
  { title: "LOCATION", className: "w-[96px]" },
  { title: "STONE", sub: "SHAPE · SIZE", className: "w-[150px]" },
  { title: "COLOR · CLARITY", sub: "CUTTING · QUALITY", className: "w-[150px]" },
  { title: "CER TYPE", sub: "CER NO.", className: "w-[140px]" },
  { title: "PCS", align: "right", className: "w-[64px]" },
  { title: "Weight (ct)", align: "right", className: "w-[100px]" },
  { title: "SALE PRICE", sub: "UNIT", align: "right", className: "w-[130px]" },
  { title: "Amount", align: "right", className: "w-[120px] border-l border-[#E3E6EA]" },
];

export type RowAction = "edit" | "duplicate" | "clear" | "remove";

export function ItemTable({
  lines,
  currency,
  totals,
  selectedIndex,
  checkedKeys,
  readOnly,
  onSelectRow,
  onToggleCheck,
  onToggleAll,
  onRowAction,
  onAddRow,
}: {
  lines: QuotationLine[];
  currency: string;
  totals: QuotationTotals;
  selectedIndex: number | null;
  checkedKeys: Set<string>;
  readOnly: boolean;
  onSelectRow: (index: number) => void;
  onToggleCheck: (key: string) => void;
  onToggleAll: (checked: boolean) => void;
  onRowAction: (index: number, action: RowAction) => void;
  onAddRow: () => void;
}) {
  const allChecked = lines.length > 0 && lines.every((l) => checkedKeys.has(l.key));

  return (
    <div className="min-w-0 flex-1">
      <div className="overflow-x-auto rounded-lg">
        <table className="w-full min-w-[1180px] border-collapse text-sm text-[#1C252E]">
          <thead className="bg-[#F6F7F8] text-left">
            <tr>
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all rows"
                  className="size-5 accent-[#0E5E63]"
                  checked={allChecked}
                  disabled={readOnly}
                  onChange={(e) => onToggleAll(e.target.checked)}
                />
              </th>
              <th className="w-9" />
              <th className="w-8 px-2 text-center font-normal text-[#6B7480]">#</th>
              {COLUMNS.map((c) => (
                <th key={c.title} className={cx("px-3 py-3 font-medium", c.className, c.align === "right" && "text-right")}>
                  <span className={cx("inline-flex items-center gap-1.5", c.align === "right" && "flex-row-reverse")}>
                    <span className="leading-tight">
                      <span className="block">{c.title}</span>
                      {c.sub && <span className="block text-[11px] font-normal text-[#6B7480]">{c.sub}</span>}
                    </span>
                    {/* TODO: sorting */}
                    <ChevronsUpDown className="size-3 text-[#95A0A9]" />
                  </span>
                </th>
              ))}
              <th className="w-14 px-3 font-medium">More</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const filled = isFilledLine(line);
              const selected = index === selectedIndex;
              return (
                <tr
                  key={line.key}
                  onClick={() => onSelectRow(index)}
                  className={cx(
                    "cursor-pointer border-b border-[#EEF0F2] align-top",
                    selected ? "bg-[#E6F1F1]" : "hover:bg-[#FAFBFB]",
                  )}
                >
                  <td className="px-3 py-4" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select row ${index + 1}`}
                      className="size-5 accent-[#0E5E63]"
                      checked={checkedKeys.has(line.key)}
                      disabled={readOnly}
                      onChange={() => onToggleCheck(line.key)}
                    />
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
                    <FilledCells line={line} currency={currency} />
                  ) : (
                    <>
                      <td colSpan={COLUMNS.length - 1} className="px-3 py-4 text-[#A9B1B9]">
                        Empty row · click to key in, or use From Stock to fill it
                      </td>
                      <td className="border-l border-[#E3E6EA]" />
                    </>
                  )}

                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <RowMenu disabled={readOnly} filled={filled} onAction={(a) => onRowAction(index, a)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-[#F6F7F8] font-medium">
              <td colSpan={3} />
              <td className="px-3 py-3">Totals</td>
              <td colSpan={4} />
              <td className="px-3 py-3 text-right">{toFixed(totals.totalPcs, 0)}</td>
              <td className="px-3 py-3 text-right">{formatWeight(totals.totalWeight)}</td>
              <td />
              <td className="border-l border-[#E3E6EA] px-3 py-3 text-right">{formatMoney(totals.subtotal)}</td>
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

function FilledCells({ line, currency }: { line: QuotationLine; currency: string }) {
  return (
    <>
      <td className="px-3 py-4">
        <div className="font-medium">{line.stoneCode || "—"}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#6B7480]">
          {line.stockId && <span>{line.stockId}</span>}
          {line.lot && <Badge variant="lot">{line.lot}</Badge>}
        </div>
        {line.itemNote && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-[#6B7480]">
            <MessageSquare className="size-3" /> {line.itemNote}
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
      <td className="px-3 py-4 text-right">{line.pcs || "0"}</td>
      <td className="px-3 py-4 text-right">{formatWeight(dec(line.weightCt))} cts</td>
      <td className="px-3 py-4 text-right">
        <div>
          {formatMoneyText(line.unitPrice)} {currency}
        </div>
        <div className="mt-1 text-xs text-[#6B7480]">{line.priceUnit === "PER_CT" ? "per cts" : "per pcs"}</div>
      </td>
      <td className="border-l border-[#E3E6EA] px-3 py-4 text-right">{formatMoney(lineAmount(line))}</td>
    </>
  );
}

function RowMenu({ disabled, filled, onAction }: { disabled: boolean; filled: boolean; onAction: (a: RowAction) => void }) {
  const [open, setOpen] = useState(false);
  const items: { action: RowAction; label: string; danger?: boolean; hidden?: boolean }[] = [
    { action: "edit", label: "Edit" },
    { action: "duplicate", label: "Duplicate", hidden: !filled },
    { action: "clear", label: "Clear row", hidden: !filled },
    { action: "remove", label: "Remove row", danger: true },
  ];
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="More"
        className="rounded p-1 hover:bg-[#EEF0F2]"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      >
        <Ellipsis className="size-5" />
      </button>
      {open && (
        <ul className="absolute right-0 z-20 mt-1 w-36 overflow-hidden rounded-lg border border-[#E3E6EA] bg-white py-1 text-sm shadow-lg">
          {items
            .filter((i) => !i.hidden && (!disabled || i.action === "edit"))
            .map((i) => (
              <li key={i.action}>
                <button
                  type="button"
                  className={cx("w-full px-3 py-2 text-left hover:bg-[#F6F7F8]", i.danger && "text-[#E5484D]")}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setOpen(false);
                    onAction(i.action);
                  }}
                >
                  {disabled && i.action === "edit" ? "View" : i.label}
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
