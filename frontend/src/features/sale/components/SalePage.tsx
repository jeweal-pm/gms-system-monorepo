"use client";

import { useEffect, useMemo, useRef, type ComponentProps, type ReactNode } from "react";
import { useFormContext } from "react-hook-form";
import { QuotationInfoForm } from "@/features/quotation/components/info/QuotationInfoForm";
import { ItemTable } from "@/features/quotation/components/items/ItemTable";
import { useConfirm, type ConfirmRequest } from "@/features/quotation/components/use-confirm";
import { QUOTATION_KIND, type DocumentKind } from "@/features/quotation/document-kind";
import { QuotationOptionsContext } from "@/features/quotation/options-context";
import { useApprovalSetting } from "@/features/trade-document/approval-flow";
import { daybookLoadError, DocumentDaybook, documentAccess, useDocumentAccess, type DaybookState, type DeletedInfo, type RestoreOutcome } from "@/features/trade-document/document-api";
import { DocumentForm, type DocumentApi, type DocumentFormConfig, type PickerRender, type SaveOutcome } from "@/features/trade-document/document-form";
import type { DocumentPhotos } from "@/features/trade-document/document-photos";
import type { DocFlow, DocumentApprovalType } from "@/features/trade-document/flow-status";
import {
  clearReserveRows,
  emptySale,
  memoStockToSaleLine,
  pickedReserveLineIds,
  pickedStockIds,
  reserveLineToSaleLine,
  reserveRowCount,
  SALE_HREF,
  SALE_NOTE_MAX,
  saleHeaderChangeConfirm,
  saleHref,
  salePickerBlocked,
  saleSchema,
  saleStockNote,
  saleTableLine,
  toSaleInput,
  type SaleFormValues,
  type SaleInput,
} from "../form";
import { MemoStockModal } from "@/features/trade-document/memo-stock-modal";
import {
  fromSale,
  mapSaleSaveError,
  SALE_PHOTOS,
  saleDeleted,
  saleFlow,
  saleLoadError,
  saleRestoreError,
  useSaleApi,
  useSaleDaybook,
  useSaleDetail,
  type SaleOptions,
} from "../api";
import { ReserveLinePicker } from "./sale-pickers";

export { SALE_HREF };

export type { SaleOptions };

/** UX only (the server checks every call): the existing catalog leaf `sale` (F-04). */
export function canViewSale(mine: Parameters<typeof documentAccess>[0]): boolean {
  return documentAccess(mine, "sale").view;
}

/** T-07 (Q-SL-07): every row is picked; an empty row opens From Reserve. */
export const SALE_EMPTY_ROW_TEXT = "Empty row · click to pick From Reserve, or use From Stock";
export const SALE_NOTE_HINT = "Printed on the sale for the customer";
export const SALE_NOTE_PLACEHOLDER = "e.g. Paid in full by transfer.";
export const SALE_DENIED = "You don't have permission to view sales.";
export const SALE_NOT_FOUND = "Sale not found.";

/**
 * T-06 / T-09: the Reserve / Quotation table and row panel with stock quantities (Pcs / Weight up to the row's cap, Pcs
 * fills Weight), pick-only rows (no Add row, Q-SL-07), the row's cap note and a 250-character note.
 */
export const SALE_KIND: DocumentKind = {
  ...QUOTATION_KIND,
  stockQuantity: true,
  pickOnly: true,
  emptyRowText: SALE_EMPTY_ROW_TEXT,
  stockNote: (line) => saleStockNote(line),
  documentNote: { max: SALE_NOTE_MAX, hint: SALE_NOTE_HINT },
  // FE-SL-007: the page's `photos` (SALE_PHOTOS) replace this; a sale never uploads to the Quotation photo route.
  uploadPhoto: () => Promise.reject(new Error("Sale photos need the sale photo route")),
};

const added = (source: string) => (count: number) => `Added ${count} item${count === 1 ? "" : "s"} from ${source}`;

