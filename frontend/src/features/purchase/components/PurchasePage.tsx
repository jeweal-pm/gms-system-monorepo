"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, type ComponentProps } from "react";
import { useFormContext } from "react-hook-form";
import { ItemTable } from "@/features/quotation/components/items/ItemTable";
import { Toast } from "@/features/quotation/components/ui";
import { QUOTATION_KIND, type DocumentKind } from "@/features/quotation/document-kind";
import { daybookLoadError, daybookState, deletedInfo, DocumentDaybook, documentAccess, useDocumentAccess } from "@/features/trade-document/document-api";
import { APPROVAL_STATUS_LABELS, DocumentForm, type DocumentFormConfig } from "@/features/trade-document/document-form";
import { VendorDocumentInfoForm } from "@/features/trade-document/vendor-info-form";
import {
  clearPickedRows,
  emptyPurchase,
  fromPurchase,
  mapPurchaseSaveError,
  purchaseRestoreError,
  memoStockToPurchaseLine,
  pickedSourceKeys,
  PURCHASE_HREF,
  PURCHASE_NOTE_MAX,
  purchaseApproveText,
  purchaseHref,
  purchaseLoadError,
  purchaseOrderLineToPurchaseLine,
  purchaseSchema,
  purchaseTableLine,
  toPurchaseInput,
  usePurchaseApi,
  usePurchaseDaybook,
  usePurchaseDetail,
  type PurchaseFormValues,
  type PurchaseInput,
  type PurchaseOptions,
} from "../api";

export { PURCHASE_HREF };

/** UX only (the server checks every call): the existing catalog leaf `purchase`. */
export function canViewPurchase(mine: Parameters<typeof documentAccess>[0]): boolean {
  return documentAccess(mine, "purchase").view;
}

/** R2-02: the design's empty-row text, naming both item buttons. */
export const PURCHASE_EMPTY_ROW_TEXT = "Empty row · click to enter details, or use Memo Stock and Purchase Order to populate.";
export const PURCHASE_NOTE_HINT = "Printed on the purchase for the vendor";

/**
 * T-06/T-09/S-01 + R2-03: the Quotation table with Stone Code and a typed Location (manual rows; blank shows "—"), the
 * Stock ID "Auto" until Save issues one, "Price" (a buying cost, DV-03 / Q-PU-14), picked rows that take part or all of
 * their cap with no line discount (D8), and a 250-character note.
 */
export const PURCHASE_KIND: DocumentKind = {
  ...QUOTATION_KIND,
  stockId: "auto",
  stoneCode: true,
  location: true,
  locations: "text",
  stockQuantity: true,
  lockStockDiscount: true,
  priceTitle: "Price",
  emptyRowText: PURCHASE_EMPTY_ROW_TEXT,
  documentNote: { max: PURCHASE_NOTE_MAX, hint: PURCHASE_NOTE_HINT },
};

/** R2-01a / R2-PO: the blocked toast of either item button, until a vendor and a currency are chosen. */
export function purchasePickerBlocked(values: Pick<PurchaseFormValues, "vendorId" | "currency">): string | null {
  if (!values.vendorId) return "Choose a vendor first";
  if (!values.currency) return "Choose a currency first";
  return null;
}
const added = (source: string) => (count: number) => `Added ${count} item${count === 1 ? "" : "s"} from ${source}`;

// One route chunk for both dialogs, loaded when one opens (R2 capacity note).
const MemoStockPicker = lazy(() => import("./purchase-pickers").then((module) => ({ default: module.MemoStockPicker })));
const PurchaseOrderPicker = lazy(() => import("./purchase-pickers").then((module) => ({ default: module.PurchaseOrderPicker })));

/**
 * The shared form opens the second picker without a blocked check, so the Purchase Order picker gives the same toast
 * as Memo Stock itself (R2-01a) and closes.
 */
function BlockedNotice({ message, onClose }: { message: string; onClose: () => void }) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const timer = setTimeout(() => close.current(), 3000);
    return () => clearTimeout(timer);
  }, []);
  return <Toast message={message} onClose={onClose} />;
}

/** Header (I-01…07, R2-04): a new vendor empties the rows picked from Memo Stock and Purchase Orders; manual rows stay. */
function PurchaseInfoForm({ options }: { options: PurchaseOptions | undefined }) {
  const { getValues, setValue } = useFormContext<PurchaseFormValues>();
  const onVendorChange = () => {
    const cleared = clearPickedRows(getValues("lines"));
    if (cleared) setValue("lines", cleared, { shouldDirty: true });
  };
  return <VendorDocumentInfoForm options={options} onVendorChange={onVendorChange} />;
}

