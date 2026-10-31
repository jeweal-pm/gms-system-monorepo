"use client";

import { ArrowRight, ChevronsUpDown, MessageSquare, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { DateInput } from "@/components/ui/date-input";
import { Badge, Button, cx, IconButton } from "@/features/quotation/components/ui";
import { dec, toFixed } from "@/features/quotation/lib/decimal";
import { formatMoneyText, formatWeight } from "@/features/quotation/lib/format";
import { memoStockLoadError, useMemoStock, type MemoStockItem } from "./memo-stock-api";

/**
 * Memo Stock picker (shared):
 * - Memo Return "Add Memo Stock" (memo-return design, SA-MR-11): the vendor's items in the return's currency, with the
 *   price after the line discount (Q-MR-13) and amount.
 * - Memo Out "From Stock" (memo-out rev 2, SA-MO-15): every vendor's items (`vendorId` left out), without the vendor's
 *   cost.
 * Each row shows Stock ID, location Memo and Pending Pcs / Weight. Search + Start → Due (memo receive Doc Date, Q-MR-10)
 * filter; rows already on the document are left out; 50 a page with Load more. OK adds the checked rows.
 */
export function MemoStockModal({ title, vendorId, currency, showPrice, emptyText, pickedIds, onCancel, onConfirm }: {
  title: string;
  /** Leave out to list every vendor (From Stock). */
  vendorId?: string;
  currency?: string;
  showPrice: boolean;
  emptyText: string;
  pickedIds: Set<string>;
  onCancel: () => void;
  onConfirm: (items: MemoStockItem[]) => void;
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

  const stock = useMemoStock({ vendorId, currency, q, from, to });
  const items = (stock.data?.pages ?? []).flatMap((page) => page.items).filter((item) => !pickedIds.has(item.id));
  const allChecked = items.length > 0 && items.every((item) => checked.has(item.id));
  const columns = showPrice ? 11 : 9;
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
        aria-labelledby="memo-stock-title"
        className="flex max-h-[90vh] w-full max-w-[1480px] flex-col rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[#E3E6EA] px-6 py-4">
          <h2 id="memo-stock-title" className="text-lg font-medium text-[#1C252E]">
            {title}
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
                placeholder="Search Stock ID, Lot, Stone, Cer No."
                aria-label="Search memo stock"
                className="w-full bg-transparent outline-none placeholder:text-[#A9B1B9]"
              />
            </label>
            <div className="flex h-10 items-center gap-2 rounded-lg border border-[#E3E6EA] px-3 text-sm">
              <DateInput aria-label="Received from" placeholder="Start" value={from} onChange={setFrom} className="w-[120px] bg-transparent outline-none" />
              <ArrowRight className="size-4 text-[#6B7480]" />
              <DateInput aria-label="Received to" placeholder="Due" value={to} onChange={setTo} className="w-[120px] bg-transparent outline-none" />
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
                        onChange={() => setChecked(allChecked ? new Set() : new Set(items.map((item) => item.id)))}
                      />
                    </th>
                    <th rowSpan={2} className="w-8 font-normal text-[#6B7480]">#</th>
                    <Th title="Stock ID" sub="Lot" />
                    <Th title="Location" />
                    <Th title="Stone" sub="Shape · Size" />
                    <Th title="Color · Clarity" sub="Cutting · Quality" />
                    <Th title="Cer Type" sub="Cer No." />
                    <th colSpan={2} className="border-b border-l border-[#E3E6EA] px-3 py-3 text-center font-medium">Pending</th>
                    {showPrice && <Th title="Price" sub="Unit" right divider />}
                    {showPrice && <Th title="Amount" right />}
                  </tr>
                  <tr>
                    <th className="w-[90px] border-l border-[#E3E6EA] px-3 py-2.5 text-right font-medium">Pcs</th>
                    <th className="w-[100px] px-3 py-2.5 text-right font-medium">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {stock.isPending && (
                    <tr>
                      <td colSpan={columns} className="py-16 text-center text-[#6B7480]">Loading…</td>
                    </tr>
                  )}
                  {stock.isError && (
                    <tr>
                      <td colSpan={columns} className="py-16 text-center text-[#E5484D]">{memoStockLoadError(stock.error)}</td>
                    </tr>
                  )}
                  {stock.isSuccess && items.length === 0 && (
                    <tr>
                      <td colSpan={columns} className="py-16 text-center text-[#6B7480]">{emptyText}</td>
                    </tr>
                  )}
                  {items.map((item, index) => (
                    <tr key={item.id} onClick={() => toggle(item.id)} className="cursor-pointer border-b border-[#EEF0F2] align-top hover:bg-[#FAFBFB]">
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          aria-label={`Select ${item.stockId} from ${item.memoReceive.docNo}`}
                          className="size-5 accent-[#0E5E63]"
                          checked={checked.has(item.id)}
                          onChange={() => toggle(item.id)}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </td>
                      <td className="py-4 text-[#6B7480]">{index + 1}</td>
                      <td className="px-3 py-4">
                        <div className="font-medium">{item.stockId}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#6B7480]">
                          {item.lot && <span>{item.lot}</span>}
                          <span>from {item.memoReceive.docNo}{vendorId === undefined ? ` · ${item.vendor.code}` : ""}</span>
                        </div>
                        {item.itemNote && (
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-[#6B7480]">
                            <MessageSquare className="size-3" /> {item.itemNote}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-4">{item.location}</td>
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
                      <td className="border-l border-[#E3E6EA] px-3 py-4 text-right">{item.pendingPcs}</td>
                      <td className="px-3 py-4 text-right">{formatWeight(dec(item.pendingWeightCt))}</td>
                      {showPrice && (
                        <td className="border-l border-[#E3E6EA] px-3 py-4 text-right">
                          {formatMoneyText(toFixed(dec(item.netUnitPrice), 2))} {item.currency}
                          <div className="mt-1 text-xs text-[#6B7480]">{item.priceUnit === "PCS" ? "pcs" : "cts"}</div>
                        </td>
                      )}
                      {showPrice && <td className="px-3 py-4 text-right">{formatMoneyText(item.amount)}</td>}
                    </tr>
                  ))}
                  {stock.hasNextPage && (
                    <tr>
                      <td colSpan={columns} className="py-4 text-center">
                        <Button size="sm" disabled={stock.isFetchingNextPage} onClick={() => void stock.fetchNextPage()}>
                          {stock.isFetchingNextPage ? "Loading…" : "Load more"}
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
              <Button variant="primary" className="min-w-24" disabled={checked.size === 0} onClick={() => onConfirm(items.filter((item) => checked.has(item.id)))}>
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