/** What a saved sale gives the edit page (the REST adapter maps `GET /sale/{id}` to it, FE-SL-006). */
export type SaleDetailState = {
  isPending: boolean;
  error: unknown;
  loaded: { initial: SaleFormValues; version: number; deleted: DeletedInfo | null; flow: DocFlow | null } | null;
};

/**
 * Everything the page reads from the inventory Sale API (ADR-0054, SA rev 1): the REST adapter (options, number
 * preview, writes, errors, detail, daybook; FE-SL-006), From Reserve (FE-SL-004), From Stock (FE-SL-005), photos
 * (FE-SL-007) and the `sale` approval type (FE-SL-009). The pages take it as a prop so tests can pass typed fixtures.
 */
export type SaleBinding = {
  useApi: (customerId: string | undefined, docDate: string, isNew: boolean) => DocumentApi<SaleInput, SaleOptions>;
  useDetail: (id: string | null) => SaleDetailState;
  loadError: (error: unknown) => string;
  mapSaveError: (error: unknown, values?: SaleFormValues) => SaveOutcome;
  mapRestoreError: (error: unknown) => RestoreOutcome;
  approvalType: DocumentApprovalType;
  photos?: DocumentPhotos;
  daybook: ReactNode;
  /** P-01 "Add From Reserve" (FE-SL-004). */
  fromReserve: PickerRender<SaleFormValues>;
  /** P-02 "Add From Stock" (FE-SL-005, `MemoStockModal` in phase 1). */
  fromStock: PickerRender<SaleFormValues>;
};

/** R-01 Daybook rows (ADR-0050 D6): customer name and the Revise / Reject note. */
export function saleDaybookState(list: ReturnType<typeof useSaleDaybook>): DaybookState {
  return {
    isPending: list.isPending,
    isError: list.isError,
    errorMessage: list.error ? daybookLoadError(list.error, "sales") : undefined,
    items: (list.data?.pages ?? []).flatMap((page) =>
      page.items.map((item) => ({
        id: item.id,
        docNo: item.docNo,
        docDate: item.docDate,
        status: item.status,
        name: item.customerName,
        note: item.status === "REVISION_REQUESTED" || item.status === "REJECTED" ? (item.reviewNote ?? undefined) : undefined,
      })),
    ),
    hasMore: list.hasNextPage,
    loadingMore: list.isFetchingNextPage,
    onLoadMore: () => void list.fetchNextPage(),
  };
}

function SaleDaybook() {
  const list = useSaleDaybook();
  const { requireApproval } = useApprovalSetting("sale");
  return <DocumentDaybook requireApproval={requireApproval} plural="sales" href={saleHref} state={saleDaybookState(list)} />;
}

/** `GET /sale/{id}` → the edit page's state (form values, version, deleted banner, `Flow`). */
export function useSaleDetailState(id: string | null): SaleDetailState {
  const detail = useSaleDetail(id);
  return {
    isPending: detail.isPending,
    error: detail.error,
    loaded: detail.data ? { initial: fromSale(detail.data), version: detail.data.version, deleted: saleDeleted(detail.data), flow: saleFlow(detail.data) } : null,
  };
}

/** The live binding: inventory REST (`/api/inventory/v1/sale*`) and master Memo Stock for From Stock. */
export const SALE_BINDING: SaleBinding = {
  useApi: useSaleApi,
  useDetail: useSaleDetailState,
  loadError: (error) => saleLoadError(error),
  mapSaveError: mapSaleSaveError,
  mapRestoreError: saleRestoreError,
  approvalType: "sale",
  photos: SALE_PHOTOS,
  daybook: <SaleDaybook />,
  fromReserve: ({ values, onClose, onAdd }) => (
    <ReserveLinePicker
      customerId={values.customerId}
      currency={values.currency}
      excluded={pickedReserveLineIds(values.lines)}
      onCancel={onClose}
      onConfirm={(rows) => onAdd(rows.map(reserveLineToSaleLine))}
    />
  ),
  // P-02 phase 1 (Q-SL-01): the Reserve / Memo Out "Add From Stock" dialog over Memo Stock of every vendor, no prices.
  fromStock: ({ values, onClose, onAdd }) => (
    <MemoStockModal
      title="Add From Stock"
      showPrice={false}
      emptyText="No stock with anything pending."
      pickedIds={pickedStockIds(values.lines)}
      onCancel={onClose}
      onConfirm={(items) => onAdd(items.map(memoStockToSaleLine))}
    />
  ),
};

