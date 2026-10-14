"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft, ChevronRight, Info, ShieldAlert, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { SetupTabs } from "@/features/setup/setup-tabs";
import { trpc } from "@/providers/app-providers";
import { isCallerLicenseCode, loadErrorMessage, mapCreateError, readDomainError, toCreateUserInput, type UserSummary } from "./api";
import { DeleteUserDialog } from "./components/delete-user-dialog";
import { PageHeader } from "./components/page-header";
import { PermissionsCard } from "./components/permissions-card";
import { PersonalInformationCard } from "./components/personal-information-card";
import { Button, cx, focusRing } from "./components/ui/button";
import { ToastProvider, useToast } from "./components/ui/toast";
import { USERS_DRAWER_ID, UsersDrawer } from "./components/users-drawer";
import { useCreateUser, useLocationOptions, usePermissionCatalog, usePermissionMine, useUserDetail, useUserList } from "./hooks";
import { grantsFromValues, valuesFromGrants } from "./permission-utils";
import { emptyUserForm, userFormSchema, type UserFormValues } from "./schema";

const FORM_ID = "user-permission-form";

/**
 * Setup › User and permission (UI revision 1, SA revision 1 first slice).
 * Super Admin only (owner answer Q-UP-20): `permission.mine` gates the page and
 * no `userAdmin.*` request is made for anyone else (FE-UP-014).
 */
export function UserPermissionPage() {
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
      <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
    </div>
  );
}

