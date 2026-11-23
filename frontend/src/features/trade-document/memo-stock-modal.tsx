"use client";

import { useEffect, useId, useState } from "react";
import { dec } from "@/features/quotation/lib/decimal";
import { formatMoneyText, formatUnitPrice, formatWeight } from "@/features/quotation/lib/format";
import { useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import { cx } from "@/features/quotation/components/ui";
import { memoStockLoadError, useMemoStock, type MemoStockItem } from "./memo-stock-api";
import { OWN_STOCK_UNAVAILABLE_TEXT, ownStockUnavailable, pickKey, useFromStock, type FromStockItem } from "./from-stock-api";
import { stockRef, stockRefLabel, type StockRefSource } from "./stock-ref";
import {
  PickerChip,
  PickerDialog,
  PickerFooter,
  PickerFrame,
  PickerGroupSubTh,
  PickerGroupTh,
  LotCell,
  PickerLoadMore,
  PickerMessage,
  PickerTh,
  PickerToolbar,
  pickerCell,
  pickerCheckbox,
  pickerCheckCell,
  pickerGroupTone,
  pickerHead,
  pickerIndexCell,
  pickerRowClass,
  pickerSub,
  lotSelectLabel,
} from "./picker-ui";

/**
 * Ref. column (owner 2026-11-04/05, after Location): the transaction the item came from — the Memo Receive no. today,
 * a Load no. once the Load page exists — in bold with its Doc Date under it.
 */
export function RefCell({ item }: { item: StockRefSource }) {
  const ref = stockRef(item);
  if (!ref) return <td className={pickerCell}>—</td>;
  return (
    <td className={pickerCell}>
      <div className="font-medium">
        {ref.docNo}
        {ref.type === "LOAD" && <span className="ml-1.5 text-[11px] font-normal text-gms-text-secondary">Load</span>}
      </div>
      <div className={pickerSub}>{ref.dateText}</div>
    </td>
  );
}

/**
 * Memo Stock picker (shared):
 * - Memo Return "Add Memo Stock" (memo-return design, SA-MR-11; look: design 139): the vendor's items in the return's
 *   currency, with Pending Pcs / Weight under the orange PENDING group, the price after the line discount (Q-MR-13)
 *   and amount.
 * - Quotation / Sale / Memo Out "Add From Stock" (look: designs 135 / 137 / 138): Memo Stock and our stock without
 *   prices; Pcs and Weight (ct) are plain columns.
 * Every row is a lot (lot-based-stock): Memo Return reads `memoStock.lots`, From Stock `fromStock.lots`; one row per lot,
 * key `lotKey`, Lot chip over Stone Code and the note, no Stock ID anywhere. Location, Ref. Search + Start → Due (memo receive Doc
 * Date, Q-MR-10) filter; rows already on the document are left out; 50 a page with Load more. OK adds the checked rows.
 */
type PickerItem = MemoStockItem | FromStockItem;
type MemoStockModalProps = {
  title: string;
  showPrice: boolean;
  emptyText: string;
  /** `lotKey`s of the lots already on the document. */
  pickedIds: Set<string>;
  onCancel: () => void;
} & (
  | {
      /** Memo Return: the vendor's Memo Stock lots in its currency (`memoStock.lots`). */
      fromStock?: false;
      memoOnly?: undefined;
      vendorId: string;
      currency: string;
      onConfirm: (items: MemoStockItem[]) => void;
    }
  | {
      /**
       * load-to-stock phase 2 (quotation ui-spec Revision 3): the customer-side "Add From Stock" list of Memo Stock and
       * our stock (`fromStock.lots`, one row per lot); Location tells the source.
       */
      fromStock: true;
      /** Sale (inventory accepts Memo Stock lots only): our stock's rows are left out and its notice is not shown. */
      memoOnly?: boolean;
      vendorId?: undefined;
      currency?: undefined;
      onConfirm: (items: FromStockItem[]) => void;
    }
);

export function MemoStockModal(props: MemoStockModalProps) {
  const { title, vendorId, currency, showPrice, emptyText, pickedIds, onCancel } = props;
  const fromStock = props.fromStock === true;
  const titleId = useId();
  const [search, setSearch] = useState("");
  const nf = useNumberFormat();
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

  const memoStock = useMemoStock(fromStock ? { vendorId: "", currency: "", q, from, to } : { vendorId, currency, q, from, to });
  const memoOnly = props.memoOnly === true;
  const ownAndMemo = useFromStock({ q, from, to }, fromStock);
  const stock = fromStock ? ownAndMemo : memoStock;
  const pages = (stock.data?.pages ?? []) as { items: PickerItem[]; ownStock?: "OK" | "UNAVAILABLE" }[];
  const keyOf = (item: PickerItem) => pickKey(item);
  const items = pages.flatMap((page) => page.items).filter((item) => !pickedIds.has(keyOf(item)) && !(memoOnly && item.source === "OWN_STOCK"));
  // FE-LS-P2-03: our stock down → Memo Stock rows stay listed and pickable under a notice (also instead of the empty text).
  const ownDown = fromStock && !memoOnly && ownStockUnavailable(pages as { ownStock: "OK" | "UNAVAILABLE" }[]);
  const allChecked = items.length > 0 && items.every((item) => checked.has(keyOf(item)));
  const columns = showPrice ? 12 : 10;
  const pending = pickerGroupTone.orange;
  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const confirm = () => {
    const picked = items.filter((item) => checked.has(keyOf(item)));
    if (props.fromStock) props.onConfirm(picked);
    else props.onConfirm(picked);
  };
  // Memo Return has the PENDING group row (2-row header); From Stock has a single 56 px header row.
  const rows = showPrice ? 2 : undefined;

  return (
    <PickerDialog titleId={titleId} title={title} onClose={onCancel}>
      <PickerToolbar
        search={{ value: search, onChange: setSearch, placeholder: "Search Lot, Stone, Stone Code, Cer No., Doc No.", label: "Search memo stock" }}
        dates={{ from, to, onFrom: setFrom, onTo: setTo, fromLabel: "Received from", toLabel: "Received to" }}
      />
      <PickerFrame footer={<PickerFooter count={checked.size} onCancel={onCancel} onOk={confirm} />}>
        <thead className={pickerHead}>
          <tr className={showPrice ? undefined : "h-14"}>
            <th scope="col" rowSpan={rows} className="w-14 px-4">
              <input
                type="checkbox"
                aria-label="Select all"
                className={pickerCheckbox}
                checked={allChecked}
                disabled={items.length === 0}
                onChange={() => setChecked(allChecked ? new Set() : new Set(items.map(keyOf)))}
              />
            </th>
            <th scope="col" rowSpan={rows} className="w-8 text-sm font-medium">#</th>
            <PickerTh rowSpan={rows} title="Lot / Stone Code" />
            <PickerTh rowSpan={rows} title="Location" upper />
            <PickerTh rowSpan={rows} title="Ref." sub="Doc Date" plainSub />
            <PickerTh rowSpan={rows} title="Stone" sub="Shape · Size" upper />
            <PickerTh rowSpan={rows} title="Color · Clarity" sub="Cutting · Quality" upper />
            <PickerTh rowSpan={rows} title="Cer Type" sub="Cer No." upper />
            {showPrice ? (
              <PickerGroupTh title="Pending" span={2} tone="orange" />
            ) : (
              <>
                <PickerTh title="Pcs" right upper className="w-[90px]" />
                <PickerTh title="Weight (ct)" right className="w-[110px]" />
              </>
            )}
            {showPrice && <PickerTh rowSpan={rows} title="Price" sub="Unit" right upper />}
            {showPrice && <PickerTh rowSpan={rows} title="Amount" right />}
          </tr>
          {showPrice && (
            <tr>
              <PickerGroupSubTh title="Pcs" tone="orange" className="w-[90px]" />
              <PickerGroupSubTh title="Weight" tone="orange" className="w-[100px]" />
            </tr>
          )}
        </thead>
        <tbody>
          {stock.isPending && <PickerMessage span={columns}>Loading…</PickerMessage>}
          {stock.isError && (
            <PickerMessage span={columns} error>
              {memoStockLoadError(stock.error)}
            </PickerMessage>
          )}
          {ownDown && (
            <tr>
              <td colSpan={columns} className="bg-[#FFF8E6] px-4 py-3 text-sm text-[#7A5A00]">
                <span role="status">{OWN_STOCK_UNAVAILABLE_TEXT}</span>
                {" — "}
                <button type="button" className="font-medium underline" disabled={stock.isRefetching} onClick={() => void stock.refetch()}>
                  Retry
                </button>
              </td>
            </tr>
          )}
          {stock.isSuccess && items.length === 0 && !ownDown && <PickerMessage span={columns}>{emptyText}</PickerMessage>}
          {items.map((item, index) => {
            const key = keyOf(item);
            const ticked = checked.has(key);
            return (
              <tr key={key} onClick={() => toggle(key)} className={pickerRowClass(ticked)}>
                <td className={pickerCheckCell}>
                  <input
                    type="checkbox"
                    aria-label={lotSelectLabel(item.lot, item.stoneCode, stockRefLabel(item))}
                    className={pickerCheckbox}
                    checked={ticked}
                    onChange={() => toggle(key)}
                    onClick={(event) => event.stopPropagation()}
                  />
                </td>
                <td className={pickerIndexCell}>{index + 1}</td>
                <LotCell lot={item.lot} stoneCode={item.stoneCode} note={item.itemNote} detail={fromStock ? item.vendor?.code : undefined} />
                <td className={pickerCell}>{item.location}</td>
                <RefCell item={item} />
                <td className={pickerCell}>
                  <div className="font-medium">{item.stone}</div>
                  <div className={pickerSub}>{[item.shape, item.size].filter(Boolean).join(" · ")}</div>
                </td>
                <td className={pickerCell}>
                  <div>{[item.color, item.clarity].filter(Boolean).join(" · ")}</div>
                  <div className={pickerSub}>{[item.cutting, item.quality].filter(Boolean).join(" · ")}</div>
                </td>
                <td className={pickerCell}>
                  {item.cerType && <PickerChip>{item.cerType}</PickerChip>}
                  <div className={pickerSub}>{item.cerNo}</div>
                </td>
                <td className={cx(pickerCell, "text-right tabular-nums", showPrice && pending.cell)}>{item.pendingPcs}</td>
                <td className={cx(pickerCell, "text-right tabular-nums", showPrice && pending.cell)}>{formatWeight(dec(item.pendingWeightCt), nf.weightPlaces)}</td>
                {showPrice && (
                  <td className={cx(pickerCell, "text-right tabular-nums")}>
                    {formatUnitPrice(item.netUnitPrice ?? "0", nf.pricePlaces)} {item.currency}
                    <div className={pickerSub}>{item.priceUnit === "PER_PCS" ? "pcs" : "cts"}</div>
                  </td>
                )}
                {showPrice && <td className={cx(pickerCell, "text-right tabular-nums")}>{formatMoneyText(item.amount ?? "0", nf.pricePlaces)}</td>}
              </tr>
            );
          })}
          {stock.hasNextPage && <PickerLoadMore span={columns} loading={stock.isFetchingNextPage} onMore={() => void stock.fetchNextPage()} />}
        </tbody>
      </PickerFrame>
    </PickerDialog>
  );
}