type HeaderField = "customerId" | "shippingAddressId" | "invoiceAddressId" | "currency" | "exchangeRate";
const HEADER_FIELDS: readonly HeaderField[] = ["customerId", "shippingAddressId", "invoiceAddressId", "currency", "exchangeRate"];
type HeaderSnapshot = Record<HeaderField, string>;
type WatchInfo = { name?: string; type?: string };

/**
 * Q-SL-05 / TC-SL-07: a user change of the customer or currency asks first when From Reserve rows would go; OK empties
 * them (From Stock rows stay), Cancel puts the customer, addresses, currency and rate back. The check runs after the
 * header's own follow-up updates (default addresses and currency), so it sees the whole change. Resets and loads are
 * not user changes and only record the new header.
 */
export function createReserveRowGuard(form: {
  getValues: () => SaleFormValues;
  setValue: (name: HeaderField | "lines", value: never, options: { shouldDirty: boolean }) => void;
  confirm: (request: ConfirmRequest) => Promise<boolean>;
  defer?: (run: () => void) => void;
}) {
  const snapshot = (): HeaderSnapshot => {
    const values = form.getValues();
    return Object.fromEntries(HEADER_FIELDS.map((field) => [field, values[field] ?? ""])) as HeaderSnapshot;
  };
  const defer = form.defer ?? ((run: () => void) => setTimeout(run, 0));
  let settled = snapshot();
  let handling = false;
  const set = (name: HeaderField | "lines", value: unknown) => form.setValue(name, value as never, { shouldDirty: true });

  const handle = async (field: "customer" | "currency", previous: HeaderSnapshot) => {
    const values = form.getValues();
    const count = reserveRowCount(values.lines);
    const changed = values.customerId !== previous.customerId || values.currency !== previous.currency;
    if (count === 0 || !changed) {
      settled = snapshot();
      handling = false;
      return;
    }
    const ok = await form.confirm(saleHeaderChangeConfirm(count, values.customerId !== previous.customerId ? "customer" : field));
    if (ok) {
      const cleared = clearReserveRows(form.getValues().lines);
      if (cleared) set("lines", cleared);
      settled = snapshot();
    } else {
      for (const name of HEADER_FIELDS) set(name, previous[name]);
      settled = previous;
    }
    handling = false;
  };

  return {
    onWatch(info: WatchInfo) {
      if (handling) return;
      if (info.type === "change" && (info.name === "customerId" || info.name === "currency")) {
        handling = true;
        const previous = settled;
        const field = info.name === "customerId" ? "customer" : "currency";
        defer(() => void handle(field, previous));
        return;
      }
      settled = snapshot();
    },
  };
}

/** I-01…I-08: the Reserve header (`QuotationInfoForm`) with the From Reserve row guard. */
export function SaleInfoForm({ options }: { options: SaleOptions | undefined }) {
  const { getValues, setValue, watch } = useFormContext<SaleFormValues>();
  const { confirm, dialog } = useConfirm();
  const confirmRef = useRef(confirm);
  useEffect(() => {
    confirmRef.current = confirm;
  });
  useEffect(() => {
    const guard = createReserveRowGuard({
      getValues: () => getValues(),
      setValue: (name, value, opts) => setValue(name, value, opts),
      confirm: (request) => confirmRef.current(request),
    });
    const subscription = watch((_value, info) => guard.onWatch(info));
    return () => subscription.unsubscribe();
  }, [getValues, setValue, watch]);
  return (
    <QuotationOptionsContext.Provider value={options}>
      <QuotationInfoForm />
      {dialog}
    </QuotationOptionsContext.Provider>
  );
}

