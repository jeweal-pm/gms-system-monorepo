"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { useNumberFormat, type NumberFormat } from "@/features/decimal-setup/number-format-provider";
import { Button, cx } from "@/features/quotation/components/ui";
import { toFixed } from "@/features/quotation/lib/decimal";
import { amountPerPiece, createLabel, gradeLine, mergeSummary, MODE_LABEL, modeAvailability, stoneLine, unitLabel, UNIT_COST_PLACES } from "../form";
import { MODES, type LoadMode, type PurchaseLineRef } from "../types";

export const MODE_TITLE: Record<LoadMode, string> = {
  NONE: "None · as it is, one load row per PU line",
  SPLIT: "Split · one load row per PU line",
  MERGE: "Merge · all picked PU lines into one load",
};

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** The card texts of P-02 (source 02/06) for the picked lines; Merge uses every line it would contain. */
export function modeTexts(picked: readonly PurchaseLineRef[], mergeLines: readonly PurchaseLineRef[], currency: string, nf: Pick<NumberFormat, "money" | "weight">): Record<LoadMode, string[]> {
  const n = picked.length;
  const merge = mergeSummary(mergeLines);
  const suggested = merge.suggested;
  return {
    NONE: [
      `${plural(n, "load row")}, same as the PU lines`,
      "Every detail can be changed, including stone, shape, size, pcs and weight. No rows can be added.",
    ],
    SPLIT: [
      `${plural(n, "load row")} → ${plural(n, "stock")}`,
      "Each row keeps its own cost. Pcs, weight and details can be changed, e.g. to split a line over several locations.",
    ],
    MERGE: [
      `${plural(mergeLines.length, "line")} → 1 row · ${merge.pcs} pcs · ${nf.weight(toFixed(merge.weightCt, 3))} ct · average ${nf.money(toFixed(merge.price, UNIT_COST_PLACES))} ${currency} ${unitLabel(merge.unit)}`,
      suggested
        ? `Suggested details come from the most expensive line per piece: ${stoneLine(suggested) || suggested.stoneCode} (${suggested.purchase.docNo}, ${nf.money(toFixed(amountPerPiece(suggested), UNIT_COST_PLACES))} ${currency} per pc). Change stone, grading and certificate in the row if needed. Pcs and weight come from the PU lines. A merged row can't be split later.`
        : "Pcs and weight come from the PU lines. A merged row can't be split later.",
    ],
  };
}

/**
 * P-02 "How should these PU lines go into stock?" (FE-LS-005, source 02/06). One mode per document (owner Q-LS-07,
 * ADR-0052 D7): on the first pick the user chooses; on later picks the document's mode stays selected and the other
 * cards are disabled with "This document is in {mode} mode". Merge needs ≥ 2 lines (mixed units allowed, Q-LS-08).
 * Back to list returns to the picker with its ticks; Enter = Create.
 */
export function LoadModeDialog({ picked, existing = [], documentMode, currency, busy = false, onBack, onCreate }: {
  picked: readonly PurchaseLineRef[];
  /** Lines already on the document (a Merge document's merged row). */
  existing?: readonly PurchaseLineRef[];
  documentMode: LoadMode | "";
  currency: string;
  busy?: boolean;
  onBack: () => void;
  onCreate: (mode: LoadMode) => void;
}) {
  const nf = useNumberFormat();
  const titleId = useId();
  const [mode, setMode] = useState<LoadMode>(documentMode || "NONE");
  const mergeLines = documentMode === "MERGE" ? [...existing, ...picked] : picked;
  const texts = modeTexts(picked, mergeLines, currency, nf);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!busy && modeAvailability(mode, picked.length, documentMode).enabled) onCreate(mode);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1C252E]/30 p-4">
      <form role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit} className="flex max-h-[92vh] w-full max-w-[468px] flex-col rounded-lg bg-white shadow-2xl">
        <h2 id={titleId} className="border-b border-[#E3E6EA] px-5 py-4 text-base font-medium text-[#1C252E]">How should these PU lines go into stock?</h2>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm text-[#1C252E]">
          <p>
            You picked <strong>{plural(picked.length, "PU line")}</strong>. Each load row becomes one stock with its own Stock ID.
          </p>
          <ul className="mt-3 divide-y divide-[#EEF0F2] rounded-lg border border-[#E3E6EA]">
            {picked.map((ref) => (
              <li key={ref.purchaseLineId} className="flex justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate">
                    <span className="font-medium">{ref.stone}</span> {[ref.shape, ref.size].filter(Boolean).join(" ")}
                    {gradeLine(ref) ? ` · ${gradeLine(ref)}` : ""}
                  </span>
                  <span className="block truncate text-xs text-[#6B7480]">
                    {ref.purchase.docNo} · {nf.unitPrice(ref.unitPrice)} {ref.purchase.currency} {unitLabel(ref.priceUnit)} · {nf.money(toFixed(amountPerPiece(ref), UNIT_COST_PLACES))} {currency} per pc
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  {ref.remainingPcs} pcs · {nf.weight(ref.remainingWeightCt)} ct
                </span>
              </li>
            ))}
          </ul>

          <fieldset className="mt-4 flex flex-col gap-3">
            <legend className="sr-only">Load mode</legend>
            {MODES.map((value) => {
              const availability = modeAvailability(value, picked.length, documentMode);
              const selected = mode === value;
              const reasonId = `${titleId}-${value}-reason`;
              return (
                <label
                  key={value}
                  className={cx(
                    "flex cursor-pointer gap-3 rounded-lg border px-4 py-3",
                    selected ? "border-[#A9CED0] bg-[#E6F1F1]" : "border-[#E3E6EA] bg-white",
                    !availability.enabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <input
                    type="radio"
                    name="load-mode"
                    value={value}
                    checked={selected}
                    disabled={!availability.enabled}
                    aria-describedby={availability.reason ? reasonId : undefined}
                    onChange={() => setMode(value)}
                    className="mt-1 size-4 accent-[#006A70]"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{MODE_TITLE[value]}</span>
                    {texts[value].map((line) => (
                      <span key={line} className="mt-1 block text-[13px] text-[#6B7480]">{line}</span>
                    ))}
                    {availability.reason && (
                      <span id={reasonId} className="mt-1 block text-[13px] font-medium text-[#B45309]">{availability.reason}</span>
                    )}
                  </span>
                </label>
              );
            })}
          </fieldset>
        </div>
        <footer className="flex items-center justify-between gap-3 border-t border-[#E3E6EA] px-5 py-3">
          <Button onClick={onBack}>Back to list</Button>
          <Button type="submit" variant="primary" disabled={busy || !modeAvailability(mode, picked.length, documentMode).enabled}>
            {busy ? "Adding…" : createLabel(mode, picked.length, documentMode)}
          </Button>
        </footer>
      </form>
    </div>
  );
}

export { MODE_LABEL };
