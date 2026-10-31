"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheck, FileSearch, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FormProvider, useFieldArray, useForm, useWatch } from "react-hook-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ScanIcon } from "@/components/ui/scan-icon";
import { QuotationHeader, type StatusLabels } from "@/features/quotation/components/header/QuotationHeader";
import { ItemEditorPanel } from "@/features/quotation/components/items/ItemEditorPanel";
import { ItemPhotoBox } from "@/features/quotation/components/items/ItemPhotoBox";
import { ItemTable, type RowAction } from "@/features/quotation/components/items/ItemTable";
import { DocumentNote } from "@/features/quotation/components/note/DocumentNote";
import { RailButtons, RailPanelView, type RailPanel } from "@/features/quotation/components/rail/RightRail";
import { SummaryValue } from "@/features/quotation/components/summary/SummaryValue";
import { Button, cx, IconButton, Toast } from "@/features/quotation/components/ui";
import { DocumentKindContext } from "@/features/quotation/document-kind";
import { calculateTotals } from "@/features/quotation/lib/calculate";
import { emptyLine, newKey } from "@/features/quotation/lib/defaults";
import { formatDate } from "@/features/quotation/lib/format";
import { LinePhotoContext, type LinePhotoTarget } from "@/features/quotation/options-context";
import { isFilledLine } from "@/features/quotation/schema";
import { readDomainError } from "@/lib/trpc-error";
import {
  fromMemoReceive,
  isPendingApproval,
  mapMemoReceiveError,
  memoReceiveLoadError,
  memoReceivePhotoUrl,
  removeLegacyStore,
  savedLineIds,
  stoneChoices,
  toMemoReceiveInput,
  uploadMemoReceivePhoto,
  useMemoReceiveDaybook,
  useMemoReceiveOptions,
  useMemoReceiveWrites,
  useNextMemoReceiveNo,
  type MemoReceiveAccess,
  type MemoReceiveDetail,
} from "../api";
import { emptyMemoReceive, MEMO_RECEIVE_KIND } from "../defaults";
import { isEditableMemo, MAX_MEMO_LINES, memoReceiveSchema, type MemoReceiveFormValues } from "../schema";
import { MemoReceiveInfoForm } from "./MemoReceiveInfoForm";

export const MEMO_RECEIVE_HREF = "/memo/memo-receive";
export const memoReceiveHref = (id: string) => `${MEMO_RECEIVE_HREF}/${id}`;

/** Saving sends the document to approval (Q-MR-05); Approve makes it read-only (rev 3). */
export const STATUS_LABELS: StatusLabels = {
  PENDING_APPROVAL: { label: "Pending Approval", tone: "bg-[#FFF4E0] text-[#B45309]" },
  APPROVED: { label: "Approved", tone: "bg-[#E7F7EE] text-[#15803D]" },
};

/** Row photos (rev 4, SA revision 2): the row panel uploads to and reads from the Memo Receive photo route. */
export const MEMO_RECEIVE_PHOTOS: LinePhotoTarget = { upload: uploadMemoReceivePhoto, url: memoReceivePhotoUrl };

/**
 * Approve shows for a saved Pending Approval document with no unsaved changes, to users with `memo-receive:APPROVE`
 * (ui-spec rev 3; UX only, the server checks every call).
 */
export function canApproveMemo(args: { saved: boolean; status: MemoReceiveFormValues["status"]; editing: boolean; dirty: boolean; approve: boolean }): boolean {
  return args.saved && isPendingApproval(args.status) && !args.editing && !args.dirty && args.approve;
}

export const approveMessage = (count: number) =>
  `Approve this Memo Receive? Its ${count} ${count === 1 ? "item moves" : "items move"} to Memo Stock and it can no longer be edited.`;

