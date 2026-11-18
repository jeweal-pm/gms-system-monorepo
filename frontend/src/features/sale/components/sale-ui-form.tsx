"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Send, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type ComponentProps, type ComponentType } from "react";
import { FormProvider, useFieldArray, useForm, useFormContext, useWatch, type Resolver } from "react-hook-form";
import { QuotationHeader } from "@/features/quotation/components/header/QuotationHeader";
import { ItemEditorDock, ItemEditorPanel } from "@/features/quotation/components/items/ItemEditorPanel";
import { ItemPhotoBox } from "@/features/quotation/components/items/ItemPhotoBox";
import { DocumentNote } from "@/features/quotation/components/note/DocumentNote";
import { RailButtons, RailPanelView, type RailPanel } from "@/features/quotation/components/rail/RightRail";
import { SummaryValue } from "@/features/quotation/components/summary/SummaryValue";
import { Button, Field, FormDateInput, FormSelect, TextInput, Toast } from "@/features/quotation/components/ui";
import { DISCARD_CHANGES_CONFIRM, useConfirm } from "@/features/quotation/components/use-confirm";
import { ItemTable } from "@/features/quotation/components/items/ItemTable";
import { DocumentKindContext, type DocumentKind } from "@/features/quotation/document-kind";
import { LinePhotoContext } from "@/features/quotation/options-context";
import { calculateTotals } from "@/features/quotation/lib/calculate";
import { exchangeRateLabel } from "@/features/quotation/lib/format";
import { isFilledLine, type QuotationFormValues, type QuotationLine } from "@/features/quotation/schema";
import { ItemToolButtons } from "@/features/trade-document/document-form";
import {
  emptySale,
  emptySaleLine,
  memoStockToSaleLine,
  pickedReserveLineIds,
  pickedStockIds,
  reserveLineToSaleLine,
  salePickerBlocked,
  saleSchema,
  type SaleFormValues,
  type SaleLine,
} from "../form";
import { NOT_CONNECTED, ReserveLinePickerDialog, StockPickerDialog } from "./sale-pickers";

/**
 * The Sale document UI without an API (owner 2026-11-18 "sale frontend ทำแค่ ui พอ ยังไม่ต้องต่อ api"): the same layout as
 * the other transaction pages (header, Item card with From Reserve then From Stock, item table, row panel, note,
 * Summary Value, rail) on the Sale form model. Nothing is fetched or saved: the selects have no choices, the number is
 * the SL preview, Save / Send to approve are disabled ("Not connected yet") and both dialogs open empty. Once the
 * Sale binding exists (FE-SL-004…007/009) the page uses the shared `DocumentForm` with the API instead.
 */

export const SALE_NUMBER_PREVIEW = "SL…";
export const SALE_NOT_CONNECTED_NOTE = `${NOT_CONNECTED}: Save and Send to approve work once Sale is connected.`;
export const SALE_DAYBOOK_NOT_CONNECTED = `${NOT_CONNECTED}. Saved sales appear here once Sale is connected.`;

/** No photo routes yet (FE-SL-007): the row panel says photos come later and nothing is uploaded. */
const NO_PHOTOS = { upload: null, url: (id: string) => id };

const added = (source: string, count: number) => `Added ${count} item${count === 1 ? "" : "s"} from ${source}`;

/** I-01…I-08 without option lists (no API): Doc Date, Customer, both addresses, Due Date, Currency, Exchange Rate, Ref. */
export function SaleHeaderFields() {
  return (
    <div className="@container px-6 py-6">
      <div className="grid grid-cols-1 gap-x-4 gap-y-5 @2xl:grid-cols-2 @4xl:grid-cols-[200px_1fr_1fr_1fr]">
        <Field label="Doc Date" required>
          <FormDateInput<SaleFormValues> name="docDate" />
        </Field>
        <Field label="Customer" required>
          <FormSelect<SaleFormValues> name="customerId" options={[]} />
        </Field>
        <Field label="Shipping Address" required>
          <FormSelect<SaleFormValues> name="shippingAddressId" options={[]} />
        </Field>
        <Field label="Invoice Address" required>
          <FormSelect<SaleFormValues> name="invoiceAddressId" options={[]} />
        </Field>
        <Field label="Due Date" required>
          <FormDateInput<SaleFormValues> name="dueDate" notBefore="docDate" />
        </Field>
        <Field label="Currency" required>
          <FormSelect<SaleFormValues> name="currency" options={[]} />
        </Field>
        <Field label={exchangeRateLabel(null, "")}>
          <TextInput readOnly tabIndex={-1} placeholder="Exchange Rate" />
        </Field>
        <Field label="Ref.">
          <RefInput />
        </Field>
      </div>
    </div>
  );
}

