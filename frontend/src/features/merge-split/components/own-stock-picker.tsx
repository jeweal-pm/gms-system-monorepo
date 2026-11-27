"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import { cx } from "@/features/quotation/components/ui";
import { dec, ZERO } from "@/features/quotation/lib/decimal";
import { formatMoneyText, formatUnitPrice, formatWeight } from "@/features/quotation/lib/format";
import {
  PickerChip,
  PickerDialog,
  PickerFooter,
  PickerFrame,
  PickerLoadMore,
  PickerMessage,
  PickerTh,
  PickerToolbar,
  pickerCell,
  pickerCheckbox,
  pickerCheckCell,
  pickerHead,
  pickerIndexCell,
  pickerRowClass,
  pickerSub,
} from "@/features/trade-document/picker-ui";
import { mergeSplitLoadError, useOwnStock } from "../api";
import type { OwnStockRow } from "../types";

export const OWN_STOCK_EMPTY = "No own stock available";
export const OWN_STOCK_SEARCH = "Search Stock ID, Stone Code, Lot, Cer No.";
const SPAN = 12;

export type OwnStockPickerProps = {
  title: string;
  emptyText?: string;
  /** Stock UUIDs already on the document (sent as `exclude`). */
  pickedIds: ReadonlySet<string>;
  locations: readonly string[];
  excludeDocId?: string;
  currency: string;
  onCancel: () => void;
  onConfirm: (items: OwnStockRow[]) => void;
};

/**
 * merge-split P-01 "Add From Stock" (FE-MS-003): our own stock only, one row per Stock ID with its available on hand
 * (Q-MS-01/02, `GET /merge-split/stock`). Search (250 ms) + Location filter, 50 a page with Load more, OK adds the
 * ticked rows. Rendered through `MemoStockModal` with `source: "merge-split"`; no Memo Stock fallback.
 */
