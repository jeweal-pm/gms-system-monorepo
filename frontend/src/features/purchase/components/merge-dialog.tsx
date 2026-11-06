"use client";

import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cx } from "@/features/quotation/components/ui";
import { useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import { add, dec, toFixed } from "@/features/quotation/lib/decimal";
import { mergePartAmount, type MergePair } from "../form";

export const MERGE_BODY = "Part of this stone was sold to a customer and the rest is still with us on memo. Both parts must go on this purchase. Choose how they appear.";
export const MERGE_BODY_MANY = "Part of these stones was sold to customers and the rest is still with us on memo. Both parts must go on this purchase. Choose how they appear.";
export const mergeTitle = (pairs: readonly MergePair[]) =>
  pairs.length === 1 ? `${pairs[0]!.stockId} is both sold and in stock` : `${pairs.length} items are both sold and in stock`;

export type MergeChoice = "merge" | "separate";

/** Badge as in Add Memo Stock (DV-09): the design's fills with darker text for WCAG AA. Kept here so the lazy picker chunk isn't pulled in. */
function Badge({ tone, children }: { tone: "sold" | "inStock"; children: ReactNode }) {
  return <span className={cx("inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium", tone === "sold" ? "bg-[#FAE6E4] text-[#C2141A]" : "bg-[#C1EFD2] text-[#166534]")}>{children}</span>;
}

/** One item: its Sold and In-stock parts and the total to buy (design source 09/10). */
function PairCard({ pair, currency }: { pair: MergePair; currency: string }) {
  const nf = useNumberFormat();
  const sold = pair.sold.line;
  const inStock = pair.inStock.line;
  const totalPcs = toFixed(add(dec(sold.stockPendingPcs), dec(inStock.stockPendingPcs)), 0);
  const totalWeight = toFixed(add(dec(sold.stockPendingWeightCt), dec(inStock.stockPendingWeightCt)), 3);
  const totalAmount = toFixed(add(dec(mergePartAmount(sold)), dec(mergePartAmount(inStock))), 2);
  const money = (value: string) => `${nf.money(value)} ${currency}`.trim();
  const title = [sold.stone, sold.shape].filter(Boolean).join(" ");
  const rows = [
    { tone: "sold" as const, label: "Sold", caption: "sold to a customer", line: sold },
    { tone: "inStock" as const, label: "In stock", caption: "with us since memo", line: inStock },
  ];
  return (
    <div className="overflow-hidden rounded-lg border border-[#E3E6EA] bg-[#F6F7F8]">
      <div className="px-4 py-3">
        <div className="text-sm font-semibold text-[#1C252E]">
          {pair.stockId} <span className="font-medium">{title}{sold.color ? ` · ${sold.color}` : ""}</span>
        </div>
        <div className="mt-0.5 text-xs text-[#6B7480]">{[sold.sourceDocNo, sold.lot].filter(Boolean).join(" · ")}</div>
      </div>
      <table className="w-full bg-white text-sm">
        <thead>
          <tr className="text-xs text-[#6B7480]">
            <th className="px-4 py-2 text-left font-normal">Stock status</th>
            <th className="px-4 py-2 text-right font-normal">Qty</th>
            <th className="px-4 py-2 text-right font-normal">Weight</th>
            <th className="px-4 py-2 text-right font-normal">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-[#E3E6EA] align-top">
              <td className="px-4 py-3">
                <Badge tone={row.tone}>{row.label}</Badge>
                <div className="mt-1 text-xs text-[#6B7480]">{row.caption}</div>
              </td>
              <td className="px-4 py-3 text-right">{row.line.stockPendingPcs} pcs</td>
              <td className="px-4 py-3 text-right">{nf.weight(row.line.stockPendingWeightCt)} ct</td>
              <td className="px-4 py-3 text-right">{money(mergePartAmount(row.line))}</td>
            </tr>
          ))}
          <tr className="border-t border-[#E3E6EA] bg-[#F6F7F8] font-semibold">
            <td className="px-4 py-3">Total to buy</td>
            <td className="px-4 py-3 text-right">{totalPcs} pcs</td>
            <td className="px-4 py-3 text-right">{nf.weight(totalWeight)} ct</td>
            <td className="px-4 py-3 text-right">{money(totalAmount)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ChoiceCard({ checked, onSelect, title, tag, children }: { checked: boolean; onSelect: () => void; title: string; tag?: string; children: ReactNode }) {
  return (
    <label className={cx("flex cursor-pointer gap-3 rounded-lg border px-4 py-3", checked ? "border-[#2F6B6B] bg-[#E8F2F2]" : "border-[#E3E6EA] bg-white")}>
      <input type="radio" name="merge-choice" checked={checked} onChange={onSelect} className="mt-0.5 size-4 accent-[#1F5C5C]" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[#1C252E]">
          {title}
          {tag && <span className="ml-2 text-xs font-medium text-[#15803D]">{tag}</span>}
        </span>
        <span className="mt-1 block text-xs leading-5 text-[#6B7480]">{children}</span>
      </span>
    </label>
  );
}

/**
 * R3-01 (purchase UI rev 3, ADR-0043; design sources 09/10, owner 2026-11-06): asked after OK in Add Memo Stock when the
 * ticked rows hold the Sold and In-stock parts of one item. One card per item and one choice for every item (Q-PU-25):
 * Merge into one row (preselected) or keep separate rows. "Back to list" and Escape add nothing and go back to the
 * picker with the same rows ticked (Q-PU-26). A native modal <dialog> sits above the picker; Escape stops here so the
 * picker's own Escape handler doesn't close it too.
 */
export function MergeDialog({ pairs, currency, separateCount, onMerge, onSplit, onBack }: {
  pairs: readonly MergePair[];
  currency: string;
  /** Rows added by "Don't merge" (every ticked row). */
  separateCount: number;
  onMerge: () => void;
  onSplit: () => void;
  onBack: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const [choice, setChoice] = useState<MergeChoice>("merge");
  const nf = useNumberFormat();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    // showModal is missing outside a browser (tests render to a string).
    if (typeof dialog.showModal === "function") dialog.showModal();
    confirmRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  const totalPcs = pairs.reduce((sum, pair) => add(sum, dec(pair.sold.line.stockPendingPcs), dec(pair.inStock.line.stockPendingPcs)), dec(0));
  const totalWeight = pairs.reduce((sum, pair) => add(sum, dec(pair.sold.line.stockPendingWeightCt), dec(pair.inStock.line.stockPendingWeightCt)), dec(0));
  const one = pairs.length === 1;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(event) => {
        event.preventDefault();
        onBack();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") event.stopPropagation();
      }}
      className="m-auto flex max-h-[calc(100vh-48px)] w-[min(640px,calc(100vw-32px))] flex-col rounded-xl bg-white p-0 text-[#1C252E] shadow-gms-overlay backdrop:bg-black/30"
    >
      <h2 id={titleId} className="flex h-16 shrink-0 items-center border-b border-[#EDEDED] px-6 text-lg font-semibold">{mergeTitle(pairs)}</h2>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto border-b border-[#EDEDED] px-6 py-5">
        <p id={bodyId} className="text-sm leading-[22px] text-[#1C252E]">{one ? MERGE_BODY : MERGE_BODY_MANY}</p>
        {pairs.map((pair) => (
          <Fragment key={pair.memoStockId}>
            <PairCard pair={pair} currency={currency} />
          </Fragment>
        ))}
        <div role="radiogroup" aria-label="How the parts appear" className="space-y-2">
          <ChoiceCard checked={choice === "merge"} onSelect={() => setChoice("merge")} title="Merge into one row" tag="Recommended if you buy it all">
            {one ? "1 row" : `${pairs.length} rows`} · {toFixed(totalPcs, 0)} pcs · {nf.weight(toFixed(totalWeight, 3))} ct at the memo price
            <br />
            Pcs, weight and price can be changed, but never below the sold part; the sold part is purchased first
          </ChoiceCard>
          <ChoiceCard checked={choice === "separate"} onSelect={() => setChoice("separate")} title="Don't merge · keep separate rows">
            Sold row: only the price can be changed (the whole sold part is purchased)
            <br />
            In-stock row: you can change pcs, weight and price, e.g. buy only part or agree a new price
          </ChoiceCard>
        </div>
      </div>
      <div className="flex justify-between gap-3 px-6 py-4">
        <Button variant="secondary" onClick={onBack}>Back to list</Button>
        <Button ref={confirmRef} variant="primary" onClick={choice === "merge" ? onMerge : onSplit} className="min-w-[96px]">
          {choice === "merge" ? "Merge" : `Add ${separateCount} rows`}
        </Button>
      </div>
    </dialog>
  );
}