function AccessGuard() {
  const mine = usePermissionMine();

  if (mine.isPending) {
    return (
      <PageFrame>
        <div aria-busy="true" aria-label="Checking access" className="space-y-4">
          <div className="h-8 w-80 animate-pulse rounded-gms-sm bg-gms-surface-sunken" />
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

  if (!mine.data.isSuperAdmin) {
    return (
      <PageFrame>
        <section aria-labelledby="access-denied-title" className="flex flex-col items-start gap-3 rounded-gms-lg border border-gms-border bg-gms-surface p-8">
          <ShieldAlert size={28} className="text-gms-text-secondary" aria-hidden />
          <h1 id="access-denied-title" className="text-xl font-medium text-gms-text-heading">
            You don&apos;t have access to User and permission
          </h1>
          <p className="text-sm text-gms-text-secondary">Only a Super Admin can manage users and permissions.</p>
          <Link href="/" className={cx("mt-2 rounded-gms-md border border-gms-border px-4 py-2 text-sm font-medium text-gms-text hover:bg-gms-surface-sunken", focusRing)}>
            Back to Home
          </Link>
        </section>
      </PageFrame>
    );
  }

  return <UserPermissionWorkspace />;
}

function UserPermissionWorkspace() {
  const toast = useToast();
  const utils = trpc.useUtils();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<UserSummary | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const list = useUserList();
  const catalog = usePermissionCatalog();
  const locations = useLocationOptions();
  const detail = useUserDetail(selectedUserId);
  const { create, isPending: creating } = useCreateUser();

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    shouldFocusError: true,
    defaultValues: emptyUserForm(),
  });
  const { setFocus } = form;

  useEffect(() => {
    if (focusRequest > 0) setFocus("username");
  }, [focusRequest, setFocus]);

  // A Super Admin who lost the role mid-session: re-check access so the guard shows the denied state.
  const lostAccess = [list.error, detail.error, locations.error].some((error) => readDomainError(error).domainCode === "SUPER_ADMIN_REQUIRED");
  useEffect(() => {
    if (lostAccess) void utils.permission.mine.invalidate();
  }, [lostAccess, utils]);

  // The selected user was deleted elsewhere: refresh the list so it disappears from the drawer.
  const detailNotFound = readDomainError(detail.error).domainCode === "USER_NOT_FOUND";
  useEffect(() => {
    if (detailNotFound) void utils.userAdmin.list.invalidate();
  }, [detailNotFound, utils]);

  const selectedSummary = useMemo(
    () => (selectedUserId === null ? null : (list.data?.items.find((user) => user.id === selectedUserId) ?? null)),
    [list.data, selectedUserId],
  );
  const viewedPermissions = useMemo(
    () => valuesFromGrants(detail.data?.permissions ?? [], catalog.data?.menus),
    [detail.data, catalog.data],
  );

  const locationsState = {
    options: locations.data ?? [],
    status: locations.isPending ? ("loading" as const) : locations.isError ? ("error" as const) : ("ready" as const),
  };

  function startNewUser() {
    setSelectedUserId(null);
    setFocusRequest((count) => count + 1);
  }

  function duplicateSelected() {
    const source = detail.data;
    if (!source || !catalog.data) return;
    form.reset(emptyUserForm(valuesFromGrants(source.permissions, catalog.data.menus)));
    setFormError(null);
    setSelectedUserId(null);
    setFocusRequest((count) => count + 1);
    // Copy pending Q-UP-03: the source toast also says "department", which has no field.
    toast.show("success", `Duplicated from ${source.name}: permissions are copied. Fill in the personal details, then create the user.`);
  }

  const onSubmit = form.handleSubmit(async (values) => {
    if (!catalog.data) {
      setFormError("The permission list hasn't loaded yet. Retry loading it, then create the user.");
      return;
    }
    if (creating) return;
    setFormError(null);
    try {
      const input = toCreateUserInput({ ...values, permissions: grantsFromValues(values.permissions, catalog.data.menus) });
      const result = await create(input);
      if (result === null) return; // a create is already in flight
      form.reset(emptyUserForm()); // also clears the password
      setSelectedUserId(result.id);
      toast.show("success", "User created");
      void utils.userAdmin.list.invalidate();
    } catch (cause) {
      const outcome = mapCreateError(cause, list.data?.usage);
      outcome.fieldErrors.forEach(({ field, message }, index) => {
        form.setError(field, { type: "server", message }, { shouldFocus: index === 0 });
      });
      setFormError(outcome.formError);
      if (outcome.refetchCatalog) void catalog.refetch();
      if (outcome.refetchLocations) void locations.refetch();
      if (outcome.refetchList) void utils.userAdmin.list.invalidate();
      if (outcome.recheckAccess) void utils.permission.mine.invalidate();
    }
  });

  function closeDrawer() {
    setDrawerOpen(false);
    toggleRef.current?.focus();
  }

  const viewing = selectedUserId !== null;
  const readOnlyAccount = Boolean(selectedSummary?.isSuperAdmin || detail.data?.readOnly);
  const viewedName = selectedSummary?.name ?? detail.data?.name ?? "user";

  return (
    <div className="flex h-full min-h-0 flex-col bg-gms-page">
      <SetupTabs />
      <div className="relative flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto pb-6 pl-6 pr-10 pt-6">
          <PageHeader
            formId={FORM_ID}
            mode={viewing ? "view" : "draft"}
            creating={creating}
            duplicateDisabled={!viewing || !detail.data || !catalog.data}
            refreshing={list.isFetching}
            onPrint={() => toast.show("info", "Print isn't available yet.")}
            onExport={() => toast.show("info", "Excel export isn't available yet.")}
            onDuplicate={duplicateSelected}
            onRefresh={() => void list.refetch()}
            onNewUser={startNewUser}
          />

          {viewing ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 rounded-gms-lg border border-gms-border bg-gms-surface px-4 py-3">
                <Info size={18} className="shrink-0 text-gms-primary" aria-hidden />
                <p className="min-w-0 flex-1 text-sm text-gms-text">
                  {readOnlyAccount
                    ? `Viewing ${viewedName}. Super Admin accounts are read-only.`
                    : `Viewing ${viewedName}. Editing saved users isn't available yet.`}
                </p>
                {selectedSummary && !readOnlyAccount && (
                  <Button icon={<Trash2 size={16} aria-hidden />} onClick={() => setDeleteTarget(selectedSummary)} className="text-gms-danger">
                    Delete user
                  </Button>
                )}
                <Button onClick={startNewUser}>Back to new user</Button>
              </div>
              {detail.isError ? (
                <div role="alert" className="flex flex-col items-start gap-3 rounded-gms-lg border border-gms-border bg-gms-surface p-6">
                  <p className="text-sm text-gms-text">{loadErrorMessage(detail.error, "this user")}</p>
                  {!detailNotFound && <Button onClick={() => void detail.refetch()}>Retry</Button>}
                </div>
              ) : (
                <>
                  <PersonalInformationCard mode="view" user={detail.data} locations={locationsState} onPhotoClick={() => undefined} />
                  <PermissionsCard
                    catalog={catalog.data}
                    catalogStatus={detail.isPending ? "pending" : catalog.status}
                    errorMessage={catalog.isError ? loadErrorMessage(catalog.error, "the permission list") : undefined}
                    onRetry={() => void catalog.refetch()}
                    values={viewedPermissions}
                  />
                </>
              )}
            </div>
          ) : (
            <form id={FORM_ID} noValidate onSubmit={onSubmit} className="space-y-4" aria-label="Create user">
              {formError && (
                <p role="alert" className="rounded-gms-md border border-gms-danger bg-gms-danger-subtle px-4 py-3 text-sm text-gms-danger">
                  {formError}
                </p>
              )}
              <PersonalInformationCard
                mode="draft"
                form={form}
                locations={locationsState}
                onPhotoClick={() => toast.show("info", "Photo upload isn't available yet.")}
              />
              <Controller
                control={form.control}
                name="permissions"
                render={({ field }) => (
                  <PermissionsCard
                    catalog={catalog.data}
                    catalogStatus={catalog.status}
                    errorMessage={catalog.isError ? loadErrorMessage(catalog.error, "the permission list") : undefined}
                    onRetry={() => void catalog.refetch()}
                    values={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </form>
          )}
        </div>

        <button
          ref={toggleRef}
          type="button"
          aria-expanded={drawerOpen}
          aria-controls={USERS_DRAWER_ID}
          aria-label={drawerOpen ? "Hide users panel" : "Show users panel"}
          onClick={() => setDrawerOpen((open) => !open)}
          className={cx(
            "absolute top-4 z-20 flex h-10 w-6 items-center justify-center rounded-l-gms-sm bg-gms-primary-strong text-gms-on-primary",
            drawerOpen ? "right-80" : "right-0",
            focusRing,
          )}
        >
          {drawerOpen ? <ChevronRight size={16} aria-hidden /> : <ChevronLeft size={16} aria-hidden />}
        </button>

        <UsersDrawer
          open={drawerOpen}
          list={list.data}
          listStatus={list.status}
          listErrorMessage={list.isError ? loadErrorMessage(list.error, "users") : undefined}
          onRetry={() => void list.refetch()}
          selectedUserId={selectedUserId}
          onSelectDraft={() => setSelectedUserId(null)}
          onSelectUser={(user) => setSelectedUserId(user.id)}
          onClose={closeDrawer}
        />
      </div>

      <DeleteUserDialog user={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={() => setSelectedUserId(null)} />
    </div>
  );
}
