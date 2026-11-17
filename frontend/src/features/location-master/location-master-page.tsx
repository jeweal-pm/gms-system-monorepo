"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useRef, useState } from "react";
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
  isNotFound,
  isPermissionDenied,
  loadErrorMessage,
  LOCATION_ENTITY,
  mapDeleteError,
  mapSaveError,
  rowText,
  toDuplicateValues,
  toFormValues,
  toInput,
  type LocationDetail,
  type LocationDrawerItem,
} from "./api";
import { LocationFieldsCard } from "./components/location-fields-card";
import { useLocationCache, useLocationDetail, useLocationList, useLocationListsFetching, useLocationLoader, useLocationMutations, useLocationTotal } from "./hooks";
import { emptyLocationForm, FIELD_ORDER, LOCATION_SEARCH_MAX, locationFormSchema, type LocationFormValues } from "./schema";

const FORM_ID = "location-form";
const entity = LOCATION_ENTITY;

/**
 * Setup › Master Code › Location Master (location-master UI rev 1, ADR-0053): the Stone Master › Size layout with one
 * Name field and the Active switch. Same modes and permission rules as the other masters (create / view / edit /
 * none; buttons disabled without the action). Documents copy the name, so a rename or delete never changes them.
 */
export function LocationMasterPage() {
  return (
    <ToastProvider>
      <PartnerAccessGuard entity={entity}>{(access) => <LocationWorkspace access={access} />}</PartnerAccessGuard>
    </ToastProvider>
  );
}

type FocusRequest = { name: Path<LocationFormValues>; seq: number } | null;

