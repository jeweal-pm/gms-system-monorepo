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
import { DRAWER_PUSH_CLASS, useDrawerState } from "@/lib/drawer-layout";
import { useDebouncedSearch, useUnsavedChangesPrompt } from "@/features/partner/hooks";
import {
  isNotFound,
  isPermissionDenied,
  loadErrorMessage,
  mapDeleteError,
  mapSaveError,
  OPTION_KINDS_BY_FIELDS,
  optionLabel,
  PART_OPTION,
  referencedIds,
  rowText,
  toDuplicateValues,
  toFormValues,
  toInput,
  type StoneDetail,
  type StoneListItem,
} from "./api";
import { StoneFieldsCard, type OptionsState } from "./components/stone-fields-card";
import { StonePrintView } from "./components/stone-print-view";
import { useStoneCache, useStoneDetail, useStoneList, useStoneListsFetching, useStoneLoader, useStoneMutations, useStoneOptions, useStoneTotal } from "./hooks";
import type { StonePage } from "./kinds";
import { emptyStoneForm, FIELD_ORDER, STONE_SEARCH_MAX, stoneFormSchema, type StoneFormValues } from "./schema";
import { buildAutoCode, PART_FIELD, PART_KEYS, PART_LABEL } from "./stone-code";

const FORM_ID = "stone-master-form";

/**
 * Setup › Stone Master pages (stone-master UI revision 1, ADR-0024). One shared workspace for all nine
 * pages, driven by the page config in kinds.ts. Same modes and permission rules as the Partner Master
 * pages (create / view / edit / none; buttons disabled without the action, VIEW-only lands on a
 * disabled Add page). `permission.mine` gates every request (`stone-master:VIEW`).
 */
export function StoneMasterPage({ page }: { page: StonePage }) {
  return (
    <ToastProvider>
      <PartnerAccessGuard entity={page.entity}>{(access) => <StoneWorkspace key={page.slug} page={page} access={access} />}</PartnerAccessGuard>
    </ToastProvider>
  );
}

type FocusRequest = { name: Path<StoneFormValues>; seq: number } | null;

