"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, PackagePlus, ScanBarcode } from "lucide-react";
import { useTabDirty, useTabDocument, useTabReplace } from "@/features/home/tabs/tab-host";
import { QuotationHeader } from "@/features/quotation/components/header/QuotationHeader";
import { Button, Toast } from "@/features/quotation/components/ui";
import { useConfirm, DISCARD_CHANGES_CONFIRM, deleteDocumentConfirm } from "@/features/quotation/components/use-confirm";
import { todayIso } from "@/features/quotation/lib/format";
import { useDocumentAccess, type DocumentAccess } from "@/features/trade-document/document-api";
import { MemoStockModal } from "@/features/trade-document/memo-stock-modal";
import { readDomainError } from "@/lib/trpc-error";
import { mapAdjustmentWriteError } from "../errors";
import { stockAdjustmentApi, useAdjustmentDetail, useAdjustmentInvalidation, useAdjustmentList, useAdjustmentNumber, useAdjustmentOptions, type AdjustmentOut, type StockLot } from "../api";
import { emptyAdjustment, lineFromStock, adjustmentSchema, type AdjustmentForm } from "../form";
import { AdjustmentTable } from "./adjustment-table";

const HREF = "/inventory/stock-adjustment";
const denied = "You don't have permission to view Stock Adjustment.";
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
  const [scan, setScan] = useState(""); const [busy, setBusy] = useState(false); const [showDaybook, setShowDaybook] = useState(!detail);
  const { confirm, dialog } = useConfirm(); const options = useAdjustmentOptions(); const nextNumber = useAdjustmentNumber(values.docDate, !detail && access.add);
  const list = useAdjustmentList(); const invalidate = useAdjustmentInvalidation(); const deleted = Boolean(detail?.deleted);
  const readOnly = !editing || (!detail && !access.add) || deleted || detail?.status === "PENDING_APPROVAL" || (detail?.status === "APPROVED" && !detail.autoApproved);

  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 3500); return () => clearTimeout(timer); }, [toast]);
  useTabDocument(detail?.docNo ?? "Stock Adjustment"); useTabDirty(dirty && !readOnly);

  const patch = <K extends keyof AdjustmentForm>(key: K, value: AdjustmentForm[K]) => { setValues((current) => ({ ...current, [key]: value })); setDirty(true); };
  const changeLine = (key: string, field: "physicalPcs" | "physicalWeightCt" | "physicalPrice" | "remark", value: string) => { setRowErrors((current) => { const next = { ...current }; delete next[key]; return next; }); patch("lines", values.lines.map((line) => line.key === key ? { ...line, [field]: value } : line)); };
  const removeLines = (keys: string[]) => { const remove = new Set(keys); patch("lines", values.lines.filter((line) => !remove.has(line.key))); setRowErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !remove.has(key)))); setSelected(new Set()); };
  const openPicker = () => { if (!values.location) { setToast("Choose Main Location first"); return; } setPicker(true); };

  const onLocation = async (location: string) => {
    if (location === values.location) return;
    if (values.lines.length && !(await confirm({ title: "Change Main Location?", body: "Changing Main Location clears all rows. Continue?", cancelLabel: "Cancel", confirmLabel: "Clear rows", confirmVariant: "danger" }))) return;
    patch("location", location); if (values.lines.length) patch("lines", []);
  };
  const addStock = (items: StockLot[]) => {
    const known = new Set(values.lines.map((line) => line.stockUuid)); const fresh = items.filter((item) => !known.has(item.stockUuid)).slice(0, 200 - values.lines.length);
    if (fresh.length) { patch("lines", [...values.lines, ...fresh.map(lineFromStock)]); setToast(`Added ${fresh.length} items from Stock`); }
    setPicker(false);
  };
  const addScanned = async () => {
    if (!values.location) { setToast("Choose Main Location first"); return; }
    if (!scan.trim()) return;
    try {
      const result = await stockAdjustmentApi.stock(values.location, scan.trim(), values.lines.map((line) => line.stockUuid));
      const query = scan.trim().toLocaleLowerCase();
      const match = result.items.find((item) => [item.stockId, item.attrs.lot, item.lotKey].some((value) => value.toLocaleLowerCase() === query));
      if (!match) { setToast(`Not in stock at ${values.location}`); return; }
      addStock([match]); setScan("");
    } catch { setToast("Couldn't find this stock. Try again."); }
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
        replaceTab(`${HREF}/${encodeURIComponent(result.id)}`);
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

  return <div className="mx-auto w-full max-w-[1600px] space-y-4 p-3 sm:p-6">
    <QuotationHeader docNo={docNo} noLabel="Adjustment No.:" newHref={HREF} isPreview={!detail} status={status} statusLabels={statusLabels} mode={readOnly ? "view" : "edit"} saving={busy} canSave={canSave} canCreate={access.add} canEdit={canEdit} canDelete={canDelete} canDuplicate={false} hideEditDelete={deleted || !detail?.flow.canEdit} hideDelete={deleted || !detail?.flow.canDelete} statusNote={status === "REVISION_REQUESTED" && detail?.approval.review ? { text: `Revise: ${detail.approval.review.note}`, tone: "warning" } : status === "PENDING_APPROVAL" ? { text: "Waiting for approval · Read-only until it is approved, sent back or rejected", tone: "muted" } : null} extraActions={detail?.flow.canSubmit && (access.add || access.edit) ? <Button variant="primary" onClick={() => void send()} disabled={busy || dirty || editing}>Send to approve</Button> : null} actions={{ onCancel: () => { if (dirty) void confirm(DISCARD_CHANGES_CONFIRM).then((ok) => { if (ok) { setValues(initial); setDirty(false); if (detail) setEditing(false); else router.push(HREF); } }); else if (detail) setEditing(false); else router.push(HREF); }, onSave: () => void save(), onEdit: () => setEditing(true), onDelete: () => void remove(), onDuplicate: () => undefined, onRefresh: () => void reload() }} />
    <section className="grid gap-4 rounded-lg border border-gms-border bg-gms-surface p-4 md:grid-cols-3">
      <label className="text-sm font-medium">Doc Date *<div className="relative mt-1"><CalendarDays className="absolute left-3 top-3 size-4 text-gms-text-secondary"/><input type="date" aria-label="Doc Date" value={values.docDate} disabled={readOnly} onChange={(e) => patch("docDate", e.target.value)} className="h-11 w-full rounded-md border border-gms-border bg-gms-surface pl-9 pr-3"/></div></label>
      <label className="text-sm font-medium">Main Location *<select aria-label="Main Location" value={values.location} disabled={readOnly || options.isPending} onChange={(e) => void onLocation(e.target.value)} className="mt-1 h-11 w-full rounded-md border border-gms-border bg-gms-surface px-3"><option value="">Choose a location</option>{options.data?.locations.map((location) => <option key={location}>{location}</option>)}</select>{options.isError && <span className="mt-1 block text-xs text-gms-danger">Couldn&apos;t load locations. Refresh and try again.</span>}</label>
      <label className="text-sm font-medium">Ref.<input aria-label="Ref." maxLength={100} value={values.ref} disabled={readOnly} onChange={(e) => patch("ref", e.target.value)} className="mt-1 h-11 w-full rounded-md border border-gms-border bg-gms-surface px-3"/></label>
    </section>
    <section className="space-y-3 rounded-lg border border-gms-border bg-gms-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Stock Adjustment</h2><p className="text-xs text-gms-text-secondary">{values.lines.length} rows · Stock quantities are set to Physical when approved.</p></div><div className="flex flex-wrap items-center gap-2"><Button variant="dark" onClick={openPicker} disabled={readOnly}><PackagePlus className="size-4"/>From Stock</Button><label className="flex h-9 items-center gap-2 rounded-md border border-gms-border px-2"><ScanBarcode className="size-4"/><input aria-label="Scan or enter Stock ID" value={scan} disabled={readOnly} onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addScanned(); } }} placeholder="Scan / enter Stock ID" className="w-40 bg-transparent text-sm outline-none sm:w-52"/></label><Button onClick={() => void addScanned()} disabled={readOnly || !scan.trim()}>Add</Button></div></div>
      <AdjustmentTable lines={values.lines} editable={!readOnly} selected={selected} rowErrors={rowErrors} onSelect={(key, checked) => setSelected((old) => { const next = new Set(old); if (checked) next.add(key); else next.delete(key); return next; })} onChange={changeLine} onRemove={removeLines} onPick={openPicker}/>
      {values.lines.length > 200 && <p role="alert" className="text-sm text-gms-danger">A document can contain up to 200 stock rows.</p>}
    </section>
    <section className="rounded-lg border border-gms-border bg-gms-surface p-4"><label className="block text-sm font-medium">Document Note <span className="text-xs font-normal text-gms-text-secondary">{values.note.length}/250</span><textarea maxLength={250} rows={3} value={values.note} disabled={readOnly} onChange={(e) => patch("note", e.target.value)} className="mt-2 w-full rounded-md border border-gms-border bg-gms-surface p-3"/></label></section>
    {detail?.deleted && <section className="rounded-lg border border-[#F0C987] bg-[#FFF8E6] p-4">This document was deleted. {detail.flow.canRestore && access.delete && <Button onClick={() => void restore()} disabled={busy}>Restore</Button>}</section>}
    <section className="rounded-lg border border-gms-border bg-gms-surface"><button type="button" onClick={() => setShowDaybook((shown) => !shown)} className="flex w-full justify-between p-4 text-left font-semibold"><span>Stock Adjustment Daybook</span><span aria-hidden>{showDaybook ? "−" : "+"}</span></button>{showDaybook && <div className="overflow-x-auto border-t border-gms-border"><table className="w-full min-w-[600px] text-sm"><thead className="bg-gms-surface-muted"><tr>{["No.", "Date", "Location", "Rows", "Status"].map((x) => <th key={x} className="p-3 text-left">{x}</th>)}</tr></thead><tbody>{list.isPending && <tr><td colSpan={5} className="p-4">Loading…</td></tr>}{list.isError && <tr><td colSpan={5} className="p-4 text-gms-danger">Couldn&apos;t load the list. Try again.</td></tr>}{list.data?.pages.flatMap((page) => page.items).map((item) => <tr key={item.id} className="border-t border-gms-border"><td className="p-3"><button className="text-gms-primary underline" onClick={() => replaceTab(`${HREF}/${encodeURIComponent(item.id)}`)}>{item.docNo ?? "Draft"}</button></td><td className="p-3">{item.docDate}</td><td className="p-3">{item.location}</td><td className="p-3">{item.lineCount}</td><td className="p-3">{statusLabels[item.status].label}</td></tr>)}</tbody></table>{list.hasNextPage && <div className="p-3 text-center"><button type="button" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage} className="rounded border border-gms-border px-4 py-2">{list.isFetchingNextPage ? "Loading…" : "Load more"}</button></div>}</div>}</section>
    {picker && <MemoStockModal title="From Stock" showPrice={false} emptyText="No own stock at this location." pickedIds={new Set(values.lines.map((line) => line.stockUuid))} source="stock-adjustment" location={values.location} onCancel={() => setPicker(false)} onConfirm={addStock} />}{dialog}{toast && <Toast message={toast} onClose={() => setToast(null)}/>}
  </div>;
}
