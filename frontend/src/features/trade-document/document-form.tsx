"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { DISCARD_CHANGES_CONFIRM, deleteDocumentConfirm, restoreDocumentConfirm, useConfirm } from "@/features/quotation/components/use-confirm";
import { Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { useTabDirty, useTabDocument, useTabReplace } from "@/features/home/tabs/tab-host";
import { FormProvider, useFieldArray, useForm, useWatch, type DefaultValues, type FieldValues, type Path, type Resolver } from "react-hook-form";
import type { z } from "zod";
import { ScanIcon } from "@/components/ui/scan-icon";
import { QuotationHeader } from "@/features/quotation/components/header/QuotationHeader";
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
import { useDocumentFlow } from "./approval-flow";
import { clearNotice, DocumentDeletedBanner, handOverNotice, peekNotice, type DeletedInfo, type RestoreOutcome } from "./document-api";
import { savedMessage, type DocFlow, type DocumentApprovalType } from "./flow-status";

/** Everything the form needs from a document's API, read through the document's own hooks. */
export type DocumentApi<Input, Options extends LineOptions = LineOptions> = {
  /** The document options (party lists etc.); their stone lists feed the shared item editor. */
  options: Options | undefined;
  companyCurrency: string | null | undefined;
  /** Number preview for a new document (Document Setup). */
  nextDocNo: string | undefined;
  /** The result carries the saved status (`Flow`): DRAFT with approval ON, APPROVED + autoApproved with it OFF. */
  create(input: Input): Promise<{ id: string; docNo?: string; status?: string; autoApproved?: boolean }>;
  update(args: Input & { id: string; expectedVersion: number }): Promise<{ status?: string; autoApproved?: boolean }>;
  remove(args: { id: string; expectedVersion: number }): Promise<unknown>;
  /** approval-setup FE-AS-010: Send to approve (`<doc>.submit`), Draft / Revise -> Pending Approval. */
  submit(args: { id: string; expectedVersion: number }): Promise<unknown>;
  /** transaction-soft-delete: a deleted document back to its status (`<doc>.restore`, DELETE grant). */
  restore(args: { id: string; expectedVersion: number }): Promise<unknown>;
  invalidate(): Promise<unknown>;
  busy: boolean;
};

/** `deleted`: the document was deleted elsewhere (`<CODE>_DELETED`); reload it read-only. */
export type SaveOutcome = { fieldErrors: { name: string; message: string }[]; message: string; deleted?: boolean };

/** An item picker dialog: picked rows go to `onAdd`. */
export type PickerRender<V> = (props: { values: V; onClose: () => void; onAdd: (lines: QuotationLine[]) => void }) => ReactNode;

export type SecondaryPicker<V> = { label: string; hint: string } & (
  | { disabledReason: string; render?: undefined; addedToast?: undefined }
  | { disabledReason?: undefined; render: PickerRender<V>; addedToast: (count: number) => string }
);

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
  /** `<doc>.restore` errors (transaction-soft-delete). */
  mapRestoreError: (error: unknown) => RestoreOutcome;
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
    render: PickerRender<V>;
    addedToast: (count: number) => string;
  };
  /**
   * A second dark item button after the first (purchase FE-PU-001: Purchase Order). It either stays disabled with
   * `disabledReason` (given as its tooltip and `aria-describedby` text), or opens its own picker (`render`), whose rows
   * are added like the first picker's. Without it the form shows one item button, as before.
   */
  secondaryPicker?: SecondaryPicker<V>;
  /** A saved document in view mode shows this instead of the disabled header fields (memo return design, view). */
  viewHeader?: (args: { values: V; options: Options | undefined }) => ReactNode;
  /**
   * The approval setting key (ADR-0048): status badge, Send to approve, Edit / Delete per `Flow`, read-only text. The
   * Approve button is no longer on a document page (Approve menu only).
   */
  approvalType: DocumentApprovalType;
  /** What the shared item table / row panel do differently (memo out: From Stock quantities); default Quotation. */
  kind?: DocumentKind;
  noteMax?: number;
  notePlaceholder: string;
  noteHint: string;
  daybook: ReactNode;
};

export type LineErrors = readonly (Record<string, { message?: unknown } | undefined> | undefined)[] | undefined;

/** The first message of each row's errors (INV-20261102-003), in row order. */
export function lineErrorMessages(lines: LineErrors, count: number): (string | undefined)[] {
  return Array.from({ length: count }, (_, index) => {
    const row = lines?.[index];
    if (!row) return undefined;
    const found = Object.values(row).find((error) => typeof error?.message === "string" && error.message);
    return found ? String(found.message) : undefined;
  });
}