/** One Memo Receive document (ADR-0033/0034): Quotation's layout and components, Memo Receive's data. */
export function MemoReceiveForm({ initial, access }: { initial?: MemoReceiveFormValues; access: MemoReceiveAccess }) {
  const router = useRouter();
  const [saved, setSaved] = useState<MemoReceiveFormValues | undefined>(initial);
  const [mode, setMode] = useState<"view" | "edit">(initial ? "view" : "edit");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [railPanel, setRailPanel] = useState<RailPanel>(null);
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  const form = useForm<MemoReceiveFormValues>({ resolver: zodResolver(memoReceiveSchema), defaultValues: initial ?? emptyMemoReceive() });
  const { control, reset, getValues, handleSubmit, formState, setError } = form;
  const lineArray = useFieldArray({ control, name: "lines", keyName: "_rhfId" });
  const values = useWatch({ control }) as MemoReceiveFormValues;
  const lines = useMemo(() => values.lines ?? [], [values.lines]);
  const totals = useMemo(() => calculateTotals(values), [values]);

  const readOnly = mode === "view";
  const status = saved?.status;
  const editable = Boolean(saved?.id) && isEditableMemo(status);
  const options = useMemoReceiveOptions(saved?.vendorId);
  const next = useNextMemoReceiveNo(values.docDate ?? "", !saved?.id);
  const writes = useMemoReceiveWrites();
  const docNo = saved?.docNo ?? next.data?.docNo ?? "—";
  const kind = useMemo(() => ({ ...MEMO_RECEIVE_KIND, stone: stoneChoices(options.data) }), [options.data]);
  const showApprove = canApproveMemo({ saved: Boolean(saved?.id), status, editing: !readOnly, dirty: formState.isDirty, approve: access.approve });

  // Rev 3: the mock store is gone; drop what it left in this browser.
  useEffect(() => removeLegacyStore(), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  /** Shows the server's latest copy, read-only. */
  const show = (detail: MemoReceiveDetail) => {
    const latest = fromMemoReceive(detail);
    setSaved(latest);
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
      setToast(memoReceiveLoadError(error));
    }
  };

  const showError = async (error: unknown) => {
    const outcome = mapMemoReceiveError(error);
    for (const field of outcome.fieldErrors) setError(field.name as never, { type: "server", message: field.message });
    setToast(outcome.message);
    if (outcome.gone) {
      await writes.invalidate();
      router.push(MEMO_RECEIVE_HREF);
    } else if (outcome.reload) {
      await reloadSaved();
      setToast(outcome.message);
    }
  };

  /* ---------- document actions ---------- */

  const onSave = handleSubmit(
    async (input) => {
      try {
        if (saved?.id && saved.version) {
          await writes.update({ ...toMemoReceiveInput(input, savedLineIds(saved)), id: saved.id, expectedVersion: saved.version });
          show(await writes.reload(saved.id));
          setToast(`Saved ${saved.docNo ?? ""}`.trim());
        } else {
          const created = await writes.create(toMemoReceiveInput(input));
          await writes.invalidate();
          router.replace(memoReceiveHref(created.id));
        }
      } catch (error) {
        await showError(error);
      }
    },
    () => setToast("Please complete the required fields"),
  );

  const onCancel = () => {
    if (formState.isDirty && !window.confirm("Discard unsaved changes?")) return;
    reset(saved ?? emptyMemoReceive());
    setMode(saved ? "view" : "edit");
    setEditorOpen(false);
    setCheckedKeys(new Set());
  };

  const onDelete = async () => {
    if (!saved?.id || !saved.version || !window.confirm(`Delete ${saved.docNo}?`)) return;
    try {
      await writes.remove({ id: saved.id, expectedVersion: saved.version });
      await writes.invalidate();
      router.push(MEMO_RECEIVE_HREF);
    } catch (error) {
      await showError(error);
    }
  };

  const onApprove = async () => {
    if (!saved?.id || !saved.version) return;
    try {
      await writes.approve({ id: saved.id, expectedVersion: saved.version });
      show(await writes.reload(saved.id));
      setApproving(false);
      setToast("Approved");
    } catch (error) {
      setApproving(false);
      const { domainCode } = readDomainError(error);
      if (domainCode === "MEMO_RECEIVE_CHANGED") {
        await reloadSaved();
        setToast("This memo receive changed. Check it and approve again.");
        return;
      }
      await showError(error);
    }
  };

  const onRefresh = async () => {
    if (!readOnly && formState.isDirty && !window.confirm("Discard unsaved changes?")) return;
    await reloadSaved();
    setToast("Refreshed");
  };

  // A copy is a new document: the server gives its rows new Stock IDs when it is saved (ui-spec H-03); its rows keep
  // their photos, as a Quotation copy does (rev 4).
  const onDuplicate = () => {
    const current = getValues();
    setSaved(undefined);
    reset({ ...current, id: undefined, docNo: undefined, status: undefined, version: undefined, lines: current.lines.map((l) => ({ ...l, key: newKey(), stockId: "" })) });
    setMode("edit");
    setToast("Duplicated as a new memo receive");
  };

  /* ---------- line actions ---------- */

  const openRow = (index: number) => {
    setSelectedIndex(index);
    setEditorOpen(true);
    setRailPanel(null);
  };

  const addRow = () => {
    if (lines.length >= MAX_MEMO_LINES) {
      setToast(`Up to ${MAX_MEMO_LINES} rows`);
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
    if (action === "duplicate" && lines.length < MAX_MEMO_LINES) {
      lineArray.insert(index + 1, { ...getValues(`lines.${index}`), key: newKey(), stockId: "", photos: [] });
    }
  };

  const removeChecked = () => {
    lineArray.remove(lines.flatMap((l, i) => (checkedKeys.has(l.key) ? [i] : [])));
    setCheckedKeys(new Set());
    setSelectedIndex(null);
    setEditorOpen(false);
  };

  const editorIndex = editorOpen && selectedIndex !== null && selectedIndex < lines.length ? selectedIndex : null;
  const itemCount = (saved?.lines ?? []).filter(isFilledLine).length;

  return (
    <DocumentKindContext.Provider value={kind}>
      <LinePhotoContext.Provider value={MEMO_RECEIVE_PHOTOS}>
        <FormProvider {...form}>
          <div className="relative flex h-full bg-white">
            <div className="min-w-0 flex-1 overflow-y-auto">
              <QuotationHeader
                noLabel="Memo Receive No.:"
                newHref={MEMO_RECEIVE_HREF}
                statusLabels={STATUS_LABELS}
                docNo={docNo}
                isPreview={!saved?.docNo}
                status={status}
                mode={mode}
                saving={writes.busy}
                canSave={saved?.id ? access.edit : access.add}
                canCreate={access.add}
                canEdit={editable && access.edit}
                canDelete={editable && access.delete}
                hideEditDelete={status === "APPROVED"}
                extraActions={
                  showApprove && (
                    <Button variant="primary" onClick={() => setApproving(true)} disabled={writes.busy} className="min-w-24">
                      <CircleCheck className="size-4" /> Approve
                    </Button>
                  )
                }
                actions={{
                  onCancel,
                  onSave: () => void onSave(),
                  onEdit: () => setMode("edit"),
                  onDelete: () => void onDelete(),
                  onDuplicate,
                  onRefresh: () => void onRefresh(),
                }}
              />

              <fieldset disabled={readOnly}>
                <MemoReceiveInfoForm options={options.data} optionsError={options.error} />
              </fieldset>

              <hr className="border-[#E3E6EA]" />

              <div className="flex gap-4 px-6 py-6">
                <div className="min-w-0 flex-1">
                  <div className="mb-4 flex flex-wrap items-center gap-3">
                    <h2 className="text-lg font-medium text-[#1C252E]">Item</h2>
                    <span className="text-xs text-[#6B7480]">{lines.length} rows</span>
                    <IconButton label="Scan to add" disabled={readOnly} className="bg-[#F6F7F8]">
                      <ScanIcon />
                    </IconButton>
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
                <RailPanelView panel={railPanel} totals={totals} currency={values.currency ?? ""} onClose={() => setRailPanel(null)} daybook={<MemoDaybook />} />
              </fieldset>
            )}
          </div>
          <ConfirmDialog
            open={approving}
            title="Approve Memo Receive"
            body={approveMessage(itemCount)}
            cancelLabel="Cancel"
            confirmLabel="Approve"
            pendingLabel="Approving…"
            pending={writes.busy}
            onCancel={() => setApproving(false)}
            onConfirm={() => void onApprove()}
          />
          {toast && <Toast message={toast} onClose={() => setToast(null)} />}
        </FormProvider>
      </LinePhotoContext.Provider>
    </DocumentKindContext.Provider>
  );
}

