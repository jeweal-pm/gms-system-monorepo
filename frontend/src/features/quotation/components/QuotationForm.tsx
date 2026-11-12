"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { DISCARD_CHANGES_CONFIRM, deleteDocumentConfirm, restoreDocumentConfirm, useConfirm } from "./use-confirm";
import { clearNotice, DocumentDeletedBanner, handOverNotice, peekNotice, type DeletedInfo } from "@/features/trade-document/document-api";
import { useDocumentFlow } from "@/features/trade-document/approval-flow";
import { savedMessage, type DocFlow } from "@/features/trade-document/flow-status";
import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTabDirty, useTabDocument, useTabReplace } from "@/features/home/tabs/tab-host";
import { FormProvider, useFieldArray, useForm, useWatch } from "react-hook-form";
import { ScanIcon } from "@/components/ui/scan-icon";
import {
  mapSaveError,
  quotationRestoreError,
  toQuotationInput,
  useNextNumber,
  useQuotationMutations,
  useQuotationOptions,
  type QuotationAccess,
} from "../api";
import { QuotationOptionsContext } from "../options-context";
import { calculateTotals } from "../lib/calculate";
import { memoStockToStockLine, pickedStockIds } from "@/features/trade-document/customer-stock";
import { invalidSaveMessage, lineErrorMessages } from "@/features/trade-document/document-form";
import { MemoStockModal } from "@/features/trade-document/memo-stock-modal";
import type { MemoStockItem } from "@/features/trade-document/memo-stock-api";
import { emptyLine, emptyQuotation, newKey } from "../lib/defaults";
import { isFilledLine, quotationSchema, type QuotationFormValues } from "../schema";
import { QuotationHeader } from "./header/QuotationHeader";
import { QuotationInfoForm } from "./info/QuotationInfoForm";
import { ItemEditorPanel } from "./items/ItemEditorPanel";
import { ItemPhotoBox } from "./items/ItemPhotoBox";
import { ItemTable, type RowAction } from "./items/ItemTable";
import { DocumentNote } from "./note/DocumentNote";
import { RailButtons, RailPanelView, type RailPanel } from "./rail/RightRail";
import { SummaryValue } from "./summary/SummaryValue";
import { Button, IconButton, Toast } from "./ui";

/**
 * One quotation document (ADR-0025 layout, data from SA quotation rev 1). A saved quotation is remounted
 * with the new server version after every write (QuotationPage keys on id + version).
 */
