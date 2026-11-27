"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FormProvider, useForm, useWatch, type Path, type Resolver } from "react-hook-form";
import { ScanIcon } from "@/components/ui/scan-icon";
import { useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import { useTabDirty, useTabDocument, useTabReplace } from "@/features/home/tabs/tab-host";
import { QuotationHeader } from "@/features/quotation/components/header/QuotationHeader";
import { ItemEditorDock } from "@/features/quotation/components/items/ItemEditorPanel";
import { DocumentNote } from "@/features/quotation/components/note/DocumentNote";
import { RailButtons, type RailPanel } from "@/features/quotation/components/rail/RightRail";
import { Button, Field, FormDateInput, IconButton, SidePanel, TextInput, Toast } from "@/features/quotation/components/ui";
import { DISCARD_CHANGES_CONFIRM, deleteDocumentConfirm, useConfirm } from "@/features/quotation/components/use-confirm";
import { toFixed } from "@/features/quotation/lib/decimal";
import { todayIso } from "@/features/quotation/lib/format";
import type { QuotationStatus } from "@/features/quotation/schema";
import { useDocumentFlow } from "@/features/trade-document/approval-flow";
import { clearNotice, DocumentDaybook, handOverNotice, peekNotice, useDocumentAccess, type DaybookState, type DocumentAccess } from "@/features/trade-document/document-api";
import { savedMessage, type DocFlow } from "@/features/trade-document/flow-status";
import { MemoStockModal } from "@/features/trade-document/memo-stock-modal";
import { readDomainError } from "@/lib/trpc-error";
import {
  addedToast,
  addSplitChild,
  applyPick,
  emptyMergeSplit,
  firstRowIssue,
  fromMergeSplit,
  invalidMessage,
  mapMergeSplitError,
  MERGE_SPLIT_HREF,
  mergeSplitApi,
  mergeSplitHref,
  mergeSplitLoadError,
  mergeSplitSchema,
  MODE_LABEL,
  MS_DENIED,
  MS_NOT_FOUND,
  NOTE_MAX,
  REF_MAX,
  relinkStockPhotos,
  removeRows,
  removeSource,
  resultTotals,
  sourceTotals,
  suggestedSource,
  sourceFromStock,
  toMergeSplitInput,
  totalsMismatch,
  useMergeSplitDaybook,
  useMergeSplitDetail,
  useMergeSplitNumber,
  useMergeSplitOptions,
  useMergeSplitWrites,
  validateMergeSplit,
  type MsFormValues,
  type MsRowValues,
} from "../api";
import type { MsMode, MsOut, OwnStockRow } from "../types";
import { MergeSplitModeDialog } from "./mode-dialog";
import { MergeSplitResultTable, MergeSplitModeChip } from "./result-table";
import { MergeSplitPhotoBox, MergeSplitRowPanel } from "./result-row-panel";
import { MergeSplitSourceTable } from "./source-table";

export const MS_IN_USE_NOTE = "A new stock is already used · In use — cannot edit";
export const MS_DELETED_TEXT = "This Merge/Split was deleted · Read-only";
export const MS_NOTE_HINT = "Kept with this document; not printed";

const message = "p-10 text-gms-body text-gms-text-secondary";

/** `/inventory/merge-split` — a new Merge/Split (FE-MS-001). */
export function MergeSplitPage() {
  const access = useDocumentAccess("merge-split");
  if (!access) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>{MS_DENIED}</p>;
  return <MergeSplitForm access={access} />;
}

/** `/inventory/merge-split/[id]` — a saved one; it remounts on every new server version. */
export function EditMergeSplitPage({ id }: { id: string }) {
  const access = useDocumentAccess("merge-split");
  const detail = useMergeSplitDetail(access?.view ? id : null);
  if (!access || (access.view && detail.isPending)) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>{MS_DENIED}</p>;
  if (detail.isError || !detail.data) return <p className={message}>{detail.error ? mergeSplitLoadError(detail.error) : MS_NOT_FOUND}</p>;
  return <MergeSplitForm key={`${id}:${detail.data.version}`} access={access} detail={detail.data} />;
}

/** `MsOut` → the shared ADR-0050 `Flow`: Edit / Delete off once a new stock is used (Q-LS-19) or the document is deleted. */
export function mergeSplitFlow(detail: MsOut): DocFlow {
  const changeable = !detail.deleted && !detail.results.some((row) => row.inUse);
  const review = detail.approval.review;
  return {
    status: detail.status,
    autoApproved: detail.approval.autoApproved || detail.autoApproved,
    revisionCount: detail.approval.revisionCount,
    canEdit: changeable,
    canDelete: changeable,
    canSubmit: detail.approval.requireApproval,
    usedBy: null,
    review: review ? { action: review.action, note: review.note, at: review.at ?? "", byName: review.byName } : null,
  };
}

/** Stocks whose photos are relinked on a pick (Q-MS-11): Split every picked stock, Merge only a new row's suggested one. */
export function photoStocks(picked: readonly OwnStockRow[], mode: MsMode, hasMergedRow: boolean): string[] {
  if (mode === "MERGE") {
    if (hasMergedRow) return [];
    const best = suggestedSource(picked.map((row) => ({ ...sourceFromStock(row), stockUuid: row.stockUuid })));
    return best && best.photoCount > 0 ? [best.stockUuid] : [];
  }
  return picked.filter((row) => row.photoCount > 0).map((row) => row.stockUuid);
}

export function mergeSplitDaybookState(list: ReturnType<typeof useMergeSplitDaybook>): DaybookState {
  return {
    isPending: list.isPending,
    isError: list.isError,
    errorMessage: list.error ? mergeSplitLoadError(list.error, "documents") : undefined,
    items: (list.data?.pages ?? []).flatMap((page) =>
      page.items.map((item) => ({
        id: item.id,
        docNo: item.docNo ?? "Draft",
        docDate: item.docDate,
        status: item.status,
        name: `${MODE_LABEL[item.mode]} · ${item.sourceCount} → ${item.resultCount}`,
      })),
    ),
    hasMore: list.hasNextPage,
    loadingMore: list.isFetchingNextPage,
    onLoadMore: () => void list.fetchNextPage(),
  };
}

function MergeSplitDaybook({ requireApproval }: { requireApproval: boolean | undefined }) {
  const list = useMergeSplitDaybook();
  return <DocumentDaybook requireApproval={requireApproval} plural="documents" href={mergeSplitHref} state={mergeSplitDaybookState(list)} />;
}

function rowFieldErrors(errors: unknown, index: number): Partial<Record<string, string>> {
  const row = (errors as { rows?: Record<number, Record<string, { message?: unknown } | undefined> | undefined> } | undefined)?.rows?.[index];
  if (!row) return {};
  return Object.fromEntries(Object.entries(row).flatMap(([field, value]) => (typeof value?.message === "string" ? [[field, value.message]] : [])));
}

/**
 * merge-split UI rev 1 on SA rev 1 (owner 2026-11-27): Load to Stock's layout with one From Stock button for our own
 * stock, Item (sources) and Result tables (Split groups / one Merge row), balance chips, the totals mismatch banner
 * (S-06, blocks Save), row panel, Document Note, Daybook / Summary rail and the ADR-0050 approval flow.
 */
export function MergeSplitForm({ access, detail }: { access: DocumentAccess; detail?: MsOut }) {
  const nf = useNumberFormat();
  const replaceTab = useTabReplace();
  const initial = useMemo(() => (detail ? fromMergeSplit(detail) : emptyMergeSplit(todayIso())), [detail]);
  const form = useForm<MsFormValues>({ resolver: zodResolver(mergeSplitSchema as never) as unknown as Resolver<MsFormValues>, defaultValues: initial });
  const { control, getValues, setValue, reset, handleSubmit, formState, setError, clearErrors, register } = form;
  const values = useWatch({ control }) as MsFormValues;
  const rows = useMemo(() => values.rows ?? [], [values.rows]);
  const sources = useMemo(() => values.sources ?? [], [values.sources]);
  const mode = values.mode ?? "";

  const [viewMode, setViewMode] = useState<"view" | "edit">(detail ? "view" : "edit");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [rail, setRail] = useState<RailPanel>(null);
  const [toast, setToast] = useState<string | null>(() => peekNotice(detail?.id));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked] = useState<OwnStockRow[] | null>(null);
  const [adding, setAdding] = useState(false);
  const fromStockRef = useRef<HTMLSpanElement>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const deleted = Boolean(detail?.deleted);
  const readOnly = viewMode === "view" || deleted;
  const isNew = !detail;
  const options = useMergeSplitOptions();
  const currency = options.data?.companyCurrency ?? "THB";
  const nextNumber = useMergeSplitNumber(values.docDate ?? "", isNew && access.add);
  const writes = useMergeSplitWrites();

  const reload = async (text: string) => {
    if (detail) handOverNotice(detail.id, text);
    setViewMode("view");
    await writes.invalidate();
  };

  const showError = (error: unknown) => {
    const outcome = mapMergeSplitError(error, getValues());
    for (const field of outcome.fieldErrors) setError(field.name as Path<MsFormValues>, { type: "server", message: field.message });
    setToast(outcome.message);
    if (outcome.refetch && detail) void reload(outcome.message);
    else if (outcome.refetchPicker) void writes.invalidate();
  };

  const approvalFlow = useDocumentFlow({
    type: "merge-split",
    saved: detail ? { id: detail.id, docNo: detail.docNo ?? undefined, version: detail.version } : undefined,
    flow: detail ? mergeSplitFlow(detail) : null,
    deleted,
    access,
    editing: !readOnly,
    dirty: formState.isDirty,
    busy: writes.busy,
    submit: writes.submit,
    confirm,
    toast: setToast,
    reload,
    onError: showError,
  });

  useTabDocument(detail?.docNo ?? undefined);
  useTabDirty(formState.isDirty && !readOnly);
  useEffect(() => clearNotice(detail?.id), [detail?.id]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  /** A structural change (pick, remove, split): indexes move, so old row errors are cleared. */
  const apply = (next: MsFormValues) => {
    setValue("mode", next.mode, { shouldDirty: true });
    setValue("sources", next.sources, { shouldDirty: true });
    setValue("rows", next.rows, { shouldDirty: true });
    clearErrors("rows");
    if (selectedKey && !next.rows.some((row) => row.key === selectedKey)) {
      setSelectedKey(null);
      setPanelOpen(false);
    }
    setChecked((prev) => new Set([...prev].filter((key) => next.rows.some((row) => row.key === key))));
  };

  const updateRow = (index: number, patch: Partial<MsRowValues>) => {
    const current = getValues(`rows.${index}`);
    if (!current) return;
    setValue(`rows.${index}`, { ...current, ...patch }, { shouldDirty: true, shouldValidate: formState.isSubmitted });
  };

  const onWriteError = async (error: unknown, action: "save" | "delete") => {
    if (readDomainError(error).domainCode !== "MERGE_SPLIT_IN_USE" && (await approvalFlow.handleError(error, action))) return;
    showError(error);
  };

  const mismatch = totalsMismatch({ mode, rows, sources });

  const onSave = handleSubmit(
    async (valid) => {
      const input = toMergeSplitInput(valid);
      try {
        if (detail) {
          const result = await writes.update(detail.id, { ...input, expectedVersion: detail.version });
          const text = savedMessage(detail.docNo ?? "Merge/Split", { status: result.status, autoApproved: result.status === "APPROVED" });
          handOverNotice(detail.id, text);
          setToast(text);
          setViewMode("view");
          await writes.invalidate();
        } else {
          const result = await writes.create(input);
          handOverNotice(result.id, savedMessage(result.docNo ?? "Merge/Split", { status: result.status, autoApproved: result.status === "APPROVED" }));
          await writes.invalidate();
          replaceTab(mergeSplitHref(result.id));
        }
      } catch (error) {
        await onWriteError(error, "save");
      }
    },
    () => {
      const issues = validateMergeSplit(getValues());
      const first = firstRowIssue(issues);
      const row = first ? getValues(`rows.${first.index}`) : undefined;
      if (row) {
        setSelectedKey(row.key);
        setPanelOpen(true);
        setRail(null);
      }
      setToast(invalidMessage(issues));
    },
  );

  const onCancel = async () => {
    if (formState.isDirty && !(await confirm(DISCARD_CHANGES_CONFIRM))) return;
    reset(initial);
    setViewMode(detail ? "view" : "edit");
    setPanelOpen(false);
    setChecked(new Set());
  };

  const onDelete = async () => {
    if (!detail || !(await confirm(deleteDocumentConfirm(detail.docNo ?? "this Merge/Split")))) return;
    try {
      await writes.remove({ id: detail.id, expectedVersion: detail.version });
      handOverNotice(detail.id, "Deleted");
      await writes.invalidate();
    } catch (error) {
      await onWriteError(error, "delete");
    }
  };

  const onRestore = async () => {
    if (!detail) return;
    try {
      await writes.restore({ id: detail.id, expectedVersion: detail.version });
      handOverNotice(detail.id, "Restored");
      await writes.invalidate();
    } catch (error) {
      showError(error);
    }
  };

  const onRefresh = async () => {
    if (formState.isDirty && !readOnly && !(await confirm(DISCARD_CHANGES_CONFIRM))) return;
    if (formState.isDirty) reset(initial);
    await writes.invalidate();
    setToast("Refreshed");
  };

  const openPicker = () => {
    if (!readOnly) setPickerOpen(true);
  };
  const closePicker = () => {
    setPickerOpen(false);
    setPicked(null);
    requestAnimationFrame(() => fromStockRef.current?.querySelector("button")?.focus());
  };

  const addPicked = async (items: readonly OwnStockRow[], pickMode: MsMode) => {
    setAdding(true);
    const current = getValues();
    const documentMode = current.mode;
    const { photos, failed } = await relinkStockPhotos(photoStocks(items, pickMode, current.mode === "MERGE" && current.rows.length > 0), mergeSplitApi.stockPhotos);
    apply(applyPick(getValues(), items, pickMode, photos));
    setAdding(false);
    closePicker();
    const text = addedToast(pickMode, items.length, documentMode);
    setToast(failed > 0 ? `${text}. Some photos couldn't be copied; add them in the row.` : text);
  };

  const onCreate = (pickMode: MsMode) => (picked ? addPicked(picked, pickMode) : Promise.resolve());

  /** P-01 OK: the first pick asks for the mode (P-02); later picks reuse it ("Added with mode {mode}"). */
  const onPicked = (items: OwnStockRow[]) => {
    if (items.length === 0) return;
    const documentMode = getValues("mode");
    if (documentMode && getValues("rows").length > 0) void addPicked(items, documentMode);
    else setPicked(items);
  };

  const removeGroup = async (sourceKey: string) => {
    const source = sources.find((candidate) => candidate.key === sourceKey);
    const ok = await confirm({
      title: `Remove ${source?.stockId ?? "this stock"} from this document?`,
      body: mode === "SPLIT" ? "Its new stocks are removed too. The stock keeps its quantity." : "The merged row's quantities are recomputed. The stock keeps its quantity.",
      cancelLabel: "Cancel",
      confirmLabel: "Remove",
      confirmVariant: "danger",
    });
    if (ok) apply(removeSource(getValues(), sourceKey));
  };

  const selectedIndex = selectedKey ? rows.findIndex((row) => row.key === selectedKey) : -1;
  const selectedRow = selectedIndex >= 0 ? rows[selectedIndex]! : null;
  const rowErrors = useMemo(() => {
    const map = new Map<number, string>();
    if (!formState.isSubmitted) return map;
    rows.forEach((_, index) => {
      const first = Object.values(rowFieldErrors(formState.errors, index))[0];
      if (first) map.set(index, first);
    });
    return map;
  }, [formState.isSubmitted, formState.errors, rows]);
  const sourceSum = sourceTotals({ sources });
  const resultSum = resultTotals({ mode, rows, sources });
  const status = detail ? (detail.status as QuotationStatus) : undefined;
  let statusNote = approvalFlow.statusNote;
  if (deleted) statusNote = { text: MS_DELETED_TEXT, tone: "muted" };
  else if (detail?.results.some((row) => row.inUse)) statusNote = { text: MS_IN_USE_NOTE, tone: "muted" };

  return (
    <FormProvider {...form}>
      <div className="relative flex h-full bg-gms-page">
        <div className="min-w-0 flex-1 overflow-y-auto">
          {deleted && (
            <div role="status" className="mx-6 mt-4 flex items-center justify-between gap-3 rounded-gms-md border border-[#F0C987] bg-[#FFF8E6] px-4 py-3 text-sm text-[#7A5A00]">
              <span>{MS_DELETED_TEXT}</span>
              {access.delete && (
                <Button size="sm" disabled={writes.busy} onClick={() => void onRestore()}>
                  Restore
                </Button>
              )}
            </div>
          )}
          <QuotationHeader
            noLabel="Merge/Split No.:"
            newHref={MERGE_SPLIT_HREF}
            docNo={detail ? (detail.docNo ?? "Draft") : (nextNumber.data?.docNo ?? "—")}
            isPreview={isNew}
            status={status}
            statusLabels={approvalFlow.statusLabels}
            statusNote={statusNote}
            hideEditDelete={approvalFlow.hideEditDelete}
            extraActions={approvalFlow.sendButton}
            mode={deleted ? "view" : viewMode}
            saving={writes.busy}
            canSave={!deleted && (detail ? access.edit : access.add) && mismatch === null}
            canCreate={access.add}
            canEdit={approvalFlow.canEdit}
            canDelete={approvalFlow.canDelete}
            canDuplicate={false}
            onPrint={detail && !deleted ? () => window.print() : undefined}
            actions={{
              onCancel: () => void onCancel(),
              onSave: () => void onSave(),
              onEdit: () => setViewMode("edit"),
              onDelete: () => void onDelete(),
              onDuplicate: () => undefined,
              onRefresh: () => void onRefresh(),
            }}
          />

          <fieldset disabled={readOnly} className="mx-6 rounded-gms-md bg-gms-surface px-6 py-6">
            <div className="grid grid-cols-1 gap-x-4 gap-y-6 md:grid-cols-[150px_1fr]">
              <Field label="Doc Date" required error={formState.errors.docDate?.message}>
                <FormDateInput<MsFormValues> name="docDate" />
              </Field>
              <Field label="Ref." error={formState.errors.ref?.message}>
                <TextInput maxLength={REF_MAX} {...register("ref")} />
              </Field>
            </div>
          </fieldset>

          <div className="mx-6 mt-4 mb-6 flex gap-4 rounded-gms-md bg-gms-surface px-6 py-6">
            <div className="min-w-0 flex-1">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-medium text-[#1C252E]">Item</h2>
                <span className="text-xs text-[#6B7480]">{sources.length} stock{sources.length === 1 ? "" : "s"}</span>
                <span ref={fromStockRef} title={readOnly ? undefined : "Pick our own stock to merge or split"}>
                  <Button variant="dark" size="sm" disabled={readOnly} onClick={openPicker}>
                    From Stock
                  </Button>
                </span>
                <IconButton label="Scan to add" disabled className="bg-[#F6F7F8]">
                  <ScanIcon />
                </IconButton>
              </div>
              <MergeSplitSourceTable sources={sources} currency={currency} />

              <hr className="my-8 border-t-[3px] border-[#EDEDED]" />

              <div className="mb-4 flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-medium text-[#1C252E]">Result</h2>
                <span className="text-xs text-[#6B7480]">{rows.length} row{rows.length === 1 ? "" : "s"}</span>
                <MergeSplitModeChip mode={mode} />
                {checked.size > 0 && !readOnly && mode === "SPLIT" && (
                  <Button size="sm" variant="danger-outline" onClick={() => apply(removeRows(getValues(), checked))}>
                    <Trash2 className="size-4" /> Remove {checked.size} selected
                  </Button>
                )}
                {formState.errors.rows?.message && <span className="text-sm text-[#E5484D]">{String(formState.errors.rows.message)}</span>}
              </div>
              {mismatch && (
                <p role="alert" data-ms-mismatch className="mb-4 rounded-gms-md border border-[#F0C987] bg-[#FFF8E6] px-4 py-3 text-sm text-[#B45309]">
                  {mismatch}
                </p>
              )}
              <div className="flex items-start gap-4">
                <MergeSplitPhotoBox row={selectedRow} index={selectedIndex >= 0 ? selectedIndex : null} />
                <div className="min-w-0 flex-1">
                  <MergeSplitResultTable
                    values={{ mode, rows, sources }}
                    currency={currency}
                    locations={options.data?.locations ?? []}
                    readOnly={readOnly}
                    selectedKey={selectedKey}
                    checkedKeys={checked}
                    rowErrors={rowErrors}
                    onSelect={(index) => setSelectedKey(rows[index]?.key ?? null)}
                    onOpenPanel={(index) => {
                      setSelectedKey(rows[index]?.key ?? null);
                      setPanelOpen(true);
                      setRail(null);
                    }}
                    onToggleCheck={(key) =>
                      setChecked((prev) => {
                        const next = new Set(prev);
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        return next;
                      })
                    }
                    onToggleAll={(all) => setChecked(all ? new Set(rows.map((row) => row.key)) : new Set())}
                    onRemove={(key) => apply(removeRows(getValues(), new Set([key])))}
                    onChange={updateRow}
                    onSplit={(sourceKey) => apply(addSplitChild(getValues(), sourceKey))}
                    onRemoveSource={(sourceKey) => void removeGroup(sourceKey)}
                    onPickEmpty={openPicker}
                  />
                </div>
              </div>

              <fieldset disabled={readOnly} className="mt-6 flex flex-col gap-10 pb-6 lg:flex-row">
                <DocumentNote placeholder="e.g. Split for two showroom trays." hint={MS_NOTE_HINT} max={NOTE_MAX} />
              </fieldset>
            </div>

            {!panelOpen && <RailButtons active={rail} onChange={setRail} />}
            {panelOpen && selectedRow && (
              <ItemEditorDock>
                <MergeSplitRowPanel
                  row={selectedRow}
                  index={selectedIndex}
                  total={rows.length}
                  values={{ mode, rows, sources }}
                  locations={options.data?.locations ?? []}
                  currency={currency}
                  readOnly={readOnly}
                  errors={formState.isSubmitted ? rowFieldErrors(formState.errors, selectedIndex) : {}}
                  onChange={(patch) => updateRow(selectedIndex, patch)}
                  onPrev={() => setSelectedKey(rows[Math.max(0, selectedIndex - 1)]?.key ?? null)}
                  onNext={() => setSelectedKey(rows[Math.min(rows.length - 1, selectedIndex + 1)]?.key ?? null)}
                  onRemove={() => (mode === "SPLIT" ? apply(removeRows(getValues(), new Set([selectedRow.key]))) : setPanelOpen(false))}
                  onClose={() => setPanelOpen(false)}
                />
              </ItemEditorDock>
            )}
          </div>
        </div>

        {rail && !panelOpen && (
          <div className="absolute top-4 right-16 bottom-4 z-30 w-[440px] max-w-[calc(100%-5rem)]">
            {rail === "daybook" ? (
              <SidePanel title="Daybook" subtitle="Chronological daybook of all system activities." onClose={() => setRail(null)} className="h-full">
                <MergeSplitDaybook requireApproval={approvalFlow.requireApproval} />
              </SidePanel>
            ) : (
              <SidePanel title="Summary Value" subtitle="Source stocks against the new stocks." onClose={() => setRail(null)} className="h-full">
                <dl className="grid grid-cols-3 gap-y-3 px-5 py-4 text-sm" data-ms-summary>
                  <dt className="text-[#6B7480]" />
                  <dd className="text-right text-[#6B7480]">Source</dd>
                  <dd className="text-right text-[#6B7480]">Result</dd>
                  <dt className="text-[#6B7480]">Pcs</dt>
                  <dd className="text-right tabular-nums">{sourceSum.pcs}</dd>
                  <dd className="text-right tabular-nums">{resultSum.pcs}</dd>
                  <dt className="text-[#6B7480]">Weight (ct)</dt>
                  <dd className="text-right tabular-nums">{nf.weight(toFixed(sourceSum.weightCt, 3))}</dd>
                  <dd className="text-right tabular-nums">{nf.weight(toFixed(resultSum.weightCt, 3))}</dd>
                  <dt className="font-medium">Cost ({currency})</dt>
                  <dd className="text-right font-medium tabular-nums">{nf.money(toFixed(sourceSum.cost, 2))}</dd>
                  <dd className="text-right font-medium tabular-nums">{nf.money(toFixed(resultSum.cost, 2))}</dd>
                </dl>
              </SidePanel>
            )}
          </div>
        )}
      </div>

      {pickerOpen && (
        <MemoStockModal
          source="merge-split"
          title="Add From Stock"
          showPrice={false}
          emptyText="No own stock available"
          pickedIds={new Set(sources.map((source) => source.stockUuid))}
          locations={options.data?.locations ?? []}
          excludeDocId={detail?.id}
          currency={currency}
          onCancel={closePicker}
          onConfirm={onPicked}
        />
      )}
      {pickerOpen && picked && (
        <MergeSplitModeDialog picked={picked} existing={sources} documentMode={mode} currency={currency} busy={adding} onBack={() => setPicked(null)} onCreate={(pickMode) => void onCreate(pickMode)} />
      )}
      {confirmDialog}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </FormProvider>
  );
}
