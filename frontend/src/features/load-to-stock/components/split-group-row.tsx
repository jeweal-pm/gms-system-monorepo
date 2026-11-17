"use client";

import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import { Button, IconButton } from "@/features/quotation/components/ui";
import { add, dec, toFixed } from "@/features/quotation/lib/decimal";
import { unitLabel, type SplitGroup } from "../form";

/** "→ No location yet" / "→ 1 location" / "→ 3 locations" (distinct non-empty locations of the group's rows). */
export function groupLocationText(group: SplitGroup): string {
  const count = new Set(group.rows.map(({ row }) => row.location.trim().toLowerCase()).filter(Boolean)).size;
  if (count === 0) return "→ No location yet";
  return `→ ${count} location${count === 1 ? "" : "s"}`;
}

export const groupRowsText = (group: SplitGroup) => `${group.rows.length} load row${group.rows.length === 1 ? "" : "s"}`;

/**
 * S-01 Split group row (FE-LS-007, source 04): one per picked PU line, fill #F9F9F9. Collapse chevron, "{PU} · {stone}",
 * the line's grading / lot / certificate, location and row counts, the line's remaining "{pcs} pcs · {weight} cts" with
 * its amount and price, "+ Split" (adds a child with the unallocated rest) and the trash (removes the line, confirmed).
 */
export function SplitGroupRow({ group, number, collapsed, readOnly, currency, columns, onToggle, onSplit, onRemove }: {
  group: SplitGroup;
  number: number;
  collapsed: boolean;
  readOnly: boolean;
  currency: string;
  columns: number;
  onToggle: () => void;
  onSplit: () => void;
  onRemove: () => void;
}) {
  const nf = useNumberFormat();
  const { ref } = group;
  const loadedPcs = group.rows.reduce((sum, { row }) => sum + (Number.parseInt(row.pcs || "0", 10) || 0), 0);
  const loadedWeight = add(...group.rows.map(({ row }) => dec(row.weightCt)));
  const over = loadedPcs > ref.remainingPcs || loadedWeight > dec(ref.remainingWeightCt);
  const sub = [ref.color, ref.clarity, ref.cutting, ref.quality, ref.lot && `Lot ${ref.lot}`, [ref.cerType, ref.cerNo].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
  return (
    <tr className="border-b border-[#EEF0F2] bg-[#F9F9F9] align-top" data-split-group={ref.purchaseLineId}>
      <td colSpan={columns} className="px-3 py-3">
        <div className="flex flex-wrap items-start gap-3">
          <IconButton label={collapsed ? "Expand group" : "Collapse group"} aria-expanded={!collapsed} onClick={onToggle} className="size-7">
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
          </IconButton>
          <span className="pt-1 font-medium text-[#0E5E63]">{number}</span>
          <div className="min-w-[220px] flex-1">
            <div className="font-medium">
              {ref.purchase.docNo} · {[ref.stone, ref.shape, ref.size].filter(Boolean).join(" ")}
            </div>
            <div className="mt-1 text-xs text-[#6B7480]">{sub}</div>
          </div>
          <div className="min-w-[140px] text-sm">
            <div>{groupLocationText(group)}</div>
            <div className="mt-1 text-xs text-[#6B7480]">{groupRowsText(group)}</div>
          </div>
          <div className="min-w-[200px] text-right">
            <div className={over ? "font-medium text-[#E5484D]" : "font-medium"}>
              {ref.remainingPcs} pcs · {nf.weight(ref.remainingWeightCt)} cts
            </div>
            <div className="mt-1 text-xs text-[#6B7480]">
              {nf.money(ref.remainingAmountBase)} {currency} · {nf.money(toFixed(dec(ref.unitCostBase), 4))}/{unitLabel(ref.priceUnit).replace("per ", "")}
            </div>
            {over && <div className="mt-1 text-xs text-[#E5484D]">Rows add up to more than is left on {ref.purchase.docNo}</div>}
          </div>
          {!readOnly && (
            <div className="flex items-center gap-1">
              <Button size="sm" onClick={onSplit} aria-label={`Split ${ref.purchase.docNo} ${ref.stone}`}>
                <Plus className="size-4" /> Split
              </Button>
              <IconButton label={`Remove ${ref.purchase.docNo} ${ref.stone}`} onClick={onRemove} className="text-[#EB8487]">
                <Trash2 className="size-4" />
              </IconButton>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}
