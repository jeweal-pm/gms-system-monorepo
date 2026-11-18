"use client";

import { ArrowRight, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DateInput } from "@/components/ui/date-input";
import { useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import { Button, cx, IconButton } from "@/features/quotation/components/ui";
import { loadLoadError, usePurchaseLineSearch, type SearchInput } from "../api";
import { shortDate } from "../form";
import type { PurchaseLineRef } from "../types";
import { CerCell, GradeCell, HeaderCell, StoneCell, StoneCodeCell } from "./cells";
import { priceSub } from "./load-source-table";

export const PICKER_EMPTY_TEXT = "No purchase lines left to load";
export const PICKER_SEARCH_PLACEHOLDER = "Search PU no., stone code, lot, cer no.";

/** Rows of the loaded pages without the lines already on the document (the server excludes them too). */
export function pickerRows(pages: readonly { items: readonly PurchaseLineRef[] }[] | undefined, excluded: ReadonlySet<string>): PurchaseLineRef[] {
  const seen = new Set<string>();
  return (pages ?? []).flatMap((page) =>
    page.items.filter((item) => {
      if (excluded.has(item.purchaseLineId) || seen.has(item.purchaseLineId) || item.remainingPcs <= 0) return false;
      seen.add(item.purchaseLineId);
      return true;
    }),
  );
}

/**
 * P-01 Add From Purchase (FE-LS-004, source 01): lines of approved Purchases of the document's vendor with remaining
 * pcs > 0 (owner Q-LS-26), without the lines on this document. Search (250 ms, DV-06) and a PU Doc Date range; 50 a page
 * with Load more. OK is disabled until a row is ticked; ticks are kept while the mode dialog is open (Back to list).
 * Esc / ✕ / Cancel close it (the page returns focus to From Purchase); `suspended` lets the mode dialog own Esc.
 */
export function PurchaseLinePicker({ vendorId, companyCurrency, excludeLineIds, excludeAllocationOf, suspended = false, onCancel, onConfirm }: {
  vendorId: string;
  companyCurrency: string;
  excludeLineIds: readonly string[];
  excludeAllocationOf?: string;
  suspended?: boolean;
  onCancel: () => void;
  onConfirm: (picked: PurchaseLineRef[]) => void;
}) {
  const nf = useNumberFormat();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const timer = setTimeout(() => setQ(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (suspended) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, suspended]);

  const input: SearchInput = useMemo(
    () => ({ vendorId, q, from, to, excludeLineIds: [...excludeLineIds], ...(excludeAllocationOf ? { excludeAllocationOf } : {}) }),
    [vendorId, q, from, to, excludeLineIds, excludeAllocationOf],
  );
  const search$ = usePurchaseLineSearch(input);
  const excluded = useMemo(() => new Set(excludeLineIds), [excludeLineIds]);
  const items = useMemo(() => pickerRows(search$.data?.pages, excluded), [search$.data, excluded]);
  const allChecked = items.length > 0 && items.every((item) => checked.has(item.purchaseLineId));
  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#1C252E]/40 p-6" onClick={suspended ? undefined : onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="load-picker-title"
        className="flex max-h-[90vh] w-full max-w-[1195px] flex-col rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[#E3E6EA] px-6 py-4">
          <h2 id="load-picker-title" className="text-lg font-medium text-[#1C252E]">Add From Purchase</h2>
          <IconButton label="Close" onClick={onCancel}>
            <X className="size-5" />
          </IconButton>
        </header>

        <div className="flex min-h-0 flex-1 flex-col px-6 py-5 md:px-10">
          <div className="mb-5 flex flex-wrap justify-end gap-3">
            <label className="flex h-10 w-full max-w-80 items-center gap-2 rounded-lg bg-[#F6F7F8] px-3 text-sm">
              <Search aria-hidden className="size-4 text-[#6B7480]" />
              <input
                autoFocus
                value={search}
                maxLength={100}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={PICKER_SEARCH_PLACEHOLDER}
                aria-label="Search purchase lines"
                className="w-full bg-transparent outline-none placeholder:text-[#A9B1B9]"
              />
            </label>
            <div className="flex h-10 items-center gap-2 rounded-lg border border-[#E3E6EA] px-3 text-sm">
              <DateInput aria-label="PU date from" placeholder="Start" value={from} onChange={setFrom} className="w-[120px] bg-transparent outline-none" />
              <ArrowRight aria-hidden className="size-4 text-[#6B7480]" />
              <DateInput aria-label="PU date to" placeholder="Due" value={to} onChange={setTo} className="w-[120px] bg-transparent outline-none" />
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#E3E6EA]">
            <div className="min-h-[360px] flex-1 overflow-auto">
              <table className="w-full min-w-[1100px] border-collapse text-sm text-[#1C252E]">
                <thead className="sticky top-0 bg-[#F6F7F8] text-left">
                  <tr>
                    <th scope="col" className="w-12 px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        className="size-5 accent-[#0E5E63]"
                        checked={allChecked}
                        disabled={items.length === 0}
                        onChange={() => setChecked(allChecked ? new Set() : new Set(items.map((item) => item.purchaseLineId)))}
                      />
                    </th>
                    <th scope="col" className="w-8 font-normal text-[#6B7480]">#</th>
                    <HeaderCell title="PU No." sub="Doc Date" />
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
                  {search$.isPending && (
                    <tr>
                      <td colSpan={12} className="py-16 text-center text-[#6B7480]">Loading…</td>
                    </tr>
                  )}
                  {search$.isError && (
                    <tr>
                      <td colSpan={12} className="py-16 text-center">
                        <p role="alert" className="text-[#E5484D]">{loadLoadError(search$.error, "purchase lines")}</p>
                        <Button size="sm" className="mt-3" onClick={() => void search$.refetch()}>Retry</Button>
                      </td>
                    </tr>
                  )}
                  {search$.isSuccess && items.length === 0 && (
                    <tr>
                      <td colSpan={12} className="py-16 text-center text-[#6B7480]">{PICKER_EMPTY_TEXT}</td>
                    </tr>
                  )}
                  {items.map((item, index) => {
                    const on = checked.has(item.purchaseLineId);
                    return (
                      <tr
                        key={item.purchaseLineId}
                        onClick={() => toggle(item.purchaseLineId)}
                        className={cx("cursor-pointer border-b border-[#EEF0F2] align-top", on ? "bg-[#E6F1F1]" : "hover:bg-[#FAFBFB]")}
                      >
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            aria-label={`Select ${item.stoneCode || "line"} from ${item.purchase.docNo}`}
                            className="size-5 accent-[#0E5E63]"
                            checked={on}
                            onChange={() => toggle(item.purchaseLineId)}
                            onClick={(event) => event.stopPropagation()}
                          />
                        </td>
                        <td className="py-4 text-[#6B7480]">{index + 1}</td>
                        <td className="px-3 py-4">
                          <div className="font-medium">{item.purchase.docNo}</div>
                          <div className="mt-1 text-xs text-[#6B7480]">{shortDate(item.purchase.docDate)}</div>
                        </td>
                        <td className="px-3 py-4"><StoneCodeCell code={item.stoneCode} label="New on load" stockId={null} lot={item.lot} /></td>
                        <td className="px-3 py-4">{item.location || "—"}</td>
                        <td className="px-3 py-4"><StoneCell attrs={item} /></td>
                        <td className="px-3 py-4"><GradeCell attrs={item} /></td>
                        <td className="px-3 py-4"><CerCell attrs={item} /></td>
                        <td className="px-3 py-4 text-right tabular-nums">{item.remainingPcs}</td>
                        <td className="px-3 py-4 text-right tabular-nums">{nf.weight(item.remainingWeightCt)}</td>
                        <td className="px-3 py-4 text-right tabular-nums">
                          {nf.unitPrice(item.unitPrice)} {item.purchase.currency}
                          <div className="mt-1 text-xs text-[#6B7480]">{priceSub(item, companyCurrency)}</div>
                        </td>
                        <td className="px-3 py-4 text-right tabular-nums">
                          {nf.money(item.remainingAmountBase)}
                          <div className="mt-1 text-xs text-[#6B7480]">{companyCurrency}</div>
                        </td>
                      </tr>
                    );
                  })}
                  {search$.hasNextPage && (
                    <tr>
                      <td colSpan={12} className="py-4 text-center">
                        <Button size="sm" disabled={search$.isFetchingNextPage} onClick={() => void search$.fetchNextPage()}>
                          {search$.isFetchingNextPage ? "Loading…" : "Load more"}
                        </Button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-[#E3E6EA] px-5 py-3">
              {checked.size > 0 && <span className="mr-auto text-sm font-medium text-[#1C252E]">{checked.size} selected</span>}
              <Button onClick={onCancel}>Cancel</Button>
              <Button variant="primary" className="min-w-24" disabled={checked.size === 0} onClick={() => onConfirm(items.filter((item) => checked.has(item.purchaseLineId)))}>
                OK
              </Button>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
