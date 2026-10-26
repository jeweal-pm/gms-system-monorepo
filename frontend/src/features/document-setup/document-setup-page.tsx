"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useForm, useWatch, type FieldErrors, type Path } from "react-hook-form";
import { Button, cx, focusRing } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/outlined-field";
import { ToastProvider, useToast } from "@/components/ui/toast";
import type { PartnerAccess } from "@/features/partner/access";
import { PlainTextField } from "@/features/company-profile/components/plain-text-field";
import { DiscardChangesDialog } from "@/features/partner/components/discard-changes-dialog";
import { DetailLoadError, FormErrorBanner, PartnerAccessGuard } from "@/features/partner/components/partner-page-parts";
import { useUnsavedChangesPrompt } from "@/features/partner/hooks";
import { DRAWER_PUSH_CLASS, useDrawerState } from "@/lib/drawer-layout";
import { loadErrorMessage, mapSaveError, savedRowOrder } from "./api";
import { NumberingCard } from "./components/numbering-card";
import { TRANSACTIONS_DRAWER_ID, TransactionsDrawer } from "./components/transactions-drawer";
import { useDocumentSetup, useDocumentSetupCache, useDocumentTransactions, useSaveDocumentSetup } from "./hooks";
import { DECLARATION_MAX, defaultFormValues, documentSetupFormSchema, toFormValues, toSaveInput, type DocumentSetupFormValues, type DocumentTransaction } from "./schema";

const FORM_ID = "document-setup-form";
/** `document-setup` permission leaf (VIEW, EDIT; document-setup SA rev 1). */
export const DOCUMENT_SETUP_ENTITY = { key: "document-setup", singular: "Document Setup", plural: "Document Setups" };

const FIELD_ORDER: readonly string[] = ["name", "code", "startFrom", "rows", "declaration"];

/** First invalid field in visual order, including the first invalid row cell. */
export function firstInvalidField(errors: FieldErrors<DocumentSetupFormValues>): Path<DocumentSetupFormValues> | null {
  for (const name of FIELD_ORDER) {
    if (name !== "rows" && errors[name as keyof DocumentSetupFormValues]) return name as Path<DocumentSetupFormValues>;
    if (name === "rows" && Array.isArray(errors.rows)) {
      for (let index = 0; index < errors.rows.length; index++) {
        const row = errors.rows[index];
        if (!row) continue;
        for (const cell of ["effectiveDate", "prefix", "separator", "startNo"] as const) if (row[cell]) return `rows.${index}.${cell}`;
      }
    }
  }
  return null;
}

/** Setup › Document Setup (document-setup UI rev 1, owner 2026-10-23). */
export function DocumentSetupPage() {
  return (
    <ToastProvider>
      <PartnerAccessGuard entity={DOCUMENT_SETUP_ENTITY}>{(access) => <DocumentSetupWorkspace access={access} />}</PartnerAccessGuard>
    </ToastProvider>
  );
}

