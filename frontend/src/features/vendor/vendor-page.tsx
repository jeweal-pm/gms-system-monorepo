"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useForm, useWatch, type FieldErrors, type Path } from "react-hook-form";
import { ToastProvider, useToast } from "@/components/ui/toast";
import type { PartnerAccess } from "@/features/partner/access";
import { invoiceAddressType } from "@/features/partner/address-types";
import { AddressListCard } from "@/features/partner/components/address-list-card";
import { DiscardChangesDialog } from "@/features/partner/components/discard-changes-dialog";
import { partnerDrawerId } from "@/features/partner/components/partner-drawer";
import { PartnerInformationCard } from "@/features/partner/components/partner-information-card";
import { PartnerPageHeader, type PartnerMode } from "@/features/partner/components/partner-page-header";
import {
  DetailLoadError,
  DrawerToggle,
  EmptySelection,
  FormErrorBanner,
  FormSkeleton,
  PartnerAccessGuard,
  printDateFormatter,
  useDrawerPreference,
} from "@/features/partner/components/partner-page-parts";
import { PartnerPrintView } from "@/features/partner/components/partner-print-view";
import type { PartnerEntity } from "@/features/partner/entity";
import { useSuggestedCodePrefill, useUnsavedChangesPrompt } from "@/features/partner/hooks";
import type { OptionsState } from "@/features/partner/options";
import { errorTreeFromEntries, firstErrorField } from "@/features/partner/schema";
import { isPermissionDenied, isVendorNotFound, loadErrorMessage, mapSaveError, type MappedFieldError, toDuplicateValues, toFormValues, toVendorFields } from "./api";
import { DeleteVendorDialog } from "./components/delete-vendor-dialog";
import { VendorsDrawer } from "./components/vendors-drawer";
import type { VendorDetail } from "./contract";
import {
  useCreateVendor,
  useUpdateVendor,
  useVendorCache,
  useVendorDetail,
  useVendorListsFetching,
  useVendorLoader,
  useVendorNextCode,
  useVendorOptions,
  useVendorTotal,
} from "./hooks";
import { VENDOR_ADDRESS_ARRAYS, emptyVendorForm, vendorFormSchema, type VendorFormValues } from "./schema";

const FORM_ID = "vendor-form";
const DRAWER_STORAGE_KEY = "gms.vendor.drawerOpen";
/** Permission menu key `vendor` (FE-VEN-003; existing catalog leaf); wording for the shared Partner Master components. */
const VENDOR: PartnerEntity = { key: "vendor", singular: "Vendor", plural: "Vendors" };
const DRAWER_ID = partnerDrawerId(VENDOR);

/**
 * Setup › Vendor (`vendor` UI revision 3, ADR-0019 + ADR-0021). `permission.mine` (live) gates the page: no vendor data
 * request is made without `vendor:VIEW` (FE-VEN-003). Data: gateway `vendor.*` through the typed
 * tRPC client (hooks.ts, FE-VEN-010); errors mapped from domain codes in api.ts (FE-VEN-011).
 * Differences from customer: one full-width Invoice Address card with the 4-column wide item grid
 * (VD-02/03) and an optional default address (Q-VEN-03).
 * Modes (ADR-0021 §3, like User & Permission): create (new draft), view (saved, read-only),
 * edit (after Edit; Cancel restores the saved values). Code Name is required and prefilled
 * from `vendor.nextCode` in create mode (ADR-0021 §1–2).
 */
export function VendorPage() {
  return (
    <ToastProvider>
      <PartnerAccessGuard entity={VENDOR}>{(access) => <VendorWorkspace access={access} />}</PartnerAccessGuard>
    </ToastProvider>
  );
}

type FocusRequest = { name: Path<VendorFormValues>; seq: number } | null;

