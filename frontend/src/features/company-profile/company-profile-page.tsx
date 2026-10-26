"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FileSpreadsheet, Pencil, Printer, RotateCw, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch, type FieldErrors } from "react-hook-form";
import { Button, IconButton, cx } from "@/components/ui/button";
import { LabeledCheckbox } from "@/components/ui/checkbox";
import { ComboboxField } from "@/components/ui/combobox-field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TextField } from "@/components/ui/outlined-field";
import { PhoneField } from "@/components/ui/phone-field";
import { SelectField } from "@/components/ui/select-field";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { currencyChoices } from "@/features/partner/options";
import type { PartnerAccess } from "@/features/partner/access";
import { DiscardChangesDialog } from "@/features/partner/components/discard-changes-dialog";
import { PartnerAccessGuard } from "@/features/partner/components/partner-page-parts";
import { RegionField, type RegionValue } from "@/features/partner/components/region-field";
import type { PartnerEntity } from "@/features/partner/entity";
import { useUnsavedChangesPrompt } from "@/features/partner/hooks";
import { useRegionData } from "@/lib/regions";
import { readDomainError } from "@/lib/trpc-error";
import { fieldErrorMessage, formFieldFor, logoErrorMessage, LogoUploadError, logoUrl, toFormValues, toSaveInput, uploadLogo, type CompanyProfile } from "./api";
import { LogoUploadTile } from "./components/logo-upload-tile";
import { ProfileSection, fieldGrid } from "./components/profile-section";
import { PlainTextField } from "./components/plain-text-field";
import { useCompanyProfile, useCompanyProfileCache, useCompanyProfileOptions, useRemoveCompanyLogo, useSaveCompanyProfile } from "./hooks";
import { COMPANY_PROFILE_FIELD_ORDER, companyProfileSchema, emptyCompanyProfileForm, normalizeWebsite, type CompanyProfileFormValues, type LogoChange } from "./schema";

const FORM_ID = "company-profile-form";
/** Existing permission catalog leaf `company-profile` (D-09); wording for the shared partner components. */
const COMPANY: PartnerEntity = { key: "company-profile", singular: "Company Profile", plural: "Company Profiles" };

type Mode = "setup" | "view" | "edit";

/**
 * Setup › Company Profile (UI revision 3, SA revision 3). `permission.mine` gates the page with
 * `company-profile:VIEW`; changes need `company-profile:EDIT` (SA-CP-07). Data: gateway
 * `companyProfile.*` over tRPC; the logo through the REST route (SA-CP-04).
 */
export function CompanyProfilePage() {
  return (
    <ToastProvider>
      <PartnerAccessGuard entity={COMPANY}>{(access) => <CompanyProfileLoader access={access} />}</PartnerAccessGuard>
    </ToastProvider>
  );
}

function CompanyProfileLoader({ access }: { access: PartnerAccess }) {
  const query = useCompanyProfile();
  if (query.isPending) {
    return (
      <div aria-busy="true" aria-label="Loading company profile" className="space-y-6 px-6 pt-6">
        <div className="h-9 w-64 animate-pulse rounded-gms-sm bg-gms-surface-sunken" />
        <div className="h-32 w-32 animate-pulse rounded-gms-lg bg-gms-surface-sunken lg:ml-[300px]" />
        <div className="grid max-w-[860px] gap-5 md:grid-cols-2 lg:ml-[300px]">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-[52px] animate-pulse rounded-gms-md bg-gms-surface-sunken" />
          ))}
        </div>
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="px-6 pt-6">
        <div role="alert" className="flex max-w-xl flex-col items-start gap-3 rounded-gms-lg border border-gms-border bg-gms-surface p-6">
          <p className="text-gms-body text-gms-text">Couldn&apos;t load the company profile.</p>
          <Button onClick={() => void query.refetch()}>Retry</Button>
        </div>
      </div>
    );
  }
  return <CompanyProfileWorkspace access={access} saved={query.data.profile} refetch={async () => (await query.refetch()).data?.profile ?? null} />;
}

