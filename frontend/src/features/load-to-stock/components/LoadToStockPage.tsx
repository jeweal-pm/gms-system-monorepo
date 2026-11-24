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
import { Button, Field, FormDateInput, FormSelect, IconButton, ReadonlyBox, SidePanel, TextInput, Toast, type Option } from "@/features/quotation/components/ui";
import { DISCARD_CHANGES_CONFIRM, deleteDocumentConfirm, useConfirm } from "@/features/quotation/components/use-confirm";
import { toFixed } from "@/features/quotation/lib/decimal";
import { todayIso } from "@/features/quotation/lib/format";
import type { QuotationStatus } from "@/features/quotation/schema";
import { useDocumentFlow } from "@/features/trade-document/approval-flow";
import { clearNotice, DocumentDaybook, DocumentDeletedBanner, handOverNotice, peekNotice, useDocumentAccess, type DaybookState, type DocumentAccess } from "@/features/trade-document/document-api";
import { savedMessage, type DocFlow } from "@/features/trade-document/flow-status";
import { readDomainError } from "@/lib/trpc-error";
import {
  addedToast,
  addSplitChild,
  applyPick,
  emptyLoad,
  firstRowIssue,
  fromLoad,
  highestPriced,
  invalidMessage,
  LOAD_TO_STOCK_HREF,
  loadLoadError,
  loadSchema,
  loadToStockApi,
  loadToStockHref,
  loadTotals,
  mapLoadSaveError,
  NO_COMPANY_CURRENCY,
  NOTE_MAX,
  REF_MAX,
  removeRows,
  removeSource,
  toLoadInput,
  useLoadDaybook,
  useLoadDetail,
  useLoadOptions,
  useLoadVendors,
  useLoadWrites,
  useNextNumber,
  validateLoad,
  type LoadFormValues,
  type LoadOut,
  type LoadRowValues,
  holdersText,
} from "../api";
import type { LoadMode, PurchaseLineRef } from "../types";
import { LoadModeDialog } from "./load-mode-dialog";
import { LoadPhotoBox, LoadRowPanel } from "./load-row-panel";
import { LoadSourceTable } from "./load-source-table";
import { LoadModeChip, LoadTable } from "./load-table";
import { PurchaseLinePicker } from "./purchase-line-picker";

export const LOAD_DENIED = "You don't have permission to view Load to Stock.";
export const LOAD_NOT_FOUND = "Load to Stock not found.";
export const LOAD_NOTE_HINT = "Kept with this load; not printed";
export const CHOOSE_ACCOUNT_FIRST = "Choose an account first";
export const ACCOUNT_LOCKED_HINT = "Empty the Load table to change the account";
export const IN_USE_NOTE = "Some stock from this load is already used · Read-only";
/** SA rev 2: the in-use note names the documents holding the stock (≤ 5) when the load detail lists them. */
export const inUseNote = (holders: Parameters<typeof holdersText>[0]) => {
  const by = holdersText(holders);
  return by ? `Some stock from this load is already used by ${by} · Read-only` : IN_USE_NOTE;
};
export const SYNCING_NOTE = "Saving in progress — refreshing";
/** ADR-0052 D14: at most 3 photo transfers at a time. */
export const PHOTO_COPY_CONCURRENCY = 3;

const message = "p-10 text-gms-body text-gms-text-secondary";

/** `/inventory/load-to-stock` — a new Load to Stock (FE-LS-002). */
export function LoadToStockPage() {
  const access = useDocumentAccess("load-to-stock");
  if (!access) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>{LOAD_DENIED}</p>;
  return <LoadToStockForm access={access} />;
}

/** `/inventory/load-to-stock/[id]` — a saved one; it remounts on every new server version. */
export function EditLoadToStockPage({ id }: { id: string }) {
  const access = useDocumentAccess("load-to-stock");
  const detail = useLoadDetail(access?.view ? id : null);
  if (!access || (access.view && detail.isPending)) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>{LOAD_DENIED}</p>;
  if (detail.isError || !detail.data) return <p className={message}>{detail.error ? loadLoadError(detail.error) : LOAD_NOT_FOUND}</p>;
  return <LoadToStockForm key={`${id}:${detail.data.version}`} access={access} detail={detail.data} />;
}