/** T-06: the shared item table with "from {Reserve No. / Memo Receive No.}" under the Stock ID (display only). */
export function SaleItemTable(props: ComponentProps<typeof ItemTable>) {
  const lines = useMemo(() => props.lines.map(saleTableLine), [props.lines]);
  return <ItemTable {...props} lines={lines} />;
}

/**
 * sale UI rev 1 + SA rev 1 (owner 2026-11-18): a customer document in the shared transaction layout, number from
 * Document Setup › Sale (SL). Items come only from two dark buttons, in this order: **From Reserve** (`picker`, blocked
 * until a customer and currency are chosen; an empty row opens it) and **From Stock** (`secondaryPicker`).
 */
export function saleConfig(binding: SaleBinding): DocumentFormConfig<SaleFormValues, SaleInput, SaleOptions> {
  return {
    noun: "sale",
    noLabel: "Sale No.:",
    newHref: SALE_HREF,
    detailHref: saleHref,
    schema: saleSchema,
    empty: emptySale,
    toInput: toSaleInput,
    useApi: binding.useApi,
    partyId: (values) => values?.customerId,
    header: ({ options }) => <SaleInfoForm options={options} />,
    mapSaveError: binding.mapSaveError,
    mapRestoreError: binding.mapRestoreError,
    pickLabel: "From Reserve",
    pickHint: "Pick open lines from this customer's approved reserves",
    picker: {
      blockedReason: salePickerBlocked,
      render: binding.fromReserve,
      addedToast: added("Reserve"),
    },
    secondaryPicker: {
      label: "From Stock",
      hint: "Pick stones from stock (Memo Stock)",
      render: binding.fromStock,
      addedToast: added("Stock"),
    },
    emptyRowText: SALE_EMPTY_ROW_TEXT,
    itemTable: SaleItemTable,
    kind: SALE_KIND,
    approvalType: binding.approvalType,
    photos: binding.photos,
    noteMax: SALE_NOTE_MAX,
    notePlaceholder: SALE_NOTE_PLACEHOLDER,
    noteHint: SALE_NOTE_HINT,
    daybook: binding.daybook,
  };
}

/** The page config on the live binding. */
export const SALE_CONFIG = saleConfig(SALE_BINDING);

const message = "p-10 text-gms-body text-gms-text-secondary";

/** `/sale/sale` — a new sale. */
export function SalePage({ binding = SALE_BINDING }: { binding?: SaleBinding }) {
  const access = useDocumentAccess("sale");
  const config = useMemo(() => saleConfig(binding), [binding]);
  if (!access) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>{SALE_DENIED}</p>;
  return <DocumentForm config={config} canAdd={access.add} canEdit={access.edit} canDelete={access.delete} />;
}

function BoundEditSalePage({ id, binding, access }: { id: string; binding: SaleBinding; access: NonNullable<ReturnType<typeof useDocumentAccess>> }) {
  const config = useMemo(() => saleConfig(binding), [binding]);
  const detail = binding.useDetail(id);
  if (detail.isPending) return <p className={message}>Loading…</p>;
  if (!detail.loaded) return <p className={message}>{detail.error ? binding.loadError(detail.error) : SALE_NOT_FOUND}</p>;
  const { initial, version, deleted, flow } = detail.loaded;
  return <DocumentForm key={`${id}:${version}`} config={config} initial={initial} deleted={deleted} flow={flow} canAdd={access.add} canEdit={access.edit} canDelete={access.delete} />;
}

/** `/sale/sale/[id]` — a saved sale; it remounts on every new server version. */
export function EditSalePage({ id, binding = SALE_BINDING }: { id: string; binding?: SaleBinding }) {
  const access = useDocumentAccess("sale");
  if (!access) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>{SALE_DENIED}</p>;
  return <BoundEditSalePage id={id} binding={binding} access={access} />;
}
