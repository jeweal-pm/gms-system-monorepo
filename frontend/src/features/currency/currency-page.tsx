"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useForm, useWatch, type FieldErrors, type Path } from "react-hook-form";
import { cx } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ToastProvider, useToast } from "@/components/ui/toast";
import type { PartnerAccess } from "@/features/partner/access";
import { DiscardChangesDialog } from "@/features/partner/components/discard-changes-dialog";
import { PartnerDrawer, partnerDrawerId, type PartnerListQuery } from "@/features/partner/components/partner-drawer";
import { PartnerPageHeader, type PartnerMode } from "@/features/partner/components/partner-page-header";
import { DetailLoadError, DrawerToggle, FormErrorBanner, PartnerAccessGuard, printDateFormatter } from "@/features/partner/components/partner-page-parts";
import { useDebouncedSearch, useUnsavedChangesPrompt } from "@/features/partner/hooks";
import { DRAWER_PUSH_CLASS, useDrawerState } from "@/lib/drawer-layout";
import {
  CURRENCY_ENTITY,
  isNotFound,
  isPermissionDenied,
  loadErrorMessage,
  mapDeleteError,
  mapSaveError,
  rowText,
  toCreateInput,
  toDuplicateValues,
  toFormValues,
  toUpdateFields,
  type CurrencyDetail,
  type CurrencyListItem,
} from "./api";
import { CurrencyFieldsCard } from "./components/currency-fields-card";
import { useCurrencyCache, useCurrencyDetail, useCurrencyList, useCurrencyListsFetching, useCurrencyLoader, useCurrencyMutations, useCurrencyOverview } from "./hooks";
import { CURRENCY_SEARCH_MAX, currencyFormSchema, emptyCurrencyForm, FIELD_ORDER, isBaseCode, type CurrencyFormValues } from "./schema";

const FORM_ID = "currency-form";
const entity = CURRENCY_ENTITY;

/**
 * Setup › Master Code › Currency (currency UI rev 1, source 01). Same modes and permission rules as the
 * Stone Master pages (create / view / edit / none; buttons disabled without the action). Rates are against
 * the Company Profile currency (base), which has no rates and is always active (SA-CUR-02).
 */
export function CurrencyPage() {
  return (
    <ToastProvider>
      <PartnerAccessGuard entity={entity}>{(access) => <CurrencyWorkspace access={access} />}</PartnerAccessGuard>
    </ToastProvider>
  );
}

type FocusRequest = { name: Path<CurrencyFormValues>; seq: number } | null;

