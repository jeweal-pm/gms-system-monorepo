"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ScanIcon } from "@/components/ui/scan-icon";
import { useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import { useTabDirty, useTabDocument, useTabReplace } from "@/features/home/tabs/tab-host";
import { QuotationHeader } from "@/features/quotation/components/header/QuotationHeader";
import { RailButtons, type RailPanel } from "@/features/quotation/components/rail/RightRail";
import { Button, DateBox, Field, IconButton, SelectMenu, SidePanel, TextInput, Toast } from "@/features/quotation/components/ui";
import { useConfirm, DISCARD_CHANGES_CONFIRM, deleteDocumentConfirm } from "@/features/quotation/components/use-confirm";
import { todayIso } from "@/features/quotation/lib/format";
import { useApprovalSetting } from "@/features/trade-document/approval-flow";
import { DeletedBanner, DocumentDaybook, useDocumentAccess, type DaybookState, type DocumentAccess } from "@/features/trade-document/document-api";
import { MemoStockModal } from "@/features/trade-document/memo-stock-modal";
import { readDomainError } from "@/lib/trpc-error";
import { mapAdjustmentWriteError } from "../errors";
import { stockAdjustmentApi, useAdjustmentDetail, useAdjustmentInvalidation, useAdjustmentList, useAdjustmentNumber, useAdjustmentOptions, type AdjustmentOut, type StockLot } from "../api";
import { adjustmentTotals, emptyAdjustment, lineFromStock, adjustmentSchema, ROW_MAX, type AdjustmentForm } from "../form";
import { AdjustmentTable, type PhysicalField } from "./adjustment-table";

const HREF = "/inventory/stock-adjustment";
const denied = "You don't have permission to view Stock Adjustment.";
export const DELETED_TEXT = "This Stock Adjustment was deleted";
export const adjustmentHref = (id: string) => `${HREF}/${encodeURIComponent(id)}`;
const badDate = (value: string) => !/^\d{4}-\d{2}-\d{2}$/.test(value);
const statusLabels = {
  DRAFT: { label: "Draft", tone: "bg-[#EEF0F2] text-[#4B5563]" }, PENDING_APPROVAL: { label: "Pending Approval", tone: "bg-[#FFF4E0] text-[#B45309]" },
  APPROVED: { label: "Approved", tone: "bg-[#E7F7EE] text-[#15803D]" }, REVISION_REQUESTED: { label: "Revise", tone: "bg-[#FFF4E0] text-[#B45309]" }, REJECTED: { label: "Rejected", tone: "bg-[#FDECEC] text-[#B42318]" },
};

export function StockAdjustmentPage() {
  const access = useDocumentAccess("stock-adjustment");
  if (!access) return <p className="p-10 text-sm text-gms-text-secondary">Loading…</p>;
  if (!access.view) return <p className="p-10 text-sm text-gms-text-secondary">{denied}</p>;
  return <AdjustmentEditor access={access} />;
}

export function EditStockAdjustmentPage({ id }:{id:string}) {
  const access = useDocumentAccess("stock-adjustment"); const detail = useAdjustmentDetail(access?.view ? id : null);
  if (!access || (access.view && detail.isPending)) return <p className="p-10 text-sm text-gms-text-secondary">Loading…</p>;
  if (!access.view) return <p className="p-10 text-sm text-gms-text-secondary">{denied}</p>;
  if (detail.isError || !detail.data) return <p role="alert" className="p-10 text-sm text-gms-danger">{readError(detail.error)}</p>;
  return <AdjustmentEditor key={`${id}:${detail.data.version}`} access={access} detail={detail.data} />;
}

function readError(error: unknown) {
  const { domainCode } = readDomainError(error);
  if (domainCode === "PERMISSION_DENIED") return denied;
  if (domainCode === "STOCK_ADJUSTMENT_NOT_FOUND" || domainCode === "NOT_FOUND") return "Stock Adjustment not found.";
  if (domainCode === "UNAUTHORIZED") return "Your session has ended. Sign in again.";
  return "Couldn't load Stock Adjustment. Try again.";
}

type AdjustmentList = ReturnType<typeof useAdjustmentList>;

/** Daybook rows (same right-rail list as Stock Transfer Location): number, Main Location · rows, date, status dot. */
export function adjustmentDaybookState(list: Pick<AdjustmentList, "isPending" | "isError" | "error" | "data" | "hasNextPage" | "isFetchingNextPage" | "fetchNextPage">): DaybookState {
  return {
    isPending: list.isPending,
    isError: list.isError,
    errorMessage: list.error ? "Couldn't load stock adjustments. Try again." : undefined,
    items: (list.data?.pages ?? []).flatMap((page) => page.items.map((item) => ({
      id: item.id, docNo: item.docNo || "—", docDate: item.docDate, status: item.status,
      name: `${item.location} · ${item.lineCount} row${item.lineCount === 1 ? "" : "s"}`,
    }))),
    hasMore: list.hasNextPage,
    loadingMore: list.isFetchingNextPage,
    onLoadMore: () => void list.fetchNextPage(),
  };
}

function AdjustmentDaybook() {
  const list = useAdjustmentList();
  const { requireApproval } = useApprovalSetting("stock-adjustment");
  return <DocumentDaybook requireApproval={requireApproval} plural="adjustments" href={adjustmentHref} state={adjustmentDaybookState(list)} />;
}

function fromDetail(detail: AdjustmentOut): AdjustmentForm {
  return { docDate: detail.docDate, location: detail.location, ref: detail.ref, note: detail.note, lines: detail.lines.map((line) => ({
    id: line.id, key: line.id, stockUuid: line.stockUuid, stockId: line.stockId, lotKey: line.lotKey, refDocNo: line.refDocNo,
    priceUnit: line.priceUnit, stockPcs: line.stockPcs, stockWeightCt: line.stockWeightCt, stockPrice: line.stockPrice,
    physicalPcs: String(line.physicalPcs), physicalWeightCt: line.physicalWeightCt, physicalPrice: line.physicalPrice ?? line.stockPrice,
    remark: line.remark, attrs: line.attrs,
  })) };
}

function AdjustmentEditor({ access, detail }:{ access: DocumentAccess; detail?: AdjustmentOut }) {
  const router = useRouter(); const replaceTab = useTabReplace(); const initial = useMemo(() => detail ? fromDetail(detail) : emptyAdjustment(todayIso()), [detail]);
  const [values, setValues] = useState<AdjustmentForm>(initial); const [editing, setEditing] = useState(!detail && access.add); const [dirty, setDirty] = useState(false);
  const [picker, setPicker] = useState(false); const [selected, setSelected] = useState<Set<string>>(new Set()); const [toast, setToast] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [scan, setScan] = useState(""); const [scanOpen, setScanOpen] = useState(false); const [scanning, setScanning] = useState(false); const [busy, setBusy] = useState(false);
  const [rail, setRail] = useState<RailPanel>(null); const fromStockRef = useRef<HTMLSpanElement>(null); const nf = useNumberFormat();
  const { confirm, dialog } = useConfirm(); const options = useAdjustmentOptions(); const nextNumber = useAdjustmentNumber(values.docDate, !detail && access.add);
  const invalidate = useAdjustmentInvalidation(); const deleted = Boolean(detail?.deleted);
  const readOnly = !editing || (!detail && !access.add) || deleted || detail?.status === "PENDING_APPROVAL" || (detail?.status === "APPROVED" && !detail.autoApproved);

  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 3500); return () => clearTimeout(timer); }, [toast]);
  useTabDocument(detail?.docNo ?? "Stock Adjustment"); useTabDirty(dirty && !readOnly);

  const patch = <K extends keyof AdjustmentForm>(key: K, value: AdjustmentForm[K]) => { setValues((current) => ({ ...current, [key]: value })); setDirty(true); };
  const changeLine = (key: string, field: PhysicalField, value: string) => { setRowErrors((current) => { const next = { ...current }; delete next[key]; return next; }); patch("lines", values.lines.map((line) => line.key === key ? { ...line, [field]: value } : line)); };
  const removeLines = (keys: string[]) => { const remove = new Set(keys); patch("lines", values.lines.filter((line) => !remove.has(line.key))); setRowErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !remove.has(key)))); setSelected((old) => new Set([...old].filter((key) => !remove.has(key)))); };
  const openPicker = () => { if (readOnly) return; if (!values.location) { setToast("Choose Main Location first"); return; } setPicker(true); };
  const closePicker = () => { setPicker(false); requestAnimationFrame(() => fromStockRef.current?.querySelector("button")?.focus()); };

  const onLocation = async (location: string) => {
    if (location === values.location) return;
    if (values.lines.length && !(await confirm({ title: "Change Main Location?", body: "Changing Main Location clears all rows. Continue?", cancelLabel: "Cancel", confirmLabel: "Clear rows", confirmVariant: "danger" }))) return;
    patch("location", location); if (values.lines.length) { patch("lines", []); setSelected(new Set()); setRowErrors({}); }
  };
  const addStock = (items: StockLot[]) => {
    const known = new Set(values.lines.map((line) => line.stockUuid)); const fresh = items.filter((item) => !known.has(item.stockUuid)).slice(0, 200 - values.lines.length);
    if (fresh.length) { patch("lines", [...values.lines, ...fresh.map(lineFromStock)]); setToast(`Added ${fresh.length} items from Stock`); }
  };
  const addScanned = async () => {
    if (!values.location) { setToast("Choose Main Location first"); return; }
    if (!scan.trim() || scanning) return;
    setScanning(true);
    try {
      const result = await stockAdjustmentApi.stock(values.location, scan.trim(), values.lines.map((line) => line.stockUuid));
      const query = scan.trim().toLocaleLowerCase();
      const match = result.items.find((item) => [item.stockId, item.attrs.lot, item.lotKey].some((value) => value.toLocaleLowerCase() === query));
      if (!match) { setToast(`Not in stock at ${values.location}`); return; }
      addStock([match]); setScan("");
    } catch { setToast("Couldn't find this stock. Try again."); }
    finally { setScanning(false); }
  };

  const reload = async (message?: string) => {
    if (detail) await invalidate(detail.id); else await invalidate();
    if (message) setToast(message);
    if (detail) router.refresh();
  };

  const save = async () => {
    const parsed = adjustmentSchema.safeParse(values);
    if (badDate(values.docDate)) { setToast("Choose a valid Doc Date"); return; }
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const rowIndex = typeof issue?.path[1] === "number" ? issue.path[1] : null;
      if (rowIndex !== null && values.lines[rowIndex]) {
        const line = values.lines[rowIndex]!; const message = issue?.message ?? "Check this value";
        setRowErrors((current) => ({ ...current, [line.key]: message })); setToast(`Row ${rowIndex + 1}: ${message}`);
      } else setToast(issue?.message ?? "Check the required fields");
      return;
    }
    setBusy(true);
    try {
      if (detail) {
        const result = await stockAdjustmentApi.update(detail.id, detail.version, values);
        await invalidate(detail.id, result.status === "APPROVED"); setToast(result.status === "APPROVED" ? "Saved and approved (approval is off)." : "Saved as Draft"); setEditing(false); setDirty(false); router.refresh();
      } else {
        const result = await stockAdjustmentApi.create(values); await invalidate(result.id, result.status === "APPROVED");
        replaceTab(adjustmentHref(result.id));
      }
    } catch (error) { mapWriteError(error); }
    finally { setBusy(false); }
  };

  const mapWriteError = (error: unknown) => {
    const outcome = mapAdjustmentWriteError(error, values.lines);
    setRowErrors(Object.fromEntries(outcome.rowErrors.map((item) => [item.key, item.message])));
    setToast(outcome.message);
    if (outcome.refetch && detail) void invalidate(detail.id);
  };

  const remove = async () => {
    if (!detail || !(await confirm(deleteDocumentConfirm(detail.docNo ?? "Stock Adjustment")))) return;
    setBusy(true); try { await stockAdjustmentApi.remove(detail.id, detail.version); await invalidate(detail.id, detail.status === "APPROVED" && detail.autoApproved); router.refresh(); setToast("Stock Adjustment deleted"); } catch (error) { mapWriteError(error); } finally { setBusy(false); }
  };
  const restore = async () => {
    if (!detail) return; setBusy(true); try { await stockAdjustmentApi.restore(detail.id, detail.version); await invalidate(detail.id); router.refresh(); setToast("Stock Adjustment restored"); } catch (error) { mapWriteError(error); } finally { setBusy(false); }
  };
  const send = async () => {
    if (!detail) { await save(); return; }
    if (!(await confirm({ title: `Send ${detail.docNo ?? "Stock Adjustment"} to approve?`, body: "It can't be edited or deleted until an approver acts.", cancelLabel: "Cancel", confirmLabel: "Send to approve", confirmVariant: "primary" }))) return;
    setBusy(true); try { await stockAdjustmentApi.submit(detail.id, detail.version); await invalidate(detail.id); setToast(`Sent ${detail.docNo ?? "Stock Adjustment"} to approve`); router.refresh(); } catch (error) { mapWriteError(error); } finally { setBusy(false); }
  };

  const status = detail?.status ?? "DRAFT";
  const canEdit = !detail || (detail.flow.canEdit && access.edit);
  const canDelete = Boolean(detail?.flow.canDelete && access.delete);
  const canSave = values.lines.length > 0 && Boolean(values.location) && Boolean(values.docDate);
  const docNo = detail?.docNo ?? nextNumber.data?.docNo ?? "SA —";

  const totals = adjustmentTotals(values.lines);
  const rowCount = values.lines.length;
  const toggle = (key: string, checked: boolean) => setSelected((old) => { const next = new Set(old); if (checked) next.add(key); else next.delete(key); return next; });

  return <div className="relative flex h-full bg-gms-page">
    <div className="min-w-0 flex-1 overflow-y-auto">
      {deleted && <DeletedBanner text={DELETED_TEXT} canRestore={Boolean(detail?.flow.canRestore && access.delete)} busy={busy} onRestore={() => void restore()} />}
      <QuotationHeader docNo={docNo} noLabel="Adjustment No.:" newHref={HREF} isPreview={!detail} status={status} statusLabels={statusLabels} mode={readOnly ? "view" : "edit"} saving={busy} canSave={canSave} canCreate={access.add} canEdit={canEdit} canDelete={canDelete} canDuplicate={false} hideEditDelete={deleted || !detail?.flow.canEdit} hideDelete={deleted || !detail?.flow.canDelete} statusNote={status === "REVISION_REQUESTED" && detail?.approval.review ? { text: `Revise: ${detail.approval.review.note}`, tone: "warning" } : status === "PENDING_APPROVAL" ? { text: "Waiting for approval · Read-only until it is approved, sent back or rejected", tone: "muted" } : null} extraActions={detail?.flow.canSubmit && (access.add || access.edit) ? <Button variant="primary" onClick={() => void send()} disabled={busy || dirty || editing}>Send to approve</Button> : null} actions={{ onCancel: () => { if (dirty) void confirm(DISCARD_CHANGES_CONFIRM).then((ok) => { if (ok) { setValues(initial); setDirty(false); setSelected(new Set()); setRowErrors({}); if (detail) setEditing(false); else router.push(HREF); } }); else if (detail) setEditing(false); else router.push(HREF); }, onSave: () => void save(), onEdit: () => setEditing(true), onDelete: () => void remove(), onDuplicate: () => undefined, onRefresh: () => void reload("Refreshed") }} />

      <fieldset disabled={readOnly} className="mx-6 rounded-gms-md bg-gms-surface px-6 py-6">
        <div className="grid grid-cols-1 gap-x-4 gap-y-6 md:grid-cols-[200px_1fr_1fr]">
          <Field label="Doc Date" required>
            <DateBox aria-label="Doc Date" value={values.docDate} onChange={(value) => patch("docDate", value)} />
          </Field>
          <Field label="Main Location" required error={options.isError ? "Couldn't load locations. Refresh and try again." : undefined}>
            <SelectMenu value={values.location} placeholder="Select" disabled={readOnly || options.isPending} options={(options.data?.locations ?? []).map((location) => ({ value: location, label: location }))} onChange={(location) => void onLocation(location)} />
          </Field>
          <Field label="Ref.">
            <TextInput aria-label="Ref." maxLength={100} value={values.ref} onChange={(event) => patch("ref", event.target.value)} />
          </Field>
        </div>
      </fieldset>

      <div className="mx-6 mt-4 mb-6 flex gap-4 rounded-gms-md bg-gms-surface px-6 py-6">
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-medium text-[#1C252E]">Stock Adjustment</h2>
            <span className="text-xs text-[#6B7480]">{rowCount} row{rowCount === 1 ? "" : "s"}</span>
            <span ref={fromStockRef}><Button variant="dark" size="sm" disabled={readOnly} onClick={openPicker}>From Stock</Button></span>
            <IconButton label="Scan to add" disabled={readOnly} className="bg-[#F6F7F8]" aria-expanded={scanOpen} onClick={() => setScanOpen((open) => !open)}><ScanIcon /></IconButton>
            {scanOpen && !readOnly && (
              <form className="flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); void addScanned(); }}>
                <TextInput compact autoFocus aria-label="Scan or type a Stock ID, lot or stone code" placeholder="Scan barcode" maxLength={100} value={scan} onChange={(event) => setScan(event.target.value)} className="w-[240px]" />
                <Button size="sm" type="submit" disabled={scanning || !scan.trim()}>{scanning ? "Adding…" : "Add"}</Button>
              </form>
            )}
            {selected.size > 0 && !readOnly && <Button size="sm" variant="danger-outline" onClick={() => removeLines([...selected])}><Trash2 className="size-4" /> Remove {selected.size} selected</Button>}
          </div>
          <AdjustmentTable lines={values.lines} editable={!readOnly} selected={selected} rowErrors={rowErrors} onSelect={toggle} onSelectAll={(all) => setSelected(all ? new Set(values.lines.map((line) => line.key)) : new Set())} onChange={changeLine} onRemove={(key) => removeLines([key])} onPick={openPicker} />
          {values.lines.length > ROW_MAX && <p role="alert" className="mt-2 text-sm text-gms-danger">A document can contain up to 200 stock rows.</p>}

          <div className="mt-10">
            <h3 className="mb-3 text-sm font-medium text-[#1C252E]">Document Note</h3>
            <div className="relative md:w-1/2">
              <textarea aria-label="Document Note" maxLength={250} rows={4} value={values.note} readOnly={readOnly} onChange={(event) => patch("note", event.target.value)} className="block min-h-[100px] w-full resize-y rounded-gms-md border border-gms-border bg-gms-surface px-4 pt-3 pb-7 text-[15px] text-gms-text outline-none hover:border-gms-text-placeholder focus:border-gms-primary focus:ring-2 focus:ring-gms-primary/20 read-only:bg-gms-field-disabled" />
              <span aria-hidden className="pointer-events-none absolute right-4 bottom-2 text-xs text-[#95A0A9]">{values.note.length}/250</span>
            </div>
          </div>
        </div>
        <RailButtons active={rail} onChange={setRail} />
      </div>
    </div>

    {rail && (
      <div className="absolute top-4 right-16 bottom-4 z-30 w-[440px] max-w-[calc(100%-5rem)]">
        {rail === "daybook" ? (
          <SidePanel title="Daybook" subtitle="Chronological daybook of all system activities." onClose={() => setRail(null)} className="h-full">
            <AdjustmentDaybook />
          </SidePanel>
        ) : (
          <SidePanel title="Summary Value" subtitle="Stock on hand against the physical count." onClose={() => setRail(null)} className="h-full">
            <dl className="grid grid-cols-2 gap-y-3 px-5 py-4 text-sm">
              <dt className="text-[#6B7480]">Rows</dt><dd className="text-right">{totals.rowCount}</dd>
              <dt className="text-[#6B7480]">Stock Pcs</dt><dd className="text-right tabular-nums">{totals.stockPcs}</dd>
              <dt className="text-[#6B7480]">Physical Pcs</dt><dd className="text-right tabular-nums">{totals.physicalPcs}</dd>
              <dt className="text-[#6B7480]">Diff Pcs</dt><dd className="text-right tabular-nums">{totals.diffPcs}</dd>
              <dt className="text-[#6B7480]">Stock Weight (ct)</dt><dd className="text-right tabular-nums">{nf.weight(totals.stockWeightCt)}</dd>
              <dt className="text-[#6B7480]">Physical Weight (ct)</dt><dd className="text-right tabular-nums">{nf.weight(totals.physicalWeightCt)}</dd>
              <dt className="text-[#6B7480]">Diff Weight (ct)</dt><dd className="text-right tabular-nums">{nf.weight(totals.diffWeightCt)}</dd>
            </dl>
          </SidePanel>
        )}
      </div>
    )}
    {picker && <MemoStockModal title="From Stock" showPrice={false} emptyText="No own stock at this location." pickedIds={new Set(values.lines.map((line) => line.stockUuid))} source="stock-adjustment" location={values.location} onCancel={closePicker} onConfirm={(items) => { addStock(items); closePicker(); }} />}{dialog}{toast && <Toast message={toast} onClose={() => setToast(null)}/>}
  </div>;
}