/** Toast of a failed Save: names the first bad row and what to fix, else the generic header message. */
export function invalidSaveMessage(rowMessages: readonly (string | undefined)[]): string {
  const index = rowMessages.findIndex(Boolean);
  return index < 0 ? "Please complete the required fields" : `Row ${index + 1}: ${rowMessages[index]}`;
}

/** Status badges of every document page (ADR-0048: Draft, Pending Approval, Revise, Approved, Rejected). */
export { FLOW_STATUS_LABELS as APPROVAL_STATUS_LABELS } from "./flow-status";

type ToolButton = { label: string; onClick: () => void };

/**
 * The item tools beside the "Item" title: the first picker button, an optional second one (FE-PU-001) and the scan
 * placeholder. A second button with `disabledReason` can't take focus while disabled, so its reason is also given as
 * `aria-describedby` text besides the tooltip.
 */
export function ItemToolButtons({ primary, secondary, readOnly }: {
  primary: ToolButton & { title: string; disabled: boolean };
  secondary?: ToolButton & { hint: string; disabledReason?: string };
  readOnly: boolean;
}) {
  const reasonId = useId();
  return (
    <>
      <span title={primary.title}>
        <Button variant="dark" size="sm" disabled={primary.disabled} onClick={primary.onClick}>
          {primary.label}
        </Button>
      </span>
      {secondary &&
        (secondary.disabledReason ? (
          <span title={secondary.disabledReason}>
            <Button variant="dark" size="sm" disabled aria-describedby={reasonId}>
              {secondary.label}
            </Button>
            <span id={reasonId} className="sr-only">
              {secondary.disabledReason}
            </span>
          </span>
        ) : (
          <span title={secondary.hint}>
            <Button variant="dark" size="sm" disabled={readOnly} onClick={secondary.onClick}>
              {secondary.label}
            </Button>
          </span>
        ))}
      {/* TODO: scan barcode เพื่อเพิ่มรายการ */}
      <IconButton label="Scan to add" disabled={readOnly} className="bg-[#F6F7F8]">
        <ScanIcon />
      </IconButton>
    </>
  );
}

/** Photos aren't available on the memo documents yet (ADR-0033 rev 1). */
const NO_PHOTOS = { upload: null, url: (id: string) => id };

/**
 * One trade document with the Quotation page layout and components (memo out, memo out return; ADR-0033). The
 * document type supplies its schema, header fields, API hooks and wording. A saved document is remounted with
 * the new server version after every write (its page keys on id + version).
 */