export function QuotationForm({ initial, deleted: initialDeleted = null, flow = null, access }: { initial?: QuotationFormValues; deleted?: DeletedInfo | null; flow?: DocFlow | null; access: QuotationAccess }) {
  const replaceTab = useTabReplace();
  const [saved, setSaved] = useState<QuotationFormValues | undefined>(initial);
  const [mode, setMode] = useState<"view" | "edit">(initial ? "view" : "edit");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [railPanel, setRailPanel] = useState<RailPanel>(null);
  const [fromStockOpen, setFromStockOpen] = useState(false);
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  // A message handed over from the copy before this version (deleted elsewhere, restored).
  const [toast, setToast] = useState<string | null>(() => peekNotice(initial?.id));
  // transaction-soft-delete D10: a deleted quotation is read-only with the banner.
  const [deleted, setDeleted] = useState<DeletedInfo | null>(initialDeleted);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const form = useForm<QuotationFormValues>({
    resolver: zodResolver(quotationSchema),
    defaultValues: initial ?? emptyQuotation(),
  });
  const { control, reset, resetField, getValues, handleSubmit, formState, setError } = form;
  const lineArray = useFieldArray({ control, name: "lines", keyName: "_rhfId" });
  // app-shell-tabs T-03 / Q-TAB-03: the tab shows the document number and a dot while edits are unsaved.
  useTabDocument(saved?.docNo);
  useTabDirty(formState.isDirty && mode === "edit");

  const values = useWatch({ control }) as QuotationFormValues;
  const lines = useMemo(() => values.lines ?? [], [values.lines]);
  const totals = useMemo(() => calculateTotals(values), [values]);

  const isDeleted = Boolean(deleted && saved?.id);
  const readOnly = mode === "view" || isDeleted;
  const status = values.status ?? "DRAFT";
  const options = useQuotationOptions(saved?.customerId);
  const nextNumber = useNextNumber(values.docDate ?? "", !saved?.docNo);
  // Without a Document Setup row in effect the server numbers plainly 1, 2, 3 … (owner 2026-10-26).
  const docNo = saved?.docNo ?? nextNumber.data?.docNo ?? "—";
  const mutations = useQuotationMutations();
  const busy = mutations.create.isPending || mutations.update.isPending || mutations.remove.isPending || mutations.restore.isPending || mutations.submit.isPending;

  // A new quotation starts in the company currency once the options arrive.
  const companyCurrency = options.data?.companyCurrency;
  useEffect(() => {
    // INV-20261107-008: a value the page fills in by itself becomes the field's default too, so an untouched document isn't "unsaved".
    if (!saved && companyCurrency && getValues("currency") === "") resetField("currency", { defaultValue: companyCurrency });
  }, [saved, companyCurrency, getValues, resetField]);

  useEffect(() => clearNotice(initial?.id), [initial?.id]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  /* ---------- document actions ---------- */

  function showError(error: unknown) {
    const outcome = mapSaveError(error);
    for (const field of outcome.fieldErrors) setError(field.name, { type: "server", message: field.message });
    setToast(outcome.message);
    // FE-SD-003: deleted in another tab; reload it (the page remounts read-only with the banner) and keep the message.
    if (outcome.deleted && saved?.id) {
      handOverNotice(saved.id, outcome.message);
      setMode("view");
      void mutations.invalidate();
    }
  }

  /** After a write: reload the saved document (the page remounts with the new version and keeps the message). */
  const afterWrite = async (message: string) => {
    setToast(message);
    if (saved?.id) handOverNotice(saved.id, message);
    setMode("view");
    await mutations.invalidate();
  };

  // FE-AS-010 (ADR-0048): Save / Send to approve / Edit / Delete follow the Quotation approval setting and `Flow`.
  const approvalFlow = useDocumentFlow({
    type: "quotation",
    saved,
    flow,
    deleted: isDeleted,
    access,
    editing: !readOnly,
    dirty: formState.isDirty,
    busy,
    submit: (args) => mutations.submit.mutateAsync(args),
    confirm,
    toast: setToast,
    reload: afterWrite,
    onError: (error) => showError(error),
  });

  const onWriteError = async (error: unknown, action: "save" | "delete") => {
    if (!(await approvalFlow.handleError(error, action))) showError(error);
  };

  const onSave = handleSubmit(
    async (v) => {
      // Empty rows are not sent; the server computes every total.
      const input = toQuotationInput(v);
      try {
        if (saved?.id && saved.version) {
          const result = await mutations.update.mutateAsync({ id: saved.id, expectedVersion: saved.version, ...input });
          await afterWrite(savedMessage(saved.docNo, result));
        } else {
          const result = await mutations.create.mutateAsync(input);
          handOverNotice(result.id, savedMessage(result.docNo, result));
          await mutations.invalidate();
          replaceTab(`/pre-sale/quotation/${result.id}`);
        }
      } catch (error) {
        await onWriteError(error, "save");
      }
    },
    (errors) => {
      // Name the first bad row and open it, as the other document pages do (INV-20261102-003).
      const rowMessages = lineErrorMessages(errors.lines as Parameters<typeof lineErrorMessages>[0], getValues("lines").length);
      const first = rowMessages.findIndex(Boolean);
      if (first >= 0) {
        setSelectedIndex(first);
        setEditorOpen(true);
      }
      setToast(invalidSaveMessage(rowMessages));
    },
  );



  const onCancel = async () => {
    if (formState.isDirty && !(await confirm(DISCARD_CHANGES_CONFIRM))) return;
    reset(saved ?? emptyQuotation());
    setMode(saved ? "view" : "edit");
    setEditorOpen(false);
    setCheckedKeys(new Set());
  };

  const onDelete = async () => {
    if (!saved?.id || !saved.version || !(await confirm(deleteDocumentConfirm(saved.docNo)))) return;
    try {
      await mutations.remove.mutateAsync({ id: saved.id, expectedVersion: saved.version });
      await mutations.invalidate();
      replaceTab("/pre-sale/quotation");
    } catch (error) {
      await onWriteError(error, "delete");
    }
  };

  /** FE-SD-002: a deleted quotation back to its status (Draft / Pending Approval); the page remounts editable. */
  const onRestore = async () => {
    if (!saved?.id || !saved.version || !(await confirm(restoreDocumentConfirm(saved.docNo, approvalFlow.restoreLabel)))) return;
    try {
      await mutations.restore.mutateAsync({ id: saved.id, expectedVersion: saved.version });
      handOverNotice(saved.id, `Restored ${saved.docNo ?? ""}`.trim());
      await mutations.invalidate();
    } catch (error) {
      const outcome = quotationRestoreError(error);
      setToast(outcome.message);
      if (outcome.refetch) {
        handOverNotice(saved.id, outcome.message);
        await mutations.invalidate();
      }
    }
  };

  const onDuplicate = () => {
    const current = getValues();
    setSaved(undefined);
    setDeleted(null);
    reset({
      ...emptyQuotation(),
      ...current,
      id: undefined,
      docNo: undefined,
      version: undefined,
      statusReason: undefined,
      status: "DRAFT",
      lines: current.lines.map((l) => ({ ...l, key: newKey() })),
    });
    setMode("edit");
    setToast("Duplicated as a new quotation");
  };

  /* ---------- line actions ---------- */

  const openRow = (index: number) => {
    setSelectedIndex(index);
    setEditorOpen(true);
    setRailPanel(null);
  };

  const addRow = () => {
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
    if (action === "duplicate") {
      const source = getValues(`lines.${index}`);
      // ห้าม stock ซ้ำ → สำเนาเป็น manual line ไม่มี stockId
      lineArray.insert(index + 1, { ...source, key: newKey(), source: "MANUAL", stockId: "", memoStockId: undefined, stockPendingPcs: undefined, stockPendingWeightCt: undefined, photos: [] });
    }
  };

  const removeChecked = () => {
    const indexes = lines.flatMap((l, i) => (checkedKeys.has(l.key) ? [i] : []));
    lineArray.remove(indexes);
    setCheckedKeys(new Set());
    setSelectedIndex(null);
    setEditorOpen(false);
  };

  /** quotation rev 2 (ADR-0038): picked Memo Stock items fill the empty rows first, then are appended; nothing is held. */
  const fillFromStock = (items: MemoStockItem[]) => {
    const next = [...getValues("lines")];
    let cursor = 0;
    for (const item of items) {
      while (cursor < next.length && isFilledLine(next[cursor])) cursor++;
      if (cursor < next.length) next[cursor] = memoStockToStockLine(item);
      else next.push(memoStockToStockLine(item));
    }
    lineArray.replace(next);
    setFromStockOpen(false);
    setToast(`Added ${items.length} item${items.length === 1 ? "" : "s"} from Stock`);
  };

  const editorIndex = editorOpen && selectedIndex !== null && selectedIndex < lines.length ? selectedIndex : null;

  return (
    <QuotationOptionsContext.Provider value={options.data}>
    <FormProvider {...form}>
      {/* AppShell <main> เป็นตัว scroll: ฝั่งซ้าย scroll เอง, editor panel สูงเต็มจอไม่ถูกตัด */}
      <div className="relative flex h-full bg-gms-page">
        <div className="min-w-0 flex-1 overflow-y-auto">
          {isDeleted && deleted && <DocumentDeletedBanner info={deleted} canRestore={access.delete} busy={busy} onRestore={() => void onRestore()} />}
          <QuotationHeader
            docNo={docNo}
            isPreview={!saved?.docNo}
            status={saved ? ((flow?.status as typeof status | undefined) ?? status) : undefined}
            statusLabels={approvalFlow.statusLabels}
            statusNote={approvalFlow.statusNote}
            statusReason={saved?.statusReason}
            mode={isDeleted ? "view" : mode}
            saving={busy}
            canSave={!isDeleted && (saved ? access.edit : access.add)}
            canCreate={access.add}
            canEdit={approvalFlow.canEdit}
            canDelete={approvalFlow.canDelete}
            hideEditDelete={approvalFlow.hideEditDelete}
            extraActions={approvalFlow.sendButton}
            actions={{
              onCancel: () => void onCancel(),
              onSave: () => void onSave(),
              onEdit: () => setMode("edit"),
              onDelete: () => void onDelete(),
              onDuplicate,
              onRefresh: () => void mutations.invalidate().then(() => setToast("Refreshed")),
            }}
          />

          <fieldset disabled={readOnly} className="mx-6 rounded-gms-md bg-gms-surface">
            <QuotationInfoForm />
          </fieldset>


          <div className="mx-6 rounded-gms-md bg-gms-surface mt-4 mb-6 flex gap-4 px-6 py-6">
            <div className="min-w-0 flex-1">
              <div className="mb-4 flex items-center gap-3">
                <h2 className="text-lg font-medium text-[#1C252E]">Item</h2>
                <span className="text-xs text-[#6B7480]">{lines.length} rows</span>
                {/* quotation rev 2 (ADR-0038): Memo Stock now, our own stock later; it only copies the item's details. */}
                <span title="Pick stones from stock (Memo Stock)">
                  <Button variant="dark" size="sm" disabled={readOnly} onClick={() => setFromStockOpen(true)}>
                    From Stock
                  </Button>
                </span>
                {/* TODO: scan barcode เพื่อเพิ่มรายการ */}
                <IconButton label="Scan to add" disabled={readOnly} className="bg-[#F6F7F8]">
                  <ScanIcon />
                </IconButton>
                {checkedKeys.size > 0 && !readOnly && (
                  <Button size="sm" variant="danger-outline" onClick={removeChecked}>
                    <Trash2 className="size-4" /> Remove {checkedKeys.size} selected
                  </Button>
                )}
                {formState.errors.lines?.message && (
                  <span className="text-sm text-[#E5484D]">{formState.errors.lines.message}</span>
                )}
              </div>

              <div className="flex items-start gap-4">
                {/* อยู่นอก fieldset เพื่อให้เลื่อนดูรูปได้ใน view mode */}
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
                      const next = new Set(prev);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    })
                  }
                  onToggleAll={(checked) => setCheckedKeys(checked ? new Set(lines.map((l) => l.key)) : new Set())}
                  onRowAction={onRowAction}
                  onAddRow={addRow}
                />
                </fieldset>
              </div>

              {/* Same column as the table, so Summary Value ends exactly where the table ends (owner 2026-10-23),
                  with or without the right rail. */}
              <fieldset disabled={readOnly} className="mt-6 flex flex-col gap-10 pb-6 lg:flex-row">
                <DocumentNote />
                <div className="w-full shrink-0 lg:w-[440px]">
                  <h2 className="mb-2 text-lg font-medium text-[#1C252E]">Summary Value</h2>
                  <SummaryValue totals={totals} currency={values.currency ?? ""} />
                </div>
              </fieldset>
            </div>

            {editorIndex === null && <RailButtons active={railPanel} onChange={setRailPanel} />}
          </div>

        </div>

        {editorIndex !== null && (
          <div className="h-full">
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
          </div>
        )}

        {railPanel && editorIndex === null && (
          <fieldset disabled={readOnly && railPanel === "summary"} className="absolute top-4 right-16 bottom-4 z-30 w-[440px]">
            <RailPanelView panel={railPanel} totals={totals} currency={values.currency ?? ""} onClose={() => setRailPanel(null)} />
          </fieldset>
        )}
      </div>

      {fromStockOpen && (
        <MemoStockModal
          title="Add From Stock"
          showPrice={false}
          emptyText="No stock with anything pending."
          pickedIds={pickedStockIds(lines)}
          onCancel={() => setFromStockOpen(false)}
          onConfirm={fillFromStock}
        />
      )}
      {confirmDialog}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </FormProvider>
    </QuotationOptionsContext.Provider>
  );
}