function DocumentSetupWorkspace({ access }: { access: PartnerAccess }) {
  const toast = useToast();
  const cache = useDocumentSetupCache();
  const transactions = useDocumentTransactions();
  const items = transactions.data?.items;
  const [chosenKey, setChosenKey] = useState<string | null>(null);
  const selectedKey = chosenKey ?? items?.[0]?.transactionKey ?? null;
  const selected = items?.find((item) => item.transactionKey === selectedKey);
  const detail = useDocumentSetup(selectedKey);
  const save = useSaveDocumentSetup();
  const drawer = useDrawerState();
  const [editing, setEditing] = useState(false);
  const [formError, setFormError] = useState<{ message: string; stale?: boolean } | null>(null);
  const [pendingDiscard, setPendingDiscard] = useState<(() => void) | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const loaded = selected !== undefined && detail.data !== undefined;
  const savedSetup = detail.data?.setup ?? null;
  const readOnly = !editing;
  // Saved setup or the defaults for the selection; the form follows it (dirty edits are kept while editing).
  const selectedLabel = selected?.label;
  const selectedDefaultCode = selected?.defaultCode;
  const detailData = detail.data;
  const formValues = useMemo(() => {
    if (detailData === undefined || selectedLabel === undefined || selectedDefaultCode === undefined) return undefined;
    return detailData.setup ? toFormValues(detailData.setup) : defaultFormValues({ label: selectedLabel, defaultCode: selectedDefaultCode });
  }, [detailData, selectedLabel, selectedDefaultCode]);

  const form = useForm<DocumentSetupFormValues>({
    resolver: zodResolver(documentSetupFormSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    shouldFocusError: false,
    defaultValues: { name: "", code: "", startFrom: "", rows: [], declaration: "" },
    values: formValues,
    resetOptions: { keepDirtyValues: true },
  });
  const { isDirty } = form.formState;
  const declaration = useWatch({ control: form.control, name: "declaration" }) ?? "";
  useUnsavedChangesPrompt(editing && isDirty);

  function guard(action: () => void) {
    if (editing && isDirty) setPendingDiscard(() => action);
    else action();
  }

  function selectTransaction(item: DocumentTransaction) {
    if (item.transactionKey === selectedKey) return;
    guard(() => {
      setEditing(false);
      setFormError(null);
      setChosenKey(item.transactionKey);
    });
  }

  function cancel() {
    guard(() => {
      setEditing(false);
      setFormError(null);
      if (formValues) form.reset(formValues);
    });
  }

  function onInvalid(errors: FieldErrors<DocumentSetupFormValues>) {
    const first = firstInvalidField(errors);
    if (first) form.setFocus(first);
  }

  function onValid(values: DocumentSetupFormValues) {
    if (!selectedKey || save.isPending) return;
    setFormError(null);
    save.mutate(toSaveInput(selectedKey, values, savedSetup?.version ?? null), {
      onSuccess: ({ setup }) => {
        cache.setDetail(selectedKey, setup);
        void cache.invalidateList();
        form.reset(toFormValues(setup));
        setEditing(false);
        toast.show("success", "Document setup saved");
      },
      onError: (error) => {
        const outcome = mapSaveError(error, savedRowOrder(values));
        for (const field of outcome.fieldErrors) form.setError(field.name as Path<DocumentSetupFormValues>, { type: "server", message: field.message });
        if (outcome.fieldErrors[0]) form.setFocus(outcome.fieldErrors[0].name as Path<DocumentSetupFormValues>);
        if (outcome.formError) setFormError({ message: outcome.formError, stale: outcome.stale });
        if (outcome.recheckAccess) {
          setEditing(false);
          void cache.recheckAccess();
        }
      },
    });
  }

  async function reloadLatest() {
    const result = await detail.refetch();
    if (!selected) return;
    form.reset(result.data?.setup ? toFormValues(result.data.setup) : defaultFormValues(selected));
    setFormError(null);
    setEditing(false);
  }

  function closeDrawer() {
    drawer.setOpen(false);
    window.requestAnimationFrame(() => toggleRef.current?.focus());
  }

  const listStatus = transactions.isPending ? "pending" : transactions.isError ? "error" : "success";

  return (
    <div className="flex h-full min-h-0 flex-col bg-gms-page">
      <div className="relative flex min-h-0 flex-1">
        {/* On a PC the open drawer pushes the content; on a tablet it overlays (owner 2026-10-21). */}
        <div className={cx("relative flex min-w-0 flex-1 flex-col overflow-y-auto p-4 sm:pb-6 sm:pl-6 sm:pr-10 sm:pt-6", drawer.open && DRAWER_PUSH_CLASS)}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
              <h1 className="text-gms-title font-medium text-gms-text-heading">Document Setup</h1>
              {selected && <span className="text-gms-body text-gms-text-secondary">{selected.label}</span>}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2.5">
              <Button onClick={cancel} disabled={!editing || save.isPending} className="h-[38px] min-w-[100px]">
                Cancel
              </Button>
              <Button type="submit" form={FORM_ID} variant="primary" loading={save.isPending} loadingLabel="Saving..." disabled={!editing} className="h-[38px] min-w-[100px]">
                Save
              </Button>
              <Button
                variant="primary"
                icon={<Pencil size={16} aria-hidden />}
                onClick={() => {
                  setFormError(null);
                  setEditing(true);
                }}
                disabled={!access.edit || editing || !loaded}
                className="h-[38px] min-w-[100px]"
              >
                Edit
              </Button>
            </div>
          </div>

          {transactions.isError && !items && <DetailLoadError message={loadErrorMessage(transactions.error, "transactions")} onRetry={() => void transactions.refetch()} />}
          {selectedKey !== null && detail.isError && <DetailLoadError message={loadErrorMessage(detail.error, "this document setup")} onRetry={() => void detail.refetch()} />}
          {selectedKey !== null && !loaded && !detail.isError && (
            <div aria-busy="true" aria-label="Loading document setup" className="h-[320px] animate-pulse rounded-gms-lg bg-gms-surface-sunken" />
          )}

          {loaded && selected && (
            <form
              id={FORM_ID}
              noValidate
              onSubmit={(event) => void form.handleSubmit(onValid, onInvalid)(event)}
              aria-label={editing ? `Edit document setup for ${selected.label}` : `Document setup for ${selected.label}`}
              className="flex flex-col gap-4"
            >
              {formError && <FormErrorBanner message={formError.message} onReload={formError.stale ? () => void reloadLatest() : undefined} reloading={detail.isFetching} />}
              {!savedSetup && (
                <p role="status" className="rounded-gms-md border border-gms-border bg-gms-surface-muted px-4 py-3 text-gms-body text-gms-text-secondary">
                  Not set up yet — numbers use these defaults.
                </p>
              )}
              <Card title="Document Setup" titleId="document-setup-title" titleClassName="text-gms-heading font-medium text-gms-text">
                <div className="grid grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
                  <TextField
                    id="document-setup-name"
                    label="Name"
                    required
                    readOnly={readOnly}
                    autoComplete="off"
                    maxLength={120}
                    placeholder="e.g. PURCHASE ORDER"
                    error={form.formState.errors.name?.message}
                    {...form.register("name")}
                  />
                  <TextField
                    id="document-setup-code"
                    label="Code"
                    required
                    readOnly={readOnly}
                    autoComplete="off"
                    maxLength={10}
                    placeholder="e.g. PO"
                    className="[&_input]:uppercase"
                    error={form.formState.errors.code?.message}
                    {...form.register("code")}
                  />
                  <TextField
                    id="document-setup-start-from"
                    label="Start From"
                    required
                    readOnly={readOnly}
                    autoComplete="off"
                    inputMode="numeric"
                    maxLength={9}
                    placeholder="e.g. 1"
                    error={form.formState.errors.startFrom?.message}
                    {...form.register("startFrom", {
                      onChange: (event: { target: HTMLInputElement }) => {
                        event.target.value = event.target.value.replace(/\D/g, "");
                      },
                    })}
                  />
                </div>
                <p className="mt-3 text-gms-label text-gms-text-secondary">Name is printed as the document header. Start From is the Start No for new rows.</p>
              </Card>

              <NumberingCard form={form} readOnly={readOnly} />

              <Card
                title="Declaration"
                titleId="document-declaration-title"
                titleClassName="text-gms-heading font-medium text-gms-text"
                trailing={<span className="text-gms-label text-gms-text-secondary" aria-live="polite">{`${declaration.length} / ${DECLARATION_MAX.toLocaleString("en-US")}`}</span>}
              >
                <PlainTextField
                  id="document-setup-declaration"
                  labelledBy="document-declaration-title"
                  readOnly={readOnly}
                  rows={6}
                  maxLength={DECLARATION_MAX}
                  placeholder="Text printed on the document"
                  error={form.formState.errors.declaration?.message}
                  {...form.register("declaration")}
                />
              </Card>
            </form>
          )}
        </div>

        <button
          ref={toggleRef}
          type="button"
          aria-expanded={drawer.open}
          aria-controls={TRANSACTIONS_DRAWER_ID}
          aria-label={drawer.open ? "Hide transactions panel" : "Show transactions panel"}
          onClick={() => drawer.setOpen(!drawer.open)}
          className={cx(
            "absolute top-4 z-40 flex h-10 w-6 items-center justify-center rounded-l-gms-sm bg-gms-primary-strong text-gms-on-primary print:hidden",
            drawer.open ? "max-sm:hidden sm:right-80" : "right-0",
            focusRing,
          )}
        >
          {drawer.open ? <ChevronRight size={16} aria-hidden /> : <ChevronLeft size={16} aria-hidden />}
        </button>

        <TransactionsDrawer
          open={drawer.open}
          items={items}
          status={listStatus}
          errorMessage={transactions.isError ? loadErrorMessage(transactions.error, "transactions") : undefined}
          onRetry={() => void transactions.refetch()}
          selectedKey={selectedKey}
          onSelect={selectTransaction}
          onClose={closeDrawer}
        />
      </div>

      <DiscardChangesDialog
        entity={DOCUMENT_SETUP_ENTITY}
        open={pendingDiscard !== null}
        name={selected ? `the ${selected.label} setup` : ""}
        onKeep={() => setPendingDiscard(null)}
        onDiscard={() => {
          const action = pendingDiscard;
          setPendingDiscard(null);
          action?.();
        }}
      />
    </div>
  );
}