function LocationWorkspace({ access }: { access: PartnerAccess }) {
  const toast = useToast();
  const cache = useLocationCache();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [previousId, setPreviousId] = useState<string | null>(null);
  const drawer = useDrawerState();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; updatedAt: string } | null>(null);
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

  const total = useLocationTotal();
  const list = useLocationList(search);
  const detail = useLocationDetail(selectedId);
  const loadRecord = useLocationLoader();
  const listsFetching = useLocationListsFetching();
  const { create, update, remove } = useLocationMutations();

  const loaded = selectedId !== null && loadedId === selectedId && detail.data?.id === selectedId;
  const gone = selectedId !== null && goneId === selectedId;
  const mode: PartnerMode = selectedId === null ? (access.add ? "create" : "none") : editing && access.edit && loaded && !gone ? "edit" : "view";
  const submitting = create.isPending || update.isPending;
  const readOnly = mode !== "create" && mode !== "edit";

  const form = useForm<LocationFormValues>({ resolver: zodResolver(locationFormSchema), mode: "onBlur", reValidateMode: "onChange", shouldFocusError: false, defaultValues: emptyLocationForm() });
  const { isDirty } = form.formState;
  const watchedName = useWatch({ control: form.control, name: "name" }) ?? "";

  const requestFocus = useCallback((name: Path<LocationFormValues>) => setFocusRequest((current) => ({ name, seq: (current?.seq ?? 0) + 1 })), []);
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
    form.reset(emptyLocationForm());
    setFormError(null);
    setSelectedId(null);
    setLoadedId(null);
    setEditing(false);
    if (access.add) requestFocus("name");
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

  function applyDetail(data: LocationDetail) {
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
      form.reset(emptyLocationForm());
      form.reset(toDuplicateValues(source), { keepDefaultValues: true });
      selectionRef.current = null;
      setPreviousId(source.id);
      setFormError(null);
      setSelectedId(null);
      setLoadedId(null);
      setEditing(false);
      requestFocus("name");
      toast.show("info", `Copied from ${source.name}. Enter a new name, then save.`);
    });
  }

  function refresh() {
    guard(() => {
      setFormError(null);
      void cache.invalidateLists();
      if (selectedId === null) {
        form.reset(emptyLocationForm());
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

  const onInvalid = (errors: FieldErrors<LocationFormValues>) => focusFirstError(Object.keys(errors));

  const onValid = async (values: LocationFormValues) => {
    if (submittingRef.current || (mode !== "create" && mode !== "edit")) return;
    submittingRef.current = true;
    setFormError(null);
    try {
      if (mode === "create") {
        const result = await create.mutateAsync(toInput(values));
        toast.show("success", "Location created");
        void cache.invalidateLists();
        void cache.invalidateOptions();
        setPreviousId(null);
        setEditing(false);
        setSelectedId(result.id);
        setLoadedId(null);
        loadIntoForm(result.id);
      } else if (selectedId !== null && detail.data) {
        const id = selectedId;
        await update.mutateAsync({ id, expectedUpdatedAt: loadedVersionRef.current ?? detail.data.updatedAt, ...toInput(values) });
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
    const { id, updatedAt } = deleteTarget;
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
      { id, expectedUpdatedAt: updatedAt },
      {
        onSuccess: () => finish("success", "Location deleted"),
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
  const recordTitle = loaded && detail.data ? detail.data.name : undefined;

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
            total={total}
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
              if (loaded && detail.data) setDeleteTarget({ id: detail.data.id, name: detail.data.name, updatedAt: loadedVersionRef.current ?? detail.data.updatedAt });
            }}
          />

          {selectedId !== null && !loaded && detail.isError && (
            <DetailLoadError message={loadErrorMessage(detail.error, "this location")} onRetry={detailNotFound ? undefined : () => loadIntoForm(selectedId)} />
          )}
          {selectedId !== null && !loaded && !detail.isError && (
            <div aria-busy="true" aria-label="Loading location" className="h-[320px] animate-pulse rounded-gms-lg bg-gms-surface-sunken" />
          )}

          {showForm && (
            <form
              id={FORM_ID}
              noValidate
              onSubmit={(event) => void form.handleSubmit(onValid, onInvalid)(event)}
              aria-label={mode === "create" ? "Create location" : mode === "edit" ? "Edit location" : "Location details"}
              className="flex flex-1 flex-col gap-4"
            >
              {formError && <FormErrorBanner message={formError.message} onReload={formError.stale ? reloadLatest : undefined} reloading={detail.isFetching} />}
              <LocationFieldsCard form={form} readOnly={readOnly} />
            </form>
          )}
        </div>

        <DrawerToggle ref={toggleRef} entity={entity} open={drawer.open} drawerId={partnerDrawerId(entity)} onToggle={() => drawer.setOpen(!drawer.open)} />

        <PartnerDrawer<LocationDrawerItem>
          entity={entity}
          open={drawer.open}
          total={total}
          query={query}
          search={search}
          maxSearchLength={LOCATION_SEARCH_MAX}
          onQueryChange={setQuery}
          list={list as unknown as PartnerListQuery<LocationDrawerItem>}
          loadErrorMessage={loadErrorMessage}
          draft={access.add}
          draftSelected={mode === "create"}
          selectedId={selectedId}
          onSelectDraft={() => {
            if (mode === "create") requestFocus("name");
            else startCreate();
          }}
          onSelectItem={(item) => {
            if (item.id === selectedId) return;
            guard(() => selectRecord(item.id));
          }}
          onClose={closeDrawer}
          searchPlaceholder="Search name..."
          rowText={rowText}
        />
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete ${deleteTarget?.name ?? "location"}?`}
        body="The location will be permanently deleted. Documents that already use it keep the name they saved. To stop offering it, you can turn off Active instead."
        cancelLabel="Keep location"
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
        name={watchedName}
        onKeep={() => setPendingDiscard(null)}
        onDiscard={() => {
          const action = pendingDiscard;
          setPendingDiscard(null);
          action?.();
        }}
      />
      {loaded && detail.data && (
        <section aria-hidden className="hidden text-black print:block">
          <p className="text-gms-label">Setup › Location Master</p>
          <h1 className="mt-1 text-gms-title font-medium">{detail.data.name}</h1>
          <dl className="mt-6 grid grid-cols-[180px_1fr] gap-x-6 gap-y-2 text-gms-body">
            <dt className="font-medium">Name</dt>
            <dd>{detail.data.name}</dd>
            <dt className="font-medium">Active</dt>
            <dd>{detail.data.active ? "Yes" : "No"}</dd>
          </dl>
          <p className="mt-8 text-gms-label">{`Printed ${printedAt}`}</p>
        </section>
      )}
    </div>
  );
}
