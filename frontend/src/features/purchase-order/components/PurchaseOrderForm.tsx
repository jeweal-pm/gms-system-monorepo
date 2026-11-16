"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useDocumentFlow } from "@/features/trade-document/approval-flow";
import { flowOf, savedMessage, type DocFlow } from "@/features/trade-document/flow-status";
import { deleteDocumentConfirm, restoreDocumentConfirm, useConfirm } from "@/features/quotation/components/use-confirm";
import {
  daybookLoadError,
  daybookState,
  deletedInfo,
  DocumentDaybook,
  DocumentDeletedBanner,
  clearNotice,
  handOverNotice,
  peekNotice,
  type DeletedInfo,
} from "@/features/trade-document/document-api";
import { useTabDirty, useTabDocument, useTabReplace } from "@/features/home/tabs/tab-host";
import { FormProvider, useFieldArray, useForm, useWatch } from "react-hook-form";
import { QuotationHeader } from "@/features/quotation/components/header/QuotationHeader";
import { ItemEditorDock, ItemEditorPanel } from "@/features/quotation/components/items/ItemEditorPanel";
import { ItemPhotoBox } from "@/features/quotation/components/items/ItemPhotoBox";
import { ItemTable, type RowAction } from "@/features/quotation/components/items/ItemTable";
import { DocumentNote } from "@/features/quotation/components/note/DocumentNote";
import { RailButtons, RailPanelView, type RailPanel } from "@/features/quotation/components/rail/RightRail";
import { SummaryValue } from "@/features/quotation/components/summary/SummaryValue";
import { Button, Toast } from "@/features/quotation/components/ui";
import { DocumentKindContext } from "@/features/quotation/document-kind";
import { calculateTotals } from "@/features/quotation/lib/calculate";
import { emptyLine, newKey } from "@/features/quotation/lib/defaults";
import { LinePhotoContext, type LinePhotoTarget } from "@/features/quotation/options-context";
import { isFilledLine } from "@/features/quotation/schema";
import { invalidSaveMessage, lineErrorMessages, type LineErrors } from "@/features/trade-document/document-form";
import { VendorDocumentInfoForm } from "@/features/trade-document/vendor-info-form";
import {
  fromPurchaseOrder,
  mapPurchaseOrderError,
  purchaseOrderLoadError,
  purchaseOrderRestoreError,
  purchaseOrderPhotoUrl,
  stoneChoices,
  toPurchaseOrderInput,
  uploadPurchaseOrderPhoto,
  useNextPurchaseOrderNo,
  usePurchaseOrderDaybook,
  usePurchaseOrderOptions,
  usePurchaseOrderWrites,
  type PurchaseOrderAccess,
  type PurchaseOrderDetail,
} from "../api";
import { emptyPurchaseOrder, PURCHASE_ORDER_KIND } from "../defaults";
import { MAX_PURCHASE_ORDER_LINES, purchaseOrderSchema, type PurchaseOrderFormValues } from "../schema";

export const PURCHASE_ORDER_HREF = "/purchase/purchase-order";
const APPROVAL_TYPE = "purchase-order";
export const purchaseOrderHref = (id: string) => `${PURCHASE_ORDER_HREF}/${encodeURIComponent(id)}`;

/** ADR-0050 status badges (Draft, Pending Approval, Revise, Approved, Rejected). */
export { FLOW_STATUS_LABELS as STATUS_LABELS } from "@/features/trade-document/flow-status";

/** Row photos (Q-PO-09): the row panel uploads to and reads from the Purchase Order photo route. */
export const PURCHASE_ORDER_PHOTOS: LinePhotoTarget = { upload: uploadPurchaseOrderPhoto, url: purchaseOrderPhotoUrl };


