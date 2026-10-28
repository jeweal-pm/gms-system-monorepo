"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ScanLine, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FormProvider, useFieldArray, useForm, useWatch } from "react-hook-form";
import {
  isEditableStatus,
  mapSaveError,
  toQuotationInput,
  useNextNumber,
  useQuotationMutations,
  useQuotationOptions,
  type QuotationAccess,
} from "../api";
import { QuotationOptionsContext } from "../options-context";
import { calculateTotals } from "../lib/calculate";
import { emptyLine, emptyQuotation, newKey } from "../lib/defaults";
import type { StockItem } from "../mock/stock";
import { isFilledLine, quotationSchema, type QuotationFormValues, type QuotationLine } from "../schema";
import { QuotationHeader } from "./header/QuotationHeader";
import { QuotationInfoForm } from "./info/QuotationInfoForm";
import { FromStockModal } from "./items/FromStockModal";
import { ItemEditorPanel } from "./items/ItemEditorPanel";
import { ItemPhotoBox } from "./items/ItemPhotoBox";
import { ItemTable, type RowAction } from "./items/ItemTable";
import { DocumentNote } from "./note/DocumentNote";
import { RailButtons, RailPanelView, type RailPanel } from "./rail/RightRail";
import { SummaryValue } from "./summary/SummaryValue";
import { Button, IconButton, Toast } from "./ui";

function stockToLine({ note, loadedAt, ...fields }: StockItem): QuotationLine {
  void loadedAt; // วันที่ load stock ไม่เก็บลงเอกสาร
  return { ...emptyLine(), ...fields, source: "STOCK", itemNote: note };
}

/**
 * One quotation document (ADR-0025 layout, data from SA quotation rev 1). A saved quotation is remounted
 * with the new server version after every write (QuotationPage keys on id + version).
 */
