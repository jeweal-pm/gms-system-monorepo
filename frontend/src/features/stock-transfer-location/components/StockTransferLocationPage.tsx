"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { ScanIcon } from "@/components/ui/scan-icon";
import { useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import { useTabDirty, useTabDocument, useTabReplace } from "@/features/home/tabs/tab-host";
import { QuotationHeader } from "@/features/quotation/components/header/QuotationHeader";
import { RailButtons, type RailPanel } from "@/features/quotation/components/rail/RightRail";
import { Button, Field, FormDateInput, IconButton, SidePanel, TextInput, Toast } from "@/features/quotation/components/ui";
import { DISCARD_CHANGES_CONFIRM, deleteDocumentConfirm, useConfirm } from "@/features/quotation/components/use-confirm";
import { add, dec, toFixed } from "@/features/quotation/lib/decimal";
import { todayIso } from "@/features/quotation/lib/format";
import type { QuotationStatus } from "@/features/quotation/schema";
import { useDocumentFlow } from "@/features/trade-document/approval-flow";
import { clearNotice, DeletedBanner, DocumentDaybook, handOverNotice, peekNotice, useDocumentAccess, type DaybookState, type DocumentAccess } from "@/features/trade-document/document-api";
import { savedMessage } from "@/features/trade-document/flow-status";
import { MemoStockModal, transferLotKey } from "@/features/trade-document/memo-stock-modal";
import { readDomainError } from "@/lib/trpc-error";
import {
  lookupScan,
  mapTransferSaveError,
  scanMessage,
  STOCK_TRANSFER_HREF,
  stockTransferHref,
  transferFlow,
  transferLoadError,
  useTransferDaybook,
  useTransferDetail,
  useTransferNextNumber,
  useTransferOptions,
  useTransferWrites,
  type TransferOut,
} from "../api";
import {
  addLots,
  emptyTransfer,
  fromTransfer,
  invalidMessage,
  ISSUE_TEXT,
  isValid,
  pcsPatch,
  pickedStockUuids,
  REF_MAX,
  removeRows,
  toTransferInput,
  validateTransfer,
  type TransferFormValues,
  type TransferRow,
} from "../form";
import type { StockLot } from "../types";
import { TransferTable } from "./transfer-table";

export const TRANSFER_DENIED = "You don't have permission to view Stock Transfer Location.";
export const TRANSFER_NOT_FOUND = "Stock Transfer Location not found.";
export const TRANSFER_DELETED_TEXT = "This Stock Transfer Location was deleted";
export const FROM_STOCK_TITLE = "From Stock";
export const FROM_STOCK_EMPTY = "No stock with on hand to move.";

const message = "p-10 text-gms-body text-gms-text-secondary";

/** `/inventory/stock-transfer-location` — a new transfer (FE-STL-001). */
export function StockTransferLocationPage() {
  const access = useDocumentAccess("stock-transfer-location");
  if (!access) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>{TRANSFER_DENIED}</p>;
  return <StockTransferForm access={access} />;
}

/** `/inventory/stock-transfer-location/[id]` — a saved one; it remounts on every new server version. */
export function EditStockTransferLocationPage({ id }: { id: string }) {
  const access = useDocumentAccess("stock-transfer-location");
  const detail = useTransferDetail(access?.view ? id : null);
  if (!access || (access.view && detail.isPending)) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>{TRANSFER_DENIED}</p>;
  if (detail.isError || !detail.data) return <p className={message}>{detail.error ? transferLoadError(detail.error) : TRANSFER_NOT_FOUND}</p>;
  return <StockTransferForm key={`${id}:${detail.data.version}:${detail.data.deleted}`} access={access} detail={detail.data} />;
}

/** Daybook rows (ADR-0050 D6): the Ref. under the number, the Revise / Reject note when there is one. */
export function transferDaybookState(list: ReturnType<typeof useTransferDaybook>): DaybookState {
  return {
    isPending: list.isPending,
    isError: list.isError,
    errorMessage: list.error ? transferLoadError(list.error, "transfers") : undefined,
    items: (list.data?.pages ?? []).flatMap((page) =>
      page.items.map((item) => ({
        id: item.id,
        docNo: item.docNo || "—",
        docDate: item.docDate,
        status: item.status,
        name: item.ref || `${item.lineCount} item${item.lineCount === 1 ? "" : "s"}`,
        note: item.status === "REVISION_REQUESTED" || item.status === "REJECTED" ? (item.reviewNote ?? undefined) : undefined,
      })),
    ),
    hasMore: list.hasNextPage,
    loadingMore: list.isFetchingNextPage,
    onLoadMore: () => void list.fetchNextPage(),
  };
}

function TransferDaybook({ requireApproval }: { requireApproval: boolean | undefined }) {
  const list = useTransferDaybook();
  return <DocumentDaybook requireApproval={requireApproval} plural="transfers" href={stockTransferHref} state={transferDaybookState(list)} />;
}

/** Totals of the amounts typed to move (Summary rail). */
export function transferTotals(rows: readonly TransferRow[]) {
  return {
    rowCount: rows.length,
    pcs: rows.reduce((sum, row) => sum + (/^\d+$/.test(row.pcs.trim()) ? Number(row.pcs) : 0), 0),
    weightCt: add(...rows.map((row) => (/^\d+(\.\d+)?$/.test(row.weightCt.trim()) ? dec(row.weightCt) : dec("0")))),
  };
}

/**
 * stock-transfer-location UI (ADR-0060 D12, owner images 01–03): header, Doc Date / Ref., the Item card with From
 * Stock and barcode scan, the transfer grid, Daybook / Summary rail and the approval flow (ADR-0050).
 */
export function StockTransferForm({ access, detail }: { access: DocumentAccess; detail?: TransferOut }) {
  const nf = useNumberFormat();
  const replaceTab = useTabReplace();
  const initial = useMemo(() => (detail ? fromTransfer(detail) : emptyTransfer(todayIso())), [detail]);
  const form = useForm<TransferFormValues>({ defaultValues: initial });
  const { control, getValues, setValue, reset, formState, setError, clearErrors, register } = form;
  const values = useWatch({ control }) as TransferFormValues;
  const rows = useMemo(() => values.rows ?? [], [values.rows]);

  const [mode, setMode] = useState<"view" | "edit">(detail ? "view" : "edit");
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<ReadonlyMap<string, string>>(new Map());
  const [rail, setRail] = useState<RailPanel>(null);
  const [toast, setToast] = useState<string | null>(() => peekNotice(detail?.id));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanText, setScanText] = useState("");
  const [scanning, setScanning] = useState(false);
  const fromStockRef = useRef<HTMLSpanElement>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const deleted = detail?.deleted ?? false;
  const readOnly = mode === "view" || deleted;
  const isNew = !detail;
  const options = useTransferOptions();
  const nextNumber = useTransferNextNumber(values.docDate ?? "", isNew && access.add);
  const writes = useTransferWrites();

  const reload = async (text: string) => {
    if (detail) handOverNotice(detail.id, text);
    setMode("view");
    await writes.invalidate();
  };

  const showError = (error: unknown) => {
    const outcome = mapTransferSaveError(error, getValues());
    for (const field of outcome.fieldErrors) setError(field.name, { type: "server", message: field.message });
    setRowErrors(new Map(outcome.rowErrors.map((entry) => [entry.key, entry.message])));
    setToast(outcome.message);
    if (outcome.refetch && detail) void reload(outcome.message);
    else if (outcome.refetchStock) void writes.invalidate();
  };

  const approvalFlow = useDocumentFlow({
    type: "stock-transfer-location",
    saved: detail ? { id: detail.id, docNo: detail.docNo ?? undefined, version: detail.version } : undefined,
    flow: detail ? transferFlow(detail) : null,
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

  const setRows = (next: TransferRow[]) => {
    setValue("rows", next, { shouldDirty: true });
    setChecked((prev) => new Set([...prev].filter((key) => next.some((row) => row.key === key))));
    setRowErrors((prev) => new Map([...prev].filter(([key]) => next.some((row) => row.key === key))));
  };

  const patchRow = (key: string, patch: Partial<TransferRow>) => {
    const current = getValues("rows");
    setValue(
      "rows",
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
      { shouldDirty: true },
    );
    setRowErrors((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  };

  const addPicked = (lots: readonly StockLot[]) => {
    const result = addLots(getValues(), lots);
    setRows(result.values.rows);
    return result;
  };

  const onWriteError = async (error: unknown, action: "save" | "delete") => {
    // The transfer's own IN_USE / STATUS texts before the shared ADR-0050 codes.
    const code = readDomainError(error).domainCode;
    if (code !== "STOCK_TRANSFER_IN_USE" && code !== "STOCK_TRANSFER_STATUS" && (await approvalFlow.handleError(error, action))) return;
    showError(error);
  };

  const onSave = async () => {
    clearErrors();
    const current = getValues();
    const issues = validateTransfer(current);
    if (!isValid(issues)) {
      if (issues.docDate) setError("docDate", { type: "required", message: "Required" });
      setRowErrors(new Map(issues.rows.map((entry) => [entry.key, ISSUE_TEXT[entry.issue]])));
      setToast(invalidMessage(issues));
      return;
    }
    setRowErrors(new Map());
    const input = toTransferInput(current);
    try {
      if (detail) {
        const result = await writes.update(detail.id, { ...input, expectedVersion: detail.version });
        const text = savedMessage(detail.docNo ?? undefined, { status: result.status, autoApproved: result.status === "APPROVED" });
        handOverNotice(detail.id, text);
        setToast(text);
        setMode("view");
        await writes.invalidate();
      } else {
        const result = await writes.create(input);
        handOverNotice(result.id, savedMessage(result.docNo ?? undefined, { status: result.status, autoApproved: result.status === "APPROVED" }));
        await writes.invalidate();
        replaceTab(stockTransferHref(result.id));
      }
    } catch (error) {
      await onWriteError(error, "save");
    }
  };

  const onCancel = async () => {
    if (formState.isDirty && !(await confirm(DISCARD_CHANGES_CONFIRM))) return;
    reset(initial);
    setMode(detail ? "view" : "edit");
    setChecked(new Set());
    setRowErrors(new Map());
  };

  const onDelete = async () => {
    if (!detail || !(await confirm(deleteDocumentConfirm(detail.docNo ?? undefined)))) return;
    try {
      await writes.remove({ id: detail.id, expectedVersion: detail.version });
      await writes.invalidate();
      replaceTab(STOCK_TRANSFER_HREF);
    } catch (error) {
      await onWriteError(error, "delete");
    }
  };

  const onRestore = async () => {
    if (!detail) return;
    try {
      await writes.restore({ id: detail.id, expectedVersion: detail.version });
      await reload("Restored");
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
    requestAnimationFrame(() => fromStockRef.current?.querySelector("button")?.focus());
  };

  const onScan = async () => {
    const code = scanText.trim();
    if (!code || scanning) return;
    setScanning(true);
    try {
      const result = await lookupScan(code, pickedStockUuids(getValues()));
      if (result.kind === "found") {
        const added = addPicked([result.lot]);
        setToast(added.added > 0 ? `Added ${result.lot.attrs.stoneCode || code}` : "A transfer can have up to 200 rows");
        setScanText("");
      } else {
        setToast(scanMessage(code, result));
      }
    } catch (error) {
      setToast(transferLoadError(error, "stock"));
    } finally {
      setScanning(false);
    }
  };

  const status = detail ? (detail.status as QuotationStatus) : undefined;
  const totals = transferTotals(rows);
  const picked = pickedStockUuids({ rows });

  return (
    <FormProvider {...form}>
      <div className="relative flex h-full bg-gms-page">
        <div className="min-w-0 flex-1 overflow-y-auto">
          {deleted && <DeletedBanner text={TRANSFER_DELETED_TEXT} canRestore={access.delete} busy={writes.busy} onRestore={() => void onRestore()} />}
          <QuotationHeader
            noLabel="Transfer Location No.:"
            newHref={STOCK_TRANSFER_HREF}
            docNo={detail?.docNo ?? nextNumber.data?.docNo ?? "—"}
            isPreview={isNew}
            status={status}
            statusLabels={approvalFlow.statusLabels}
            statusNote={approvalFlow.statusNote}
            hideEditDelete={approvalFlow.hideEditDelete}
            extraActions={approvalFlow.sendButton}
            mode={deleted ? "view" : mode}
            saving={writes.busy}
            canSave={!deleted && (detail ? access.edit : access.add)}
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
            <div className="grid grid-cols-1 gap-x-4 gap-y-6 md:grid-cols-[200px_1fr]">
              <Field label="Doc Date" required error={formState.errors.docDate?.message}>
                <FormDateInput<TransferFormValues> name="docDate" />
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
                <span className="text-xs text-[#6B7480]">
                  {rows.length} item{rows.length === 1 ? "" : "s"}
                </span>
                <span ref={fromStockRef}>
                  <Button variant="dark" size="sm" disabled={readOnly} onClick={openPicker}>
                    From Stock
                  </Button>
                </span>
                <IconButton label="Scan to add" disabled={readOnly} className="bg-[#F6F7F8]" aria-expanded={scanOpen} onClick={() => setScanOpen((open) => !open)}>
                  <ScanIcon />
                </IconButton>
                {scanOpen && !readOnly && (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void onScan();
                    }}
                  >
                    <TextInput compact autoFocus aria-label="Scan or type a Stock ID, lot or stone code" placeholder="Scan barcode" maxLength={100} value={scanText} onChange={(event) => setScanText(event.target.value)} className="w-[240px]" />
                    <Button size="sm" type="submit" disabled={scanning || !scanText.trim()}>
                      {scanning ? "Adding…" : "Add"}
                    </Button>
                  </form>
                )}
                {checked.size > 0 && !readOnly && (
                  <Button size="sm" variant="danger-outline" onClick={() => setRows(removeRows(getValues(), checked).rows)}>
                    <Trash2 className="size-4" /> Remove {checked.size} selected
                  </Button>
                )}
              </div>
              <TransferTable
                rows={rows}
                locations={options.data?.locations ?? []}
                readOnly={readOnly}
                checkedKeys={checked}
                rowErrors={rowErrors}
                onToggleCheck={(key) =>
                  setChecked((prev) => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  })
                }
                onToggleAll={(all) => setChecked(all ? new Set(rows.map((row) => row.key)) : new Set())}
                onRemove={(key) => setRows(removeRows(getValues(), new Set([key])).rows)}
                onLocation={(key, toLocation) => patchRow(key, { toLocation })}
                onPcs={(key, text) => {
                  const row = getValues("rows").find((entry) => entry.key === key);
                  if (row) patchRow(key, pcsPatch(row, text));
                }}
                onWeight={(key, weightCt) => patchRow(key, { weightCt })}
                onPickEmpty={openPicker}
              />
            </div>
            <RailButtons active={rail} onChange={setRail} />
          </div>
        </div>

        {rail && (
          <div className="absolute top-4 right-16 bottom-4 z-30 w-[440px] max-w-[calc(100%-5rem)]">
            {rail === "daybook" ? (
              <SidePanel title="Daybook" subtitle="Chronological daybook of all system activities." onClose={() => setRail(null)} className="h-full">
                <TransferDaybook requireApproval={approvalFlow.requireApproval} />
              </SidePanel>
            ) : (
              <SidePanel title="Summary Value" subtitle="Totals of the amounts to move." onClose={() => setRail(null)} className="h-full">
                <dl className="grid grid-cols-2 gap-y-3 px-5 py-4 text-sm">
                  <dt className="text-[#6B7480]">Rows</dt>
                  <dd className="text-right">{totals.rowCount}</dd>
                  <dt className="text-[#6B7480]">Pcs</dt>
                  <dd className="text-right tabular-nums">{totals.pcs}</dd>
                  <dt className="text-[#6B7480]">Weight (ct)</dt>
                  <dd className="text-right tabular-nums">{nf.weight(toFixed(totals.weightCt, 3))}</dd>
                </dl>
              </SidePanel>
            )}
          </div>
        )}
      </div>

      {pickerOpen && (
        <MemoStockModal
          source="stock-transfer-location"
          title={FROM_STOCK_TITLE}
          showPrice={false}
          emptyText={FROM_STOCK_EMPTY}
          exclude={picked}
          pickedIds={new Set(rows.map((row) => transferLotKey({ lotKey: row.lotKey, stockUuid: row.stockUuid })))}
          onCancel={closePicker}
          onConfirm={(lots) => {
            const result = addPicked(lots);
            closePicker();
            if (result.added > 0) setToast(`Added ${result.added} item${result.added === 1 ? "" : "s"}${result.skipped > 0 ? ` (${result.skipped} skipped)` : ""}`);
          }}
        />
      )}
      {confirmDialog}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </FormProvider>
  );
}
