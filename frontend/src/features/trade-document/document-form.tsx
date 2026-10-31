"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { FormProvider, useFieldArray, useForm, useWatch, type DefaultValues, type FieldValues, type Path, type Resolver } from "react-hook-form";
import type { z } from "zod";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ScanIcon } from "@/components/ui/scan-icon";
import { QuotationHeader, type StatusLabels } from "@/features/quotation/components/header/QuotationHeader";
import { ItemEditorPanel } from "@/features/quotation/components/items/ItemEditorPanel";
import { ItemPhotoBox } from "@/features/quotation/components/items/ItemPhotoBox";
import { ItemTable, type RowAction } from "@/features/quotation/components/items/ItemTable";
import { DocumentNote } from "@/features/quotation/components/note/DocumentNote";
import { RailButtons, RailPanelView, type RailPanel } from "@/features/quotation/components/rail/RightRail";
import { SummaryValue } from "@/features/quotation/components/summary/SummaryValue";
import { Button, IconButton, Toast } from "@/features/quotation/components/ui";
import { calculateTotals } from "@/features/quotation/lib/calculate";
import { emptyLine, newKey } from "@/features/quotation/lib/defaults";
import { DocumentKindContext, QUOTATION_KIND, type DocumentKind } from "@/features/quotation/document-kind";
import { LineOptionsContext, LinePhotoContext, type LineOptions } from "@/features/quotation/options-context";
import { isFilledLine, type QuotationFormValues, type QuotationLine, type QuotationStatus } from "@/features/quotation/schema";

/** Everything the form needs from a document's API, read through the document's own hooks. */
export type DocumentApi<Input, Options extends LineOptions = LineOptions> = {
  /** The document options (party lists etc.); their stone lists feed the shared item editor. */
  options: Options | undefined;
  companyCurrency: string | null | undefined;
  /** Number preview for a new document (Document Setup). */
  nextDocNo: string | undefined;
  create(input: Input): Promise<{ id: string }>;
  update(args: Input & { id: string; expectedVersion: number }): Promise<unknown>;
  remove(args: { id: string; expectedVersion: number }): Promise<unknown>;
  /** Documents with an approval step (memo return). */
  approve?(args: { id: string; expectedVersion: number }): Promise<unknown>;
  invalidate(): Promise<unknown>;
  busy: boolean;
};

export type SaveOutcome = { fieldErrors: { name: string; message: string }[]; message: string };

type Saved = { id?: string; docNo?: string; version?: number; status?: string };

export type DocumentFormConfig<V extends FieldValues & Saved, Input, Options extends LineOptions = LineOptions> = {
  noun: string;
  noLabel: string;
  newHref: string;
  detailHref: (id: string) => string;
  schema: z.ZodType<V>;
  empty: () => V;
  toInput: (values: V) => Input;
  /** Reads the document's API; `partyId` is the saved party (keeps an inactive one in the lists). */
  useApi: (partyId: string | undefined, docDate: string, isNew: boolean) => DocumentApi<Input, Options>;
  partyId: (values: V | undefined) => string | undefined;
  header: (args: { readOnly: boolean; options: Options | undefined }) => ReactNode;
  mapSaveError: (error: unknown) => SaveOutcome;
  pickLabel: string;
  pickHint: string;
  emptyRowText?: string;
  itemTable?: ComponentType<Parameters<typeof ItemTable>[0]>;
  /** false: rows aren't edited in the row panel (memo out return edits only its Return cells in the table). */
  rowEditor?: boolean;
  /** Shown when an empty row is clicked and there is no row editor (e.g. its picker isn't available yet). */
  emptyRowNotice?: string;
  /**
   * The item button's picker (memo return: Add Memo Stock). The button and a click on an empty row open it; picked
   * rows fill the empty rows first, then are appended.
   */
  picker?: {
    /** Why it can't open yet (e.g. no vendor chosen), or null. */
    blockedReason: (values: V) => string | null;
    render: (props: { values: V; onClose: () => void; onAdd: (lines: QuotationLine[]) => void }) => ReactNode;
    addedToast: (count: number) => string;
  };
  /** A saved document in view mode shows this instead of the disabled header fields (memo return design, view). */
  viewHeader?: (args: { values: V; options: Options | undefined }) => ReactNode;
  /**
   * Saved documents wait for approval (memo return, Q-MR-15): a status badge, an Approve button for a saved pending
   * document in view mode, and Edit / Delete only while pending.
   */
  approval?: {
    statusLabels: StatusLabels;
    pendingStatus: QuotationStatus;
    confirmTitle: string;
    /** The confirm text from the document's filled rows (memo out counts its stock rows). */
    confirmBody: (lines: QuotationLine[]) => string;
  };
  /** What the shared item table / row panel do differently (memo out: From Stock quantities); default Quotation. */
  kind?: DocumentKind;
  noteMax?: number;
  notePlaceholder: string;
  noteHint: string;
  daybook: ReactNode;
};

