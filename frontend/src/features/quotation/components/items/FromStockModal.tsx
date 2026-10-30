"use client";

import { DateInput } from "@/components/ui/date-input";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Calendar, ChevronsUpDown, MessageSquare, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { quotationKeys, searchAvailableStock, type StockFilter } from "../../api";
import { lineAmount } from "../../lib/calculate";
import { dec } from "../../lib/decimal";
import { formatMoney, formatMoneyText, formatWeight } from "../../lib/format";
import type { StockItem } from "../../mock/stock";
import { Badge, Button, cx, IconButton } from "../ui";

export function FromStockModal({
  currency,
  existingStockIds,
  onCancel,
  onConfirm,
}: {
  currency: string;
  existingStockIds: Set<string>;
  onCancel: () => void;
  onConfirm: (items: StockItem[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StockFilter>({ search: "", from: "", to: "" });
  const [checked, setChecked] = useState<Set<string>>(new Set());

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => setFilter((f) => ({ ...f, search })), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const { data: items = [], isLoading } = useQuery({
    queryKey: quotationKeys.stock(filter),
    queryFn: () => searchAvailableStock(filter),
  });

  const selectable = items.filter((i) => !existingStockIds.has(i.stockId));
  const allChecked = selectable.length > 0 && selectable.every((i) => checked.has(i.stockId));

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(selectable.map((i) => i.stockId)));

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#1C252E]/40 p-6" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="from-stock-title"
        className="flex max-h-[90vh] w-full max-w-[1480px] flex-col rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[#E3E6EA] px-6 py-4">
          <h2 id="from-stock-title" className="text-lg font-medium text-[#1C252E]">
            Add from stock
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
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search stock code, stock ID, lot"
                className="w-full bg-transparent outline-none placeholder:text-[#A9B1B9]"
              />
            </label>
            <div className="flex h-10 items-center gap-2 rounded-lg bg-[#F6F7F8] px-3 text-sm">
              <Calendar className="size-4 text-[#6B7480]" />
              <DateInput
                aria-label="Loaded from"
                value={filter.from}
                onChange={(from) => setFilter((f) => ({ ...f, from }))}
                className="w-[130px] bg-transparent outline-none"
              />
              <ArrowRight className="size-4 text-[#6B7480]" />
              <DateInput
                aria-label="Loaded to"
                value={filter.to}
                onChange={(to) => setFilter((f) => ({ ...f, to }))}
                className="w-[130px] bg-transparent outline-none"
              />
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#E3E6EA]">
            <div className="min-h-[420px] flex-1 overflow-auto">
              <table className="w-full min-w-[1200px] border-collapse text-sm text-[#1C252E]">
                <thead className="sticky top-0 bg-[#F6F7F8] text-left">
                  <tr>
                    <th className="w-12 px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        className="size-5 accent-[#0E5E63]"
                        checked={allChecked}
                        onChange={toggleAll}
                      />
                    </th>
                    <th className="w-8 font-normal text-[#6B7480]">#</th>
                    <Th title="Stone Code" sub="Stock ID · Lot" />
                    <Th title="Location" />
                    <Th title="Stone" sub="Shape · Size" />
                    <Th title="Color · Clarity" sub="Cutting · Quality" />
                    <Th title="Cer Type" sub="Cer No." />
                    <Th title="Pcs" right />
                    <Th title="Weight (ct)" right />
                    <Th title="Sale Price" sub="Unit" right />
                    <Th title="Amount" right />
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td colSpan={11} className="py-16 text-center text-[#6B7480]">
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!isLoading && items.length === 0 && (
                    <tr>
                      <td colSpan={11} className="py-16 text-center text-[#6B7480]">
                        No stock found.
                      </td>
                    </tr>
                  )}
                  {items.map((item, i) => {
                    const added = existingStockIds.has(item.stockId);
                    return (
                      <tr
                        key={item.stockId}
                        onClick={() => !added && toggle(item.stockId)}
                        className={cx(
                          "border-b border-[#EEF0F2] align-top",
                          added ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-[#FAFBFB]",
                        )}
                      >
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            aria-label={`Select ${item.stockId}`}
                            className="size-5 accent-[#0E5E63]"
                            disabled={added}
                            checked={added || checked.has(item.stockId)}
                            onChange={() => toggle(item.stockId)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>
                        <td className="py-4 text-[#6B7480]">{i + 1}</td>
                        <td className="px-3 py-4">
                          <div className="font-medium">{item.stoneCode}</div>
                          <div className="mt-1 flex items-center gap-2 text-xs text-[#6B7480]">
                            {item.stockId} <Badge variant="lot">{item.lot}</Badge>
                            {added && <span className="text-[#0E5E63]">Already added</span>}
                          </div>
                          {item.note && (
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-[#6B7480]">
                              <MessageSquare className="size-3" /> {item.note}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-4">{item.locationId}</td>
                        <td className="px-3 py-4">
                          <div className="font-medium">{item.stone}</div>
                          <div className="mt-1 text-xs text-[#6B7480]">
                            {item.shape} · {item.size}
                          </div>
                        </td>
                        <td className="px-3 py-4">
                          <div>
                            {item.color} · {item.clarity}
                          </div>
                          <div className="mt-1 text-xs text-[#6B7480]">
                            {item.cutting} · {item.quality}
                          </div>
                        </td>
                        <td className="px-3 py-4">
                          <Badge>{item.cerType}</Badge>
                          <div className="mt-1 text-xs text-[#6B7480]">{item.cerNo}</div>
                        </td>
                        <td className="px-3 py-4 text-right">{item.pcs}</td>
                        <td className="px-3 py-4 text-right">{formatWeight(dec(item.weightCt))} cts</td>
                        <td className="px-3 py-4 text-right">
                          {formatMoneyText(item.unitPrice)} {currency}
                          <div className="mt-1 text-xs text-[#6B7480]">{item.priceUnit === "PER_CT" ? "per cts" : "per pcs"}</div>
                        </td>
                        <td className="px-3 py-4 text-right">{formatMoney(lineAmount(item))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <footer className="flex items-center justify-between border-t border-[#E3E6EA] px-5 py-3">
              <p className="text-sm text-[#6B7480]">
                Stone, grading, certificate and lot fill in and lock automatically.
                {checked.size > 0 && <span className="ml-2 font-medium text-[#1C252E]">{checked.size} selected</span>}
              </p>
              <div className="flex gap-2">
                <Button onClick={onCancel}>Cancel</Button>
                <Button
                  variant="primary"
                  className="min-w-24"
                  disabled={checked.size === 0}
                  onClick={() => onConfirm(items.filter((i) => checked.has(i.stockId)))}
                >
                  OK
                </Button>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}

function Th({ title, sub, right }: { title: string; sub?: string; right?: boolean }) {
  return (
    <th className={cx("px-3 py-3 font-medium", right && "text-right")}>
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