/** `LoadOut` → the shared ADR-0050 `Flow`: Edit / Delete off while some stock is used or a sync runs (D9). */
export function loadFlow(detail: LoadOut): DocFlow {
  const changeable = !detail.inUse && !detail.syncing;
  return {
    status: detail.status,
    autoApproved: detail.approval.autoApproved,
    revisionCount: detail.approval.revisionCount,
    canEdit: changeable,
    canDelete: changeable,
    canSubmit: detail.approval.requireApproval,
    usedBy: null,
    review: detail.approval.review ? { action: detail.approval.review.action, note: detail.approval.review.note, at: detail.approval.review.at, byName: detail.approval.review.byName } : null,
  };
}

/** Lines whose PU photos are copied on a pick (owner Q-LS-14): every line, or a new merged row's suggested line. */
export function photoLines(picked: readonly PurchaseLineRef[], mode: LoadMode, hasMergedRow: boolean): PurchaseLineRef[] {
  if (mode === "MERGE") {
    if (hasMergedRow) return [];
    const best = highestPriced(picked);
    return best && best.photoCount > 0 ? [best] : [];
  }
  return picked.filter((ref) => ref.photoCount > 0);
}

/** Copies the PU line photos, ≤ 3 at a time; a line whose copy fails starts without photos. */
export async function copyLinePhotos(lines: readonly PurchaseLineRef[], copy: (purchaseLineId: string) => Promise<{ ids: string[] }>, limit = PHOTO_COPY_CONCURRENCY) {
  const result = new Map<string, string[]>();
  let failed = 0;
  for (let start = 0; start < lines.length; start += limit) {
    const batch = lines.slice(start, start + limit);
    const settled = await Promise.allSettled(batch.map((ref) => copy(ref.purchaseLineId)));
    settled.forEach((outcome, offset) => {
      if (outcome.status === "fulfilled") result.set(batch[offset]!.purchaseLineId, outcome.value.ids);
      else failed += 1;
    });
  }
  return { photos: result, failed };
}

/** R-01 Daybook rows (ADR-0050 D6): the Revise / Reject note under the vendor. */
export function loadDaybookState(list: ReturnType<typeof useLoadDaybook>): DaybookState {
  return {
    isPending: list.isPending,
    isError: list.isError,
    errorMessage: list.error ? loadLoadError(list.error, "loads") : undefined,
    items: (list.data?.pages ?? []).flatMap((page) =>
      page.items.map((item) => ({
        id: item.id,
        docNo: item.docNo,
        docDate: item.docDate,
        status: item.status,
        name: item.vendorName,
        note: item.status === "REVISION_REQUESTED" || item.status === "REJECTED" ? (item.reviewNote ?? undefined) : undefined,
      })),
    ),
    hasMore: list.hasNextPage,
    loadingMore: list.isFetchingNextPage,
    onLoadMore: () => void list.fetchNextPage(),
  };
}

function LoadDaybook({ requireApproval }: { requireApproval: boolean | undefined }) {
  const list = useLoadDaybook();
  return <DocumentDaybook requireApproval={requireApproval} plural="loads" href={loadToStockHref} state={loadDaybookState(list)} />;
}

/** Field errors of one row (for the row panel). */
function rowFieldErrors(errors: unknown, index: number): Partial<Record<string, string>> {
  const row = (errors as { rows?: Record<number, Record<string, { message?: unknown } | undefined> | undefined> } | undefined)?.rows?.[index];
  if (!row) return {};
  return Object.fromEntries(Object.entries(row).flatMap(([field, value]) => (typeof value?.message === "string" ? [[field, value.message]] : [])));
}

