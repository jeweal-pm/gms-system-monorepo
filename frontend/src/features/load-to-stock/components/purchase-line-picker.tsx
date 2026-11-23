"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import { Button, cx } from "@/features/quotation/components/ui";
import {
  PickerChip,
  PickerDialog,
  PickerFooter,
  PickerFrame,
  PickerLoadMore,
  PickerLot,
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
import { loadLoadError, usePurchaseLineSearch, type SearchInput } from "../api";
import { shortDate } from "../form";
import type { PurchaseLineRef } from "../types";
import { GradeCell, StoneCell } from "./cells";
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
  const titleId = useId();
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
    <PickerDialog titleId={titleId} title="Add From Purchase" onClose={onCancel} onBackdrop={suspended ? undefined : onCancel}>
      <PickerToolbar
        search={{ value: search, onChange: setSearch, placeholder: PICKER_SEARCH_PLACEHOLDER, label: "Search purchase lines", maxLength: 100 }}
        dates={{ from, to, onFrom: setFrom, onTo: setTo, fromLabel: "PU date from", toLabel: "PU date to" }}
      />
      <PickerFrame
        minWidth="min-w-[1100px]"
        footer={<PickerFooter count={checked.size} onCancel={onCancel} onOk={() => onConfirm(items.filter((item) => checked.has(item.purchaseLineId)))} />}
      >
        <thead className={pickerHead}>
          <tr className="h-14">
            <th scope="col" className="w-14 px-4">
              <input
                type="checkbox"
                aria-label="Select all"
                className={pickerCheckbox}
                checked={allChecked}
                disabled={items.length === 0}
                onChange={() => setChecked(allChecked ? new Set() : new Set(items.map((item) => item.purchaseLineId)))}
              />
            </th>
            <th scope="col" className="w-8 text-sm font-medium">#</th>
            <PickerTh title="PU No." sub="Doc Date" upper plainSub />
            <PickerTh title="Stone Code" sub="Stock ID · Lot" />
            <PickerTh title="Location" upper />
            <PickerTh title="Stone" sub="Shape · Size" upper />
            <PickerTh title="Color · Clarity" sub="Cutting · Quality" upper />
            <PickerTh title="Cer Type" sub="Cer No." upper />
            <PickerTh title="Pcs" right upper />
            <PickerTh title="Weight" right />
            <PickerTh title="Price" sub="Unit" right upper />
            <PickerTh title="Amount" right upper />
          </tr>
        </thead>
        <tbody>
          {search$.isPending && <PickerMessage span={12}>Loading…</PickerMessage>}
          {search$.isError && (
            <tr>
              <td colSpan={12} className="py-16 text-center">
                <p role="alert" className="text-[#E5484D]">{loadLoadError(search$.error, "purchase lines")}</p>
                <Button size="sm" className="mt-3" onClick={() => void search$.refetch()}>Retry</Button>
              </td>
            </tr>
          )}
          {search$.isSuccess && items.length === 0 && <PickerMessage span={12}>{PICKER_EMPTY_TEXT}</PickerMessage>}
          {items.map((item, index) => {
            const on = checked.has(item.purchaseLineId);
            return (
              <tr key={item.purchaseLineId} onClick={() => toggle(item.purchaseLineId)} className={pickerRowClass(on)}>
                <td className={pickerCheckCell}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${item.stoneCode || "line"} from ${item.purchase.docNo}`}
                    className={pickerCheckbox}
                    checked={on}
                    onChange={() => toggle(item.purchaseLineId)}
                    onClick={(event) => event.stopPropagation()}
                  />
                </td>
                <td className={pickerIndexCell}>{index + 1}</td>
                <td className={pickerCell}>
                  <div className="font-medium">{item.purchase.docNo}</div>
                  <div className={pickerSub}>{shortDate(item.purchase.docDate)}</div>
                </td>
                <td className={pickerCell}>
                  {/* Design 148: "New on load" (the Stock ID is issued on save) with the lot chip. */}
                  <div className="font-medium">{item.stoneCode || "—"}</div>
                  <div className={cx(pickerSub, "flex flex-wrap items-center gap-1.5")}>
                    <span>New on load</span>
                    {item.lot && <span aria-hidden>·</span>}
                    {item.lot && <PickerLot>{item.lot}</PickerLot>}
                  </div>
                </td>
                <td className={pickerCell}>{item.location || "—"}</td>
                <td className={pickerCell}><StoneCell attrs={item} /></td>
                <td className={pickerCell}><GradeCell attrs={item} /></td>
                <td className={pickerCell}>
                  {item.cerType || item.cerNo ? (
                    <>
                      {item.cerType && <PickerChip>{item.cerType}</PickerChip>}
                      <div className={pickerSub}>{item.cerNo}</div>
                    </>
                  ) : (
                    <span className="text-xs text-gms-text-secondary">No certificate</span>
                  )}
                </td>
                <td className={cx(pickerCell, "text-right tabular-nums")}>{item.remainingPcs}</td>
                <td className={cx(pickerCell, "text-right tabular-nums")}>{nf.weight(item.remainingWeightCt)}</td>
                <td className={cx(pickerCell, "text-right tabular-nums")}>
                  {nf.unitPrice(item.unitPrice)} {item.purchase.currency}
                  <div className={pickerSub}>{priceSub(item, companyCurrency)}</div>
                </td>
                <td className={cx(pickerCell, "text-right tabular-nums")}>
                  {nf.money(item.remainingAmountBase)}
                  <div className={pickerSub}>{companyCurrency}</div>
                </td>
              </tr>
            );
          })}
          {search$.hasNextPage && <PickerLoadMore span={12} loading={search$.isFetchingNextPage} onMore={() => void search$.fetchNextPage()} />}
        </tbody>
      </PickerFrame>
    </PickerDialog>
  );
}
