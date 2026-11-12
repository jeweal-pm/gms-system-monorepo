"use client";

import type { ReactNode } from "react";
import { QuotationInfoForm } from "@/features/quotation/components/info/QuotationInfoForm";
import { QUOTATION_KIND, type DocumentKind } from "@/features/quotation/document-kind";
import { QuotationOptionsContext } from "@/features/quotation/options-context";
import {
  customerStockSchema,
  emptyCustomerStock,
  memoStockToStockLine,
  pickedStockIds,
  toCustomerStockInput,
  type CustomerStockFormValues,
  type CustomerStockOptions,
} from "./customer-stock";
import { type DocumentApi, type DocumentFormConfig, type SaveOutcome } from "./document-form";
import type { RestoreOutcome } from "./document-api";
import { MemoStockModal } from "./memo-stock-modal";
import type { DocumentPhotos } from "./document-photos";

type CustomerStockInput = ReturnType<typeof toCustomerStockInput>;

/** What differs between Memo Out and Reserve on the shared page. */
export type CustomerStockPageOptions = {
  /** e.g. "memo out" / "reserve" (messages). */
  noun: string;
  /** e.g. "Memo Out" / "Reserve" (number label, approve dialog). */
  title: string;
  newHref: string;
  detailHref: (id: string) => string;
  useApi: (customerId: string | undefined, docDate: string, isNew: boolean) => DocumentApi<CustomerStockInput, CustomerStockOptions>;
  mapSaveError: (error: unknown) => SaveOutcome;
  /** `<doc>.restore` errors (transaction-soft-delete). */
  mapRestoreError: (error: unknown) => RestoreOutcome;
  /** The From Stock dialog title (Reserve design: "Add From Stock"). */
  pickerTitle: string;
  /** The approval setting key (ADR-0050). */
  approvalType: "reserve" | "memo-out";
  notePlaceholder: string;
  noteHint: string;
  daybook: ReactNode;
  /** Line photo routes (ADR-0048). */
  photos: DocumentPhotos;
};

/**
 * The shared document form settings of a customer document with From Stock rows:
 * - the Quotation header with a customer and both addresses;
 * - one From Stock button over Memo Stock (every vendor), whose rows take part or all of their item;
 * - the approval flow of its type (ADR-0050: Save, Send to approve, Edit / Delete per Flow).
 * Rows keyed in by hand hold nothing.
 */
export function customerStockConfig(options: CustomerStockPageOptions): DocumentFormConfig<CustomerStockFormValues, CustomerStockInput, CustomerStockOptions> {
  // Every row comes From Stock (memo-out rev 3 owner 2026-10-31; reserve owner 2026-11-02): no Add row, and an empty row
  // opens From Stock instead of the row panel. Picked rows still open it to set the quantity and Sale Price.
  const kind: DocumentKind = {
    ...QUOTATION_KIND,
    stockQuantity: true,
    pickOnly: true,
    emptyRowText: "Empty row · click to pick From Stock",
    documentNote: { ...QUOTATION_KIND.documentNote, hint: options.noteHint },
  };
  return {
    noun: options.noun,
    noLabel: `${options.title} No.:`,
    newHref: options.newHref,
    detailHref: options.detailHref,
    schema: customerStockSchema,
    empty: emptyCustomerStock,
    toInput: toCustomerStockInput,
    photos: options.photos,
    useApi: options.useApi,
    partyId: (values) => values?.customerId,
    // These documents' options have the quotation options shape, so the quotation header fields read them as is.
    header: ({ options: documentOptions }) => (
      <QuotationOptionsContext.Provider value={documentOptions}>
        <QuotationInfoForm />
      </QuotationOptionsContext.Provider>
    ),
    mapSaveError: options.mapSaveError,
    mapRestoreError: options.mapRestoreError,
    pickLabel: "From Stock",
    pickHint: "Pick stones from stock (Memo Stock)",
    kind,
    picker: {
      blockedReason: () => null,
      render: ({ values, onClose, onAdd }) => (
        <MemoStockModal
          title={options.pickerTitle}
          showPrice={false}
          emptyText="No stock with anything pending."
          pickedIds={pickedStockIds(values.lines)}
          onCancel={onClose}
          onConfirm={(items) => onAdd(items.map(memoStockToStockLine))}
        />
      ),
      addedToast: (count) => `Added ${count} item${count === 1 ? "" : "s"} from Stock`,
    },
    approvalType: options.approvalType,
    notePlaceholder: options.notePlaceholder,
    noteHint: options.noteHint,
    daybook: options.daybook,
  };
}