export function DocumentForm<V extends FieldValues & Saved, Input, Options extends LineOptions = LineOptions>({ config, initial, deleted: initialDeleted = null, flow = null, canAdd, canEdit, canDelete }: {
  config: DocumentFormConfig<V, Input, Options>;
  initial?: V;
  /** A soft-deleted document (ADR-0045 D10): read-only with the banner, Restore with DELETE. */
  deleted?: DeletedInfo | null;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** `Flow` of the saved document (`<doc>.get`); null for a new one. */
  flow?: DocFlow | null;
}) {
  const replaceTab = useTabReplace();
  const [saved, setSaved] = useState<V | undefined>(initial);
  const [mode, setMode] = useState<"view" | "edit">(initial ? "view" : "edit");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [railPanel, setRailPanel] = useState<RailPanel>(null);
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  // A message handed over from the copy before this version (deleted elsewhere, restored).
  const [toast, setToast] = useState<string | null>(() => peekNotice(initial?.id));
  const [deleted, setDeleted] = useState<DeletedInfo | null>(initialDeleted);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [secondaryOpen, setSecondaryOpen] = useState(false);

  const form = useForm<V>({ resolver: zodResolver(config.schema as never) as unknown as Resolver<V>, defaultValues: (initial ?? config.empty()) as DefaultValues<V> });
  const { control, reset, resetField, getValues, handleSubmit, formState, setError } = form;
  const lineArray = useFieldArray({ control, name: "lines" as never, keyName: "_rhfId" });
  const values = useWatch({ control }) as unknown as QuotationFormValues;
  const lines = useMemo(() => values.lines ?? [], [values.lines]);
  const totals = useMemo(() => calculateTotals(values), [values]);

  const isDeleted = Boolean(deleted && saved?.id);
  const readOnly = mode === "view" || isDeleted;
  const api = config.useApi(config.partyId(saved), values.docDate ?? "", !saved?.docNo);
  const docNo = saved?.docNo ?? api.nextDocNo ?? "—";
  const status = saved?.docNo ? ((flow?.status ?? saved.status) as QuotationStatus | undefined) : undefined;
  /** FE-AS-010: the remounted copy shows the server's latest status; a reload hands its message over. */
  const reload = async (message: string) => {
    if (saved?.id) handOverNotice(saved.id, message);
    setMode("view");
    await api.invalidate();
  };
  const approvalFlow = useDocumentFlow({
    type: config.approvalType,
    saved,
    flow,
    deleted: isDeleted,
    access: { add: canAdd, edit: canEdit, delete: canDelete },
    editing: !readOnly,
    dirty: formState.isDirty,
    busy: api.busy,
    submit: api.submit,
    confirm,
    toast: setToast,
    reload,
    onError: (error) => showError(error),
  });
  // app-shell-tabs T-03 / Q-TAB-03: the tab shows the document number and a dot while edits are unsaved.
  useTabDocument(saved?.docNo);
  useTabDirty(formState.isDirty && !readOnly);

  // A new document starts in the company currency once the options arrive.
  useEffect(() => {
    // INV-20261107-008: a value the page fills in by itself becomes the field's default too, so an untouched document isn't "unsaved".
    if (!saved && api.companyCurrency && getValues("currency" as Path<V>) === "") resetField("currency" as Path<V>, { defaultValue: api.companyCurrency as never });
  }, [saved, api.companyCurrency, getValues, resetField]);

  useEffect(() => clearNotice(initial?.id), [initial?.id]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  function showError(error: unknown) {
    const outcome = config.mapSaveError(error);
    for (const field of outcome.fieldErrors) setError(field.name as Path<V>, { type: "server", message: field.message });
    setToast(outcome.message);
    // FE-SD-003: deleted in another tab; reload it (the page remounts read-only with the banner) and keep the message.
    if (outcome.deleted && saved?.id) {
      handOverNotice(saved.id, outcome.message);
      setMode("view");
      void api.invalidate();
    }
  }

  /** ADR-0048 codes first (in use, status, approval off), then the page's own mapping. */
  const onWriteError = async (error: unknown, action: "save" | "delete") => {
    if (!(await approvalFlow.handleError(error, action))) showError(error);
  };

  const onSave = handleSubmit(
    async (v) => {
      const input = config.toInput(v as V);
      try {
        if (saved?.id && saved.version) {
          const result = await api.update({ ...input, id: saved.id, expectedVersion: saved.version });
          const message = savedMessage(saved.docNo, result);
          setToast(message);
          handOverNotice(saved.id, message);
          await api.invalidate();
        } else {
          const result = await api.create(input);
          handOverNotice(result.id, savedMessage(result.docNo, result));
          await api.invalidate();
          replaceTab(config.detailHref(result.id));
        }
      } catch (error) {
        await onWriteError(error, "save");
      }
    },
    (errors) => {
      // INV-20261102-003: say which row is wrong and go to it (its row panel opens where there is one).
      const rowMessages = lineErrorMessages((errors as { lines?: LineErrors }).lines, getValues("lines" as Path<V>)?.length ?? 0);
      const first = rowMessages.findIndex(Boolean);
      if (first >= 0) {
        setSelectedIndex(first);
        if (config.rowEditor !== false) setEditorOpen(true);
      }
      setToast(invalidSaveMessage(rowMessages));
    },
  );

  const onCancel = async () => {
    if (formState.isDirty && !(await confirm(DISCARD_CHANGES_CONFIRM))) return;
    reset(saved ?? config.empty());
    setMode(saved ? "view" : "edit");
    setEditorOpen(false);
    setCheckedKeys(new Set());
  };

  const onDelete = async () => {
    if (!saved?.id || !saved.version || !(await confirm(deleteDocumentConfirm(saved.docNo)))) return;
    try {
      await api.remove({ id: saved.id, expectedVersion: saved.version });
      await api.invalidate();
      replaceTab(config.newHref);
    } catch (error) {
      await onWriteError(error, "delete");
    }
  };

  const onRestore = async () => {
    if (!saved?.id || !saved.version || !(await confirm(restoreDocumentConfirm(saved.docNo, approvalFlow.restoreLabel)))) return;
    try {
      await api.restore({ id: saved.id, expectedVersion: saved.version });
      // The page remounts editable with the new version; the message goes with it.
      handOverNotice(saved.id, `Restored ${saved.docNo ?? ""}`.trim());
      await api.invalidate();
    } catch (error) {
      const outcome = config.mapRestoreError(error);
      setToast(outcome.message);
      if (outcome.refetch) {
        handOverNotice(saved.id, outcome.message);
        await api.invalidate();
      }
    }
  };

  const onDuplicate = () => {
    const current = getValues() as V & { lines: QuotationLine[] };
    setSaved(undefined);
    setDeleted(null);
    reset({ ...config.empty(), ...current, id: undefined, docNo: undefined, version: undefined, status: "DRAFT", lines: current.lines.map((l) => ({ ...l, key: newKey() })) });
    setMode("edit");
    setToast(`Duplicated as a new ${config.noun}`);
  };

  const blockedReason = config.picker?.blockedReason(values as unknown as V) ?? null;
  const openPicker = () => {
    if (blockedReason) setToast(blockedReason);
    else setPickerOpen(true);
  };

  /** Picked rows go into the empty rows first, then after the last row. */
  const addPicked = (picked: QuotationLine[], addedToast = config.picker?.addedToast) => {
    const queue = [...picked];
    const current = getValues("lines" as Path<V>) as QuotationLine[];
    const merged = current.map((line) => (!isFilledLine(line) && queue.length > 0 ? queue.shift()! : line));
    lineArray.replace([...merged, ...queue] as never);
    setPickerOpen(false);
    setSecondaryOpen(false);
    if (addedToast) setToast(addedToast(picked.length));
  };
  const { secondaryPicker } = config;

  const openRow = (index: number) => {
    setSelectedIndex(index);
    if (config.kind?.pickOnly && config.picker && !readOnly && lines[index] && !isFilledLine(lines[index])) {
      openPicker();
      return;
    }
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
          <div className="relative flex h-full bg-gms-page">
            <div className="min-w-0 flex-1 overflow-y-auto">
              {isDeleted && deleted && <DocumentDeletedBanner info={deleted} canRestore={canDelete} busy={api.busy} onRestore={() => void onRestore()} />}
              <QuotationHeader
                noLabel={config.noLabel}
                newHref={config.newHref}
                docNo={docNo}
                isPreview={!saved?.docNo}
                status={status}
                statusLabels={approvalFlow.statusLabels}
                statusNote={approvalFlow.statusNote}
                hideEditDelete={approvalFlow.hideEditDelete}
                extraActions={approvalFlow.sendButton}
                mode={isDeleted ? "view" : mode}
                saving={api.busy}
                canSave={!isDeleted && (saved ? canEdit : canAdd)}
                canCreate={canAdd}
                canEdit={approvalFlow.canEdit}
                canDelete={approvalFlow.canDelete}
                actions={{
                  onCancel: () => void onCancel(),
                  onSave: () => void onSave(),
                  onEdit: () => setMode("edit"),
                  onDelete: () => void onDelete(),
                  onDuplicate,
                  onRefresh: () => void api.invalidate().then(() => setToast("Refreshed")),
                }}
              />

              {readOnly && config.viewHeader ? (
                <div className="mx-6 rounded-gms-md bg-gms-surface">{config.viewHeader({ values: values as unknown as V, options: api.options })}</div>
              ) : (
                <fieldset disabled={readOnly} className="mx-6 rounded-gms-md bg-gms-surface">{config.header({ readOnly, options: api.options })}</fieldset>
              )}


              <div className="mx-6 rounded-gms-md bg-gms-surface mt-4 mb-6 flex gap-4 px-6 py-6">
                <div className="min-w-0 flex-1">
                  <div className="mb-4 flex items-center gap-3">
                    <h2 className="text-lg font-medium text-[#1C252E]">Item</h2>
                    <span className="text-xs text-[#6B7480]">{lines.length} rows</span>
                    {/* A view-mode header (memo return design) hides the item tools too. */}
                    {!(readOnly && config.viewHeader) && (
                      <ItemToolButtons
                        readOnly={readOnly}
                        primary={{
                          label: config.pickLabel,
                          title: config.picker ? (blockedReason ?? config.pickHint) : config.pickHint,
                          disabled: !config.picker || readOnly,
                          onClick: openPicker,
                        }}
                        secondary={
                          secondaryPicker && {
                            label: secondaryPicker.label,
                            hint: secondaryPicker.hint,
                            disabledReason: secondaryPicker.disabledReason,
                            onClick: () => setSecondaryOpen(true),
                          }
                        }
                      />
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
                        rowErrors={formState.isSubmitted ? lineErrorMessages(formState.errors.lines as unknown as LineErrors, lines.length) : undefined}
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
                  onNextRow={() => setSelectedIndex(editorIndex < lines.length - 1 ? editorIndex + 1 : config.kind?.pickOnly ? editorIndex : addRow())}
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
          {secondaryOpen &&
            secondaryPicker?.render?.({
              values: values as unknown as V,
              onClose: () => setSecondaryOpen(false),
              onAdd: (picked) => addPicked(picked, secondaryPicker.addedToast),
            })}
          {confirmDialog}
          {toast && <Toast message={toast} onClose={() => setToast(null)} />}
        </FormProvider>
      </LinePhotoContext.Provider>
    </LineOptionsContext.Provider>
    </DocumentKindContext.Provider>
  );
}