/**
 * load-to-stock UI rev 1 on SA rev 1 (owner 2026-11-17): header (H-01…05, I-01…04), Item table (T-04), Load table
 * (None / Split / Merge), row panel, Document Note, Daybook / Summary rail, approval flow (ADR-0050) and the pickers.
 */
export function LoadToStockForm({ access, detail }: { access: DocumentAccess; detail?: LoadOut }) {
  const nf = useNumberFormat();
  const replaceTab = useTabReplace();
  const initial = useMemo(() => (detail ? fromLoad(detail) : emptyLoad(todayIso())), [detail]);
  const form = useForm<LoadFormValues>({ resolver: zodResolver(loadSchema as never) as unknown as Resolver<LoadFormValues>, defaultValues: initial });
  const { control, getValues, setValue, reset, handleSubmit, formState, setError, clearErrors, register } = form;
  const values = useWatch({ control }) as LoadFormValues;
  const rows = useMemo(() => values.rows ?? [], [values.rows]);
  const sources = useMemo(() => values.sources ?? [], [values.sources]);

  const [mode, setMode] = useState<"view" | "edit">(detail ? "view" : "edit");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [rail, setRail] = useState<RailPanel>(null);
  const [toast, setToast] = useState<string | null>(() => peekNotice(detail?.id));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked] = useState<PurchaseLineRef[] | null>(null);
  const [adding, setAdding] = useState(false);
  const fromPurchaseRef = useRef<HTMLSpanElement>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const deleted = detail?.deleted ?? null;
  const readOnly = mode === "view" || Boolean(deleted) || Boolean(detail?.syncing);
  const isNew = !detail;
  const options = useLoadOptions();
  const currency = options.data?.companyCurrency ?? detail?.currency ?? "";
  const nextNumber = useNextNumber(values.docDate ?? "", isNew && access.add);
  const vendors = useLoadVendors("", !readOnly);
  const writes = useLoadWrites();

  const vendorOptions: Option[] = useMemo(() => {
    const list = (vendors.data?.pages ?? []).flatMap((page) => page.items).map((vendor) => ({ value: vendor.id, label: `${vendor.code} · ${vendor.name}` }));
    if (detail && !list.some((option) => option.value === detail.vendor.id)) list.unshift({ value: detail.vendor.id, label: `${detail.vendor.code} · ${detail.vendor.name}` });
    return list;
  }, [vendors.data, detail]);

  const reload = async (text: string) => {
    if (detail) handOverNotice(detail.id, text);
    setMode("view");
    await writes.invalidate();
  };

  const showError = (error: unknown) => {
    const outcome = mapLoadSaveError(error, getValues());
    for (const field of outcome.fieldErrors) setError(field.name as Path<LoadFormValues>, { type: "server", message: field.message });
    setToast(outcome.message);
    if (outcome.pendingId && !detail) {
      handOverNotice(outcome.pendingId, outcome.message);
      void writes.invalidate().then(() => replaceTab(loadToStockHref(outcome.pendingId!)));
    } else if (outcome.refetch && detail) void reload(outcome.message);
    else if (outcome.refetchPicker) void writes.invalidate();
  };

  const approvalFlow = useDocumentFlow({
    type: "load-to-stock",
    saved: detail ? { id: detail.id, docNo: detail.docNo, version: detail.version } : undefined,
    flow: detail ? loadFlow(detail) : null,
    deleted: Boolean(deleted),
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

  useTabDocument(detail?.docNo);
  useTabDirty(formState.isDirty && !readOnly);
  useEffect(() => clearNotice(detail?.id), [detail?.id]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);
  // `syncing` (a master sync in progress): read-only, refetched after 5 s (error-handling LOAD_TO_STOCK_BUSY).
  const { invalidate } = writes;
  useEffect(() => {
    if (!detail?.syncing) return undefined;
    const timer = setTimeout(() => void invalidate(), 5000);
    return () => clearTimeout(timer);
  }, [detail?.syncing, invalidate]);

  /** A structural change (pick, remove, split): rows' indexes move, so old row errors are cleared. */
  const apply = (next: LoadFormValues) => {
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

  const updateRow = (index: number, patch: Partial<LoadRowValues>) => {
    const current = getValues(`rows.${index}`);
    if (!current) return;
    setValue(`rows.${index}`, { ...current, ...patch }, { shouldDirty: true, shouldValidate: formState.isSubmitted });
  };

  const onWriteError = async (error: unknown, action: "save" | "delete") => {
    // Load to Stock's own "in use" text (error-handling) before the shared ADR-0050 codes.
    if (readDomainError(error).domainCode !== "LOAD_TO_STOCK_IN_USE" && (await approvalFlow.handleError(error, action))) return;
    showError(error);
  };

  const onSave = handleSubmit(
    async (valid) => {
      const input = toLoadInput(valid);
      try {
        if (detail) {
          const result = await writes.update(detail.id, { ...input, expectedVersion: detail.version });
          const text = savedMessage(detail.docNo, { status: result.status, autoApproved: result.status === "APPROVED" });
          handOverNotice(detail.id, text);
          setToast(text);
          setMode("view");
          await writes.invalidate();
        } else {
          const result = await writes.create(input);
          handOverNotice(result.id, savedMessage(result.docNo, { status: result.status, autoApproved: result.status === "APPROVED" }));
          await writes.invalidate();
          replaceTab(loadToStockHref(result.id));
        }
      } catch (error) {
        await onWriteError(error, "save");
      }
    },
    () => {
      // INV-20261102-003: name the first bad row and open it.
      const issues = validateLoad(getValues());
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
    setMode(detail ? "view" : "edit");
    setPanelOpen(false);
    setChecked(new Set());
  };

  const onDelete = async () => {
    if (!detail || !(await confirm(deleteDocumentConfirm(detail.docNo)))) return;
    try {
      await writes.remove({ id: detail.id, expectedVersion: detail.version });
      await writes.invalidate();
      replaceTab(LOAD_TO_STOCK_HREF);
    } catch (error) {
      await onWriteError(error, "delete");
    }
  };

  const onRefresh = async () => {
    if (formState.isDirty && !readOnly && !(await confirm(DISCARD_CHANGES_CONFIRM))) return;
    if (formState.isDirty) reset(initial);
    await writes.invalidate();
    setToast("Refreshed");
  };

  const openPicker = () => {
    if (readOnly) return;
    if (!getValues("vendorId")) {
      setToast(CHOOSE_ACCOUNT_FIRST);
      return;
    }
    setPickerOpen(true);
  };
  const closePicker = () => {
    setPickerOpen(false);
    setPicked(null);
    requestAnimationFrame(() => fromPurchaseRef.current?.querySelector("button")?.focus());
  };

  const onCreate = async (loadMode: LoadMode) => {
    if (!picked) return;
    setAdding(true);
    const current = getValues();
    const { photos, failed } = await copyLinePhotos(photoLines(picked, loadMode, current.mode === "MERGE" && current.rows.length > 0), loadToStockApi.photosFromPurchaseLine);
    apply(applyPick(getValues(), picked, loadMode, photos));
    setAdding(false);
    closePicker();
    setToast(failed > 0 ? `${addedToast(loadMode, picked.length)}. Some PU photos couldn't be copied; add them in the row.` : addedToast(loadMode, picked.length));
  };

  const removeGroup = async (purchaseLineId: string) => {
    const ref = sources.find((source) => source.purchaseLineId === purchaseLineId);
    const ok = await confirm({
      title: `Remove ${ref?.purchase.docNo ?? "this PU line"} from this load?`,
      body: "Its load rows are removed too. The PU line keeps its quantity.",
      cancelLabel: "Cancel",
      confirmLabel: "Remove",
      confirmVariant: "danger",
    });
    if (ok) apply(removeSource(getValues(), purchaseLineId));
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
  const totals = loadTotals({ rows, mode: values.mode ?? "", sources });
  const status = detail ? (detail.status as QuotationStatus) : undefined;
  let statusNote = approvalFlow.statusNote;
  if (detail?.syncing) statusNote = { text: SYNCING_NOTE, tone: "muted" };
  else if (detail?.inUse && !deleted) statusNote = { text: inUseNote(detail.holders), tone: "muted" };

  return (
    <FormProvider {...form}>
      <div className="relative flex h-full bg-gms-page">
        <div className="min-w-0 flex-1 overflow-y-auto">
          {deleted && <DocumentDeletedBanner info={{ at: deleted.at, by: deleted.by }} canRestore={false} busy={writes.busy} onRestore={() => undefined} />}
          <QuotationHeader
            noLabel="Load to Stock No.:"
            newHref={LOAD_TO_STOCK_HREF}
            docNo={detail?.docNo ?? nextNumber.data?.docNo ?? "—"}
            isPreview={isNew}
            status={status}
            statusLabels={approvalFlow.statusLabels}
            statusNote={statusNote}
            hideEditDelete={approvalFlow.hideEditDelete}
            extraActions={approvalFlow.sendButton}
            mode={deleted ? "view" : mode}
            saving={writes.busy}
            canSave={!deleted && !detail?.syncing && (detail ? access.edit : access.add)}
            canCreate={access.add}
            canEdit={approvalFlow.canEdit}
            canDelete={approvalFlow.canDelete}
            canDuplicate={false}
            actions={{
              onCancel: () => void onCancel(),
              onSave: () => void onSave(),
              onEdit: () => setMode("edit"),
              onDelete: () => void onDelete(),
              onDuplicate: () => undefined,
              onRefresh: () => void onRefresh(),
            }}
          />

          <fieldset disabled={readOnly} className="mx-6 rounded-gms-md bg-gms-surface px-6 py-6">
            <div className="grid grid-cols-1 gap-x-4 gap-y-6 md:grid-cols-[150px_1fr_1fr_1fr]">
              <Field label="Doc Date" required error={formState.errors.docDate?.message}>
                <FormDateInput<LoadFormValues> name="docDate" />
              </Field>
              <Field label="Account" required error={formState.errors.vendorId?.message}>
                <span title={sources.length > 0 ? ACCOUNT_LOCKED_HINT : undefined} className="block">
                  <FormSelect<LoadFormValues> name="vendorId" options={vendorOptions} placeholder="Select" disabled={readOnly || sources.length > 0} onOpen={() => void (vendors.hasNextPage ? vendors.fetchNextPage() : null)} />
                </span>
              </Field>
              <Field label="Currency" required error={options.data && !options.data.companyCurrency ? NO_COMPANY_CURRENCY : undefined}>
                <ReadonlyBox value={currency} />
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
                <span className="text-xs text-[#6B7480]">{sources.length} item{sources.length === 1 ? "" : "s"}</span>
                <span ref={fromPurchaseRef} title={readOnly ? undefined : getValues("vendorId") ? "Pick lines of this vendor's approved purchases" : CHOOSE_ACCOUNT_FIRST}>
                  <Button variant="dark" size="sm" disabled={readOnly} onClick={openPicker}>
                    From Purchase
                  </Button>
                </span>
                <IconButton label="Scan to add" disabled className="bg-[#F6F7F8]">
                  <ScanIcon />
                </IconButton>
              </div>
              <LoadSourceTable sources={sources} companyCurrency={currency} />

              <hr className="my-8 border-t-[3px] border-[#EDEDED]" />

              <div className="mb-4 flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-medium text-[#1C252E]">Load</h2>
                <span className="text-xs text-[#6B7480]">{rows.length} row{rows.length === 1 ? "" : "s"}</span>
                <LoadModeChip mode={values.mode ?? ""} />
                {checked.size > 0 && !readOnly && (
                  <Button size="sm" variant="danger-outline" onClick={() => apply(removeRows(getValues(), checked))}>
                    <Trash2 className="size-4" /> Remove {checked.size} selected
                  </Button>
                )}
                {formState.errors.rows?.message && <span className="text-sm text-[#E5484D]">{String(formState.errors.rows.message)}</span>}
              </div>
              <div className="flex items-start gap-4">
                <LoadPhotoBox row={selectedRow} index={selectedIndex >= 0 ? selectedIndex : null} />
                <div className="min-w-0 flex-1">
                  <LoadTable
                    values={{ mode: values.mode ?? "", rows, sources }}
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
                    onSplit={(lineId) => apply(addSplitChild(getValues(), lineId))}
                    onRemoveGroup={(lineId) => void removeGroup(lineId)}
                    onPickEmpty={openPicker}
                  />
                </div>
              </div>

              <fieldset disabled={readOnly} className="mt-6 flex flex-col gap-10 pb-6 lg:flex-row">
                <DocumentNote placeholder="e.g. Loaded into the safe on arrival." hint={LOAD_NOTE_HINT} max={NOTE_MAX} />
              </fieldset>
            </div>

            {!panelOpen && <RailButtons active={rail} onChange={setRail} />}
            {panelOpen && selectedRow && (
              <ItemEditorDock>
                <LoadRowPanel
                  row={selectedRow}
                  index={selectedIndex}
                  total={rows.length}
                  values={{ mode: values.mode ?? "", sources }}
                  options={options.data}
                  currency={currency}
                  readOnly={readOnly}
                  errors={formState.isSubmitted ? rowFieldErrors(formState.errors, selectedIndex) : {}}
                  onChange={(patch) => updateRow(selectedIndex, patch)}
                  onPrev={() => setSelectedKey(rows[Math.max(0, selectedIndex - 1)]?.key ?? null)}
                  onNext={() => setSelectedKey(rows[Math.min(rows.length - 1, selectedIndex + 1)]?.key ?? null)}
                  onRemove={() => apply(removeRows(getValues(), new Set([selectedRow.key])))}
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
                <LoadDaybook requireApproval={approvalFlow.requireApproval} />
              </SidePanel>
            ) : (
              <SidePanel title="Summary Value" subtitle="Totals of the load rows." onClose={() => setRail(null)} className="h-full">
                <dl className="grid grid-cols-2 gap-y-3 px-5 py-4 text-sm">
                  <dt className="text-[#6B7480]">Load rows</dt>
                  <dd className="text-right">{totals.rowCount}</dd>
                  <dt className="text-[#6B7480]">Pcs</dt>
                  <dd className="text-right tabular-nums">{totals.pcs}</dd>
                  <dt className="text-[#6B7480]">Weight (ct)</dt>
                  <dd className="text-right tabular-nums">{nf.weight(toFixed(totals.weightCt, 3))}</dd>
                  <dt className="font-medium">Amount</dt>
                  <dd className="text-right font-medium tabular-nums">
                    {nf.money(toFixed(totals.cost, 2))} {currency}
                  </dd>
                </dl>
              </SidePanel>
            )}
          </div>
        )}
      </div>

      {pickerOpen && (
        <PurchaseLinePicker
          vendorId={values.vendorId ?? ""}
          companyCurrency={currency}
          excludeLineIds={sources.map((ref) => ref.purchaseLineId)}
          excludeAllocationOf={detail?.id}
          suspended={picked !== null}
          onCancel={closePicker}
          onConfirm={setPicked}
        />
      )}
      {pickerOpen && picked && (
        <LoadModeDialog
          picked={picked}
          existing={sources}
          documentMode={values.mode ?? ""}
          currency={currency}
          busy={adding}
          onBack={() => setPicked(null)}
          onCreate={(loadMode) => void onCreate(loadMode)}
        />
      )}
      {confirmDialog}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </FormProvider>
  );
}