function CurrencyWorkspace({ access }: { access: PartnerAccess }) {
  const toast = useToast();
  const cache = useCurrencyCache();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [previousId, setPreviousId] = useState<string | null>(null);
  const drawer = useDrawerState();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [pendingDiscard, setPendingDiscard] = useState<(() => void) | null>(null);
  const [formError, setFormError] = useState<{ message: string; stale?: boolean } | null>(null);
  const [goneId, setGoneId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest>(null);
  const [printedAt, setPrintedAt] = useState("");
  const [query, setQuery] = useState("");
  const search = useDebouncedSearch(query);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const submittingRef = useRef(false);
  const selectionRef = useRef<string | null>(null);
  const loadedVersionRef = useRef<string | null>(null);

  const overview = useCurrencyOverview();
  const list = useCurrencyList(search);
  const detail = useCurrencyDetail(selectedId);
  const loadRecord = useCurrencyLoader();
  const listsFetching = useCurrencyListsFetching();
  const { create, update, remove } = useCurrencyMutations();

  const loaded = selectedId !== null && loadedId === selectedId && detail.data?.id === selectedId;
  const gone = selectedId !== null && goneId === selectedId;
  const mode: PartnerMode = selectedId === null ? (access.add ? "create" : "none") : editing && access.edit && loaded && !gone ? "edit" : "view";
  const submitting = create.isPending || update.isPending;
  const readOnly = mode !== "create" && mode !== "edit";
  const baseCode = (loaded ? detail.data?.baseCode : undefined) ?? overview.baseCode ?? null;

  const resolver = useMemo(() => zodResolver(currencyFormSchema(baseCode)), [baseCode]);
  const form = useForm<CurrencyFormValues>({ resolver, mode: "onBlur", reValidateMode: "onChange", shouldFocusError: false, defaultValues: emptyCurrencyForm() });
  const { isDirty } = form.formState;
  const watchedCode = useWatch({ control: form.control, name: "code" }) ?? "";
  const storedCode = loaded ? detail.data?.code : undefined;
  const isBase = isBaseCode(storedCode ?? watchedCode, baseCode);

  // The base currency is always active: a create that becomes the base turns Active back on.
  useEffect(() => {
    if (isBase && !readOnly && !form.getValues("active")) form.setValue("active", true, { shouldDirty: true });
  }, [isBase, readOnly, form]);

  const requestFocus = useCallback((name: Path<CurrencyFormValues>) => setFocusRequest((current) => ({ name, seq: (current?.seq ?? 0) + 1 })), []);
  useEffect(() => {
    if (focusRequest) form.setFocus(focusRequest.name, { shouldSelect: false });
  }, [focusRequest, form]);

  useUnsavedChangesPrompt(isDirty);

  const lostAccess = isPermissionDenied(detail.error) || isPermissionDenied(list.error);
  useEffect(() => {
    if (lostAccess) void cache.recheckAccess();
  }, [cache, lostAccess]);

  const detailNotFound = isNotFound(detail.error);
  useEffect(() => {
    if (detailNotFound) void cache.invalidateLists();
  }, [cache, detailNotFound]);

  useEffect(() => {
    const handler = () => flushSync(() => setPrintedAt(printDateFormatter.format(new Date())));
    window.addEventListener("beforeprint", handler);
    return () => window.removeEventListener("beforeprint", handler);
  }, []);

  function guard(action: () => void) {
    if (form.formState.isDirty) setPendingDiscard(() => action);
    else action();
  }

  function openDraft() {
    selectionRef.current = null;
    form.reset(emptyCurrencyForm());
    setFormError(null);
    setSelectedId(null);
    setLoadedId(null);
    setEditing(false);
    if (access.add) requestFocus("code");
  }

  function startCreate() {
    if (!access.add) return;
    guard(() => {
      setPreviousId(selectedId);
      openDraft();
    });
  }

  function startEdit() {
    if (!access.edit || !loaded || gone) return;
    setFormError(null);
    setEditing(true);
    requestFocus("name");
  }

  function applyDetail(data: CurrencyDetail) {
    form.reset(toFormValues(data));
    loadedVersionRef.current = data.updatedAt;
  }

  function cancel() {
    setFormError(null);
    if (mode === "edit") {
      if (detail.data && detail.data.id === selectedId) applyDetail(detail.data);
      setEditing(false);
      return;
    }
    if (mode !== "create") return;
    const previous = previousId;
    setPreviousId(null);
    if (previous !== null) selectRecord(previous);
    else openDraft();
  }

  function loadIntoForm(id: string) {
    selectionRef.current = id;
    loadRecord(id).then(
      (data) => {
        if (selectionRef.current !== id) return;
        applyDetail(data);
        setLoadedId(id);
      },
      () => undefined,
    );
  }

  function selectRecord(id: string) {
    setFormError(null);
    setEditing(false);
    setSelectedId(id);
    setLoadedId(null);
    loadIntoForm(id);
  }

  function reloadLatest() {
    if (selectedId === null) return;
    const id = selectedId;
    setFormError(null);
    void detail.refetch().then((result) => {
      if (result.data?.id === id) applyDetail(result.data);
    });
  }

  function duplicate() {
    const source = detail.data;
    if (!access.add || !loaded || !source) return;
    guard(() => {
      form.reset(emptyCurrencyForm());
      form.reset(toDuplicateValues(source), { keepDefaultValues: true });
      selectionRef.current = null;
      setPreviousId(source.id);
      setFormError(null);
      setSelectedId(null);
      setLoadedId(null);
      setEditing(false);
      requestFocus("code");
      toast.show("info", `Copied from ${source.code}. Enter a new code, then save.`);
    });
  }

  function refresh() {
    guard(() => {
      setFormError(null);
      void cache.invalidateLists();
      if (selectedId === null) {
        form.reset(emptyCurrencyForm());
        return;
      }
      const id = selectedId;
      void detail.refetch().then((result) => {
        if (result.data?.id === id) applyDetail(result.data);
      });
    });
  }

  function print() {
    if (!loaded) return;
    flushSync(() => setPrintedAt(printDateFormatter.format(new Date())));
    window.print();
  }

  function focusFirstError(names: readonly string[]) {
    const first = FIELD_ORDER.find((name) => names.includes(name));
    if (first) requestFocus(first);
  }

  const onInvalid = (errors: FieldErrors<CurrencyFormValues>) => focusFirstError(Object.keys(errors));

  const onValid = async (values: CurrencyFormValues) => {
    if (submittingRef.current || (mode !== "create" && mode !== "edit")) return;
    submittingRef.current = true;
    setFormError(null);
    try {
      if (mode === "create") {
        const result = await create.mutateAsync(toCreateInput(values, baseCode));
        toast.show("success", "Currency created");
        void cache.invalidateLists();
        void cache.invalidateOptions();
        setPreviousId(null);
        setEditing(false);
        setSelectedId(result.id);
        setLoadedId(null);
        loadIntoForm(result.id);
      } else if (selectedId !== null && detail.data) {
        const id = selectedId;
        const fields = toUpdateFields(values, detail.data.code, baseCode);
        await update.mutateAsync({ id, expectedUpdatedAt: loadedVersionRef.current ?? detail.data.updatedAt, ...fields });
        toast.show("success", "Changes saved");
        void cache.invalidateLists();
        void cache.invalidateOptions();
        const result = await detail.refetch();
        if (result.data?.id === id) applyDetail(result.data);
        setEditing(false);
      }
    } catch (cause) {
      const outcome = mapSaveError(cause);
      setFormError(outcome.formError ? { message: outcome.formError, stale: outcome.stale } : null);
      for (const { name, message } of outcome.fieldErrors) form.setError(name, { type: "server", message });
      focusFirstError(outcome.fieldErrors.map((entry) => entry.name));
      if (outcome.notFound && selectedId !== null) {
        setGoneId(selectedId);
        setEditing(false);
        void cache.invalidateLists();
      }
      if (outcome.recheckAccess) void cache.recheckAccess();
    } finally {
      submittingRef.current = false;
    }
  };

  function confirmDelete() {
    if (!deleteTarget || remove.isPending) return;
    const { id } = deleteTarget;
    setDeleteError(undefined);
    const finish = (tone: "success" | "info", message: string) => {
      toast.show(tone, message);
      setDeleteTarget(null);
      remove.reset();
      if (previousId === id) setPreviousId(null);
      if (id === selectedId) openDraft();
      void cache.resetDetail(id);
      void cache.invalidateLists();
      void cache.invalidateOptions();
    };
    remove.mutate(
      { id },
      {
        onSuccess: () => finish("success", "Currency deleted"),
        onError: (error) => {
          const outcome = mapDeleteError(error);
          if (outcome.kind === "gone") return finish("info", outcome.message);
          setDeleteError(outcome.message);
          if (outcome.recheckAccess) void cache.recheckAccess();
        },
      },
    );
  }

  function closeDrawer() {
    drawer.setOpen(false);
    window.requestAnimationFrame(() => toggleRef.current?.focus());
  }

  const showForm = mode === "create" || mode === "none" || ((mode === "edit" || mode === "view") && loaded);
  const recordTitle = loaded && detail.data ? detail.data.code : undefined;
  const printRows = useMemo(() => {
    const data = detail.data;
    if (!loaded || !data) return [];
    const base = data.code === data.baseCode;
    return [
      { label: "Code Name", value: data.code },
      { label: "Name", value: data.name },
      { label: "Description", value: data.description },
      { label: "Selling Rate", value: base ? "Base currency" : data.sellingRate ? `${data.sellingRate} ${data.baseCode ?? ""}` : "" },
      { label: "Buying Rate", value: base ? "Base currency" : data.buyingRate ? `${data.buyingRate} ${data.baseCode ?? ""}` : "" },
      { label: "Active", value: data.active ? "Yes" : "No" },
    ];
  }, [loaded, detail.data]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-gms-page">
      <div className="relative flex min-h-0 flex-1">
        {/* On a PC the open drawer pushes the content; on a tablet it overlays (owner 2026-10-21). */}
        <div className={cx("relative flex min-w-0 flex-1 flex-col overflow-y-auto p-4 sm:pb-6 sm:pl-6 sm:pr-10 sm:pt-6 print:hidden", drawer.open && DRAWER_PUSH_CLASS)}>
          <PartnerPageHeader
            entity={entity}
            formId={FORM_ID}
            mode={mode}
            recordName={recordTitle}
            total={overview.total}
            savedLoaded={loaded}
            canAdd={access.add}
            canEdit={access.edit}
            canDelete={access.delete}
            canPrint={access.print}
            gone={gone}
            submitting={submitting}
            deleting={deleteTarget !== null}
            refreshing={listsFetching || (selectedId !== null && detail.isFetching)}
            onPrint={print}
            onDuplicate={duplicate}
            onRefresh={refresh}
            onCreate={startCreate}
            onCancel={cancel}
            onEdit={startEdit}
            onDelete={() => {
              if (loaded && detail.data) setDeleteTarget({ id: detail.data.id, name: detail.data.code });
            }}
          />

          {selectedId !== null && !loaded && detail.isError && (
            <DetailLoadError message={loadErrorMessage(detail.error, "this currency")} onRetry={detailNotFound ? undefined : () => loadIntoForm(selectedId)} />
          )}
          {selectedId !== null && !loaded && !detail.isError && (
            <div aria-busy="true" aria-label="Loading currency" className="h-[320px] animate-pulse rounded-gms-lg bg-gms-surface-sunken" />
          )}

          {showForm && (
            <form
              id={FORM_ID}
              noValidate
              onSubmit={(event) => void form.handleSubmit(onValid, onInvalid)(event)}
              aria-label={mode === "create" ? "Create currency" : mode === "edit" ? "Edit currency" : "Currency details"}
              className="flex flex-1 flex-col gap-4"
            >
              {formError && <FormErrorBanner message={formError.message} onReload={formError.stale ? reloadLatest : undefined} reloading={detail.isFetching} />}
              <CurrencyFieldsCard form={form} readOnly={readOnly} codeLocked={mode === "edit"} baseCode={baseCode} isBase={isBase} />
            </form>
          )}
        </div>

        <DrawerToggle ref={toggleRef} entity={entity} open={drawer.open} drawerId={partnerDrawerId(entity)} onToggle={() => drawer.setOpen(!drawer.open)} />

        <PartnerDrawer<CurrencyListItem>
          entity={entity}
          open={drawer.open}
          total={overview.total}
          query={query}
          search={search}
          maxSearchLength={CURRENCY_SEARCH_MAX}
          onQueryChange={setQuery}
          list={list as unknown as PartnerListQuery<CurrencyListItem>}
          loadErrorMessage={loadErrorMessage}
          draft={access.add}
          draftSelected={mode === "create"}
          selectedId={selectedId}
          onSelectDraft={() => {
            if (mode === "create") requestFocus("code");
            else startCreate();
          }}
          onSelectItem={(item) => {
            if (item.id === selectedId) return;
            guard(() => selectRecord(item.id));
          }}
          onClose={closeDrawer}
          searchPlaceholder="Search code or name..."
          rowText={(item) => rowText(item, baseCode)}
        />
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete ${deleteTarget?.name ?? "currency"}?`}
        body="The currency will be permanently deleted. This can't be undone. A currency that Company Profile, a vendor or a customer uses can't be deleted; turn off Active instead."
        cancelLabel="Keep currency"
        confirmLabel="Delete"
        pendingLabel="Deleting..."
        pending={remove.isPending}
        error={deleteError}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(undefined);
          remove.reset();
        }}
        onConfirm={confirmDelete}
      />
      <DiscardChangesDialog
        entity={entity}
        open={pendingDiscard !== null}
        name={watchedCode}
        onKeep={() => setPendingDiscard(null)}
        onDiscard={() => {
          const action = pendingDiscard;
          setPendingDiscard(null);
          action?.();
        }}
      />
      {loaded && detail.data && (
        <section aria-hidden className="hidden text-black print:block">
          <p className="text-gms-label">Setup › Currency</p>
          <h1 className="mt-1 text-gms-title font-medium">{detail.data.code}</h1>
          <dl className="mt-6 grid grid-cols-[180px_1fr] gap-x-6 gap-y-2 text-gms-body">
            {printRows.map((row) => (
              <div key={row.label} className="contents">
                <dt className="font-medium">{row.label}</dt>
                <dd>{row.value || "—"}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-8 text-gms-label">{`Printed ${printedAt}`}</p>
        </section>
      )}
    </div>
  );
}
