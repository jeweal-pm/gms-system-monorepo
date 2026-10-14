"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft, ChevronRight, ShieldAlert, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { useForm, useWatch, type FieldErrors, type Path } from "react-hook-form";
import { Button, cx, focusRing } from "@/components/ui/button";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { SetupTabs } from "@/features/setup/setup-tabs";
import { isCallerLicenseCode, readDomainError } from "@/lib/trpc-error";
import { customerAccess, type CustomerAccess } from "./access";
import { isPermissionDenied, loadErrorMessage, mapSaveError, type MappedFieldError, readCustomerError, toCustomerFields, toDuplicateValues, toFormValues } from "./api";
import { AddressListCard, type AddressListHandle } from "./components/address-list-card";
import { CustomerInformationCard, type OptionsState } from "./components/customer-information-card";
import { CustomerPageHeader, type CustomerMode } from "./components/customer-page-header";
import { CustomerPrintView } from "./components/customer-print-view";
import { CUSTOMERS_DRAWER_ID, CustomersDrawer } from "./components/customers-drawer";
import type { CustomerDetail } from "./contract";
import { DeleteCustomerDialog } from "./components/delete-customer-dialog";
import { DiscardChangesDialog } from "./components/discard-changes-dialog";
import {
  useCreateCustomer,
  useCustomerCache,
  useCustomerDetail,
  useCustomerListsFetching,
  useCustomerLoader,
  useCustomerOptions,
  useCustomerTotal,
  usePermissionMine,
  useUpdateCustomer,
} from "./hooks";
import { addressIndexesWithErrors, customerFormSchema, emptyCustomerForm, firstErrorField, type CustomerFormValues } from "./schema";

const FORM_ID = "customer-form";
const DRAWER_STORAGE_KEY = "gms.customer.drawerOpen";
/** Below this width the drawer overlays the content (Q-CUS-05), so it starts closed. */
const PUSH_LAYOUT_QUERY = "(min-width: 1280px)";
const printDateFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });

/**
 * Setup › Customer (`customer` UI revision 1, ADR-0018). `permission.mine` gates the page:
 * no `customer.*` request is made without `customer:VIEW` (FE-CUS-004).
 * Data: gateway `customer.*` through the typed tRPC client (hooks.ts).
 */
export function CustomerPage() {
  return (
    <ToastProvider>
      <AccessGuard />
    </ToastProvider>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-gms-page">
      <SetupTabs />
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>
    </div>
  );
}

function AccessGuard() {
  const mine = usePermissionMine();

  if (mine.isPending) {
    return (
      <PageFrame>
        <div aria-busy="true" aria-label="Checking access" className="space-y-4">
          <div className="h-8 w-80 max-w-full animate-pulse rounded-gms-sm bg-gms-surface-sunken" />
          <div className="h-[220px] animate-pulse rounded-gms-lg bg-gms-surface-sunken" />
        </div>
      </PageFrame>
    );
  }

  if (mine.isError) {
    const { domainCode } = readDomainError(mine.error);
    const message = isCallerLicenseCode(domainCode)
      ? "Your license doesn't allow using this page right now."
      : domainCode === "UNAUTHORIZED"
        ? "Your session has ended. Sign in again."
        : "Couldn't check your access to this page.";
    return (
      <PageFrame>
        <div role="alert" className="flex flex-col items-start gap-3 rounded-gms-lg border border-gms-border bg-gms-surface p-6">
          <p className="text-sm text-gms-text">{message}</p>
          <Button onClick={() => void mine.refetch()}>Retry</Button>
        </div>
      </PageFrame>
    );
  }

  const access = customerAccess(mine.data);
  if (!access.view) {
    return (
      <PageFrame>
        <section aria-labelledby="customer-access-denied-title" className="flex flex-col items-start gap-3 rounded-gms-lg border border-gms-border bg-gms-surface p-8">
          <ShieldAlert size={28} className="text-gms-text-secondary" aria-hidden />
          <h1 id="customer-access-denied-title" className="text-xl font-medium text-gms-text-heading">
            You don&apos;t have access to Customer
          </h1>
          <p className="text-sm text-gms-text-secondary">Ask an administrator for the Customer view permission.</p>
          <Link href="/" className={cx("mt-2 rounded-gms-md border border-gms-border px-4 py-2 text-sm font-medium text-gms-text hover:bg-gms-surface-sunken", focusRing)}>
            Back to Home
          </Link>
        </section>
      </PageFrame>
    );
  }

  return <CustomerWorkspace access={access} />;
}

