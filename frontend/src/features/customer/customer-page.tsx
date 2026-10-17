"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useForm, useWatch, type FieldErrors, type Path } from "react-hook-form";
import { ToastProvider, useToast } from "@/components/ui/toast";
import type { PartnerAccess } from "@/features/partner/access";
import { invoiceAddressType, shippingAddressType } from "@/features/partner/address-types";
import { AddressListCard } from "@/features/partner/components/address-list-card";
import { DiscardChangesDialog } from "@/features/partner/components/discard-changes-dialog";
import { partnerDrawerId } from "@/features/partner/components/partner-drawer";
import { PartnerInformationCard } from "@/features/partner/components/partner-information-card";
import { PartnerPageHeader, type PartnerMode } from "@/features/partner/components/partner-page-header";
import {
  DetailLoadError,
  DrawerToggle,
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
import { isPermissionDenied, loadErrorMessage, mapSaveError, type MappedFieldError, readCustomerError, toCustomerFields, toDuplicateValues, toFormValues } from "./api";
import { CustomersDrawer } from "./components/customers-drawer";
import { DeleteCustomerDialog } from "./components/delete-customer-dialog";
import type { CustomerDetail } from "./contract";
import {
  useCreateCustomer,
  useCustomerCache,
  useCustomerDetail,
  useCustomerListsFetching,
  useCustomerLoader,
  useCustomerNextCode,
  useCustomerOptions,
  useCustomerTotal,
  useUpdateCustomer,
} from "./hooks";
import { CUSTOMER_ADDRESS_ARRAYS, customerFormSchema, emptyCustomerForm, type CustomerFormValues } from "./schema";

const FORM_ID = "customer-form";
const DRAWER_STORAGE_KEY = "gms.customer.drawerOpen";
/** Permission menu key `customer` (FE-CUS-004); wording for the shared Partner Master components. */
const CUSTOMER: PartnerEntity = { key: "customer", singular: "Customer", plural: "Customers" };
const DRAWER_ID = partnerDrawerId(CUSTOMER);

/**
 * Setup › Customer (`customer` UI revision 2, ADR-0018 + ADR-0021). `permission.mine` gates the page:
 * no `customer.*` request is made without `customer:VIEW` (FE-CUS-004).
 * Data: gateway `customer.*` through the typed tRPC client (hooks.ts).
 * UI parts are the shared Partner Master components (vendor FE-VEN-001).
 * Modes (ADR-0021 §3, like User & Permission): create (new draft), view (saved, read-only),
 * edit (after Edit; Cancel restores the saved values). Code Name is required and prefilled
 * from `customer.nextCode` in create mode (ADR-0021 §1–2).
 */
export function CustomerPage() {
  return (
    <ToastProvider>
      <PartnerAccessGuard entity={CUSTOMER}>{(access) => <CustomerWorkspace access={access} />}</PartnerAccessGuard>
    </ToastProvider>
  );
}

type FocusRequest = { name: Path<CustomerFormValues>; seq: number } | null;

function CustomerWorkspace({ access }: { access: PartnerAccess }) {
  const toast = useToast();
  const cache = useCustomerCache();
  /** `null` = the new-customer draft (with ADD) or nothing selected (without ADD). */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** ID whose saved data is currently in the form; differs from `selectedId` while it loads. */
  const [loadedId, setLoadedId] = useState<string | null>(null);
  /** Edit mode for the selected customer (after Edit); otherwise a saved customer is shown read-only. */
  const [editing, setEditing] = useState(false);
  /** The saved customer open before Create Customer / Duplicate, restored by Cancel (ADR-0021 §3). */
  const [previousId, setPreviousId] = useState<string | null>(null);
  const drawer = useDrawerPreference(DRAWER_STORAGE_KEY);
  const drawerOpen = drawer.open;
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [pendingDiscard, setPendingDiscard] = useState<(() => void) | null>(null);
  const [formError, setFormError] = useState<{ message: string; stale?: boolean } | null>(null);
  /** Saved customer found deleted on Save (CUSTOMER_NOT_FOUND): shown read-only, Save hidden. */
  const [goneId, setGoneId] = useState<string | null>(null);
  /** After an uncertain create failure, submit stays blocked until the list is refreshed (owner decision). */
  const [refreshingBeforeRetry, setRefreshingBeforeRetry] = useState(false);
  const [focusRequest, setFocusRequest] = useState<FocusRequest>(null);
  const [printedAt, setPrintedAt] = useState("");
  const toggleRef = useRef<HTMLButtonElement>(null);
  const submittingRef = useRef(false);
  /** Latest selection, read by async loads to ignore late responses. */
  const selectionRef = useRef<string | null>(null);
  /** `updatedAt` of the saved version loaded into the form; sent as `expectedUpdatedAt` (background refetches never change it). */
  const loadedVersionRef = useRef<string | null>(null);

  const options = useCustomerOptions();
  const total = useCustomerTotal();
  const detail = useCustomerDetail(selectedId);
  const loadCustomer = useCustomerLoader();
  const listsFetching = useCustomerListsFetching();
  const create = useCreateCustomer();
  const update = useUpdateCustomer();

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    shouldFocusError: false, // focus is moved manually to the first error in visual order
    defaultValues: emptyCustomerForm(),
  });
  const { isDirty } = form.formState;
  const watchedName = useWatch({ control: form.control, name: "name" });

  const loaded = selectedId !== null && loadedId === selectedId && detail.data?.id === selectedId;
  const gone = selectedId !== null && goneId === selectedId;
  const mode: PartnerMode = selectedId === null ? (access.add ? "create" : "none") : editing && access.edit && loaded && !gone ? "edit" : "view";
  const nextCode = useCustomerNextCode(mode === "create");
  useSuggestedCodePrefill(form, mode === "create", nextCode.data?.code);
  const submitting = create.isPending || update.isPending || refreshingBeforeRetry;
  const requestFocus = useCallback((name: Path<CustomerFormValues>) => setFocusRequest((current) => ({ name, seq: (current?.seq ?? 0) + 1 })), []);

  useEffect(() => {
    if (focusRequest) form.setFocus(focusRequest.name, { shouldSelect: false });
  }, [focusRequest, form]);

  // Unsaved changes: native prompt on close/reload (FE-CUS-010).
  useUnsavedChangesPrompt(isDirty);

  // Permission removed mid-session: re-check so the guard and buttons update (FE-CUS-004).
  const lostAccess = isPermissionDenied(detail.error) || isPermissionDenied(options.error);
  useEffect(() => {
    if (lostAccess) void cache.recheckAccess();
  }, [cache, lostAccess]);

  // The selected customer was deleted elsewhere: refresh the list so it disappears from the drawer.
  const detailNotFound = readCustomerError(detail.error).domainCode === "CUSTOMER_NOT_FOUND";
  useEffect(() => {
    if (detailNotFound) void cache.invalidateLists();
  }, [cache, detailNotFound]);

  const labels = useMemo(() => {
    const currencies = new Map(options.data?.currencies.map((option) => [option.value, option.label]));
    const countries = new Map(options.data?.countries.map((option) => [option.value, option.label]));
    return { currency: (code: string) => currencies.get(code) ?? code, country: (code: string) => countries.get(code) ?? code };
  }, [options.data]);

  // Ctrl+P also prints the saved customer with a fresh timestamp.
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
    form.reset(emptyCustomerForm()); // Code Name is prefilled again from `nextCode`
    setFormError(null);
    setSelectedId(null);
    setLoadedId(null);
    setEditing(false);
    if (access.add) requestFocus("code");
  }

  /** Create Customer (view mode): a new draft; Cancel returns to the customer open now. */
  function startCreate() {
    if (!access.add) return;
    guard(() => {
      setPreviousId(selectedId);
      openDraft();
    });
  }

  /** Edit (view mode): the saved customer becomes editable. */
  function startEdit() {
    if (!access.edit || !loaded || gone) return;
    setFormError(null);
    setEditing(true);
    requestFocus("code");
  }

  /**
   * Cancel. Edit mode: restore the saved values and return to view mode. Create mode: return to the
   * customer that was open before Create / Duplicate, or start an empty draft again.
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
    if (previous !== null) selectCustomer(previous);
    else openDraft();
  }

  /**
   * Loads the selected customer into the form once its data is available. Only the latest
   * selection is applied (a late response for an earlier row is ignored); background
   * refetches never reset the form (conventions.md).
   */
  function applyDetail(data: CustomerDetail) {
    form.reset(toFormValues(data));
    loadedVersionRef.current = data.updatedAt;
  }

  /** CUSTOMER_STALE banner action: load the latest saved version (local edits are dropped, as the banner says). */
  function reloadLatest() {
    if (selectedId === null) return;
    const id = selectedId;
    setFormError(null);
    void detail.refetch().then((result) => {
      if (result.data?.id === id) applyDetail(result.data);
    });
  }

  function focusFirstError(tree: Record<string, unknown>) {
    const first = firstErrorField(tree, CUSTOMER_ADDRESS_ARRAYS);
    if (first) requestFocus(first as Path<CustomerFormValues>);
  }

  /** Server field errors: set them and focus the first in visual order. */
  function showServerFieldErrors(entries: readonly MappedFieldError[]) {
    if (entries.length === 0) return;
    for (const { name, message } of entries) form.setError(name as Path<CustomerFormValues>, { type: "server", message });
    focusFirstError(errorTreeFromEntries(entries));
  }

  function loadIntoForm(id: string) {
    selectionRef.current = id;
    loadCustomer(id).then(
      (data) => {
        if (selectionRef.current !== id) return;
        applyDetail(data);
        setLoadedId(id);
      },
      () => undefined, // the `get` query observer shows the error state (+ Retry)
    );
  }

  function selectCustomer(id: string) {
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
      form.reset(emptyCustomerForm());
      form.reset(toDuplicateValues(source), { keepDefaultValues: true });
      selectionRef.current = null;
      setPreviousId(source.id);
      setFormError(null);
      setSelectedId(null);
      setLoadedId(null);
      setEditing(false);
      requestFocus("code");
      toast.show("info", `Copied from ${source.name}. Check the code name, then save the new customer.`);
    });
  }

  function refresh() {
    guard(() => {
      setFormError(null);
      void cache.invalidateLists();
      if (selectedId === null) {
        form.reset(emptyCustomerForm());
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

  const onInvalid = (errors: FieldErrors<CustomerFormValues>) => focusFirstError(errors as Record<string, unknown>);

  const onValid = async (values: CustomerFormValues) => {
    if (submittingRef.current) return; // double submit
    if (mode !== "create" && mode !== "edit") return;
    submittingRef.current = true;
    setFormError(null);
    try {
      const fields = toCustomerFields(values);
      if (mode === "create") {
        const result = await create.mutateAsync(fields);
        toast.show("success", "Customer created");
        void cache.invalidateLists();
        setPreviousId(null);
        setEditing(false); // the new customer opens in view mode
        setSelectedId(result.id);
        setLoadedId(null);
        loadIntoForm(result.id); // one `get` loads the saved customer into the form (create returns only { id, updatedAt })
      } else if (selectedId !== null && detail.data) {
        const id = selectedId;
        await update.mutateAsync({ id, expectedUpdatedAt: loadedVersionRef.current ?? detail.data.updatedAt, ...fields });
        toast.show("success", "Customer saved");
        void cache.invalidateLists();
        const result = await detail.refetch();
        if (result.data?.id === id) applyDetail(result.data);
        setEditing(false); // back to view mode
      }
    } catch (cause) {
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
  // "none" = VIEW only and nothing selected: the empty Add form, read-only (owner 2026-10-17).
  const showForm = mode === "create" || mode === "none" || ((mode === "edit" || mode === "view") && loaded);

  return (
    <div className="flex h-full min-h-0 flex-col bg-gms-page">
      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 overflow-y-auto p-4 sm:pb-6 sm:pl-6 sm:pr-10 sm:pt-6">
          <PartnerPageHeader
            entity={CUSTOMER}
            formId={FORM_ID}
            mode={mode}
            recordName={loaded ? detail.data?.name : undefined}
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
              if (loaded && detail.data) setDeleteTarget({ id: detail.data.id, name: detail.data.name });
            }}
          />


          {selectedId !== null && !loaded && detail.isError && (
            <DetailLoadError message={loadErrorMessage(detail.error, "this customer")} onRetry={detailNotFound ? undefined : () => loadIntoForm(selectedId)} />
          )}

          {selectedId !== null && !loaded && !detail.isError && <FormSkeleton entity={CUSTOMER} addressCards={2} />}

          {showForm && (
            <form
              id={FORM_ID}
              noValidate
              onSubmit={(event) => void form.handleSubmit(onValid, onInvalid)(event)}
              aria-label={mode === "create" ? "Create customer" : mode === "edit" ? "Edit customer" : "Customer details"}
              className="space-y-4 print:hidden"
            >
              {formError && <FormErrorBanner message={formError.message} onReload={formError.stale ? reloadLatest : undefined} reloading={detail.isFetching} />}
              <PartnerInformationCard form={form} title="Customer Information" idPrefix={CUSTOMER.key} readOnly={readOnly} options={optionsState} />
              {/* Side by side when the content is at least ~1000 px wide, otherwise stacked (Q-CUS-05). */}
              <div className="@container">
                <div className="grid grid-cols-1 items-start gap-4 @min-[1000px]:grid-cols-2 @min-[1000px]:gap-6">
                  <AddressListCard
                    form={form}
                    type={invoiceAddressType}
                    idPrefix={CUSTOMER.key}
                    layout="split"
                    defaultRule="exactlyOne"
                    readOnly={readOnly}
                    options={optionsState}
                  />
                  <AddressListCard
                    form={form}
                    type={shippingAddressType}
                    idPrefix={CUSTOMER.key}
                    layout="split"
                    defaultRule="exactlyOne"
                    readOnly={readOnly}
                    options={optionsState}
                  />
                </div>
              </div>
            </form>
          )}
        </div>

        <DrawerToggle ref={toggleRef} entity={CUSTOMER} open={drawerOpen} drawerId={DRAWER_ID} onToggle={() => drawer.setOpen(!drawerOpen)} />

        <CustomersDrawer
          entity={CUSTOMER}
          open={drawerOpen}
          total={total}
          draft={access.add}
          draftSelected={mode === "create"}
          selectedId={selectedId}
          onSelectDraft={() => {
            if (mode === "create") requestFocus("code");
            else startCreate();
          }}
          onSelectCustomer={(customer) => {
            if (customer.id === selectedId) return;
            guard(() => selectCustomer(customer.id));
          }}
          onClose={closeDrawer}
        />
      </div>

      <DeleteCustomerDialog
        entity={CUSTOMER}
        customer={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={(id) => {
          if (previousId === id) setPreviousId(null);
          if (id === selectedId) openDraft();
        }}
      />
      <DiscardChangesDialog
        entity={CUSTOMER}
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
          entity={CUSTOMER}
          partner={detail.data}
          addressSections={[
            { title: invoiceAddressType.title, nameLabel: invoiceAddressType.nameLabel, withTaxId: true, addresses: detail.data.invoiceAddresses },
            { title: shippingAddressType.title, nameLabel: shippingAddressType.nameLabel, withTaxId: false, addresses: detail.data.shippingAddresses },
          ]}
          currencyLabel={labels.currency}
          countryLabel={labels.country}
          printedAt={printedAt}
        />
      )}
    </div>
  );
}
