"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { dec } from "@/features/quotation/lib/decimal";
import { formatMoneyText, formatUnitPrice, formatWeight } from "@/features/quotation/lib/format";
import { useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import { cx } from "@/features/quotation/components/ui";
import { memoStockLoadError, useMemoStock, type MemoStockItem } from "./memo-stock-api";
import { OWN_STOCK_UNAVAILABLE_TEXT, ownStockUnavailable, pickKey, useFromStock, type FromStockItem } from "./from-stock-api";
import { stockRef, stockRefLabel, type StockRefSource } from "./stock-ref";
import { transferLoadError, useTransferStock } from "@/features/stock-transfer-location/api";
import type { StockLot } from "@/features/stock-transfer-location/types";
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
 * - Stock Transfer Location "From Stock" (ADR-0060 D11, FE-STL-003): `source: "stock-transfer-location"` reads
 *   `GET /api/inventory/v1/stock-transfer-location/stock` (our own lots with on hand > 0 at any location); the lots
 *   on the document go to the server as `exclude` (stock UUIDs). Pcs / Weight are on hand, plus the Stock Price.
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
      source?: undefined;
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
      source?: undefined;
      vendorId?: undefined;
      currency?: undefined;
      onConfirm: (items: FromStockItem[]) => void;
    }
  | {
      /** Stock Transfer Location (ADR-0060 D11): our own lots from backend-api-inventory. */
      source: "stock-transfer-location";
      /** Stock UUIDs of the lots already on the document (sent as `exclude`). */
      exclude: readonly string[];
      fromStock?: undefined;
      vendorId?: undefined;
      currency?: undefined;
      onConfirm: (items: StockLot[]) => void;
    }
);

/** The picker key of a transfer lot (its `lotKey`, else its stock UUID). */
export const transferLotKey = (lot: Pick<StockLot, "lotKey" | "stockUuid">) => lot.lotKey || lot.stockUuid;

/** A transfer lot in the picker's row shape: on hand as Pcs / Weight, the Stock Price as the unit price. */
export function transferPickerRow(lot: StockLot): FromStockItem {
  const { attrs } = lot;
  return {
    lotKey: transferLotKey(lot),
    source: "OWN_STOCK",
    lot: attrs.lot,
    merged: false,
    stoneCode: attrs.stoneCode,
    stone: attrs.stone,
    shape: attrs.shape,
    size: attrs.size,
    color: attrs.color,
    clarity: attrs.clarity,
    cutting: attrs.cutting,
    quality: attrs.quality,
    cerType: attrs.cerType,
    cerNo: attrs.cerNo,
    location: lot.location || attrs.location,
    itemNote: "",
    ref: { type: "LOAD", id: "", docNo: lot.refDocNo, docDate: lot.refDocDate },
    refCount: 1,
    pendingPcs: lot.onHandPcs,
    pendingWeightCt: lot.onHandWeightCt,
    priceUnit: lot.priceUnit,
    unitPrice: lot.stockPrice,
    netUnitPrice: lot.stockPrice,
    amount: null,
    currency: lot.currency,
    vendor: null,
  } as unknown as FromStockItem;
}

/** Ref. date filter on the loaded rows (the transfer stock route has no date parameters). */
export const inDateRange = (date: string, from: string, to: string) => (!from || date >= from) && (!to || date <= to);

const NO_EXCLUDE: readonly string[] = [];

