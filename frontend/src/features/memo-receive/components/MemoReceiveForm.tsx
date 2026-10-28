"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FileSearch, ScanLine, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FormProvider, useFieldArray, useForm, useWatch } from "react-hook-form";
import type { PartnerAccess } from "@/features/partner/access";
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
import {
  masterLoadMessage,
  previewDocNo,
  saveErrorMessage,
  useMemoReceiveList,
  useMemoReceiveMutations,
  useNumberingRows,
  useStoneChoices,
  useVendor,
} from "../api";
import { emptyMemoReceive, MEMO_RECEIVE_KIND } from "../defaults";
import { isEditableMemo, MAX_MEMO_LINES, memoReceiveSchema, type MemoReceiveFormValues } from "../schema";
import type { SavedMemoReceive } from "../store";
import { MemoReceiveInfoForm } from "./MemoReceiveInfoForm";

export const MEMO_RECEIVE_HREF = "/memo/memo-receive";

/** Q-MR-05: saving sends the document to the (future) Approve page. */
const STATUS_LABELS: StatusLabels = {
  PENDING_APPROVAL: { label: "Pending Approval", tone: "bg-[#FFF4E0] text-[#B45309]" },
  APPROVED: { label: "Approved", tone: "bg-[#E7F7EE] text-[#15803D]" },
};

/** One Memo Receive document (ADR-0033): Quotation's layout and components, Memo Receive's data. */
export function MemoReceiveForm({ initial, access }: { initial?: SavedMemoReceive; access: PartnerAccess }) {
  const router = useRouter();
  const [saved, setSaved] = useState<SavedMemoReceive | undefined>(initial);
  const [mode, setMode] = useState<"view" | "edit">(initial ? "view" : "edit");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [railPanel, setRailPanel] = useState<RailPanel>(null);
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  const form = useForm<MemoReceiveFormValues>({ resolver: zodResolver(memoReceiveSchema), defaultValues: initial ?? emptyMemoReceive() });
  const { control, reset, getValues, handleSubmit, formState } = form;
  const lineArray = useFieldArray({ control, name: "lines", keyName: "_rhfId" });
  const values = useWatch({ control }) as MemoReceiveFormValues;
  const lines = useMemo(() => values.lines ?? [], [values.lines]);
  const totals = useMemo(() => calculateTotals(values), [values]);

  const readOnly = mode === "view";
  const status = saved?.status;
  const editable = Boolean(saved) && isEditableMemo(status);
  const numbering = useNumberingRows();
  const vendor = useVendor(values.vendorId ?? "");
  const { stone, error: stoneError } = useStoneChoices();
  const mutations = useMemoReceiveMutations();
  const busy = mutations.create.isPending || mutations.update.isPending || mutations.remove.isPending;
  const docNo = saved?.docNo ?? (numbering.data ? previewDocNo(numbering.data, values.docDate ?? "") : "—");
  const kind = useMemo(() => ({ ...MEMO_RECEIVE_KIND, stone }), [stone]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  /* ---------- document actions ---------- */

  const onSave = handleSubmit(
    async (input) => {
      const vendorName = vendor.data?.label ?? "";
      try {
        if (saved) {
          const updated = await mutations.update.mutateAsync({ id: saved.id, values: input, vendorName });
          await mutations.invalidate();
          setSaved(updated);
          reset(updated);
          setMode("view");
          setToast(`Saved ${saved.docNo}`);
        } else {
          if (!numbering.data) return setToast(numbering.error ? masterLoadMessage(numbering.error, "Document Setup") : "Loading the document number…");
          const created = await mutations.create.mutateAsync({ values: input, rows: numbering.data, vendorName });
          await mutations.invalidate();
          router.replace(`${MEMO_RECEIVE_HREF}/${created.id}`);
        }
      } catch (error) {
        setToast(saveErrorMessage(error));
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
    if (!saved || !window.confirm(`Delete ${saved.docNo}?`)) return;
    try {
      await mutations.remove.mutateAsync(saved.id);
      await mutations.invalidate();
      router.push(MEMO_RECEIVE_HREF);
    } catch (error) {
      setToast(saveErrorMessage(error));
    }
  };

  // A copy is a new document: Stock IDs are assigned again when it is saved (ui-spec H-03).
  const onDuplicate = () => {
    const current = getValues();
    setSaved(undefined);
    reset({ ...current, id: undefined, docNo: undefined, status: undefined, lines: current.lines.map((l) => ({ ...l, key: newKey(), stockId: "" })) });
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

  return (
    <DocumentKindContext.Provider value={kind}>
      <FormProvider {...form}>
        <div className="relative flex h-full bg-white">
          <div className="min-w-0 flex-1 overflow-y-auto">
            <QuotationHeader
              title="Memo Receive No.:"
              createHref={MEMO_RECEIVE_HREF}
              statusLabels={STATUS_LABELS}
              docNo={docNo}
              isPreview={!saved}
              status={status}
              mode={mode}
              saving={busy}
              canSave={saved ? access.edit : access.add}
              canCreate={access.add}
              canEdit={editable && access.edit}
              canDelete={editable && access.delete}
              actions={{
                onCancel,
                onSave: () => void onSave(),
                onEdit: () => setMode("edit"),
                onDelete: () => void onDelete(),
                onDuplicate,
                onRefresh: () => void mutations.invalidate().then(() => setToast("Refreshed")),
              }}
            />
            <p className="px-6 text-xs text-[#6B7480]">Preview: memo receives are kept in this browser only.</p>

            <fieldset disabled={readOnly}>
              <MemoReceiveInfoForm />
            </fieldset>

            <hr className="border-[#E3E6EA]" />

            <div className="flex gap-4 px-6 py-6">
              <div className="min-w-0 flex-1">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <h2 className="text-lg font-medium text-[#1C252E]">Item</h2>
                  <span className="text-xs text-[#6B7480]">{lines.length} rows</span>
                  <IconButton label="Scan to add" disabled={readOnly} className="bg-[#F6F7F8]">
                    <ScanLine className="size-4" />
                  </IconButton>
                  {checkedKeys.size > 0 && !readOnly && (
                    <Button size="sm" variant="danger-outline" onClick={removeChecked}>
                      <Trash2 className="size-4" /> Remove {checkedKeys.size} selected
                    </Button>
                  )}
                  {formState.errors.lines?.message && <span className="text-sm text-[#E5484D]">{formState.errors.lines.message}</span>}
                  {stoneError && <span className="text-xs text-[#E5484D]">{masterLoadMessage(stoneError, "the stone master")}</span>}
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
        {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      </FormProvider>
    </DocumentKindContext.Provider>
  );
}

/** Saved memo receives, newest first; orange = Pending Approval (Q-MR-05). */
function MemoDaybook() {
  const list = useMemoReceiveList();
  if (list.isPending) return <p className="py-16 text-center text-sm text-[#6B7480]">Loading…</p>;
  const entries = list.data ?? [];
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
          <Link href={`${MEMO_RECEIVE_HREF}/${entry.id}`} className="flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-[#F6F7F8]">
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