function readStoredDrawerOpen(): boolean | null {
  try {
    const stored = window.localStorage.getItem(DRAWER_STORAGE_KEY);
    return stored === null ? null : stored === "true";
  } catch {
    return null;
  }
}

/** Read once per render on the client; the server snapshot is "open" (deterministic hydration). */
function readPreferredDrawerOpen(): boolean {
  return readStoredDrawerOpen() ?? window.matchMedia(PUSH_LAYOUT_QUERY).matches;
}

const subscribeNever = () => () => {};

function storeDrawerOpen(open: boolean) {
  try {
    window.localStorage.setItem(DRAWER_STORAGE_KEY, String(open));
  } catch {
    // Convenience only (private mode or blocked storage).
  }
}

type FocusRequest = { name: Path<CustomerFormValues>; seq: number } | null;

function CustomerWorkspace({ access }: { access: CustomerAccess }) {
  const toast = useToast();
  const cache = useCustomerCache();
  /** `null` = the new-customer draft (with ADD) or nothing selected (without ADD). */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** ID whose saved data is currently in the form; differs from `selectedId` while it loads. */
  const [loadedId, setLoadedId] = useState<string | null>(null);
  /** Drawer: the user's choice in this visit, else the remembered state, else open only where it pushes the content. */
  const [drawerChoice, setDrawerChoice] = useState<boolean | null>(null);
  const preferredDrawerOpen = useSyncExternalStore(subscribeNever, readPreferredDrawerOpen, () => true);
  const drawerOpen = drawerChoice ?? preferredDrawerOpen;
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
  const invoiceRef = useRef<AddressListHandle>(null);
  const shippingRef = useRef<AddressListHandle>(null);
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
    shouldFocusError: false, // focus is moved manually after collapsed items are expanded
    defaultValues: emptyCustomerForm(),
  });
  const { isDirty } = form.formState;
  const [watchedName, watchedCode] = useWatch({ control: form.control, name: ["name", "code"] });

  const mode: CustomerMode = selectedId === null ? (access.add ? "draft" : "none") : access.edit ? "edit" : "view";
  const loaded = selectedId !== null && loadedId === selectedId && detail.data?.id === selectedId;
  const submitting = create.isPending || update.isPending || refreshingBeforeRetry;
  const requestFocus = useCallback((name: Path<CustomerFormValues>) => setFocusRequest((current) => ({ name, seq: (current?.seq ?? 0) + 1 })), []);

  useEffect(() => {
    if (focusRequest) form.setFocus(focusRequest.name, { shouldSelect: false });
  }, [focusRequest, form]);

  // Unsaved changes: native prompt on close/reload (FE-CUS-010).
  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

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
    selectionRef.current = null;
    form.reset(emptyCustomerForm());
    setFormError(null);
    setSelectedId(null);
    setLoadedId(null);
    if (access.add) requestFocus("name");
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

  /** Server field errors: set them, expand items that contain them, focus the first in visual order. */
  function showServerFieldErrors(entries: readonly MappedFieldError[]) {
    if (entries.length === 0) return;
    const tree: Record<string, unknown> = {};
    for (const { name, message } of entries) {
      form.setError(name as Path<CustomerFormValues>, { type: "server", message });
      const parts = name.split(".");
      let node = tree;
      parts.forEach((part, index) => {
        if (index === parts.length - 1) node[part] = { message };
        else node = (node[part] ??= {}) as Record<string, unknown>;
      });
    }
    invoiceRef.current?.expand(addressIndexesWithErrors(tree, "invoiceAddresses"));
    shippingRef.current?.expand(addressIndexesWithErrors(tree, "shippingAddresses"));
    const first = firstErrorField(tree);
    if (first) requestFocus(first as Path<CustomerFormValues>);
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
    setSelectedId(id);
    setLoadedId(null);
    loadIntoForm(id);
  }

  function duplicate() {
    const source = detail.data;
    if (!access.add || !loaded || !source) return;
    guard(() => {
      // Defaults stay empty so the copy counts as unsaved changes.
      form.reset(emptyCustomerForm());
      form.reset(toDuplicateValues(source), { keepDefaultValues: true });
      selectionRef.current = null;
      setFormError(null);
      setSelectedId(null);
      setLoadedId(null);
      requestFocus("name");
      toast.show("info", `Copied from ${source.name}. Enter a code name if needed, then create the customer.`);
    });
  }

  function refresh() {
    guard(() => {
      setFormError(null);
      void cache.invalidateLists();
      if (selectedId === null) {
        form.reset(emptyCustomerForm());
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

  const onInvalid = (errors: FieldErrors<CustomerFormValues>) => {
    const tree = errors as Record<string, unknown>;
    invoiceRef.current?.expand(addressIndexesWithErrors(tree, "invoiceAddresses"));
    shippingRef.current?.expand(addressIndexesWithErrors(tree, "shippingAddresses"));
    const first = firstErrorField(tree);
    if (first) requestFocus(first as Path<CustomerFormValues>);
  };

  const onValid = async (values: CustomerFormValues) => {
    if (submittingRef.current) return; // double submit
    if (mode !== "draft" && mode !== "edit") return;
    submittingRef.current = true;
    setFormError(null);
    try {
      const fields = toCustomerFields(values);
      if (mode === "draft") {
        const result = await create.mutateAsync(fields);
        toast.show("success", "Customer created");
        void cache.invalidateLists();
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
      }
    } catch (cause) {
      const outcome = mapSaveError(cause, mode === "draft" ? "create" : "edit");
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
      if (outcome.notFound && selectedId !== null) setGoneId(selectedId);
      if (outcome.refetchOptions) void cache.refetchOptions();
      if (outcome.refetchList) void cache.invalidateLists();
      if (outcome.recheckAccess) void cache.recheckAccess();
    } finally {
      submittingRef.current = false;
    }
  };

  function toggleDrawer() {
    setDrawerChoice(!drawerOpen);
    storeDrawerOpen(!drawerOpen);
  }

  function closeDrawer() {
    setDrawerChoice(false);
    storeDrawerOpen(false);
    // The toggle may be hidden while the full-width sheet is open (<640 px); focus it after it reappears.
    window.requestAnimationFrame(() => toggleRef.current?.focus());
  }

  const gone = selectedId !== null && goneId === selectedId;
  const headerMode: CustomerMode = gone && mode === "edit" ? "view" : mode;
  const readOnly = mode === "view" || gone;
  const showForm = mode === "draft" || ((mode === "edit" || mode === "view") && loaded);

  return (
    <div className="flex h-full min-h-0 flex-col bg-gms-page">
      <SetupTabs />
      <div className="relative flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:pb-6 sm:pl-6 sm:pr-10 sm:pt-6">
          <CustomerPageHeader
            formId={FORM_ID}
            mode={headerMode}
            total={total}
            savedLoaded={loaded}
            canAdd={access.add}
            canDelete={access.delete}
            submitting={submitting}
            deleting={deleteTarget !== null}
            refreshing={listsFetching || (selectedId !== null && detail.isFetching)}
            onPrint={print}
            onDuplicate={duplicate}
            onRefresh={refresh}
            onDelete={() => {
              if (loaded && detail.data) setDeleteTarget({ id: detail.data.id, name: detail.data.name });
            }}
          />

          {mode === "none" && (
            <section aria-label="No customer selected" className="flex flex-col items-start gap-3 rounded-gms-lg border border-gms-border bg-gms-surface p-8">
              <Users size={28} className="text-gms-text-secondary" aria-hidden />
              <p className="text-base text-gms-text">Select a customer from the list.</p>
            </section>
          )}

          {selectedId !== null && !loaded && detail.isError && (
            <div role="alert" className="flex flex-col items-start gap-3 rounded-gms-lg border border-gms-border bg-gms-surface p-6">
              <p className="text-sm text-gms-text">{loadErrorMessage(detail.error, "this customer")}</p>
              {!detailNotFound && <Button onClick={() => loadIntoForm(selectedId)}>Retry</Button>}
            </div>
          )}

          {selectedId !== null && !loaded && !detail.isError && (
            <div aria-busy="true" aria-label="Loading customer" className="space-y-4">
              <div className="h-[260px] animate-pulse rounded-gms-lg bg-gms-surface-sunken" />
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="h-[420px] animate-pulse rounded-gms-lg bg-gms-surface-sunken" />
                <div className="h-[420px] animate-pulse rounded-gms-lg bg-gms-surface-sunken" />
              </div>
            </div>
          )}

          {showForm && (
            <form
              id={FORM_ID}
              noValidate
              onSubmit={(event) => void form.handleSubmit(onValid, onInvalid)(event)}
              aria-label={mode === "draft" ? "Create customer" : mode === "edit" ? "Edit customer" : "Customer details"}
              className="space-y-4 print:hidden"
            >
              {formError && (
                <div role="alert" className="flex flex-wrap items-center gap-3 rounded-gms-md border border-gms-danger bg-gms-danger-subtle px-4 py-3">
                  <p className="min-w-0 flex-1 text-sm text-gms-danger">{formError.message}</p>
                  {formError.stale && (
                    <Button onClick={reloadLatest} disabled={detail.isFetching}>
                      Reload
                    </Button>
                  )}
                </div>
              )}
              <CustomerInformationCard form={form} readOnly={readOnly} options={optionsState} />
              {/* Side by side when the content is at least ~1000 px wide, otherwise stacked (Q-CUS-05). */}
              <div className="@container">
                <div className="grid grid-cols-1 items-start gap-4 @min-[1000px]:grid-cols-2 @min-[1000px]:gap-6">
                  <AddressListCard ref={invoiceRef} form={form} type="invoice" readOnly={readOnly} options={optionsState} />
                  <AddressListCard ref={shippingRef} form={form} type="shipping" readOnly={readOnly} options={optionsState} />
                </div>
              </div>
            </form>
          )}
        </div>

        <button
          ref={toggleRef}
          type="button"
          aria-expanded={drawerOpen}
          aria-controls={CUSTOMERS_DRAWER_ID}
          aria-label={drawerOpen ? "Hide customers panel" : "Show customers panel"}
          onClick={toggleDrawer}
          className={cx(
            "absolute top-4 z-40 flex h-10 w-6 items-center justify-center rounded-l-gms-sm bg-gms-primary-strong text-gms-on-primary print:hidden",
            drawerOpen ? "max-sm:hidden sm:right-80" : "right-0",
            focusRing,
          )}
        >
          {drawerOpen ? <ChevronRight size={16} aria-hidden /> : <ChevronLeft size={16} aria-hidden />}
        </button>

        <CustomersDrawer
          open={drawerOpen}
          total={total}
          draft={access.add ? { name: mode === "draft" ? watchedName : "", code: mode === "draft" ? watchedCode : "" } : null}
          draftSelected={mode === "draft"}
          selectedId={selectedId}
          onSelectDraft={() => {
            if (mode === "draft") requestFocus("name");
            else guard(openDraft);
          }}
          onSelectCustomer={(customer) => {
            if (customer.id === selectedId) return;
            guard(() => selectCustomer(customer.id));
          }}
          onClose={closeDrawer}
        />
      </div>

      <DeleteCustomerDialog
        customer={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={(id) => {
          if (id === selectedId) openDraft();
        }}
      />
      <DiscardChangesDialog
        open={pendingDiscard !== null}
        name={watchedName}
        onKeep={() => setPendingDiscard(null)}
        onDiscard={() => {
          const action = pendingDiscard;
          setPendingDiscard(null);
          action?.();
        }}
      />
      {loaded && detail.data && <CustomerPrintView customer={detail.data} currencyLabel={labels.currency} countryLabel={labels.country} printedAt={printedAt} />}
    </div>
  );
}