export function MemoStockModal(props: MemoStockModalProps) {
  const { title, vendorId, currency, showPrice, emptyText, pickedIds, onCancel } = props;
  const fromStock = props.fromStock === true;
  const transfer = props.source === "stock-transfer-location";
  const transferExclude = props.source === "stock-transfer-location" ? props.exclude : NO_EXCLUDE;
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

  const memoStock = useMemoStock(fromStock || transfer ? { vendorId: "", currency: "", q, from, to } : { vendorId: vendorId ?? "", currency: currency ?? "", q, from, to });
  const ownAndMemo = useFromStock({ q, from, to }, fromStock);
  const transferStock = useTransferStock({ q, exclude: transferExclude }, transfer);
  const stock = transfer ? transferStock : fromStock ? ownAndMemo : memoStock;
  const transferLots = useMemo(() => {
    const excluded = new Set(transferExclude);
    return (transferStock.data?.pages ?? []).flatMap((page) => page.items).filter((lot) => !excluded.has(lot.stockUuid));
  }, [transferStock.data, transferExclude]);
  const pages = (transfer ? [{ items: transferLots.filter((lot) => inDateRange(lot.refDocDate, from, to)).map(transferPickerRow) }] : (stock.data?.pages ?? [])) as {
    items: PickerItem[];
    ownStock?: "OK" | "UNAVAILABLE";
  }[];
  const keyOf = (item: PickerItem) => pickKey(item);
  const items = pages.flatMap((page) => page.items).filter((item) => !pickedIds.has(keyOf(item)));
  // FE-LS-P2-03: our stock down → Memo Stock rows stay listed and pickable under a notice (also instead of the empty text).
  const ownDown = fromStock && ownStockUnavailable(pages as { ownStock: "OK" | "UNAVAILABLE" }[]);
  const allChecked = items.length > 0 && items.every((item) => checked.has(keyOf(item)));
  // From Stock (Quotation, Reserve, Memo Out, Sale) adds Sale Price + Amount after Weight (ct).
  const columns = showPrice ? 12 : fromStock ? 12 : transfer ? 11 : 10;
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
    if (props.source === "stock-transfer-location") {
      const byKey = new Map(transferLots.map((lot) => [transferLotKey(lot), lot]));
      props.onConfirm(picked.flatMap((item) => byKey.get(keyOf(item)) ?? []));
    } else if (props.fromStock) props.onConfirm(picked);
    else props.onConfirm(picked);
  };
  // Memo Return has the PENDING group row (2-row header); From Stock has a single 56 px header row.
  const rows = showPrice ? 2 : undefined;

  return (
    <PickerDialog titleId={titleId} title={title} onClose={onCancel}>
      <PickerToolbar
        search={
          transfer
            ? { value: search, onChange: setSearch, placeholder: "Search Stock ID, Lot, Stone Code, Ref. No.", label: "Search stock", maxLength: 100 }
            : { value: search, onChange: setSearch, placeholder: "Search Lot, Stone, Stone Code, Cer No., Doc No.", label: "Search memo stock" }
        }
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
                {fromStock && <PickerTh title="Sale Price" sub="Unit" right upper />}
                {fromStock && <PickerTh title="Amount" right />}
                {transfer && <PickerTh title="Stock Price" sub="Unit" right upper />}
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
              {transfer ? transferLoadError(stock.error, "stock") : memoStockLoadError(stock.error)}
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
                {fromStock && !showPrice && <SalePriceCells item={item} />}
                {transfer && (
                  <td className={cx(pickerCell, "text-right tabular-nums")}>
                    {formatUnitPrice(item.unitPrice ?? "0", nf.pricePlaces)} {item.currency}
                    <div className={pickerSub}>{item.priceUnit === "PER_PCS" ? "pcs" : "cts"}</div>
                  </td>
                )}
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

/** Sale Price (with its currency and unit) and the server-computed Amount of a From Stock row; "—" when the lot has no price (Memo Stock). */
function SalePriceCells({ item }: { item: FromStockItem }) {
  const nf = useNumberFormat();
  const row = item as FromStockItem & { salePrice?: string | null; saleAmount?: string | null; saleCurrency?: string | null };
  const priced = row.salePrice != null && row.saleAmount != null;
  return (
    <>
      <td className={cx(pickerCell, "text-right tabular-nums")}>
        {priced ? `${formatUnitPrice(row.salePrice!, nf.pricePlaces)}${row.saleCurrency ? ` ${row.saleCurrency}` : ""}` : "—"}
        <div className={pickerSub}>{item.priceUnit === "PER_PCS" ? "pcs" : "cts"}</div>
      </td>
      <td className={cx(pickerCell, "text-right tabular-nums")}>{priced ? formatMoneyText(row.saleAmount!, nf.pricePlaces) : "—"}</td>
    </>
  );
}
