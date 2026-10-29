"use client";

import { ArrowRight, ChevronsUpDown, MessageSquare, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { DateInput } from "@/components/ui/date-input";
import { Badge, Button, cx, IconButton } from "@/features/quotation/components/ui";
import { dec } from "@/features/quotation/lib/decimal";
import { formatMoneyText, formatWeight } from "@/features/quotation/lib/format";
import { memoReturnLoadError, useMemoStock, type MemoStockItem } from "../api";

/**
 * "Add Memo Stock" (memo-return design): the vendor's memo receive lines in the return's currency with a quantity
 * still out — Pending Pcs / Weight, price and amount. Search + Start → Due filter the receive date; rows already on
 * the return are left out. OK adds the checked rows.
 */
export function MemoStockModal({ vendorId, currency, excludeReturnId, pickedIds, onCancel, onConfirm }: {
  vendorId: string;
  currency: string;
  excludeReturnId?: string;
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

  const stock = useMemoStock({ vendorId, currency, q, from, to, excludeReturnId });
  const items = (stock.data?.items ?? []).filter((item) => !pickedIds.has(item.sourceLineId));
  const allChecked = items.length > 0 && items.every((item) => checked.has(item.sourceLineId));
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
            Add Memo Stock
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
                placeholder="Search stone code, stone, lot, location"
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
                        onChange={() => setChecked(allChecked ? new Set() : new Set(items.map((item) => item.sourceLineId)))}
                      />
                    </th>
                    <th rowSpan={2} className="w-8 font-normal text-[#6B7480]">#</th>
                    <Th title="STOCK ID" sub="LOT" />
                    <Th title="LOCATION" />
                    <Th title="STONE" sub="SHAPE · SIZE" />
                    <Th title="COLOR · CLARITY" sub="CUTTING · QUALITY" />
                    <Th title="CER TYPE" sub="CER NO." />
                    <th colSpan={2} className="border-b border-l border-[#E3E6EA] px-3 py-3 text-center font-medium">Pending</th>
                    <Th title="PRICE" sub="UNIT" right divider />
                    <Th title="Amount" right />
                  </tr>
                  <tr>
                    <th className="w-[90px] border-l border-[#E3E6EA] px-3 py-2.5 text-right font-medium">Pcs</th>
                    <th className="w-[100px] px-3 py-2.5 text-right font-medium">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {stock.isPending && (
                    <tr>
                      <td colSpan={11} className="py-16 text-center text-[#6B7480]">Loading…</td>
                    </tr>
                  )}
                  {stock.isError && (
                    <tr>
                      <td colSpan={11} className="py-16 text-center text-[#E5484D]">{memoReturnLoadError(stock.error)}</td>
                    </tr>
                  )}
                  {stock.isSuccess && items.length === 0 && (
                    <tr>
                      <td colSpan={11} className="py-16 text-center text-[#6B7480]">No memo stock from this vendor in {currency}.</td>
                    </tr>
                  )}
                  {items.map((item, index) => (
                    <tr key={item.sourceLineId} onClick={() => toggle(item.sourceLineId)} className="cursor-pointer border-b border-[#EEF0F2] align-top hover:bg-[#FAFBFB]">
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          aria-label={`Select ${item.stoneCode || item.stone} from ${item.memoReceiveNo}`}
                          className="size-5 accent-[#0E5E63]"
                          checked={checked.has(item.sourceLineId)}
                          onChange={() => toggle(item.sourceLineId)}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </td>
                      <td className="py-4 text-[#6B7480]">{index + 1}</td>
                      <td className="px-3 py-4">
                        <div className="font-medium">{item.stoneCode || "—"}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#6B7480]">
                          {item.lot && <span>{item.lot}</span>}
                          <span>from {item.memoReceiveNo}</span>
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
                      <td className="border-l border-[#E3E6EA] px-3 py-4 text-right">
                        {formatMoneyText(item.unitPrice)} {currency}
                        <div className="mt-1 text-xs text-[#6B7480]">{item.priceUnit === "PER_PCS" ? "pcs" : "cts"}</div>
                      </td>
                      <td className="px-3 py-4 text-right">{formatMoneyText(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-[#E3E6EA] px-5 py-3">
              {checked.size > 0 && <span className="mr-auto text-sm font-medium text-[#1C252E]">{checked.size} selected</span>}
              <Button onClick={onCancel}>Cancel</Button>
              <Button variant="primary" className="min-w-24" disabled={checked.size === 0} onClick={() => onConfirm(items.filter((item) => checked.has(item.sourceLineId)))}>
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
