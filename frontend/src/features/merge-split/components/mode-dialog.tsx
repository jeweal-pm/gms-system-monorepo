"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { useNumberFormat, type NumberFormat } from "@/features/decimal-setup/number-format-provider";
import { Button, cx } from "@/features/quotation/components/ui";
import { toFixed } from "@/features/quotation/lib/decimal";
import { costPerPiece, createLabel, defaultMode, mergeSummary, MODE_TITLE, modeAvailability, sourceFromStock, stoneLine, unitLabel, UNIT_COST_PLACES, type MsSource } from "../form";
import { MS_MODES, type MsMode, type OwnStockRow } from "../types";

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** P-02 card texts for the picked stocks; Merge uses every stock it would contain. */
export function modeTexts(mergeSources: readonly MsSource[], currency: string, nf: Pick<NumberFormat, "money" | "weight">): Record<MsMode, string[]> {
  const merge = mergeSummary(mergeSources);
  const suggested = merge.suggested;
  return {
    SPLIT: ["Each picked stock becomes 2 or more new stocks. Pcs and weight must add up to the stock. Cost follows weight (per pcs pricing: pcs)."],
    MERGE: [
      `${plural(mergeSources.length, "stock")} → 1 new stock · ${merge.pcs} pcs · ${nf.weight(toFixed(merge.weightCt, 3))} ct · average ${nf.money(toFixed(merge.unitCost, UNIT_COST_PLACES))} ${currency} ${unitLabel(merge.unit)}`,
      suggested
        ? `Suggested details come from the most expensive stock per piece: ${stoneLine(suggested.attrs) || suggested.attrs.stoneCode} (${suggested.stockId}, ${nf.money(toFixed(costPerPiece(suggested), UNIT_COST_PLACES))} ${currency} per pc). Choose location and grading.`
        : "Choose location and grading.",
    ],
  };
}

/**
 * P-02 "How should these stocks be converted?" (FE-MS-004): Load's mode dialog with Split and Merge only. One mode per
 * document: on later picks the document's mode stays selected and the other card is disabled. Merge needs ≥ 2 stocks.
 */
export function MergeSplitModeDialog({ picked, existing = [], documentMode, currency, busy = false, onBack, onCreate }: {
  picked: readonly OwnStockRow[];
  existing?: readonly MsSource[];
  documentMode: MsMode | "";
  currency: string;
  busy?: boolean;
  onBack: () => void;
  onCreate: (mode: MsMode) => void;
}) {
  const nf = useNumberFormat();
  const titleId = useId();
  const [mode, setMode] = useState<MsMode>(defaultMode(picked.length, documentMode));
  const pickedSources = picked.map(sourceFromStock);
  const texts = modeTexts(documentMode === "MERGE" ? [...existing, ...pickedSources] : pickedSources, currency, nf);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  const enabled = modeAvailability(mode, picked.length, documentMode).enabled;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!busy && enabled) onCreate(mode);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1C252E]/30 p-4">
      <form role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit} className="flex max-h-[92vh] w-full max-w-[468px] flex-col rounded-lg bg-white shadow-2xl">
        <h2 id={titleId} className="border-b border-[#E3E6EA] px-5 py-4 text-base font-medium text-[#1C252E]">How should these stocks be converted?</h2>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm text-[#1C252E]">
          <p>
            You picked <strong>{plural(picked.length, "stock")}</strong>. Each new row becomes one stock with its own Stock ID.
          </p>
          <ul className="mt-3 divide-y divide-[#EEF0F2] rounded-lg border border-[#E3E6EA]">
            {picked.map((row) => (
              <li key={row.stockUuid} className="flex justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate">
                    <span className="font-medium">{row.attrs.stone}</span> {[row.attrs.shape, row.attrs.size].filter(Boolean).join(" ")}
                  </span>
                  <span className="block truncate text-xs text-[#6B7480]">
                    {row.stockId} · {nf.money(toFixed(costPerPiece(row), UNIT_COST_PLACES))} {currency} per pc
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  {row.availPcs} pcs · {nf.weight(row.availWeightCt)} ct
                </span>
              </li>
            ))}
          </ul>
          <fieldset className="mt-4 flex flex-col gap-3">
            <legend className="sr-only">Conversion mode</legend>
            {MS_MODES.map((value) => {
              const availability = modeAvailability(value, picked.length, documentMode);
              const selected = mode === value;
              const reasonId = `${titleId}-${value}-reason`;
              return (
                <label
                  key={value}
                  className={cx("flex cursor-pointer gap-3 rounded-lg border px-4 py-3", selected ? "border-[#A9CED0] bg-[#E6F1F1]" : "border-[#E3E6EA] bg-white", !availability.enabled && "cursor-not-allowed opacity-60")}
                >
                  <input
                    type="radio"
                    name="merge-split-mode"
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
                    {availability.reason && <span id={reasonId} className="mt-1 block text-[13px] font-medium text-[#B45309]">{availability.reason}</span>}
                  </span>
                </label>
              );
            })}
          </fieldset>
        </div>
        <footer className="flex items-center justify-between gap-3 border-t border-[#E3E6EA] px-5 py-3">
          <Button onClick={onBack}>Back to list</Button>
          <Button type="submit" variant="primary" disabled={busy || !enabled}>
            {busy ? "Adding…" : createLabel(mode, picked.length, documentMode)}
          </Button>
        </footer>
      </form>
    </div>
  );
}
