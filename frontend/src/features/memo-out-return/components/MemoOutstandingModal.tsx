"use client";

import { useEffect, useId, useState } from "react";
import { cx } from "@/features/quotation/components/ui";
import { dec } from "@/features/quotation/lib/decimal";
import { formatMoneyText, formatWeight } from "@/features/quotation/lib/format";
import { useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import {
  PickerChip,
  PickerDialog,
  PickerFooter,
  PickerFrame,
  PickerGroupSubTh,
  PickerGroupTh,
  PickerLoadMore,
  PickerLot,
  PickerMessage,
  PickerNote,
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
} from "@/features/trade-document/picker-ui";
import { memoOutstandingLoadError, useMemoOutstanding, type MemoOutstandingItem } from "../api";

/**
 * Memo Outstanding picker (memo-out-return UI rev 4, SA-MOR-15; look: designs 141 / 142): the customer's approved Memo
 * Out From Stock lines in the return's currency with something not yet returned. Each row shows its Memo Out No., Stock
 * ID with the lot chip, the stone, Outstanding Pcs / Weight under the green OUTSTANDING group, the Memo Out price after
 * its discount and the amount of the outstanding. Search + Start → Due (Memo Out Doc Date) filter; rows already on the
 * document are left out; 50 a page with Load more. OK adds the checked rows.
 */
export function MemoOutstandingModal({ customerId, currency, excludeReturnId, pickedIds, onCancel, onConfirm }: {
  customerId: string;
  currency: string;
  excludeReturnId?: string;
  pickedIds: Set<string>;
  onCancel: () => void;
  onConfirm: (items: MemoOutstandingItem[]) => void;
}) {
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

  const outstanding = useMemoOutstanding({ customerId, currency, q, from, to, excludeReturnId });
  const items = (outstanding.data?.pages ?? []).flatMap((page) => page.items).filter((item) => !pickedIds.has(item.memoOutLineId));
  const allChecked = items.length > 0 && items.every((item) => checked.has(item.memoOutLineId));
  const columns = 12;
  const green = pickerGroupTone.green;
  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <PickerDialog titleId={titleId} title="Memo Outstanding" onClose={onCancel}>
      <PickerToolbar
        search={{ value: search, onChange: setSearch, placeholder: "Search Memo Out No., Stock ID, Lot, Stone, Cer No.", label: "Search memo outstanding" }}
        dates={{ from, to, onFrom: setFrom, onTo: setTo, fromLabel: "Memo out from", toLabel: "Memo out to" }}
      />
      <PickerFrame
        footer={<PickerFooter count={checked.size} onCancel={onCancel} onOk={() => onConfirm(items.filter((item) => checked.has(item.memoOutLineId)))} />}
      >
        <thead className={pickerHead}>
          <tr>
            <th scope="col" rowSpan={2} className="w-14 px-4">
              <input
                type="checkbox"
                aria-label="Select all"
                className={pickerCheckbox}
                checked={allChecked}
                disabled={items.length === 0}
                onChange={() => setChecked(allChecked ? new Set() : new Set(items.map((item) => item.memoOutLineId)))}
              />
            </th>
            <th scope="col" rowSpan={2} className="w-8 text-sm font-medium">#</th>
            <PickerTh rowSpan={2} title="Memo Out No." sub="Doc Date" plainSub />
            <PickerTh rowSpan={2} title="Stock ID" sub="Lot" plainSub />
            {/* Revision 5 (Q-LS-P2-04): `Memo` or our stock's Location name tells the source. */}
            <PickerTh rowSpan={2} title="Location" upper />
            <PickerTh rowSpan={2} title="Stone" sub="Shape · Size" upper />
            <PickerTh rowSpan={2} title="Color · Clarity" sub="Cutting · Quality" upper />
            <PickerTh rowSpan={2} title="Cer Type" sub="Cer No." upper />
            <PickerGroupTh title="Outstanding" span={2} tone="green" />
            <PickerTh rowSpan={2} title="Memo Price" sub="Unit" right />
            <PickerTh rowSpan={2} title="Amount" right />
          </tr>
          <tr>
            <PickerGroupSubTh title="Pcs" tone="green" className="w-[90px]" />
            <PickerGroupSubTh title="Weight" tone="green" className="w-[100px]" />
          </tr>
        </thead>
        <tbody>
          {outstanding.isPending && <PickerMessage span={columns}>Loading…</PickerMessage>}
          {outstanding.isError && (
            <PickerMessage span={columns} error>
              {memoOutstandingLoadError(outstanding.error)}
            </PickerMessage>
          )}
          {outstanding.isSuccess && items.length === 0 && <PickerMessage span={columns}>{`Nothing outstanding for this customer in ${currency}.`}</PickerMessage>}
          {items.map((item, index) => {
            const ticked = checked.has(item.memoOutLineId);
            return (
              <tr key={item.memoOutLineId} onClick={() => toggle(item.memoOutLineId)} className={pickerRowClass(ticked)}>
                <td className={pickerCheckCell}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${item.stockId} from ${item.memoOut.docNo}`}
                    className={pickerCheckbox}
                    checked={ticked}
                    onChange={() => toggle(item.memoOutLineId)}
                    onClick={(event) => event.stopPropagation()}
                  />
                </td>
                <td className={pickerIndexCell}>{index + 1}</td>
                <td className={pickerCell}>
                  <div className="font-medium">{item.memoOut.docNo}</div>
                  <div className={pickerSub}>{item.memoOut.docDate}</div>
                </td>
                <td className={pickerCell}>
                  <div className="font-medium">{item.stockId}</div>
                  {item.lot && (
                    <div className="mt-1">
                      <PickerLot>{item.lot}</PickerLot>
                    </div>
                  )}
                  <PickerNote text={item.itemNote} />
                </td>
                <td className={pickerCell}>{item.location}</td>
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
                <td className={cx(pickerCell, "text-right tabular-nums", green.cell)}>{item.outstandingPcs}</td>
                <td className={cx(pickerCell, "text-right tabular-nums", green.cell)}>{formatWeight(dec(item.outstandingWeightCt), nf.weightPlaces)}</td>
                <td className={cx(pickerCell, "text-right tabular-nums")}>
                  {formatMoneyText(item.unitPrice, nf.pricePlaces)} {item.currency}
                  <div className={pickerSub}>{item.priceUnit === "PER_PCS" ? "pcs" : "cts"}</div>
                </td>
                <td className={cx(pickerCell, "text-right tabular-nums")}>{formatMoneyText(item.amount, nf.pricePlaces)}</td>
              </tr>
            );
          })}
          {outstanding.hasNextPage && (
            <PickerLoadMore span={columns} loading={outstanding.isFetchingNextPage} onMore={() => void outstanding.fetchNextPage()} />
          )}
        </tbody>
      </PickerFrame>
    </PickerDialog>
  );
}
