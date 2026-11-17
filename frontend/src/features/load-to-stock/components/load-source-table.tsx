"use client";

import { useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import { shortDate, unitLabel } from "../form";
import type { PurchaseLineRef } from "../types";
import { CerCell, GradeCell, HeaderCell, StoneCell, StoneCodeCell } from "./cells";

/** "per ct · rate 36.20" (the rate only when the PU is in another currency). */
export function priceSub(ref: Pick<PurchaseLineRef, "priceUnit" | "purchase">, companyCurrency: string): string {
  const unit = unitLabel(ref.priceUnit);
  return ref.purchase.currency !== companyCurrency ? `${unit} · rate ${ref.purchase.rate}` : unit;
}

/**
 * T-04 Item table (FE-LS-003): the picked PU lines, read-only, one row each. Pcs / Weight / Amount are the line's
 * remaining before this document (IT-7…10); the location is the PU line's (IT-3, DV-03).
 */
export function LoadSourceTable({ sources, companyCurrency }: { sources: readonly PurchaseLineRef[]; companyCurrency: string }) {
  const nf = useNumberFormat();
  return (
    <div className="overflow-x-auto rounded-lg">
      <table className="w-full min-w-[1100px] border-collapse text-sm text-[#1C252E]" aria-label="Picked purchase lines">
        <thead className="bg-[#F6F7F8] text-left">
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
              <td colSpan={10} className="py-10 text-center text-[#6B7480]">
                No PU lines yet. Use From Purchase to pick lines to load.
              </td>
            </tr>
          )}
          {sources.map((ref, index) => (
            <tr key={ref.purchaseLineId} className="border-b border-[#EEF0F2] align-top">
              <td className="px-3 py-4 text-[#6B7480]">{index + 1}</td>
              <td className="px-3 py-4">
                <StoneCodeCell code={ref.stoneCode} label="New on load" stockId={null} lot={ref.lot} note={`From ${ref.purchase.docNo} · ${shortDate(ref.purchase.docDate)}`} />
              </td>
              <td className="px-3 py-4">{ref.location || "—"}</td>
              <td className="px-3 py-4"><StoneCell attrs={ref} /></td>
              <td className="px-3 py-4"><GradeCell attrs={ref} /></td>
              <td className="px-3 py-4"><CerCell attrs={ref} /></td>
              <td className="px-3 py-4 text-right tabular-nums">{ref.remainingPcs}</td>
              <td className="px-3 py-4 text-right tabular-nums">{nf.weight(ref.remainingWeightCt)}</td>
              <td className="px-3 py-4 text-right tabular-nums">
                {nf.unitPrice(ref.unitPrice)} {ref.purchase.currency}
                <div className="mt-1 text-xs text-[#6B7480]">{priceSub(ref, companyCurrency)}</div>
              </td>
              <td className="px-3 py-4 text-right font-medium tabular-nums">{nf.money(ref.remainingAmountBase)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