export function OwnStockPicker({ title, emptyText = OWN_STOCK_EMPTY, pickedIds, locations, excludeDocId, currency, onCancel, onConfirm }: OwnStockPickerProps) {
  const titleId = useId();
  const nf = useNumberFormat();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [location, setLocation] = useState("");
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
  const exclude = useMemo(() => [...pickedIds].sort(), [pickedIds]);
  const stock = useOwnStock({ q, location, exclude, excludeDocId }, true);
  const items = (stock.data?.pages ?? []).flatMap((page) => page.items).filter((item) => !pickedIds.has(item.stockUuid) && (item.availPcs > 0 || dec(item.availWeightCt) > ZERO));
  const allChecked = items.length > 0 && items.every((item) => checked.has(item.stockUuid));
  const toggle = (id: string) =>
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const locationFilter = (
    <label className="flex h-9 items-center gap-2 text-sm">
      <span className="text-gms-text-secondary">Location</span>
      <select aria-label="Location filter" value={location} onChange={(event) => setLocation(event.target.value)} className="h-9 rounded-gms-md border border-gms-border bg-white px-2">
        <option value="">All</option>
        {locations.map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
      </select>
    </label>
  );
  return (
    <PickerDialog titleId={titleId} title={title} onClose={onCancel}>
      <PickerToolbar lead={locationFilter} search={{ value: search, onChange: setSearch, placeholder: OWN_STOCK_SEARCH, label: "Search stock", maxLength: 100 }} />
      <PickerFrame minWidth="min-w-[1250px]" footer={<PickerFooter count={checked.size} onCancel={onCancel} onOk={() => onConfirm(items.filter((item) => checked.has(item.stockUuid)))} />}>
        <thead className={pickerHead}>
          <tr className="h-14">
            <th scope="col" className="w-14 px-4">
              <input type="checkbox" aria-label="Select all stock" className={pickerCheckbox} checked={allChecked} disabled={items.length === 0} onChange={() => setChecked(allChecked ? new Set() : new Set(items.map((item) => item.stockUuid)))} />
            </th>
            <th scope="col" className="w-8 text-sm font-medium">#</th>
            <PickerTh title="Stone Code" sub="Stock ID · Lot" plainSub />
            <PickerTh title="Location" upper />
            <PickerTh title="Stone" sub="Shape · Size" upper />
            <PickerTh title="Color · Clarity" sub="Cutting · Quality" upper />
            <PickerTh title="Cer Type" sub="Cer No." upper />
            <PickerTh title="Avail. Pcs" right upper className="w-[90px]" />
            <PickerTh title="Avail. Weight" right className="w-[110px]" />
            <PickerTh title="Cost" sub="Unit" right upper />
            <PickerTh title="Sale Price" sub="Unit" right upper />
            <PickerTh title="Amount" right />
          </tr>
        </thead>
        <tbody>
          {stock.isPending && <PickerMessage span={SPAN}>Loading…</PickerMessage>}
          {stock.isError && (
            <PickerMessage span={SPAN} error>
              {mergeSplitLoadError(stock.error, "own stock")}{" "}
              <button type="button" className="underline" onClick={() => void stock.refetch()}>Retry</button>
            </PickerMessage>
          )}
          {stock.isSuccess && items.length === 0 && <PickerMessage span={SPAN}>{emptyText}</PickerMessage>}
          {items.map((item, index) => {
            const selected = checked.has(item.stockUuid);
            const unit = item.priceUnit === "PER_PCS" ? "pcs" : "cts";
            return (
              <tr key={item.stockUuid} onClick={() => toggle(item.stockUuid)} className={pickerRowClass(selected)} data-stock-id={item.stockId}>
                <td className={pickerCheckCell}>
                  <input type="checkbox" aria-label={`Select ${item.stockId}`} className={pickerCheckbox} checked={selected} onChange={() => toggle(item.stockUuid)} onClick={(event) => event.stopPropagation()} />
                </td>
                <td className={pickerIndexCell}>{index + 1}</td>
                <td className={pickerCell}>
                  <div className="font-medium">{item.attrs.stoneCode || "—"}</div>
                  <div className={pickerSub}>
                    <span className="font-mono">{item.stockId}</span>
                    {item.lot ? ` · ${item.lot}` : ""}
                  </div>
                </td>
                <td className={pickerCell}>{item.location}</td>
                <td className={pickerCell}>
                  <div className="font-medium">{item.attrs.stone}</div>
                  <div className={pickerSub}>{[item.attrs.shape, item.attrs.size].filter(Boolean).join(" · ")}</div>
                </td>
                <td className={pickerCell}>
                  <div>{[item.attrs.color, item.attrs.clarity].filter(Boolean).join(" · ")}</div>
                  <div className={pickerSub}>{[item.attrs.cutting, item.attrs.quality].filter(Boolean).join(" · ")}</div>
                </td>
                <td className={pickerCell}>
                  {item.attrs.cerType ? <PickerChip>{item.attrs.cerType}</PickerChip> : <span className={pickerSub}>No certificate</span>}
                  <div className={pickerSub}>{item.attrs.cerNo}</div>
                </td>
                <td className={cx(pickerCell, "text-right tabular-nums")}>{item.availPcs}</td>
                <td className={cx(pickerCell, "text-right tabular-nums")}>{formatWeight(dec(item.availWeightCt), nf.weightPlaces)}</td>
                <td className={cx(pickerCell, "text-right tabular-nums")}>
                  {formatUnitPrice(item.unitCostBase, nf.pricePlaces)} {currency}
                  <div className={pickerSub}>{unit}</div>
                </td>
                <td className={cx(pickerCell, "text-right tabular-nums")}>
                  {formatUnitPrice(item.salePrice, nf.pricePlaces)} {item.currency || currency}
                  <div className={pickerSub}>{unit}</div>
                </td>
                <td className={cx(pickerCell, "text-right tabular-nums")}>{formatMoneyText(item.costAmountBase, nf.pricePlaces)}</td>
              </tr>
            );
          })}
          {stock.hasNextPage && <PickerLoadMore span={SPAN} loading={stock.isFetchingNextPage} onMore={() => void stock.fetchNextPage()} />}
        </tbody>
      </PickerFrame>
    </PickerDialog>
  );
}
