"use client";

import { useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import { toFixed, dec } from "@/features/quotation/lib/decimal";
import { CerCell, GradeCell, HeaderCell, StoneCell, StoneCodeCell } from "@/features/load-to-stock/components/cells";
import { shortDate, unitLabel, UNIT_COST_PLACES, type MsSource } from "../form";
import { TABLE_HEAD, TABLE_ROW } from "@/features/trade-document/table-row";

export const EMPTY_SOURCE_TEXT = "No stocks yet. Use From Stock to pick our own stock.";

/** "Loaded LS2611001 · 02/11/26" (IT-2 note). */
export const loadedNote = (source: Pick<MsSource, "loadedFrom">) =>
  source.loadedFrom.docNo ? `Loaded ${source.loadedFrom.docNo}${source.loadedFrom.docDate ? ` · ${shortDate(source.loadedFrom.docDate)}` : ""}` : "";

/**
 * T-04 Item table (FE-MS-004): the picked own stocks, read-only, one row per Stock ID (Q-MS-01). Pcs / Weight / Amount
 * are the available on hand when picked (IT-7…10); price is the unit cost in the company currency.
 */
export function MergeSplitSourceTable({ sources, currency }: { sources: readonly MsSource[]; currency: string }) {
  const nf = useNumberFormat();
  return (
    <div className="overflow-x-auto rounded-lg">
      <table className="w-full min-w-[1100px] border-collapse text-sm text-[#1C252E]" aria-label="Picked stocks">
        <thead className={`text-left ${TABLE_HEAD}`}>
          <tr>
            <th scope="col" className="w-10 px-3 py-3 font-normal text-[#6B7480]">#</th>
            <HeaderCell title="Stone Code" sub="Stock ID · Lot" />
            <HeaderCell title="Location" />
            <HeaderCell title="Stone" sub="Shape · Size" />
            <HeaderCell title="Color · Clarity" sub="Cutting · Quality" />
            <HeaderCell title="Cer Type" sub="Cer No." />
            <HeaderCell title="Pcs" right />
            <HeaderCell title="Weight (ct)" right />
            <HeaderCell title="Price" sub="Unit" right />
            <HeaderCell title="Amount" right />
          </tr>
        </thead>
        <tbody>
          {sources.length === 0 && (
            <tr>
              <td colSpan={10} className="py-10 text-center text-[#6B7480]">{EMPTY_SOURCE_TEXT}</td>
            </tr>
          )}
          {sources.map((source, index) => (
            <tr key={source.key} className={TABLE_ROW} data-source-stock={source.stockId}>
              <td className="px-3 py-4 text-[#6B7480]">{index + 1}</td>
              <td className="px-3 py-4">
                <StoneCodeCell code={source.attrs.stoneCode} label="Stock ID" stockId={source.stockId} lot={source.lot} note={loadedNote(source) || undefined} />
              </td>
              <td className="px-3 py-4">{source.location || "—"}</td>
              <td className="px-3 py-4"><StoneCell attrs={source.attrs} /></td>
              <td className="px-3 py-4"><GradeCell attrs={source.attrs} /></td>
              <td className="px-3 py-4"><CerCell attrs={source.attrs} /></td>
              <td className="px-3 py-4 text-right tabular-nums">{source.availPcs}</td>
              <td className="px-3 py-4 text-right tabular-nums">{nf.weight(source.availWeightCt)}</td>
              <td className="px-3 py-4 text-right tabular-nums">
                {nf.money(toFixed(dec(source.unitCostBase), UNIT_COST_PLACES))} {currency}
                <div className="mt-1 text-xs text-[#6B7480]">{unitLabel(source.priceUnit)}</div>
              </td>
              <td className="px-3 py-4 text-right font-medium tabular-nums">{nf.money(source.costAmountBase)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