function CompanyProfileWorkspace({ access, saved, refetch }: { access: PartnerAccess; saved: CompanyProfile | null; refetch: () => Promise<CompanyProfile | null> }) {
  const toast = useToast();
  const cache = useCompanyProfileCache();
  const options = useCompanyProfileOptions();
  const saveMutation = useSaveCompanyProfile();
  const removeLogoMutation = useRemoveCompanyLogo();
  const canEdit = access.edit;
  const [mode, setMode] = useState<Mode>(saved ? "view" : "setup");
  const [logo, setLogo] = useState<LogoChange>({ kind: "unchanged" });
  const [pendingDiscard, setPendingDiscard] = useState<(() => void) | null>(null);
  const [conflict, setConflict] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const logoRef = useRef(logo);

  const form = useForm<CompanyProfileFormValues>({
    resolver: zodResolver(companyProfileSchema),
    defaultValues: saved ? toFormValues(saved) : emptyCompanyProfileForm,
    // First check on blur, then on every change (form-guidelines).
    mode: "onTouched",
  });
  const {
    control,
    register,
    setValue,
    setError,
    reset,
    handleSubmit,
    formState: { errors, isDirty, isSubmitted },
  } = form;
  const [countryCode, companyName, state, city] = useWatch({ control, name: ["countryCode", "name", "state", "city"] });
  const region = useRegionData(countryCode);
  function setRegion(next: RegionValue) {
    const opts = { shouldDirty: true, shouldValidate: isSubmitted };
    if (next.state !== state) setValue("state", next.state, opts);
    if (next.city !== city) setValue("city", next.city, opts);
  }

  const readOnly = mode === "view" || !canEdit;
  const dirty = isDirty || logo.kind !== "unchanged";
  useUnsavedChangesPrompt(dirty && !readOnly);

  // Revoke a picked logo's preview URL when the page unmounts.
  useEffect(() => {
    logoRef.current = logo;
  }, [logo]);
  useEffect(
    () => () => {
      if (logoRef.current.kind === "new") URL.revokeObjectURL(logoRef.current.previewUrl);
    },
    [],
  );

  function clearLogoChange() {
    if (logo.kind === "new") URL.revokeObjectURL(logo.previewUrl);
    setLogo({ kind: "unchanged" });
  }

  function restore(profile: CompanyProfile | null) {
    reset(profile ? toFormValues(profile) : emptyCompanyProfileForm);
    clearLogoChange();
    setMode(profile ? "view" : "setup");
  }

  /** Runs `action` now, or after the user confirms discarding unsaved changes. */
  function confirmDiscard(action: () => void) {
    if (dirty && !readOnly) setPendingDiscard(() => action);
    else action();
  }

  async function reload() {
    setRefreshing(true);
    try {
      restore(await refetch());
    } catch {
      toast.show("error", "Couldn't refresh the company profile.");
    } finally {
      setRefreshing(false);
    }
  }

  function focusField(name: string) {
    const element = document.getElementById(`cp-${name}`);
    element?.scrollIntoView({ block: "center" });
    element?.focus({ preventScroll: true });
  }

  function focusFirstError(fieldErrors: FieldErrors<CompanyProfileFormValues>) {
    const first = COMPANY_PROFILE_FIELD_ORDER.find((name) => fieldErrors[name]);
    if (first) focusField(first);
  }

  function applyLogoChange(profile: CompanyProfile): Promise<CompanyProfile> {
    if (logo.kind === "new") return uploadLogo(logo.file, profile.version);
    if (logo.kind === "removed" && profile.logo) return removeLogoMutation.mutateAsync({ expectedVersion: profile.version }).then((result) => result.profile);
    return Promise.resolve(profile);
  }

  /** SA-CP-09: save the fields (only when changed or first save), then the logo; a failed logo step keeps the saved fields. */
  async function save(values: CompanyProfileFormValues) {
    if (submitting) return;
    setSubmitting(true);
    let profile = saved;
    try {
      if (!profile || isDirty) {
        profile = (await saveMutation.mutateAsync(toSaveInput(values, profile?.version ?? null))).profile;
        cache.setData(undefined, { profile });
        reset(toFormValues(profile));
      }
    } catch (error) {
      setSubmitting(false);
      const { domainCode, fieldErrors } = readDomainError(error);
      if (domainCode === "CONFLICT") {
        setConflict(true);
      } else if (domainCode === "VALIDATION_ERROR" && fieldErrors.length > 0) {
        let first: string | null = null;
        for (const fieldError of fieldErrors) {
          const field = formFieldFor(fieldError.path);
          if (!field) continue;
          setError(field, { type: "server", message: fieldErrorMessage(fieldError) });
          first ??= field;
        }
        if (first) focusField(first);
        else toast.show("error", "Some details are invalid. Check the form and try again.");
      } else if (domainCode === "PERMISSION_DENIED") {
        toast.show("error", "You don't have permission to change the company profile.");
      } else {
        toast.show("error", "Couldn't save. Try again.");
      }
      return;
    }

    try {
      const final = await applyLogoChange(profile);
      cache.setData(undefined, { profile: final });
      clearLogoChange();
      setMode("view");
      toast.show("success", "Company profile saved");
    } catch (error) {
      const code = error instanceof LogoUploadError ? error.code : (readDomainError(error).domainCode ?? "UNKNOWN");
      // Fields are saved; keep the picked logo so Save retries only the logo step.
      setMode("edit");
      toast.show("error", `Details saved, but the logo couldn't be updated: ${logoErrorMessage(code)}.`);
    } finally {
      setSubmitting(false);
    }
  }

  const optionsStatus = options.isPending ? "loading" : options.isError ? "error" : "ready";
  const optionList = { status: optionsStatus, onRetry: () => void options.refetch() } as const;
  const fieldProps = { readOnly };
  return (
    <div className="min-h-full bg-gms-surface px-4 pb-12 sm:px-6">
      <CompanyProfileHeader
        mode={mode}
        canEdit={canEdit}
        submitting={submitting}
        refreshing={refreshing}
        onCancel={() => confirmDiscard(() => restore(saved))}
        onEdit={() => setMode("edit")}
        onRefresh={() => confirmDiscard(() => void reload())}
      />

      {/* UI revision 3: Company Logo in a 200 px left column; the sections stack in the second column. */}
      <form id={FORM_ID} noValidate onSubmit={handleSubmit(save, focusFirstError)} className="grid grid-cols-1 gap-x-12 pt-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:pl-10">
        <div className="mb-8 lg:mb-0">
          <p className="mb-6 text-gms-heading font-medium text-gms-text">Company Logo</p>
          <LogoUploadTile id="cp-logo" value={logo} savedUrl={logoUrl(saved)} onChange={setLogo} readOnly={readOnly} uploading={submitting && logo.kind === "new"} />
        </div>

        <ProfileSection id="company-general" title="General Information">
          <div className={fieldGrid}>
            <TextField id="cp-name" label="Name/Company Name" required autoComplete="organization" error={errors.name?.message} {...fieldProps} {...register("name")} />
            <TextField id="cp-taxId" label="Tax ID" autoComplete="off" error={errors.taxId?.message} {...fieldProps} {...register("taxId")} />
            <TextField id="cp-contactName" label="Contact Person Name" required autoComplete="name" error={errors.contactName?.message} {...fieldProps} {...register("contactName")} />
            <Controller
              control={control}
              name="phone"
              render={({ field }) => (
                <PhoneField id="cp-phone" label="Phone No." required value={field.value} onChange={field.onChange} onBlur={field.onBlur} inputRef={field.ref} error={errors.phone?.message} readOnly={readOnly} />
              )}
            />
            <TextField id="cp-email" label="Email" type="email" required autoComplete="email" error={errors.email?.message} {...fieldProps} {...register("email")} />
            <TextField
              id="cp-website"
              label="Website"
              type="url"
              autoComplete="url"
              placeholder="https://"
              error={errors.website?.message}
              {...fieldProps}
              {...register("website", {
                onBlur: (event: React.FocusEvent<HTMLInputElement>) => {
                  const normalized = normalizeWebsite(event.target.value);
                  if (normalized !== event.target.value) setValue("website", normalized, { shouldDirty: true, shouldValidate: true });
                },
              })}
            />
          </div>
        </ProfileSection>

        <ProfileSection id="company-address" title="Address">
          <div className={fieldGrid}>
            <TextField id="cp-address" label="Address No.1" required autoComplete="address-line1" className="md:col-span-2" error={errors.address?.message} {...fieldProps} {...register("address")} />
            <TextField id="cp-address2" label="Address No.2" autoComplete="address-line2" className="md:col-span-2" error={errors.address2?.message} {...fieldProps} {...register("address2")} />
            <TextField id="cp-roadStreet" label="Road/Street" autoComplete="off" error={errors.roadStreet?.message} {...fieldProps} {...register("roadStreet")} />
            {/* Searchable (owner 2026-10-19). Controlled: the options load after the form (owner screenshot 2026-10-16). */}
            <Controller
              control={control}
              name="countryCode"
              render={({ field }) => (
                <ComboboxField
                  id="cp-countryCode"
                  label="Country"
                  required
                  placeholder="Search country"
                  options={options.data?.countries ?? []}
                  status={optionList.status}
                  onRetry={optionList.onRetry}
                  error={errors.countryCode?.message}
                  readOnly={readOnly}
                  ref={field.ref}
                  value={field.value}
                  onBlur={field.onBlur}
                  onChange={(code) => {
                    field.onChange(code);
                    // State and City belong to the chosen country: clear them when it changes (partner DV-04).
                    setRegion({ state: "", city: "" });
                  }}
                />
              )}
            />
            {/* Owner 2026-10-19: State then City (optional), dropdowns from the country's list (a City fills its State);
                countries without a list keep free text. DV-04: the design labels State "Stage/Province". */}
            {(["state", "city"] as const).map((kind) => (
              <Controller
                key={kind}
                control={control}
                name={kind}
                render={({ field }) => (
                  <RegionField
                    kind={kind}
                    id={`cp-${kind}`}
                    label={kind === "state" ? "State/Province" : "City"}
                    required={kind === "state"}
                    readOnly={readOnly}
                    hasCountry={Boolean(countryCode)}
                    region={region}
                    value={{ state, city }}
                    onChange={setRegion}
                    onBlur={field.onBlur}
                    autoComplete={kind === "state" ? "address-level1" : "address-level2"}
                    error={errors[kind]?.message}
                    ref={field.ref}
                  />
                )}
              />
            ))}
            <TextField id="cp-postcode" label="Postcode" required autoComplete="postal-code" error={errors.postcode?.message} {...fieldProps} {...register("postcode")} />
          </div>
        </ProfileSection>

        <ProfileSection id="company-currency" title="Company Currency">
          <div className={fieldGrid}>
            <Controller
              control={control}
              name="currencyCode"
              render={({ field }) => (
                <SelectField
                  id="cp-currencyCode"
                  label="Company Currency"
                  required
                  placeholder="Select"
                  options={currencyChoices(options.data?.currencies ?? [], field.value)}
                  status={optionList.status}
                  onRetry={optionList.onRetry}
                  error={errors.currencyCode?.message}
                  readOnly={readOnly}
                  ref={field.ref}
                  name={field.name}
                  value={field.value}
                  onBlur={field.onBlur}
                  onChange={(event) => field.onChange(event.target.value)}
                />
              )}
            />
          </div>
        </ProfileSection>

        <ProfileSection id="company-bank" title="Company Bank Details">
          <PlainTextField id="cp-bankDetails" labelledBy="company-bank-title" placeholder="Enter bank transfer details..." error={errors.bankDetails?.message} {...fieldProps} {...register("bankDetails")} />
          <div className="mt-4">
            <Controller
              control={control}
              name="showBankDetailsOnInvoice"
              render={({ field }) => <LabeledCheckbox id="cp-showBankDetails" label="Need to show on invoice" checked={field.value} onChange={field.onChange} readOnly={readOnly} inputRef={field.ref} />}
            />
          </div>
        </ProfileSection>
      </form>

      <DiscardChangesDialog
        entity={COMPANY}
        open={pendingDiscard !== null}
        name={companyName}
        onKeep={() => setPendingDiscard(null)}
        onDiscard={() => {
          const action = pendingDiscard;
          setPendingDiscard(null);
          action?.();
        }}
      />
      <ConfirmDialog
        open={conflict}
        title="The company profile was changed"
        body="Someone else saved changes. Reload to see them; your unsaved changes will be lost."
        cancelLabel="Keep editing"
        confirmLabel="Reload"
        pendingLabel="Reloading..."
        pending={refreshing}
        onCancel={() => setConflict(false)}
        onConfirm={() => {
          setConflict(false);
          void reload();
        }}
      />
    </div>
  );
}