/** One Purchase Order (ADR-0041): Quotation's layout and components, a vendor header, keyed-in rows and Approve. */
export function PurchaseOrderForm({ initial, deleted: initialDeleted = null, flow: initialFlow = null, access }: { initial?: PurchaseOrderFormValues; deleted?: DeletedInfo | null; flow?: DocFlow | null; access: PurchaseOrderAccess }) {
  const replaceTab = useTabReplace();
  const [saved, setSaved] = useState<PurchaseOrderFormValues | undefined>(initial);
  // transaction-soft-delete D10: a deleted purchase order is read-only with the banner.
  const [deleted, setDeleted] = useState<DeletedInfo | null>(initialDeleted);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [mode, setMode] = useState<"view" | "edit">(initial ? "view" : "edit");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [railPanel, setRailPanel] = useState<RailPanel>(null);
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  // A message handed over from a create (the new document opens on its own page).
  const [toast, setToast] = useState<string | null>(() => peekNotice(initial?.id));
  // FE-AS-010: the saved document's `Flow` (status, Edit / Delete / Send to approve flags), refreshed on every reload.
  const [flow, setFlow] = useState<DocFlow | null>(initialFlow);

  const form = useForm<PurchaseOrderFormValues>({ resolver: zodResolver(purchaseOrderSchema), defaultValues: initial ?? emptyPurchaseOrder() });
  const { control, reset, trigger, resetField, getValues, handleSubmit, formState, setError } = form;
  const lineArray = useFieldArray({ control, name: "lines", keyName: "_rhfId" });
  const values = useWatch({ control }) as PurchaseOrderFormValues;
  const lines = useMemo(() => values.lines ?? [], [values.lines]);
  const totals = useMemo(() => calculateTotals(values), [values]);

  const isDeleted = Boolean(deleted && saved?.id);
  const readOnly = mode === "view" || isDeleted;
  // INV-20261107-005: after a failed Save, "Add at least one item" is checked again as soon as a row is filled.
  const filledCount = lines.filter(isFilledLine).length;
  useEffect(() => {
    if (formState.isSubmitted && filledCount > 0) void trigger("lines");
  }, [filledCount, formState.isSubmitted, trigger]);
  const status = (flow?.status ?? saved?.status) as PurchaseOrderFormValues["status"];
  const options = usePurchaseOrderOptions(saved?.vendorId);
  const next = useNextPurchaseOrderNo(values.docDate ?? "", !saved?.id);
  const writes = usePurchaseOrderWrites();
  const docNo = saved?.docNo ?? next.data?.docNo ?? "—";
  const kind = useMemo(() => ({ ...PURCHASE_ORDER_KIND, stone: stoneChoices(options.data) }), [options.data]);
  useTabDocument(saved?.docNo);
  useTabDirty(formState.isDirty && !readOnly);

  // A new PO starts in the company currency (the shared header then fills its rate). INV-20261107-008: a value the page fills in by itself becomes the field's default too, so an untouched document isn't "unsaved".
  const companyCurrency = options.data?.companyCurrency ?? null;
  useEffect(() => {
    if (!values.currency && companyCurrency) resetField("currency", { defaultValue: companyCurrency });
  }, [values.currency, companyCurrency, resetField]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  /** Shows the server's latest copy, read-only. */
  const show = (detail: PurchaseOrderDetail) => {
    const latest = fromPurchaseOrder(detail);
    setSaved(latest);
    setDeleted(deletedInfo(detail));
    setFlow(flowOf(detail));
    reset(latest);
    setMode("view");
    setEditorOpen(false);
    setCheckedKeys(new Set());
  };

  const reloadSaved = async () => {
    if (!saved?.id) return;
    try {
      show(await writes.reload(saved.id));
    } catch (error) {
      setToast(purchaseOrderLoadError(error));
    }
  };

  useEffect(() => clearNotice(initial?.id), [initial?.id]);

  async function showError(error: unknown) {
    const outcome = mapPurchaseOrderError(error);
    for (const field of outcome.fieldErrors) setError(field.name as never, { type: "server", message: field.message });
    setToast(outcome.message);
    if (outcome.gone) {
      await writes.invalidate();
      replaceTab(PURCHASE_ORDER_HREF);
    } else if (outcome.reload) {
      await reloadSaved();
      setToast(outcome.message);
    }
  }

  // FE-AS-010 (ADR-0050): Save / Send to approve / Edit / Delete follow the approval setting and `Flow`.
  const approvalFlow = useDocumentFlow({
    type: APPROVAL_TYPE,
    saved,
    flow,
    deleted: isDeleted,
    access,
    editing: !readOnly,
    dirty: formState.isDirty,
    busy: writes.busy,
    submit: writes.submit,
    confirm,
    toast: setToast,
    reload: async (message) => {
      await reloadSaved();
      setToast(message);
    },
    onError: (error) => void showError(error),
  });

  /** ADR-0050 codes first (in use, status, approval off), then the page's own mapping. */
  const onWriteError = async (error: unknown, action: "save" | "delete") => {
    if (!(await approvalFlow.handleError(error, action))) await showError(error);
  };

  /* ---------- document actions ---------- */

  const onSave = handleSubmit(
    async (input) => {
      try {
        if (saved?.id && saved.version) {
          const result = await writes.update({ ...toPurchaseOrderInput(input), id: saved.id, expectedVersion: saved.version });
          show(await writes.reload(saved.id));
          setToast(savedMessage(saved.docNo, result));
        } else {
          const created = await writes.create(toPurchaseOrderInput(input));
          handOverNotice(created.id, savedMessage(created.docNo, created));
          await writes.invalidate();
          replaceTab(purchaseOrderHref(created.id));
        }
      } catch (error) {
        await onWriteError(error, "save");
      }
    },
    (errors) => setToast(invalidSaveMessage(lineErrorMessages(errors.lines as unknown as LineErrors, lines.length))),
  );

  const onCancel = () => {
    if (formState.isDirty && !window.confirm("Discard unsaved changes?")) return;
    reset(saved ?? emptyPurchaseOrder());
    setMode(saved ? "view" : "edit");
    setEditorOpen(false);
    setCheckedKeys(new Set());
  };

  const onDelete = async () => {
    // The shared confirm modal and text (deleteDocumentConfirm), as on the other documents.
    if (!saved?.id || !saved.version || !(await confirm(deleteDocumentConfirm(saved.docNo)))) return;
    try {
      await writes.remove({ id: saved.id, expectedVersion: saved.version });
      await writes.invalidate();
      replaceTab(PURCHASE_ORDER_HREF);
    } catch (error) {
      await onWriteError(error, "delete");
    }
  };

  /** FE-SD-002: a deleted purchase order back to its status; the reloaded copy is editable again. */
  const onRestore = async () => {
    if (!saved?.id || !saved.version || !(await confirm(restoreDocumentConfirm(saved.docNo, approvalFlow.restoreLabel)))) return;
    try {
      await writes.restore({ id: saved.id, expectedVersion: saved.version });
      show(await writes.reload(saved.id));
      setToast(`Restored ${saved.docNo ?? ""}`.trim());
    } catch (error) {
      const outcome = purchaseOrderRestoreError(error);
      if (outcome.refetch) await reloadSaved();
      setToast(outcome.message);
    }
  };

  const onRefresh = async () => {
    if (!readOnly && formState.isDirty && !window.confirm("Discard unsaved changes?")) return;
    await reloadSaved();
    setToast("Refreshed");
  };

  // A copy is a new pending PO; its rows keep their photos, as a Quotation copy does.
  const onDuplicate = () => {
    const current = getValues();
    setSaved(undefined);
    setDeleted(null);
    reset({ ...current, id: undefined, docNo: undefined, status: undefined, version: undefined, lines: current.lines.map((l) => ({ ...l, key: newKey() })) });
    setMode("edit");
    setToast("Duplicated as a new purchase order");
  };

  /* ---------- line actions ---------- */

  const openRow = (index: number) => {
    setSelectedIndex(index);
    setEditorOpen(true);
    setRailPanel(null);
  };

  const addRow = () => {
    if (lines.length >= MAX_PURCHASE_ORDER_LINES) {
      setToast(`Up to ${MAX_PURCHASE_ORDER_LINES} rows`);
      return lines.length - 1;
    }
    lineArray.append(emptyLine());
    return lineArray.fields.length;
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

  const onRowAction = (index: number, action: RowAction) => {
    if (action === "edit") openRow(index);
    if (action === "remove") removeRow(index);
    if (action === "clear") lineArray.update(index, emptyLine());
    if (action === "duplicate" && lines.length < MAX_PURCHASE_ORDER_LINES) {
      lineArray.insert(index + 1, { ...getValues(`lines.${index}`), key: newKey(), photos: [] });
    }
  };

  const removeChecked = () => {
    lineArray.remove(lines.flatMap((l, i) => (checkedKeys.has(l.key) ? [i] : [])));
    setCheckedKeys(new Set());
    setSelectedIndex(null);
    setEditorOpen(false);
  };

  const editorIndex = editorOpen && selectedIndex !== null && selectedIndex < lines.length ? selectedIndex : null;

  return (
    <DocumentKindContext.Provider value={kind}>
      <LinePhotoContext.Provider value={PURCHASE_ORDER_PHOTOS}>
        <FormProvider {...form}>
          <div className="relative flex h-full bg-gms-page">
            <div className="min-w-0 flex-1 overflow-y-auto">
              {isDeleted && deleted && <DocumentDeletedBanner info={deleted} canRestore={access.delete} busy={writes.busy} onRestore={() => void onRestore()} />}
              <QuotationHeader
                noLabel="Purchase Order No.:"
                newHref={PURCHASE_ORDER_HREF}
                statusLabels={approvalFlow.statusLabels}
                statusNote={approvalFlow.statusNote}
                docNo={docNo}
                isPreview={!saved?.docNo}
                status={status}
                mode={isDeleted ? "view" : mode}
                saving={writes.busy}
                canSave={!isDeleted && (saved?.id ? access.edit : access.add)}
                canCreate={access.add}
                canEdit={approvalFlow.canEdit}
                canDelete={approvalFlow.canDelete}
                hideEditDelete={approvalFlow.hideEditDelete}
                extraActions={approvalFlow.sendButton}
                actions={{
                  onCancel,
                  onSave: () => void onSave(),
                  onEdit: () => setMode("edit"),
                  onDelete: () => void onDelete(),
                  onDuplicate,
                  onRefresh: () => void onRefresh(),
                }}
              />

              <fieldset disabled={readOnly} className="mx-6 rounded-gms-md bg-gms-surface">
                <VendorDocumentInfoForm options={options.data} />
                {options.error && <p role="alert" className="-mt-3 px-10 pb-4 text-xs text-[#E5484D]">{purchaseOrderLoadError(options.error, "vendors")}</p>}
              </fieldset>


              <div className="mx-6 rounded-gms-md bg-gms-surface mt-4 mb-6 flex gap-4 px-6 py-6">
                <div className="min-w-0 flex-1">
                  <div className="mb-4 flex flex-wrap items-center gap-3">
                    <h2 className="text-lg font-medium text-[#1C252E]">Item</h2>
                    <span className="text-xs text-[#6B7480]">{lines.length} rows</span>
                    {checkedKeys.size > 0 && !readOnly && (
                      <Button size="sm" variant="danger-outline" onClick={removeChecked}>
                        <Trash2 className="size-4" /> Remove {checkedKeys.size} selected
                      </Button>
                    )}
                    {formState.errors.lines?.message && <span className="text-sm text-[#E5484D]">{formState.errors.lines.message}</span>}
                  </div>

                  <div className="flex items-start gap-4">
                    <ItemPhotoBox index={selectedIndex} />
                    <fieldset disabled={readOnly} className="min-w-0 flex-1">
                      <ItemTable
                        lines={lines}
                        currency={values.currency ?? ""}
                        totals={totals}
                        selectedIndex={selectedIndex}
                        checkedKeys={checkedKeys}
                        readOnly={readOnly}
                        onSelectRow={openRow}
                        onToggleCheck={(key) =>
                          setCheckedKeys((prev) => {
                            const nextKeys = new Set(prev);
                            if (nextKeys.has(key)) nextKeys.delete(key);
                            else nextKeys.add(key);
                            return nextKeys;
                          })
                        }
                        onToggleAll={(checked) => setCheckedKeys(checked ? new Set(lines.map((l) => l.key)) : new Set())}
                        onRowAction={onRowAction}
                        onAddRow={addRow}
                        rowErrors={formState.isSubmitted ? lineErrorMessages(formState.errors.lines as unknown as LineErrors, lines.length) : undefined}
                      />
                    </fieldset>
                  </div>

                  <fieldset disabled={readOnly} className="mt-6 flex flex-col gap-10 pb-6 lg:flex-row">
                    <DocumentNote />
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
                      readOnly={readOnly}
                      onPrev={() => setSelectedIndex(Math.max(0, editorIndex - 1))}
                      onNext={() => setSelectedIndex(Math.min(lines.length - 1, editorIndex + 1))}
                      onNextRow={() => setSelectedIndex(editorIndex < lines.length - 1 ? editorIndex + 1 : addRow())}
                      onRemove={() => removeRow(editorIndex)}
                      onClose={() => setEditorOpen(false)}
                    />
                  </ItemEditorDock>
                )}
              </div>
            </div>

            {railPanel && editorIndex === null && (
              <fieldset disabled={readOnly && railPanel === "summary"} className="absolute top-4 right-16 bottom-4 z-30 w-[440px]">
                <RailPanelView panel={railPanel} totals={totals} currency={values.currency ?? ""} onClose={() => setRailPanel(null)} daybook={<PurchaseOrderDaybook />} />
              </fieldset>
            )}
          </div>
          {confirmDialog}
          {toast && <Toast message={toast} onClose={() => setToast(null)} />}
        </FormProvider>
      </LinePhotoContext.Provider>
    </DocumentKindContext.Provider>
  );
}


/** Saved purchase orders, newest first; orange = Pending Approval, green = Approved (Q-PO-10); grey = Deleted (FE-SD-001). */
function PurchaseOrderDaybook() {
  const list = usePurchaseOrderDaybook();
  return (
    <DocumentDaybook
      plural="purchase orders"
      href={purchaseOrderHref}
      emptyText="No results found."
      state={daybookState(list, (error) => daybookLoadError(error, "purchase orders"), (item) => String(item.vendorName ?? ""))}
    />
  );
}