/** Saved memo receives, newest first; orange = Pending Approval, green = Approved. */
function MemoDaybook() {
  const list = useMemoReceiveDaybook();
  if (list.isPending) return <p className="py-16 text-center text-sm text-[#6B7480]">Loading…</p>;
  if (list.error) return <p className="py-16 text-center text-sm text-[#E5484D]">{memoReceiveLoadError(list.error, "memo receives")}</p>;
  const entries = list.data?.items ?? [];
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-[#6B7480]">
        <FileSearch className="size-10 text-[#1C252E]" strokeWidth={1.5} />
        No results found.
      </div>
    );
  }
  return (
    <ul className="px-5 py-3">
      {entries.map((entry, index) => (
        <li key={entry.id}>
          <Link href={memoReceiveHref(entry.id)} className="flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-[#F6F7F8]">
            <span className="w-8 shrink-0 text-[#1C252E]">#{index + 1}</span>
            <span className={cx("mt-1.5 size-3 shrink-0 rounded-full", entry.status === "APPROVED" ? "bg-[#22C55E]" : "bg-[#F5A524]")} title={STATUS_LABELS[entry.status]?.label} />
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-[#1C252E]">{entry.docNo}</span>
              <span className="block truncate text-sm text-[#1C252E]">{entry.vendorName}</span>
            </span>
            <span className="shrink-0 text-sm text-[#A9B1B9]">{formatDate(entry.docDate)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