export function QuotationForm({ initial, access }: { initial?: QuotationFormValues; access: QuotationAccess }) {
  const router = useRouter();
  const [saved, setSaved] = useState<QuotationFormValues | undefined>(initial);
  const [mode, setMode] = useState<"view" | "edit">(initial ? "view" : "edit");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [railPanel, setRailPanel] = useState<RailPanel>(null);
  const [fromStockOpen, setFromStockOpen] = useState(false);
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  const form = useForm<QuotationFormValues>({
    resolver: zodResolver(quotationSchema),
    defaultValues: initial ?? emptyQuotation(),
  });
  const { control, reset, getValues, handleSubmit, formState, setValue, setError } = form;
  const lineArray = useFieldArray({ control, name: "lines", keyName: "_rhfId" });

  const values = useWatch({ control }) as QuotationFormValues;
  const lines = useMemo(() => values.lines ?? [], [values.lines]);
  const totals = useMemo(() => calculateTotals(values), [values]);

  const readOnly = mode === "view";
  const status = values.status ?? "DRAFT";
  const options = useQuotationOptions(saved?.customerId);
  const nextNumber = useNextNumber(values.docDate ?? "", !saved?.docNo);
  // Without a Document Setup row in effect the server numbers plainly 1, 2, 3 … (owner 2026-10-26).
  const docNo = saved?.docNo ?? nextNumber.data?.docNo ?? "—";
  const mutations = useQuotationMutations();
  const busy = mutations.create.isPending || mutations.update.isPending || mutations.remove.isPending;

  // A new quotation starts in the company currency once the options arrive.
  const companyCurrency = options.data?.companyCurrency;
  useEffect(() => {
    if (!saved && companyCurrency && getValues("currency") === "") setValue("currency", companyCurrency);
  }, [saved, companyCurrency, getValues, setValue]);
  const existingStockIds = useMemo(() => new Set(lines.map((l) => l.stockId).filter(Boolean)), [lines]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  /* ---------- document actions ---------- */

  const showError = (error: unknown) => {
    const outcome = mapSaveError(error);
    for (const field of outcome.fieldErrors) setError(field.name, { type: "server", message: field.message });
    setToast(outcome.message);
  };

  /** After a write: reload the saved document (the page remounts with the new version). */
  const afterWrite = async (message: string) => {
    setToast(message);
    await mutations.invalidate();
  };

  const onSave = handleSubmit(
    async (v) => {
      // Empty rows are not sent; the server computes every total.
      const input = toQuotationInput(v);
      try {
        if (saved?.id && saved.version) {
          await mutations.update.mutateAsync({ id: saved.id, expectedVersion: saved.version, ...input });
          await afterWrite(`Saved ${saved.docNo}`);
        } else {
          const result = await mutations.create.mutateAsync(input);
          await mutations.invalidate();
          router.replace(`/pre-sale/quotation/${result.id}`);
        }
      } catch (error) {
        showError(error);
      }
    },
    () => setToast("Please complete the required fields"),
  );



  const onCancel = () => {
    if (formState.isDirty && !window.confirm("Discard unsaved changes?")) return;
    reset(saved ?? emptyQuotation());
    setMode(saved ? "view" : "edit");
    setEditorOpen(false);
    setCheckedKeys(new Set());
  };

  const onDelete = async () => {
    if (!saved?.id || !saved.version || !window.confirm(`Delete ${saved.docNo}?`)) return;
    try {
      await mutations.remove.mutateAsync({ id: saved.id, expectedVersion: saved.version });
      await mutations.invalidate();
      router.push("/pre-sale/quotation");
    } catch (error) {
      showError(error);
    }
  };

  const onDuplicate = () => {
    const current = getValues();
    setSaved(undefined);
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
      lineArray.insert(index + 1, { ...source, key: newKey(), source: "MANUAL", stockId: "", photos: [] });
    }
  };

  const removeChecked = () => {
    const indexes = lines.flatMap((l, i) => (checkedKeys.has(l.key) ? [i] : []));
    lineArray.remove(indexes);
    setCheckedKeys(new Set());
    setSelectedIndex(null);
    setEditorOpen(false);
  };

  const fillFromStock = (items: StockItem[]) => {
    const next = [...getValues("lines")];
    let cursor = 0;
    for (const item of items) {
      while (cursor < next.length && isFilledLine(next[cursor])) cursor++;
      if (cursor < next.length) next[cursor] = stockToLine(item);
      else next.push(stockToLine(item));
    }
    lineArray.replace(next);
    setFromStockOpen(false);
    setToast(`Added ${items.length} item${items.length > 1 ? "s" : ""} from stock`);
  };

  const editorIndex = editorOpen && selectedIndex !== null && selectedIndex < lines.length ? selectedIndex : null;

  return (
    <QuotationOptionsContext.Provider value={options.data}>
    <FormProvider {...form}>
      {/* AppShell <main> เป็นตัว scroll: ฝั่งซ้าย scroll เอง, editor panel สูงเต็มจอไม่ถูกตัด */}
      <div className="relative flex h-full bg-white">
        <div className="min-w-0 flex-1 overflow-y-auto">
          <QuotationHeader
            docNo={docNo}
            isPreview={!saved?.docNo}
            status={saved ? status : undefined}
            statusReason={saved?.statusReason}
            mode={mode}
            saving={busy}
            canSave={saved ? access.edit : access.add}
            canCreate={access.add}
            canEdit={Boolean(saved) && access.edit && isEditableStatus(status)}
            canDelete={Boolean(saved) && access.delete && isEditableStatus(status)}
            actions={{
              onCancel,
              onSave: () => void onSave(),
              onEdit: () => setMode("edit"),
              onDelete: () => void onDelete(),
              onDuplicate,
              onRefresh: () => void mutations.invalidate().then(() => setToast("Refreshed")),
            }}
          />

          <fieldset disabled={readOnly}>
            <QuotationInfoForm />
          </fieldset>

          <hr className="border-[#E3E6EA]" />

          <div className="flex gap-4 px-6 py-6">
            <div className="min-w-0 flex-1">
              <div className="mb-4 flex items-center gap-3">
                <h2 className="text-lg font-medium text-[#1C252E]">Item</h2>
                <span className="text-xs text-[#6B7480]">{lines.length} rows</span>
                {/* SA-QT-13: no stock data until the inventory service exists. */}
                <span title="Stock isn't available yet">
                  <Button variant="dark" size="sm" disabled onClick={() => setFromStockOpen(true)}>
                    From Stock
                  </Button>
                </span>
                {/* TODO: scan barcode เพื่อเพิ่มรายการ */}
                <IconButton label="Scan to add" disabled={readOnly} className="bg-[#F6F7F8]">
                  <ScanLine className="size-4" />
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
        <FromStockModal
          currency={values.currency ?? ""}
          existingStockIds={existingStockIds}
          onCancel={() => setFromStockOpen(false)}
          onConfirm={fillFromStock}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </FormProvider>
    </QuotationOptionsContext.Provider>
  );
}
