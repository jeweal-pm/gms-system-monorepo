"use client";

import { Trash2 } from "lucide-react";
import type { ChangeEvent } from "react";
import { useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import { diff, sanitize, type AdjustmentLine } from "../form";

const group = "px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide";
const cell = "border-b border-gms-border px-2 py-2 align-middle text-sm";
const input = "h-9 w-full min-w-20 rounded-md border border-gms-border bg-gms-surface px-2 text-right tabular-nums outline-none focus:border-gms-primary focus:ring-2 focus:ring-gms-primary/20 disabled:bg-gms-field-disabled";
const colors = { stock: "bg-[#E8F4F3]", physical: "bg-[#FFF0F1]", diff: "bg-[#EEF4FF]" };

export function AdjustmentTable({ lines, editable, selected, rowErrors = {}, onSelect, onChange, onRemove, onPick }:{
  lines: AdjustmentLine[]; editable: boolean; selected: ReadonlySet<string>;
  rowErrors?: Readonly<Record<string, string>>;
  onSelect: (key: string, checked: boolean) => void; onChange: (key: string, field: "physicalPcs" | "physicalWeightCt" | "physicalPrice" | "remark", value: string) => void;
  onRemove: (keys: string[]) => void; onPick: () => void;
}) {
  const nf = useNumberFormat();
  const visibleRows = Math.max(5, lines.length);
  return <div className="overflow-x-auto rounded-lg border border-gms-border">
    <table className="w-full min-w-[1180px] border-collapse">
      <thead>
        <tr className="border-b border-gms-border bg-gms-surface-muted">
          <th rowSpan={2} className="w-10 px-2"><input aria-label="Select all adjustment rows" type="checkbox" disabled={!lines.length || !editable} checked={lines.length > 0 && selected.size === lines.length} onChange={(e) => lines.forEach((line) => onSelect(line.key, e.target.checked))} /></th>
          <th rowSpan={2} className="w-10 px-2">#</th><th rowSpan={2} className="min-w-64 px-3 text-left">Stock ID · Lot</th>
          <th colSpan={3} className={`${group} ${colors.stock}`}>Stock</th><th colSpan={3} className={`${group} ${colors.physical}`}>Physical</th><th colSpan={3} className={`${group} ${colors.diff}`}>Diff</th><th rowSpan={2} className="min-w-40 px-2">Remark</th>
          <th rowSpan={2} className="w-12"></th>
        </tr>
        <tr className="border-b border-gms-border bg-gms-surface-muted text-xs text-gms-text-secondary">
          {(["Pcs", "Cts", "Price", "Pcs", "Cts", "Price", "Pcs", "Cts", "Price"] as const).map((label, i) => <th key={`${label}-${i}`} className={`px-2 py-2 text-right ${i < 3 ? colors.stock : i < 6 ? colors.physical : colors.diff}`}>{label}</th>)}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: visibleRows }, (_, index) => {
          const line = lines[index];
          if (!line) return <tr key={`empty-${index}`} className="h-[72px] border-b border-gms-border last:border-0 hover:bg-gms-surface-muted"><td colSpan={14} className="px-4 text-sm text-gms-text-secondary">{editable ? <button type="button" onClick={onPick} className="w-full cursor-pointer py-4 text-left">{index + 1}<span className="ml-4">Empty row · click to pick from stock</span></button> : <span>{index + 1}<span className="ml-4">—</span></span>}</td></tr>;
          const isSelected = selected.has(line.key);
          const dPcs = diff(line.physicalPcs, line.stockPcs, 0); const dCts = diff(line.physicalWeightCt, line.stockWeightCt, 3); const dPrice = diff(line.physicalPrice, line.stockPrice, 2);
          const diffTone = (value: string | null) => value === null ? "text-gms-text-secondary" : value.startsWith("-") ? "text-gms-danger" : value === "0.000" || value === "0.00" || value === "0" ? "text-gms-text-secondary" : "text-[#15803D]";
          const edit = (field: "physicalPcs" | "physicalWeightCt" | "physicalPrice" | "remark", decimal: number) => (e: ChangeEvent<HTMLInputElement>) => onChange(line.key, field, field === "remark" ? e.target.value.slice(0, 250) : sanitize(e.target.value, decimal));
          return <tr key={line.key} className={`border-b border-gms-border last:border-0 ${isSelected ? "bg-gms-primary/10" : "bg-gms-surface"} hover:bg-gms-surface-muted`}>
            <td className={`${cell} text-center`}><input aria-label={`Select ${line.stockId}`} type="checkbox" checked={isSelected} disabled={!editable} onChange={(e) => onSelect(line.key, e.target.checked)} /></td>
            <td className={`${cell} text-center tabular-nums`}>{index + 1}</td>
            <td className={`${cell} min-w-64`}><strong className="block">{line.attrs.stoneCode || line.stockId}</strong><span className="block text-xs text-gms-text-secondary">{line.attrs.lot} · {line.refDocNo}</span><span className="block text-xs text-gms-text-secondary">{[line.attrs.stone, line.attrs.shape, line.attrs.size, line.attrs.location].filter(Boolean).join(" · ")}</span>{rowErrors[line.key] && <span role="alert" className="mt-1 block text-xs text-gms-danger">{rowErrors[line.key]}</span>}</td>
            <td className={`${cell} ${colors.stock} text-right tabular-nums`}>{line.stockPcs}</td><td className={`${cell} ${colors.stock} text-right tabular-nums`}>{nf.weight(line.stockWeightCt)} cts</td><td className={`${cell} ${colors.stock} text-right tabular-nums`}>{nf.unitPrice(line.stockPrice)} / {line.priceUnit === "PER_PCS" ? "pcs" : "ct"}</td>
            <td className={`${cell} ${colors.physical}`}><input aria-label={`${line.stockId} Physical Pcs`} className={input} inputMode="numeric" placeholder="0" value={line.physicalPcs} disabled={!editable} onChange={edit("physicalPcs", 0)} /></td>
            <td className={`${cell} ${colors.physical}`}><input aria-label={`${line.stockId} Physical Cts`} className={input} inputMode="decimal" placeholder="0.000" value={line.physicalWeightCt} disabled={!editable} onChange={edit("physicalWeightCt", 3)} /></td>
            <td className={`${cell} ${colors.physical}`}><input aria-label={`${line.stockId} Physical Price`} className={input} inputMode="decimal" placeholder="0.00" value={line.physicalPrice} disabled={!editable} onChange={edit("physicalPrice", 2)} /></td>
            <td className={`${cell} ${colors.diff} text-right tabular-nums ${diffTone(dPcs)}`}>{dPcs ?? "–"}</td><td className={`${cell} ${colors.diff} text-right tabular-nums ${diffTone(dCts)}`}>{dCts === null ? "–" : nf.weight(dCts)}</td><td className={`${cell} ${colors.diff} text-right tabular-nums ${diffTone(dPrice)}`}>{dPrice === null ? "–" : nf.unitPrice(dPrice)}</td>
            <td className={cell}><input aria-label={`${line.stockId} Remark`} maxLength={250} className={`${input} text-left`} value={line.remark} disabled={!editable} onChange={edit("remark", 0)} /></td>
            <td className={cell}><button type="button" aria-label={`Remove ${line.stockId}`} disabled={!editable} onClick={() => onRemove([line.key])} className="rounded p-2 text-gms-danger hover:bg-red-50 disabled:opacity-40"><Trash2 className="size-4" /></button></td>
          </tr>;
        })}
      </tbody>
    </table>
    <div className="flex items-center justify-between border-t border-gms-border bg-gms-surface-muted px-3 py-2 text-xs text-gms-text-secondary">
      <span>{lines.length} rows</span><button type="button" disabled={!editable || selected.size === 0} onClick={() => onRemove([...selected])} className="rounded-md px-3 py-1.5 font-medium text-gms-danger hover:bg-red-50 disabled:opacity-40">Remove selected</button>
    </div>
  </div>;
}