/**
 * CP-02 header (S1): title left; Print / Excel / Refresh, then Cancel · Save · Edit on the right. Sticky
 * at the top of the scrolling content (Q-CP-08). Print and Excel stay unavailable (DV-03, owner).
 */
function CompanyProfileHeader({
  mode,
  canEdit,
  submitting,
  refreshing,
  onCancel,
  onEdit,
  onRefresh,
}: Readonly<{ mode: Mode; canEdit: boolean; submitting: boolean; refreshing: boolean; onCancel: () => void; onEdit: () => void; onRefresh: () => void }>) {
  const editing = mode !== "view" && canEdit;
  return (
    <div className="sticky top-0 z-20 -mx-4 mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3 bg-gms-surface px-4 pt-6 pb-3 sm:-mx-6 sm:px-6">
      <h1 className="text-gms-title font-medium text-gms-text-heading">Company Profile</h1>
      <div className="flex flex-col items-end gap-3">
        <div className="flex items-center gap-1">
          <IconButton label="Print company profile" unavailableReason="Printing isn't available yet">
            <Printer size={18} aria-hidden />
          </IconButton>
          <IconButton label="Export to Excel" unavailableReason="Excel export isn't available yet">
            <FileSpreadsheet size={18} className="text-gms-excel" aria-hidden />
          </IconButton>
          <span className="w-3" aria-hidden />
          <IconButton label="Refresh" onClick={onRefresh} aria-busy={refreshing || undefined} disabled={submitting || refreshing}>
            <RotateCw size={18} className={cx(refreshing && "animate-spin")} aria-hidden />
          </IconButton>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onCancel} disabled={!editing || submitting} className="min-w-[100px]">
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" loading={submitting} loadingLabel="Saving..." icon={<Save size={18} aria-hidden />} disabled={!editing} className="min-w-[100px]">
            Save
          </Button>
          <Button variant="primary" icon={<Pencil size={16} aria-hidden />} onClick={onEdit} disabled={mode !== "view" || !canEdit} className="min-w-[100px]">
            Edit
          </Button>
        </div>
      </div>
    </div>
  );
}