function StoneWorkspace({ page, access }: { page: StonePage; access: PartnerAccess }) {
  const { kind, fields, entity } = page;
  const toast = useToast();
  const cache = useStoneCache(kind);
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

  const total = useStoneTotal(kind);
  const list = useStoneList(kind, search);
  const detail = useStoneDetail(kind, selectedId);
  const loadRecord = useStoneLoader(kind);
  const listsFetching = useStoneListsFetching(kind);
  const { create, update, remove } = useStoneMutations(kind);

  const resolver = useMemo(() => zodResolver(stoneFormSchema(fields)), [fields]);
  const form = useForm<StoneFormValues>({ resolver, mode: "onBlur", reValidateMode: "onChange", shouldFocusError: false, defaultValues: emptyStoneForm() });
  const { isDirty } = form.formState;
  const watched = useWatch({ control: form.control });

  const loaded = selectedId !== null && loadedId === selectedId && detail.data?.id === selectedId;
  const gone = selectedId !== null && goneId === selectedId;
  const mode: PartnerMode = selectedId === null ? (access.add ? "create" : "none") : editing && access.edit && loaded && !gone ? "edit" : "view";
  const submitting = create.isPending || update.isPending;
  const readOnly = mode !== "create" && mode !== "edit";

  const include = useMemo(() => referencedIds(fields, loaded ? detail.data : undefined), [fields, loaded, detail.data]);
  const options = useStoneOptions(OPTION_KINDS_BY_FIELDS[fields], include);
  const optionsState: OptionsState = { data: options.data, status: options.isPending && OPTION_KINDS_BY_FIELDS[fields].length > 0 ? "loading" : options.isError ? "error" : "ready", onRetry: () => void options.refetch() };

  // Live Auto code from the chosen parts' codes in the current order (the server rebuilds it on save).
  const autoCode = useMemo(() => {
    if (fields !== "stoneCode") return "";
    const codes = Object.fromEntries(PART_KEYS.map((part) => {
      const id = watched[PART_FIELD[part]];
      return [part, options.data?.[PART_OPTION[part]]?.find((option) => option.id === id)?.code];
    }));
    return buildAutoCode(watched.partOrder ?? [], codes);
  }, [fields, watched, options.data]);

  const requestFocus = useCallback((name: Path<StoneFormValues>) => setFocusRequest((current) => ({ name, seq: (current?.seq ?? 0) + 1 })), []);
  useEffect(() => {
    if (focusRequest) form.setFocus(focusRequest.name, { shouldSelect: false });
  }, [focusRequest, form]);

  useUnsavedChangesPrompt(isDirty);

  const lostAccess = isPermissionDenied(detail.error) || isPermissionDenied(options.error) || isPermissionDenied(list.error);
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

  const firstField: Path<StoneFormValues> = fields === "stoneCode" ? "stoneNameId" : "code";

  function guard(action: () => void) {
    if (form.formState.isDirty) setPendingDiscard(() => action);
    else action();
  }

  function openDraft() {
    selectionRef.current = null;
    form.reset(emptyStoneForm());
    setFormError(null);
    setSelectedId(null);
    setLoadedId(null);
    setEditing(false);
    if (access.add) requestFocus(firstField);
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
    requestFocus(firstField);
  }

  function applyDetail(data: StoneDetail) {
    form.reset(toFormValues(fields, data));
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
      form.reset(emptyStoneForm());
      form.reset(toDuplicateValues(fields, source), { keepDefaultValues: true });
      selectionRef.current = null;
      setPreviousId(source.id);
      setFormError(null);
      setSelectedId(null);
      setLoadedId(null);
      setEditing(false);
      requestFocus(firstField);
      toast.show("info", `Copied from ${source.name ?? source.code}. Enter a new code, then save.`);
    });
  }

  function refresh() {
    guard(() => {
      setFormError(null);
      void cache.invalidateLists();
      void options.refetch();
      if (selectedId === null) {
        form.reset(emptyStoneForm());
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

  const onInvalid = (errors: FieldErrors<StoneFormValues>) => focusFirstError(Object.keys(errors));

  const onValid = async (values: StoneFormValues) => {
    if (submittingRef.current || (mode !== "create" && mode !== "edit")) return;
    submittingRef.current = true;
    setFormError(null);
    try {
      const input = toInput(fields, values);
      if (mode === "create") {
        const result = await create.mutateAsync(input);
        toast.show("success", `${entity.singular} created`);
        void cache.invalidateLists();
        void cache.invalidateOptions();
        setPreviousId(null);
        setEditing(false);
        setSelectedId(result.id);
        setLoadedId(null);
        loadIntoForm(result.id);
      } else if (selectedId !== null && detail.data) {
        const id = selectedId;
        await update.mutateAsync({ id, expectedUpdatedAt: loadedVersionRef.current ?? detail.data.updatedAt, ...input });
        toast.show("success", "Changes saved");
        void cache.invalidateLists();
        void cache.invalidateOptions();
        const result = await detail.refetch();
        if (result.data?.id === id) applyDetail(result.data);
        setEditing(false);
      }
    } catch (cause) {
      const outcome = mapSaveError(cause, fields);
      setFormError(outcome.formError ? { message: outcome.formError, stale: outcome.stale } : null);
      for (const { name, message } of outcome.fieldErrors) form.setError(name, { type: "server", message });
      focusFirstError(outcome.fieldErrors.map((entry) => entry.name));
      if (outcome.notFound && selectedId !== null) {
        setGoneId(selectedId);
        setEditing(false);
        void cache.invalidateLists();
      }
      if (outcome.refetchOptions) void options.refetch();
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
        onSuccess: () => finish("success", `${entity.singular} deleted`),
        onError: (error) => {
          const outcome = mapDeleteError(error, entity.singular);
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
  const recordTitle = loaded && detail.data ? (fields === "stoneCode" ? detail.data.code : detail.data.name) : undefined;
  const printRows = useMemo(() => {
    const data = detail.data;
    if (!loaded || !data) return [];
    const find = (key: "group" | "size", id: string | null | undefined) => options.data?.[key]?.find((option) => option.id === id);
    if (fields === "stoneCode" && data.parts) {
      const parts = data.parts;
      return [
        { label: "Stone Code", value: data.code },
        { label: "Mode", value: data.mode === "MANUAL" ? "Manual Code" : "Auto Code" },
        ...(data.partOrder ?? []).map((part, index) => {
          const id = parts[PART_FIELD[part]];
          const option = options.data?.[PART_OPTION[part]]?.find((entry) => entry.id === id);
          return { label: `#${index + 1} ${PART_LABEL[part]}`, value: option ? optionLabel(option) : "" };
        }),
        { label: "Active", value: data.active ? "Yes" : "No" },
      ];
    }
    const rows = [{ label: "Code Name", value: data.code }, { label: "Name", value: data.name ?? "" }];
    if (fields === "stoneName") {
      const group = find("group", data.groupId);
      rows.push({ label: "Stone Group", value: group ? optionLabel(group) : "" }, { label: "HSN", value: data.hsn ?? "" });
    }
    if (fields === "shape") rows.push({ label: "Sizes Available", value: (data.sizeIds ?? []).map((id) => find("size", id)?.name ?? "").filter(Boolean).join(", ") });
    rows.push({ label: "Active", value: data.active ? "Yes" : "No" });
    return rows;
  }, [loaded, detail.data, fields, options.data]);

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
              if (loaded && detail.data) setDeleteTarget({ id: detail.data.id, name: recordTitle ?? detail.data.code });
            }}
          />

          {selectedId !== null && !loaded && detail.isError && (
            <DetailLoadError message={loadErrorMessage(detail.error, `this ${entity.singular.toLowerCase()}`)} onRetry={detailNotFound ? undefined : () => loadIntoForm(selectedId)} />
          )}
          {selectedId !== null && !loaded && !detail.isError && (
            <div aria-busy="true" aria-label={`Loading ${entity.singular.toLowerCase()}`} className="h-[320px] animate-pulse rounded-gms-lg bg-gms-surface-sunken" />
          )}

          {showForm && (
            <form
              id={FORM_ID}
              noValidate
              onSubmit={(event) => void form.handleSubmit(onValid, onInvalid)(event)}
              aria-label={mode === "create" ? `Create ${entity.singular.toLowerCase()}` : mode === "edit" ? `Edit ${entity.singular.toLowerCase()}` : `${entity.singular} details`}
              className="flex flex-1 flex-col gap-4"
            >
              {formError && <FormErrorBanner message={formError.message} onReload={formError.stale ? reloadLatest : undefined} reloading={detail.isFetching} />}
              <StoneFieldsCard page={page} form={form} readOnly={readOnly} options={optionsState} autoCode={autoCode} />
            </form>
          )}
        </div>

        <DrawerToggle ref={toggleRef} entity={entity} open={drawer.open} drawerId={partnerDrawerId(entity)} onToggle={() => drawer.setOpen(!drawer.open)} />

        <PartnerDrawer<StoneListItem>
          entity={entity}
          open={drawer.open}
          total={total}
          query={query}
          search={search}
          maxSearchLength={STONE_SEARCH_MAX}
          onQueryChange={setQuery}
          list={list as unknown as PartnerListQuery<StoneListItem>}
          loadErrorMessage={loadErrorMessage}
          draft={access.add}
          draftSelected={mode === "create"}
          selectedId={selectedId}
          onSelectDraft={() => {
            if (mode === "create") requestFocus(firstField);
            else startCreate();
          }}
          onSelectItem={(item) => {
            if (item.id === selectedId) return;
            guard(() => selectRecord(item.id));
          }}
          onClose={closeDrawer}
          searchPlaceholder={page.searchPlaceholder}
          rowText={(item) => rowText(fields, item)}
        />
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete ${deleteTarget?.name ?? entity.singular.toLowerCase()}?`}
        body={`The ${entity.singular.toLowerCase()} will be permanently deleted. This can't be undone. A record that other records use can't be deleted; turn off Active instead.`}
        cancelLabel={`Keep ${entity.singular.toLowerCase()}`}
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
        name={fields === "stoneCode" ? watched.code ?? "" : watched.name ?? ""}
        onKeep={() => setPendingDiscard(null)}
        onDiscard={() => {
          const action = pendingDiscard;
          setPendingDiscard(null);
          action?.();
        }}
      />
      {loaded && detail.data && <StonePrintView page={page} title={recordTitle ?? detail.data.code} rows={printRows} printedAt={printedAt} />}
    </div>
  );
}