/** The shared item table showing "Auto", "from {PO No.}" and "—" for a blank Location (display only). */
export function PurchaseItemTable(props: ComponentProps<typeof ItemTable>) {
  const lines = useMemo(() => props.lines.map(purchaseTableLine), [props.lines]);
  return <ItemTable {...props} lines={lines} />;
}

/** R-01: saved purchases, newest first. */
function PurchaseDaybook() {
  const daybook = usePurchaseDaybook();
  return (
    <DocumentDaybook
      plural="purchases"
      href={purchaseHref}
      state={daybookState(daybook, (error) => daybookLoadError(error, "purchases"), (item) => String(item.vendorName ?? ""))}
    />
  );
}

/**
 * purchase UI rev 1 + rev 2 on SA rev 1 (owner 2026-11-04): a vendor document in the shared transaction layout, number
 * from Document Setup › Purchase. Rows are keyed in, picked from the vendor's Memo Stock or picked from approved PO
 * lines. Save checks availability and moves no stock; Approve takes the rows off Memo Stock and the POs (SA D2).
 */
export const PURCHASE_CONFIG: DocumentFormConfig<PurchaseFormValues, PurchaseInput, PurchaseOptions> = {
  noun: "purchase",
  noLabel: "Purchase No.:",
  newHref: PURCHASE_HREF,
  detailHref: purchaseHref,
  schema: purchaseSchema,
  empty: emptyPurchase,
  toInput: toPurchaseInput,
  useApi: usePurchaseApi,
  partyId: (values) => values?.vendorId,
  header: ({ options }) => <PurchaseInfoForm options={options} />,
  mapSaveError: mapPurchaseSaveError,
  mapRestoreError: purchaseRestoreError,
  pickLabel: "Memo Stock",
  pickHint: "Pick stones on memo from this vendor",
  picker: {
    blockedReason: purchasePickerBlocked,
    render: ({ values, onClose, onAdd }) => (
      <Suspense fallback={null}>
        <MemoStockPicker vendorId={values.vendorId} currency={values.currency} excluded={pickedSourceKeys(values.lines)} onCancel={onClose} onConfirm={(rows) => onAdd(rows.map(memoStockToPurchaseLine))} />
      </Suspense>
    ),
    addedToast: added("Memo Stock"),
  },
  secondaryPicker: {
    label: "Purchase Order",
    hint: "Pick open lines from this vendor's approved purchase orders",
    render: ({ values, onClose, onAdd }) => {
      const blocked = purchasePickerBlocked(values);
      if (blocked) return <BlockedNotice message={blocked} onClose={onClose} />;
      return (
        <Suspense fallback={null}>
          <PurchaseOrderPicker vendorId={values.vendorId} currency={values.currency} excluded={pickedSourceKeys(values.lines)} onCancel={onClose} onConfirm={(rows) => onAdd(rows.map(purchaseOrderLineToPurchaseLine))} />
        </Suspense>
      );
    },
    addedToast: added("Purchase Order"),
  },
  emptyRowText: PURCHASE_EMPTY_ROW_TEXT,
  itemTable: PurchaseItemTable,
  kind: PURCHASE_KIND,
  approval: {
    statusLabels: APPROVAL_STATUS_LABELS,
    pendingStatus: "PENDING_APPROVAL",
    confirmTitle: "Approve Purchase",
    confirmBody: purchaseApproveText,
  },
  noteMax: PURCHASE_NOTE_MAX,
  notePlaceholder: "e.g. Paid by transfer on delivery.",
  noteHint: PURCHASE_NOTE_HINT,
  daybook: <PurchaseDaybook />,
};

const message = "p-10 text-gms-body text-gms-text-secondary";
export const PURCHASE_DENIED = "You don't have permission to view purchases.";

/** `/purchase-order/purchase` — a new purchase. */
export function PurchasePage() {
  const access = useDocumentAccess("purchase");
  if (!access) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>{PURCHASE_DENIED}</p>;
  return <DocumentForm config={PURCHASE_CONFIG} canAdd={access.add} canEdit={access.edit} canDelete={access.delete} canApprove={access.approve} />;
}

/** `/purchase-order/purchase/[id]` — a saved purchase; it remounts on every new server version. */
export function EditPurchasePage({ id }: { id: string }) {
  const access = useDocumentAccess("purchase");
  const detail = usePurchaseDetail(access?.view ? id : null);
  if (!access || (access.view && detail.isPending)) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>{PURCHASE_DENIED}</p>;
  if (detail.isError || !detail.data) return <p className={message}>{detail.error ? purchaseLoadError(detail.error) : "Purchase not found."}</p>;
  return <DocumentForm key={`${id}:${detail.data.version}`} config={PURCHASE_CONFIG} initial={fromPurchase(detail.data)} deleted={deletedInfo(detail.data)} canAdd={access.add} canEdit={access.edit} canDelete={access.delete} canApprove={access.approve} />;
}