function VendorWorkspace({ access }: { access: PartnerAccess }) {
  const toast = useToast();
  const cache = useVendorCache();
  /** `null` = the new-vendor draft (with ADD) or nothing selected (without ADD). */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** ID whose saved data is currently in the form; differs from `selectedId` while it loads. */
  const [loadedId, setLoadedId] = useState<string | null>(null);
  /** Edit mode for the selected vendor (after Edit); otherwise a saved vendor is shown read-only. */
  const [editing, setEditing] = useState(false);
  /** The saved vendor open before Create Vendor / Duplicate, restored by Cancel (ADR-0021 §3). */
  const [previousId, setPreviousId] = useState<string | null>(null);
  const drawer = useDrawerPreference(DRAWER_STORAGE_KEY);
  const drawerOpen = drawer.open;
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [pendingDiscard, setPendingDiscard] = useState<(() => void) | null>(null);
  const [formError, setFormError] = useState<{ message: string; stale?: boolean } | null>(null);
  /** Saved vendor found deleted on Save: shown read-only, Save hidden. */
  const [goneId, setGoneId] = useState<string | null>(null);
  /** After an uncertain create failure, submit stays blocked until the list is refreshed (customer owner decision, reused). */
  const [refreshingBeforeRetry, setRefreshingBeforeRetry] = useState(false);
  const [focusRequest, setFocusRequest] = useState<FocusRequest>(null);
  const [printedAt, setPrintedAt] = useState("");
  const toggleRef = useRef<HTMLButtonElement>(null);
  const submittingRef = useRef(false);
  /** Latest selection, read by async loads to ignore late responses. */
  const selectionRef = useRef<string | null>(null);
  /** `updatedAt` of the saved version loaded into the form; sent as `expectedUpdatedAt`. */
  const loadedVersionRef = useRef<string | null>(null);

  const options = useVendorOptions();
  const total = useVendorTotal();
  const detail = useVendorDetail(selectedId);
  const loadVendor = useVendorLoader();
  const listsFetching = useVendorListsFetching();
  const create = useCreateVendor();
  const update = useUpdateVendor();

  const form = useForm<VendorFormValues>({
    resolver: zodResolver(vendorFormSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    shouldFocusError: false, // focus is moved manually to the first error in visual order
    defaultValues: emptyVendorForm(),
  });
  const { isDirty } = form.formState;
  const watchedName = useWatch({ control: form.control, name: "name" });

  const loaded = selectedId !== null && loadedId === selectedId && detail.data?.id === selectedId;
  const gone = selectedId !== null && goneId === selectedId;
  const mode: PartnerMode = selectedId === null ? (access.add ? "create" : "none") : editing && access.edit && loaded && !gone ? "edit" : "view";
  const nextCode = useVendorNextCode(mode === "create");
  useSuggestedCodePrefill(form, mode === "create", nextCode.data?.code);
  const submitting = create.isPending || update.isPending || refreshingBeforeRetry;
  const requestFocus = useCallback((name: Path<VendorFormValues>) => setFocusRequest((current) => ({ name, seq: (current?.seq ?? 0) + 1 })), []);

  useEffect(() => {
    if (focusRequest) form.setFocus(focusRequest.name, { shouldSelect: false });
  }, [focusRequest, form]);

  // Unsaved changes: native prompt on close/reload (FE-VEN-009).
  useUnsavedChangesPrompt(isDirty);

  // Permission removed mid-session: re-check so the guard and buttons update (FE-VEN-011).
  const lostAccess = isPermissionDenied(detail.error) || isPermissionDenied(options.error);
  useEffect(() => {
    if (lostAccess) void cache.recheckAccess();
  }, [cache, lostAccess]);

  // The selected vendor was deleted elsewhere: refresh the list so it disappears from the drawer.
  const detailNotFound = isVendorNotFound(detail.error);
  useEffect(() => {
    if (detailNotFound) void cache.invalidateLists();
  }, [cache, detailNotFound]);

  const labels = useMemo(() => {
    const currencies = new Map(options.data?.currencies.map((option) => [option.value, option.label]));
    const countries = new Map(options.data?.countries.map((option) => [option.value, option.label]));
    return { currency: (code: string) => currencies.get(code) ?? code, country: (code: string) => countries.get(code) ?? code };
  }, [options.data]);

  // Ctrl+P also prints the saved vendor with a fresh timestamp.
  useEffect(() => {
    const handler = () => flushSync(() => setPrintedAt(printDateFormatter.format(new Date())));
    window.addEventListener("beforeprint", handler);
    return () => window.removeEventListener("beforeprint", handler);
  }, []);

  const optionsState: OptionsState = {
    currencies: options.data?.currencies ?? [],
    countries: options.data?.countries ?? [],
    status: options.isPending ? "loading" : options.isError ? "error" : "ready",
    onRetry: () => void options.refetch(),
  };

  /** Runs `action` now, or after "Discard" when the form has unsaved changes. */
  function guard(action: () => void) {
    if (form.formState.isDirty) setPendingDiscard(() => action);
    else action();
  }

  function openDraft() {
    // Already in create mode: the query stays enabled, so ask for a fresh suggestion explicitly.
    if (mode === "create") void nextCode.refetch();
    selectionRef.current = null;
    form.reset(emptyVendorForm()); // Code Name is prefilled again from `nextCode`
    setFormError(null);
    setSelectedId(null);
    setLoadedId(null);
    setEditing(false);
    if (access.add) requestFocus("code");
  }

  /** Create Vendor (view mode): a new draft; Cancel returns to the vendor open now. */
  function startCreate() {
    if (!access.add) return;
    guard(() => {
      setPreviousId(selectedId);
      openDraft();
    });
  }

  /** Edit (view mode): the saved vendor becomes editable. */
  function startEdit() {
    if (!access.edit || !loaded || gone) return;
    setFormError(null);
    setEditing(true);
    requestFocus("code");
  }

  /**
   * Cancel. Edit mode: restore the saved values and return to view mode. Create mode: return to the
   * vendor that was open before Create / Duplicate, or start an empty draft again.
   */
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
    if (previous !== null) selectVendor(previous);
    else openDraft();
  }

  /** Only the current selection's data resets the form; background refetches never do (conventions.md). */
  function applyDetail(data: VendorDetail) {
    form.reset(toFormValues(data));
    loadedVersionRef.current = data.updatedAt;
  }

  /** Stale banner action: load the latest saved version (local edits are dropped, as the banner says). */
  function reloadLatest() {
    if (selectedId === null) return;
    const id = selectedId;
    setFormError(null);
    void detail.refetch().then((result) => {
      if (result.data?.id === id) applyDetail(result.data);
    });
  }

  function focusFirstError(tree: Record<string, unknown>) {
    const first = firstErrorField(tree, VENDOR_ADDRESS_ARRAYS);
    if (first) requestFocus(first as Path<VendorFormValues>);
  }

  /** Server field errors (FE-VEN-011): set them and focus the first in visual order. */
  function showServerFieldErrors(entries: readonly MappedFieldError[]) {
    if (entries.length === 0) return;
    for (const { name, message } of entries) form.setError(name as Path<VendorFormValues>, { type: "server", message });
    focusFirstError(errorTreeFromEntries(entries));
  }

  function loadIntoForm(id: string) {
    selectionRef.current = id;
    loadVendor(id).then(
      (data) => {
        if (selectionRef.current !== id) return;
        applyDetail(data);
        setLoadedId(id);
      },
      () => undefined, // the `get` query observer shows the error state (+ Retry)
    );
  }

  function selectVendor(id: string) {
    setFormError(null);
    setEditing(false);
    setSelectedId(id);
    setLoadedId(null);
    loadIntoForm(id);
  }

  function duplicate() {
    const source = detail.data;
    if (!access.add || !loaded || !source) return;
    guard(() => {
      // Defaults stay empty so the copy counts as unsaved changes; Code Name gets the suggestion.
      form.reset(emptyVendorForm());
      form.reset(toDuplicateValues(source), { keepDefaultValues: true });
      selectionRef.current = null;
      setPreviousId(source.id);
      setFormError(null);
      setSelectedId(null);
      setLoadedId(null);
      setEditing(false);
      requestFocus("code");
      toast.show("info", `Copied from ${source.name}. Check the code name, then save the new vendor.`);
    });
  }

  function refresh() {
    guard(() => {
      setFormError(null);
      void cache.invalidateLists();
      if (selectedId === null) {
        form.reset(emptyVendorForm());
        if (mode === "create") void nextCode.refetch();
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

  const onInvalid = (errors: FieldErrors<VendorFormValues>) => focusFirstError(errors as Record<string, unknown>);

  const onValid = async (values: VendorFormValues) => {
    if (submittingRef.current) return; // double submit
    if (mode !== "create" && mode !== "edit") return;
    submittingRef.current = true;
    setFormError(null);
    try {
      const fields = toVendorFields(values);
      if (mode === "create") {
        const result = await create.mutateAsync(fields);
        toast.show("success", "Vendor created");
        void cache.invalidateLists();
        setPreviousId(null);
        setEditing(false); // the new vendor opens in view mode
        setSelectedId(result.id);
        setLoadedId(null);
        loadIntoForm(result.id);
      } else if (selectedId !== null && detail.data) {
        const id = selectedId;
        await update.mutateAsync({ id, expectedUpdatedAt: loadedVersionRef.current ?? detail.data.updatedAt, ...fields });
        toast.show("success", "Vendor saved");
        void cache.invalidateLists();
        const result = await detail.refetch();
        if (result.data?.id === id) applyDetail(result.data);
        setEditing(false); // back to view mode
      }
    } catch (cause) {
      // Entered values are kept on every failure (error-handling.md).
      const outcome = mapSaveError(cause, mode === "create" ? "create" : "edit");
      if (outcome.refreshListBeforeRetry) {
        // The create may have succeeded (timeout): refresh the list before another submit is allowed.
        setRefreshingBeforeRetry(true);
        try {
          await cache.refetchLists();
        } catch {
          // The list shows its own error state.
        } finally {
          setRefreshingBeforeRetry(false);
        }
      }
      setFormError(outcome.formError ? { message: outcome.formError, stale: outcome.stale } : null);
      showServerFieldErrors(outcome.fieldErrors);
      if (outcome.notFound && selectedId !== null) {
        setGoneId(selectedId);
        setEditing(false);
      }
      if (outcome.refetchNextCode && mode === "create") void nextCode.refetch();
      if (outcome.refetchOptions) void cache.refetchOptions();
      if (outcome.refetchList) void cache.invalidateLists();
      if (outcome.recheckAccess) void cache.recheckAccess();
    } finally {
      submittingRef.current = false;
    }
  };

  function closeDrawer() {
    drawer.setOpen(false);
    // The toggle may be hidden while the full-width sheet is open (<640 px); focus it after it reappears.
    window.requestAnimationFrame(() => toggleRef.current?.focus());
  }

  const readOnly = mode !== "create" && mode !== "edit";
  const showForm = mode === "create" || ((mode === "edit" || mode === "view") && loaded);

  return (
    <div className="flex h-full min-h-0 flex-col bg-gms-page">
      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 overflow-y-auto p-4 sm:pb-6 sm:pl-6 sm:pr-10 sm:pt-6">
          <PartnerPageHeader
            entity={VENDOR}
            formId={FORM_ID}
            mode={mode}
            recordName={loaded ? detail.data?.name : undefined}
            total={total}
            savedLoaded={loaded}
            canAdd={access.add}
            canEdit={access.edit}
            canDelete={access.delete}
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
              if (loaded && detail.data) setDeleteTarget({ id: detail.data.id, name: detail.data.name });
            }}
          />

          {mode === "none" && <EmptySelection entity={VENDOR} />}

          {selectedId !== null && !loaded && detail.isError && (
            <DetailLoadError message={loadErrorMessage(detail.error, "this vendor")} onRetry={detailNotFound ? undefined : () => loadIntoForm(selectedId)} />
          )}

          {selectedId !== null && !loaded && !detail.isError && <FormSkeleton entity={VENDOR} addressCards={1} />}

          {showForm && (
            <form
              id={FORM_ID}
              noValidate
              onSubmit={(event) => void form.handleSubmit(onValid, onInvalid)(event)}
              aria-label={mode === "create" ? "Create vendor" : mode === "edit" ? "Edit vendor" : "Vendor details"}
              className="space-y-4 print:hidden"
            >
              {formError && <FormErrorBanner message={formError.message} onReload={formError.stale ? reloadLatest : undefined} reloading={detail.isFetching} />}
              <PartnerInformationCard form={form} title="Vendor Information" idPrefix={VENDOR.key} readOnly={readOnly} options={optionsState} />
              {/* VD-02: Invoice Address only, full content width; VD-03: 4-column item grid capped at ~1220 px. */}
              <AddressListCard
                form={form}
                type={invoiceAddressType}
                idPrefix={VENDOR.key}
                layout="wide"
                defaultRule="atMostOne"
                readOnly={readOnly}
                options={optionsState}
              />
            </form>
          )}
        </div>

        <DrawerToggle ref={toggleRef} entity={VENDOR} open={drawerOpen} drawerId={DRAWER_ID} onToggle={() => drawer.setOpen(!drawerOpen)} />

        <VendorsDrawer
          entity={VENDOR}
          open={drawerOpen}
          total={total}
          draft={access.add}
          draftSelected={mode === "create"}
          selectedId={selectedId}
          onSelectDraft={() => {
            if (mode === "create") requestFocus("code");
            else startCreate();
          }}
          onSelectVendor={(vendor) => {
            if (vendor.id === selectedId) return;
            guard(() => selectVendor(vendor.id));
          }}
          onClose={closeDrawer}
        />
      </div>

      <DeleteVendorDialog
        entity={VENDOR}
        vendor={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={(id) => {
          if (previousId === id) setPreviousId(null);
          if (id === selectedId) openDraft();
        }}
      />
      <DiscardChangesDialog
        entity={VENDOR}
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
        <PartnerPrintView
          entity={VENDOR}
          partner={detail.data}
          addressSections={[{ title: invoiceAddressType.title, nameLabel: invoiceAddressType.nameLabel, withTaxId: true, addresses: detail.data.invoiceAddresses }]}
          currencyLabel={labels.currency}
          countryLabel={labels.country}
          printedAt={printedAt}
        />
      )}
    </div>
  );
}
