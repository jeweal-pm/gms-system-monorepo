"use client";

import { useEffect, useMemo, useRef, type ComponentProps, type ReactNode } from "react";
import { useFormContext } from "react-hook-form";
import type { QuotationOptions } from "@/features/quotation/api";
import { QuotationInfoForm } from "@/features/quotation/components/info/QuotationInfoForm";
import { ItemTable } from "@/features/quotation/components/items/ItemTable";
import { useConfirm, type ConfirmRequest } from "@/features/quotation/components/use-confirm";
import { QUOTATION_KIND, type DocumentKind } from "@/features/quotation/document-kind";
import { QuotationOptionsContext } from "@/features/quotation/options-context";
import { documentAccess, useDocumentAccess, type DeletedInfo, type RestoreOutcome } from "@/features/trade-document/document-api";
import { DocumentForm, type DocumentApi, type DocumentFormConfig, type PickerRender, type SaveOutcome } from "@/features/trade-document/document-form";
import type { DocumentPhotos } from "@/features/trade-document/document-photos";
import type { DocFlow, DocumentApprovalType } from "@/features/trade-document/flow-status";
import {
  clearReserveRows,
  emptySale,
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
import { SaleUiForm } from "./sale-ui-form";

export { SALE_HREF };

/** The sale options have the quotation options shape (api-contract `GET /sale/options`), so the shared header reads them. */
export type SaleOptions = QuotationOptions;

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
 * A saved sale's route while the Sale API is not connected (owner 2026-11-18: UI only, no API yet). The new-sale route
 * shows the full document UI instead (`SaleUiForm`); no mock store or fake Save is used (Q-PU-01 rule).
 */
export const SALE_UNAVAILABLE = "Sale isn't available yet.";

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
  // Sale line photos come with FE-SL-007 (`binding.photos` replaces this); never the Quotation photo route.
  uploadPhoto: () => Promise.reject(new Error("Sale photos are not connected yet")),
};

const added = (source: string) => (count: number) => `Added ${count} item${count === 1 ? "" : "s"} from ${source}`;

/** What a saved sale gives the edit page (the REST adapter maps `GET /sale/{id}` to it, FE-SL-006). */
export type SaleDetailState = {
  isPending: boolean;
  error: unknown;
  loaded: { initial: SaleFormValues; version: number; deleted: DeletedInfo | null; flow: DocFlow | null } | null;
};

/**
 * Everything the page needs from work that waits for the backend (ADR-0054, SA rev 1). FE-SL-006 supplies the REST
 * adapter (options, number preview, writes, errors, detail, daybook), FE-SL-004 the From Reserve picker, FE-SL-005 the
 * From Stock picker (the dialogs in `sale-pickers.tsx` take its query `data`), FE-SL-007 the photos and FE-SL-009 the
 * `sale` approval type. Until then `SALE_BINDING` is null and `/sale/sale` shows the document UI with no API
 * (`SaleUiForm`, owner 2026-11-18 "ทำแค่ ui พอ ยังไม่ต้องต่อ api").
 */
export type SaleBinding = {
  useApi: (customerId: string | undefined, docDate: string, isNew: boolean) => DocumentApi<SaleInput, SaleOptions>;
  useDetail: (id: string | null) => SaleDetailState;
  loadError: (error: unknown) => string;
  mapSaveError: (error: unknown) => SaveOutcome;
  mapRestoreError: (error: unknown) => RestoreOutcome;
  approvalType: DocumentApprovalType;
  photos?: DocumentPhotos;
  daybook: ReactNode;
  /** P-01 "Add From Reserve" (FE-SL-004). */
  fromReserve: PickerRender<SaleFormValues>;
  /** P-02 "Add From Stock" (FE-SL-005, `MemoStockModal` in phase 1). */
  fromStock: PickerRender<SaleFormValues>;
};

/** Not wired yet: FE-SL-006 replaces this with the inventory REST adapter once BE-SL-008 hands the contract back. */
export const SALE_BINDING: SaleBinding | null = null as SaleBinding | null;

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

/** The page config once the binding exists (FE-SL-006); null until then. */
export const SALE_CONFIG = SALE_BINDING ? saleConfig(SALE_BINDING) : null;

const message = "p-10 text-gms-body text-gms-text-secondary";

/** `/sale/sale` — a new sale. */
export function SalePage({ binding = SALE_BINDING }: { binding?: SaleBinding | null }) {
  const access = useDocumentAccess("sale");
  const config = useMemo(() => (binding ? saleConfig(binding) : null), [binding]);
  if (!access) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>{SALE_DENIED}</p>;
  if (!config) {
    return (
      <SaleUiForm
        canAdd={access.add}
        kind={SALE_KIND}
        itemTable={SaleItemTable}
        emptyRowText={SALE_EMPTY_ROW_TEXT}
        notePlaceholder={SALE_NOTE_PLACEHOLDER}
        noteHint={SALE_NOTE_HINT}
        noteMax={SALE_NOTE_MAX}
      />
    );
  }
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
export function EditSalePage({ id, binding = SALE_BINDING }: { id: string; binding?: SaleBinding | null }) {
  const access = useDocumentAccess("sale");
  if (!access) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>{SALE_DENIED}</p>;
  if (!binding) return <p className={message}>{SALE_UNAVAILABLE}</p>;
  return <BoundEditSalePage id={id} binding={binding} access={access} />;
}