/** Status badges of documents with an approval step (Memo Receive colors: orange pending, green approved). */
export const APPROVAL_STATUS_LABELS: StatusLabels = {
  PENDING_APPROVAL: { label: "Pending Approval", tone: "bg-[#FFF4E0] text-[#B45309]" },
  APPROVED: { label: "Approved", tone: "bg-[#E7F7EE] text-[#15803D]" },
};

/** Photos aren't available on the memo documents yet (ADR-0033 rev 1). */
const NO_PHOTOS = { upload: null, url: (id: string) => id };

/**
 * One trade document with the Quotation page layout and components (memo out, memo out return; ADR-0033). The
 * document type supplies its schema, header fields, API hooks and wording. A saved document is remounted with
 * the new server version after every write (its page keys on id + version).
 */
export function DocumentForm<V extends FieldValues & Saved, Input, Options extends LineOptions = LineOptions>({ config, initial, canAdd, canEdit, canDelete, canApprove = false }: {
  config: DocumentFormConfig<V, Input, Options>;
  initial?: V;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove?: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<V | undefined>(initial);
  const [mode, setMode] = useState<"view" | "edit">(initial ? "view" : "edit");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [railPanel, setRailPanel] = useState<RailPanel>(null);
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [approving, setApproving] = useState(false);

  const form = useForm<V>({ resolver: zodResolver(config.schema as never) as unknown as Resolver<V>, defaultValues: (initial ?? config.empty()) as DefaultValues<V> });
  const { control, reset, getValues, handleSubmit, formState, setValue, setError } = form;
  const lineArray = useFieldArray({ control, name: "lines" as never, keyName: "_rhfId" });
  const values = useWatch({ control }) as unknown as QuotationFormValues;
  const lines = useMemo(() => values.lines ?? [], [values.lines]);
  const totals = useMemo(() => calculateTotals(values), [values]);

  const readOnly = mode === "view";
  const api = config.useApi(config.partyId(saved), values.docDate ?? "", !saved?.docNo);
  const docNo = saved?.docNo ?? api.nextDocNo ?? "—";
  const { approval } = config;
  const status = approval && saved?.docNo ? (saved.status as QuotationStatus | undefined) : undefined;
  /** An approved document is read-only (approval documents edit only while pending). */
  const locked = Boolean(approval && status && status !== approval.pendingStatus);
  const showApprove = Boolean(approval && api.approve && saved?.id && status === approval.pendingStatus && readOnly && !formState.isDirty && canApprove);

  // A new document starts in the company currency once the options arrive.
  useEffect(() => {
    if (!saved && api.companyCurrency && getValues("currency" as Path<V>) === "") setValue("currency" as Path<V>, api.companyCurrency as never);
  }, [saved, api.companyCurrency, getValues, setValue]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const showError = (error: unknown) => {
    const outcome = config.mapSaveError(error);
    for (const field of outcome.fieldErrors) setError(field.name as Path<V>, { type: "server", message: field.message });
    setToast(outcome.message);
  };

  const onSave = handleSubmit(
    async (v) => {
      const input = config.toInput(v as V);
      try {
        if (saved?.id && saved.version) {
          await api.update({ ...input, id: saved.id, expectedVersion: saved.version });
          setToast(`Saved ${saved.docNo}`);
          await api.invalidate();
        } else {
          const result = await api.create(input);
          await api.invalidate();
          router.replace(config.detailHref(result.id));
        }
      } catch (error) {
        showError(error);
      }
    },
    () => setToast("Please complete the required fields"),
  );

  const onCancel = () => {
    if (formState.isDirty && !window.confirm("Discard unsaved changes?")) return;
    reset(saved ?? config.empty());
    setMode(saved ? "view" : "edit");
    setEditorOpen(false);
    setCheckedKeys(new Set());
  };

  const onDelete = async () => {
    if (!saved?.id || !saved.version || !window.confirm(`Delete ${saved.docNo}?`)) return;
    try {
      await api.remove({ id: saved.id, expectedVersion: saved.version });
      await api.invalidate();
      router.push(config.newHref);
    } catch (error) {
      showError(error);
    }
  };

  const onApprove = async () => {
    if (!saved?.id || !saved.version || !api.approve) return;
    try {
      await api.approve({ id: saved.id, expectedVersion: saved.version });
      setApproving(false);
      setToast(`Approved ${saved.docNo}`);
      await api.invalidate();
    } catch (error) {
      setApproving(false);
      showError(error);
    }
  };

  const onDuplicate = () => {
    const current = getValues() as V & { lines: QuotationLine[] };
    setSaved(undefined);
    reset({ ...config.empty(), ...current, id: undefined, docNo: undefined, version: undefined, status: approval?.pendingStatus ?? "DRAFT", lines: current.lines.map((l) => ({ ...l, key: newKey() })) });
    setMode("edit");
    setToast(`Duplicated as a new ${config.noun}`);
  };

  const blockedReason = config.picker?.blockedReason(values as unknown as V) ?? null;
  const openPicker = () => {
    if (blockedReason) setToast(blockedReason);
    else setPickerOpen(true);
  };

  /** Picked rows go into the empty rows first, then after the last row. */
  const addPicked = (picked: QuotationLine[]) => {
    const queue = [...picked];
    const current = getValues("lines" as Path<V>) as QuotationLine[];
    const merged = current.map((line) => (!isFilledLine(line) && queue.length > 0 ? queue.shift()! : line));
    lineArray.replace([...merged, ...queue] as never);
    setPickerOpen(false);
    if (config.picker) setToast(config.picker.addedToast(picked.length));
  };

  const openRow = (index: number) => {
    setSelectedIndex(index);
    if (config.rowEditor === false) {
      const empty = !readOnly && lines[index] && !isFilledLine(lines[index]);
      if (empty && config.picker) openPicker();
      else if (empty && config.emptyRowNotice) setToast(config.emptyRowNotice);
      return;
    }
    setEditorOpen(true);
    setRailPanel(null);
  };

  const addRow = () => {
    lineArray.append(emptyLine() as never);
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
    if (action === "clear") lineArray.update(index, emptyLine() as never);
    if (action === "duplicate") lineArray.insert(index + 1, { ...(getValues(`lines.${index}` as Path<V>) as QuotationLine), key: newKey(), source: "MANUAL", stockId: "", photos: [] } as never);
  };

  const removeChecked = () => {
    lineArray.remove(lines.flatMap((l, i) => (checkedKeys.has(l.key) ? [i] : [])));
    setCheckedKeys(new Set());
    setSelectedIndex(null);
    setEditorOpen(false);
  };

  const editorIndex = editorOpen && selectedIndex !== null && selectedIndex < lines.length ? selectedIndex : null;
  const Table = config.itemTable ?? ItemTable;

  return (
    <DocumentKindContext.Provider value={config.kind ?? QUOTATION_KIND}>
    <LineOptionsContext.Provider value={api.options}>
      <LinePhotoContext.Provider value={NO_PHOTOS}>
        <FormProvider {...form}>
          <div className="relative flex h-full bg-white">
            <div className="min-w-0 flex-1 overflow-y-auto">
              <QuotationHeader
                noLabel={config.noLabel}
                newHref={config.newHref}
                docNo={docNo}
                isPreview={!saved?.docNo}
                status={status}
                statusLabels={approval?.statusLabels}
                hideEditDelete={locked}
                extraActions={
                  showApprove && (
                    <Button variant="primary" onClick={() => setApproving(true)}>
                      <CircleCheck className="size-4" /> Approve
                    </Button>
                  )
                }
                mode={mode}
                saving={api.busy}
                canSave={saved ? canEdit : canAdd}
                canCreate={canAdd}
                canEdit={Boolean(saved) && canEdit && !locked}
                canDelete={Boolean(saved) && canDelete && !locked}
                actions={{
                  onCancel,
                  onSave: () => void onSave(),
                  onEdit: () => setMode("edit"),
                  onDelete: () => void onDelete(),
                  onDuplicate,
                  onRefresh: () => void api.invalidate().then(() => setToast("Refreshed")),
                }}
              />

              {readOnly && config.viewHeader ? (
                config.viewHeader({ values: values as unknown as V, options: api.options })
              ) : (
                <fieldset disabled={readOnly}>{config.header({ readOnly, options: api.options })}</fieldset>
              )}

              <hr className="border-[#E3E6EA]" />

              <div className="flex gap-4 px-6 py-6">
                <div className="min-w-0 flex-1">
                  <div className="mb-4 flex items-center gap-3">
                    <h2 className="text-lg font-medium text-[#1C252E]">Item</h2>
                    <span className="text-xs text-[#6B7480]">{lines.length} rows</span>
                    {/* A view-mode header (memo return design) hides the item tools too. */}
                    {!(readOnly && config.viewHeader) && (
                      <>
                        <span title={config.picker ? (blockedReason ?? config.pickHint) : config.pickHint}>
                          <Button variant="dark" size="sm" disabled={!config.picker || readOnly} onClick={openPicker}>
                            {config.pickLabel}
                          </Button>
                        </span>
                        {/* TODO: scan barcode เพื่อเพิ่มรายการ */}
                        <IconButton label="Scan to add" disabled={readOnly} className="bg-[#F6F7F8]">
                          <ScanIcon />
                        </IconButton>
                      </>
                    )}
                    {checkedKeys.size > 0 && !readOnly && (
                      <Button size="sm" variant="danger-outline" onClick={removeChecked}>
                        <Trash2 className="size-4" /> Remove {checkedKeys.size} selected
                      </Button>
                    )}
                    {formState.errors.lines?.message && <span className="text-sm text-[#E5484D]">{String(formState.errors.lines.message)}</span>}
                  </div>

                  <div className="flex items-start gap-4">
                    <ItemPhotoBox index={selectedIndex} />
                    <fieldset disabled={readOnly} className="min-w-0 flex-1">
                      <Table
                        lines={lines}
                        currency={values.currency ?? ""}
                        totals={totals}
                        selectedIndex={selectedIndex}
                        checkedKeys={checkedKeys}
                        readOnly={readOnly}
                        emptyRowText={config.emptyRowText}
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

                  <fieldset disabled={readOnly} className="mt-6 flex flex-col gap-10 pb-6 lg:flex-row">
                    <DocumentNote placeholder={config.notePlaceholder} hint={config.noteHint} max={config.noteMax} />
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
                <RailPanelView panel={railPanel} totals={totals} currency={values.currency ?? ""} daybook={config.daybook} onClose={() => setRailPanel(null)} />
              </fieldset>
            )}
          </div>
          {pickerOpen && config.picker?.render({ values: values as unknown as V, onClose: () => setPickerOpen(false), onAdd: addPicked })}
          {approval && (
            <ConfirmDialog
              open={approving}
              title={approval.confirmTitle}
              body={approval.confirmBody(lines.filter(isFilledLine))}
              cancelLabel="Cancel"
              confirmLabel="Approve"
              pendingLabel="Approving…"
              pending={api.busy}
              onCancel={() => setApproving(false)}
              onConfirm={() => void onApprove()}
            />
          )}
          {toast && <Toast message={toast} onClose={() => setToast(null)} />}
        </FormProvider>
      </LinePhotoContext.Provider>
    </LineOptionsContext.Provider>
    </DocumentKindContext.Provider>
  );
}