function RefInput() {
  const { register } = useFormContext<SaleFormValues>();
  return <TextInput maxLength={100} {...register("ref")} />;
}

export function SaleUiForm({ canAdd, kind, itemTable: Table, emptyRowText, notePlaceholder, noteHint, noteMax }: {
  canAdd: boolean;
  kind: DocumentKind;
  itemTable: ComponentType<ComponentProps<typeof ItemTable>>;
  emptyRowText: string;
  notePlaceholder: string;
  noteHint: string;
  noteMax: number;
}) {
  const form = useForm<SaleFormValues>({ resolver: zodResolver(saleSchema) as unknown as Resolver<SaleFormValues>, defaultValues: emptySale() });
  const { control, reset, getValues, formState } = form;
  const lineArray = useFieldArray({ control, name: "lines", keyName: "_rhfId" });
  const values = useWatch({ control }) as unknown as SaleFormValues;
  const lines = useMemo(() => (values.lines ?? []) as SaleLine[], [values.lines]);
  const totals = useMemo(() => calculateTotals(values as unknown as QuotationFormValues), [values]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [railPanel, setRailPanel] = useState<RailPanel>(null);
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<"reserve" | "stock" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const blockedReason = salePickerBlocked(values);
  const openReserve = () => {
    if (blockedReason) setToast(blockedReason);
    else setOpen("reserve");
  };

  /** Picked rows go into the empty rows first, then after the last row (as the shared form). */
  const addPicked = (picked: SaleLine[], source: string) => {
    const queue = [...picked];
    const merged = getValues("lines").map((line) => (!isFilledLine(line) && queue.length > 0 ? queue.shift()! : line));
    lineArray.replace([...merged, ...queue]);
    setOpen(null);
    setToast(added(source, picked.length));
  };

  const openRow = (index: number) => {
    setSelectedIndex(index);
    // Pick-only (Q-SL-07): an empty row opens From Reserve instead of the row panel.
    if (lines[index] && !isFilledLine(lines[index])) {
      openReserve();
      return;
    }
    setEditorOpen(true);
    setRailPanel(null);
  };

  const removeRow = (index: number) => {
    const remaining = lines.length - 1;
    lineArray.remove(index);
    if (selectedIndex === null) return;
    if (remaining <= 0) {
      setSelectedIndex(null);
      setEditorOpen(false);
    } else if (selectedIndex === index) {
      setSelectedIndex(Math.min(index, remaining - 1));
    } else if (selectedIndex > index) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  const onRowAction = (index: number, action: "edit" | "remove" | "clear" | "duplicate") => {
    if (action === "edit") openRow(index);
    if (action === "remove") removeRow(index);
    if (action === "clear") lineArray.update(index, emptySaleLine());
  };

  const removeChecked = () => {
    lineArray.remove(lines.flatMap((line, index) => (checkedKeys.has(line.key) ? [index] : [])));
    setCheckedKeys(new Set());
    setSelectedIndex(null);
    setEditorOpen(false);
  };

  const onCancel = async () => {
    if (formState.isDirty && !(await confirm(DISCARD_CHANGES_CONFIRM))) return;
    reset(emptySale());
    setEditorOpen(false);
    setSelectedIndex(null);
    setCheckedKeys(new Set());
  };

  const editorIndex = editorOpen && selectedIndex !== null && selectedIndex < lines.length ? selectedIndex : null;
  const noop = () => undefined;
  const sendButton = (
    <span title={NOT_CONNECTED}>
      <Button variant="primary" disabled className="min-w-24">
        <Send className="size-4" /> Send to approve
      </Button>
    </span>
  );

  return (
    <DocumentKindContext.Provider value={kind}>
      <LinePhotoContext.Provider value={NO_PHOTOS}>
      <FormProvider {...form}>
        <div className="relative flex h-full bg-gms-page">
          <div className="min-w-0 flex-1 overflow-y-auto">
            <QuotationHeader
              noLabel="Sale No.:"
              newHref="/sale/sale"
              docNo={SALE_NUMBER_PREVIEW}
              isPreview
              statusNote={{ text: SALE_NOT_CONNECTED_NOTE, tone: "muted" }}
              extraActions={sendButton}
              mode="edit"
              saving={false}
              canSave={false}
              canCreate={canAdd}
              canEdit={false}
              canDelete={false}
              hideEditDelete
              actions={{ onCancel: () => void onCancel(), onSave: noop, onEdit: noop, onDelete: noop, onDuplicate: noop, onRefresh: noop }}
            />

            <fieldset className="mx-6 rounded-gms-md bg-gms-surface">
              <SaleHeaderFields />
            </fieldset>

            <div className="mx-6 mt-4 mb-6 flex gap-4 rounded-gms-md bg-gms-surface px-6 py-6">
              <div className="min-w-0 flex-1">
                <div className="mb-4 flex items-center gap-3">
                  <h2 className="text-lg font-medium text-[#1C252E]">Item</h2>
                  <span className="text-xs text-[#6B7480]">{lines.length} rows</span>
                  <ItemToolButtons
                    readOnly={false}
                    primary={{ label: "From Reserve", title: blockedReason ?? "Pick open lines from this customer's approved reserves", disabled: false, onClick: openReserve }}
                    secondary={{ label: "From Stock", hint: "Pick stones from stock (Memo Stock)", onClick: () => setOpen("stock") }}
                  />
                  {checkedKeys.size > 0 && (
                    <Button size="sm" variant="danger-outline" onClick={removeChecked}>
                      <Trash2 className="size-4" /> Remove {checkedKeys.size} selected
                    </Button>
                  )}
                </div>

                <div className="flex items-start gap-4">
                  <ItemPhotoBox index={selectedIndex} />
                  <fieldset className="min-w-0 flex-1">
                    <Table
                      lines={lines as QuotationLine[]}
                      currency={values.currency ?? ""}
                      totals={totals}
                      selectedIndex={selectedIndex}
                      checkedKeys={checkedKeys}
                      readOnly={false}
                      emptyRowText={emptyRowText}
                      onSelectRow={openRow}
                      onToggleCheck={(key) =>
                        setCheckedKeys((prev) => {
                          const next = new Set(prev);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        })
                      }
                      onToggleAll={(checked) => setCheckedKeys(checked ? new Set(lines.map((line) => line.key)) : new Set())}
                      onRowAction={onRowAction}
                      onAddRow={() => lines.length}
                    />
                  </fieldset>
                </div>

                <fieldset className="mt-6 flex flex-col gap-10 pb-6 lg:flex-row">
                  <DocumentNote placeholder={notePlaceholder} hint={noteHint} max={noteMax} />
                  <div className="w-full shrink-0 lg:w-[440px]">
                    <h2 className="mb-2 text-lg font-medium text-[#1C252E]">Summary Value</h2>
                    <SummaryValue totals={totals} currency={values.currency ?? ""} />
                  </div>
                </fieldset>
              </div>

              {editorIndex === null && <RailButtons active={railPanel} onChange={setRailPanel} />}
              {editorIndex !== null && (
                <ItemEditorDock>
                  <ItemEditorPanel
                    index={editorIndex}
                    total={lines.length}
                    readOnly={false}
                    onPrev={() => setSelectedIndex(Math.max(0, editorIndex - 1))}
                    onNext={() => setSelectedIndex(Math.min(lines.length - 1, editorIndex + 1))}
                    onNextRow={() => setSelectedIndex(Math.min(lines.length - 1, editorIndex + 1))}
                    onRemove={() => removeRow(editorIndex)}
                    onClose={() => setEditorOpen(false)}
                  />
                </ItemEditorDock>
              )}
            </div>
          </div>

          {railPanel && editorIndex === null && (
            <div className="absolute top-4 right-16 bottom-4 z-30 w-[440px]">
              <RailPanelView
                panel={railPanel}
                totals={totals}
                currency={values.currency ?? ""}
                daybook={<p className="p-6 text-sm text-[#6B7480]">{SALE_DAYBOOK_NOT_CONNECTED}</p>}
                onClose={() => setRailPanel(null)}
              />
            </div>
          )}
        </div>
        {open === "reserve" && (
          <ReserveLinePickerDialog
            currency={values.currency ?? ""}
            excluded={pickedReserveLineIds(lines)}
            onCancel={() => setOpen(null)}
            onConfirm={(rows) => addPicked(rows.map(reserveLineToSaleLine), "Reserve")}
          />
        )}
        {open === "stock" && (
          <StockPickerDialog excluded={pickedStockIds(lines)} onCancel={() => setOpen(null)} onConfirm={(rows) => addPicked(rows.map(memoStockToSaleLine), "Stock")} />
        )}
        {dialog}
        {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      </FormProvider>
      </LinePhotoContext.Provider>
    </DocumentKindContext.Provider>
  );
}
