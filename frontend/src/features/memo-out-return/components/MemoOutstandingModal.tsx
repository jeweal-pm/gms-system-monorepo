"use client";

import { ArrowRight, ChevronsUpDown, MessageSquare, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { DateInput } from "@/components/ui/date-input";
import { Badge, Button, cx, IconButton } from "@/features/quotation/components/ui";
import { dec } from "@/features/quotation/lib/decimal";
import { formatMoneyText, formatWeight } from "@/features/quotation/lib/format";
import { memoOutstandingLoadError, useMemoOutstanding, type MemoOutstandingItem } from "../api";

/**
 * Memo Outstanding picker (memo-out-return UI rev 4, SA-MOR-15): the customer's approved Memo Out From Stock lines in
 * the return's currency with something not yet returned. Each row shows its Memo Out No., Stock ID / Lot, the stone,
 * Outstanding Pcs / Weight, the Memo Out price after its discount and the amount of the outstanding. Search + Start →
 * Due (Memo Out Doc Date) filter; rows already on the document are left out; 50 a page with Load more. OK adds the
 * checked rows.
 */
export function MemoOutstandingModal({ customerId, currency, excludeReturnId, pickedIds, onCancel, onConfirm }: {
  customerId: string;
  currency: string;
  excludeReturnId?: string;
  pickedIds: Set<string>;
  onCancel: () => void;
  onConfirm: (items: MemoOutstandingItem[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    const timer = setTimeout(() => setQ(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const outstanding = useMemoOutstanding({ customerId, currency, q, from, to, excludeReturnId });
  const items = (outstanding.data?.pages ?? []).flatMap((page) => page.items).filter((item) => !pickedIds.has(item.memoOutLineId));
  const allChecked = items.length > 0 && items.every((item) => checked.has(item.memoOutLineId));
  const columns = 11;
  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#1C252E]/40 p-6" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="memo-outstanding-title"
        className="flex max-h-[90vh] w-full max-w-[1480px] flex-col rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[#E3E6EA] px-6 py-4">
          <h2 id="memo-outstanding-title" className="text-lg font-medium text-[#1C252E]">
            Memo Outstanding
          </h2>
          <IconButton label="Close" onClick={onCancel}>
            <X className="size-5" />
          </IconButton>
        </header>

        <div className="flex min-h-0 flex-1 flex-col px-10 py-6">
          <div className="mb-5 flex flex-wrap justify-end gap-3">
            <label className="flex h-10 w-80 items-center gap-2 rounded-lg bg-[#F6F7F8] px-3 text-sm">
              <Search className="size-4 text-[#6B7480]" />
              <input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search Memo Out No., Stock ID, Lot, Stone, Cer No."
                aria-label="Search memo outstanding"
                className="w-full bg-transparent outline-none placeholder:text-[#A9B1B9]"
              />
            </label>
            <div className="flex h-10 items-center gap-2 rounded-lg border border-[#E3E6EA] px-3 text-sm">
              <DateInput aria-label="Memo out from" placeholder="Start" value={from} onChange={setFrom} className="w-[120px] bg-transparent outline-none" />
              <ArrowRight className="size-4 text-[#6B7480]" />
              <DateInput aria-label="Memo out to" placeholder="Due" value={to} onChange={setTo} className="w-[120px] bg-transparent outline-none" />
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#E3E6EA]">
            <div className="min-h-[420px] flex-1 overflow-auto">
              <table className="w-full min-w-[1200px] border-collapse text-sm text-[#1C252E]">
                <thead className="sticky top-0 bg-[#F6F7F8] text-left">
                  <tr>
                    <th rowSpan={2} className="w-12 px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        className="size-5 accent-[#0E5E63]"
                        checked={allChecked}
                        disabled={items.length === 0}
                        onChange={() => setChecked(allChecked ? new Set() : new Set(items.map((item) => item.memoOutLineId)))}
                      />
                    </th>
                    <th rowSpan={2} className="w-8 font-normal text-[#6B7480]">#</th>
                    <Th title="Memo Out No." sub="Doc Date" />
                    <Th title="Stock ID" sub="Lot" />
                    <Th title="Stone" sub="Shape · Size" />
                    <Th title="Color · Clarity" sub="Cutting · Quality" />
                    <Th title="Cer Type" sub="Cer No." />
                    <th colSpan={2} className="border-b border-l border-[#E3E6EA] px-3 py-3 text-center font-medium">Outstanding</th>
                    <Th title="Memo Price" sub="Unit" right divider />
                    <Th title="Amount" right />
                  </tr>
                  <tr>
                    <th className="w-[90px] border-l border-[#E3E6EA] px-3 py-2.5 text-right font-medium">Pcs</th>
                    <th className="w-[100px] px-3 py-2.5 text-right font-medium">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {outstanding.isPending && (
                    <tr>
                      <td colSpan={columns} className="py-16 text-center text-[#6B7480]">Loading…</td>
                    </tr>
                  )}
                  {outstanding.isError && (
                    <tr>
                      <td colSpan={columns} className="py-16 text-center text-[#E5484D]">{memoOutstandingLoadError(outstanding.error)}</td>
                    </tr>
                  )}
                  {outstanding.isSuccess && items.length === 0 && (
                    <tr>
                      <td colSpan={columns} className="py-16 text-center text-[#6B7480]">{`Nothing outstanding for this customer in ${currency}.`}</td>
                    </tr>
                  )}
                  {items.map((item, index) => (
                    <tr key={item.memoOutLineId} onClick={() => toggle(item.memoOutLineId)} className="cursor-pointer border-b border-[#EEF0F2] align-top hover:bg-[#FAFBFB]">
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          aria-label={`Select ${item.stockId} from ${item.memoOut.docNo}`}
                          className="size-5 accent-[#0E5E63]"
                          checked={checked.has(item.memoOutLineId)}
                          onChange={() => toggle(item.memoOutLineId)}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </td>
                      <td className="py-4 text-[#6B7480]">{index + 1}</td>
                      <td className="px-3 py-4">
                        <div className="font-medium">{item.memoOut.docNo}</div>
                        <div className="mt-1 text-xs text-[#6B7480]">{item.memoOut.docDate}</div>
                      </td>
                      <td className="px-3 py-4">
                        <div className="font-medium">{item.stockId}</div>
                        {item.lot && <div className="mt-1 text-xs text-[#6B7480]">{item.lot}</div>}
                        {item.itemNote && (
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-[#6B7480]">
                            <MessageSquare className="size-3" /> {item.itemNote}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-4">
                        <div className="font-medium">{item.stone}</div>
                        <div className="mt-1 text-xs text-[#6B7480]">{[item.shape, item.size].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td className="px-3 py-4">
                        <div>{[item.color, item.clarity].filter(Boolean).join(" · ")}</div>
                        <div className="mt-1 text-xs text-[#6B7480]">{[item.cutting, item.quality].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td className="px-3 py-4">
                        {item.cerType && <Badge>{item.cerType}</Badge>}
                        <div className="mt-1 text-xs text-[#6B7480]">{item.cerNo}</div>
                      </td>
                      <td className="border-l border-[#E3E6EA] px-3 py-4 text-right">{item.outstandingPcs}</td>
                      <td className="px-3 py-4 text-right">{formatWeight(dec(item.outstandingWeightCt))}</td>
                      <td className="border-l border-[#E3E6EA] px-3 py-4 text-right">
                        {formatMoneyText(item.unitPrice)} {item.currency}
                        <div className="mt-1 text-xs text-[#6B7480]">{item.priceUnit === "PER_PCS" ? "pcs" : "cts"}</div>
                      </td>
                      <td className="px-3 py-4 text-right">{formatMoneyText(item.amount)}</td>
                    </tr>
                  ))}
                  {outstanding.hasNextPage && (
                    <tr>
                      <td colSpan={columns} className="py-4 text-center">
                        <Button size="sm" disabled={outstanding.isFetchingNextPage} onClick={() => void outstanding.fetchNextPage()}>
                          {outstanding.isFetchingNextPage ? "Loading…" : "Load more"}
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
              <Button variant="primary" className="min-w-24" disabled={checked.size === 0} onClick={() => onConfirm(items.filter((item) => checked.has(item.memoOutLineId)))}>
                OK
              </Button>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}

function Th({ title, sub, right, divider }: { title: string; sub?: string; right?: boolean; divider?: boolean }) {
  return (
    <th rowSpan={2} className={cx("px-3 py-3 font-medium", right && "text-right", divider && "border-l border-[#E3E6EA]")}>
      <span className={cx("inline-flex items-center gap-1.5", right && "flex-row-reverse")}>
        <span className="leading-tight">
          <span className="block">{title}</span>
          {sub && <span className="block text-[11px] font-normal text-[#6B7480]">{sub}</span>}
        </span>
        <ChevronsUpDown className="size-3 text-[#95A0A9]" />
      </span>
    </th>
  );
}
