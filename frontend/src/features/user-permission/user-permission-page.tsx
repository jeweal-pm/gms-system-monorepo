"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft, ChevronRight, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/providers/app-providers";
import { isCallerLicenseCode, readDomainError } from "@/lib/trpc-error";
import { loadErrorMessage, mapSaveError, toCreateUserInput, toUpdateUserInput, type PermissionCatalog, type UserDetail, type UserSummary } from "./api";
import { DeleteUserDialog } from "./components/delete-user-dialog";
import { PageHeader, type PageMode } from "./components/page-header";
import { PermissionsCard } from "./components/permissions-card";
import { PersonalInformationCard } from "./components/personal-information-card";
import { Button, cx, focusRing } from "@/components/ui/button";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { USERS_DRAWER_ID, UsersDrawer } from "./components/users-drawer";
import { useLocationOptions, usePermissionCatalog, usePermissionMine, useSaveUser, useUserDetail, useUserList } from "./hooks";
import { grantsFromValues, valuesFromGrants } from "./permission-utils";
import { emptyUserForm, userFormSchema, type UserFormValues } from "./schema";

const FORM_ID = "user-permission-form";

/**
 * Setup › User and permission, UI revision 2 (ADR-0020).
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

/** Saved user -> form values. The password is never returned, so it starts empty. */
function formFromDetail(user: UserDetail, catalog: PermissionCatalog | undefined): UserFormValues {
  return {
    active: user.active,
    username: user.username,
    password: "",
    name: user.name,
    phone: user.phone,
    locationIds: user.locationIds,
    permissions: valuesFromGrants(user.permissions, catalog?.nodes),
  };
}

function UserPermissionWorkspace() {
  const toast = useToast();
  const utils = trpc.useUtils();
  const session = authClient.useSession();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [mode, setMode] = useState<PageMode>("create");
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<UserSummary | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ field: "username" | "name"; seq: number } | null>(null);
  /** The saved user that was open before Create User / Duplicate, restored by Cancel. */
  const [previousUserId, setPreviousUserId] = useState<string | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const list = useUserList();
  const catalog = usePermissionCatalog();
  const locations = useLocationOptions();
  const detail = useUserDetail(selectedUserId);
  const { create, update, isPending: saving } = useSaveUser();

  const target = mode !== "create" && detail.data && detail.data.id === selectedUserId ? detail.data : null;
  const superAdminTarget = Boolean(target?.isSuperAdmin);
  const isSelf = target !== null && target.id === session.data?.user.id;

  // One form serves create and edit; RHF re-reads `resolver` on every render (react-hook-form 7.89).
  const resolver = useMemo(
    () => zodResolver(userFormSchema(mode === "create" ? "create" : "edit", superAdminTarget)) as Resolver<UserFormValues>,
    [mode, superAdminTarget],
  );

  const form = useForm<UserFormValues>({
    resolver,
    mode: "onBlur",
    reValidateMode: "onChange",
    shouldFocusError: true,
    defaultValues: emptyUserForm(),
  });
  const { setFocus, reset } = form;
  const draftUsername = useWatch({ control: form.control, name: "username" });

  useEffect(() => {
    if (focusRequest) setFocus(focusRequest.field);
  }, [focusRequest, setFocus]);

  // View mode always mirrors the latest saved details (also after Cancel, Save and Refresh).
  useEffect(() => {
    if (mode === "view" && detail.data && detail.data.id === selectedUserId) reset(formFromDetail(detail.data, catalog.data));
  }, [mode, detail.data, selectedUserId, catalog.data, reset]);

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

  const locationsState = {
    options: locations.data ?? [],
    status: locations.isPending ? ("loading" as const) : locations.isError ? ("error" as const) : ("ready" as const),
  };

  function startDraft(values: UserFormValues) {
    if (selectedUserId !== null) setPreviousUserId(selectedUserId);
    reset(values);
    setFormError(null);
    setSelectedUserId(null);
    setMode("create");
    setFocusRequest({ field: "username", seq: Date.now() });
  }

  function selectUser(id: string) {
    setFormError(null);
    setSelectedUserId(id);
    setMode("view");
  }

  function cancel() {
    setFormError(null);
    if (mode === "edit") {
      setMode("view"); // the view effect restores the saved values
      void detail.refetch();
      return;
    }
    const previous = previousUserId;
    setPreviousUserId(null);
    if (previous !== null && list.data?.items.some((user) => user.id === previous)) selectUser(previous);
    else reset(emptyUserForm());
  }

  function startEdit() {
    if (!target) return;
    setFormError(null);
    setMode("edit");
    setFocusRequest({ field: "name", seq: Date.now() });
  }

  function duplicateSelected() {
    const source = detail.data;
    if (!source || !catalog.data) return;
    // ADR-0020 §4: copy the details and permissions into a new draft; Username and Password are cleared.
    startDraft({ ...formFromDetail(source, catalog.data), username: "", password: "", active: true });
    toast.show("success", `Duplicated from ${source.name}. Enter a username and password, then save.`);
  }

  function print() {
    window.print();
  }

  function refresh() {
    void list.refetch();
    if (selectedUserId !== null && mode === "view") void detail.refetch();
  }

  const onSubmit = form.handleSubmit(async (values) => {
    if (mode === "view" || saving) return;
    if (!catalog.data) {
      setFormError("The permission list hasn't loaded yet. Retry loading it, then save.");
      return;
    }
    setFormError(null);
    const permissions = grantsFromValues(values.permissions, catalog.data.nodes);
    try {
      if (mode === "create") {
        const result = await create(toCreateUserInput({ ...values, permissions }));
        if (result === null) return; // a save is already in flight
        setPreviousUserId(null);
        reset(emptyUserForm()); // also clears the password
        selectUser(result.id);
        toast.show("success", "User created");
      } else {
        if (!target) return;
        const result = await update(toUpdateUserInput(target, { ...values, permissions }));
        if (result === null) return;
        form.setValue("password", "");
        setMode("view");
        void utils.userAdmin.get.invalidate({ id: target.id });
        toast.show("success", "Changes saved");
      }
      void utils.userAdmin.list.invalidate();
    } catch (cause) {
      const outcome = mapSaveError(cause, mode === "create" ? "create" : "update", list.data?.usage);
      outcome.fieldErrors.forEach(({ field, message }, index) => {
        form.setError(field, { type: "server", message }, { shouldFocus: index === 0 });
      });
      setFormError(outcome.formError);
      if (outcome.refetchCatalog) void catalog.refetch();
      if (outcome.refetchLocations) void locations.refetch();
      if (outcome.refetchList) void utils.userAdmin.list.invalidate();
      if (outcome.refetchDetail && target) void utils.userAdmin.get.invalidate({ id: target.id });
      if (outcome.recheckAccess) void utils.permission.mine.invalidate();
      if (outcome.gone) {
        setSelectedUserId(null);
        setMode("create");
        reset(emptyUserForm());
      }
    }
  });

  function closeDrawer() {
    setDrawerOpen(false);
    toggleRef.current?.focus();
  }

  const savedLoaded = selectedUserId !== null && detail.data?.id === selectedUserId;
  const deleteBlockedReason = target?.isSuperAdmin
    ? "Super Admin accounts can't be deleted"
    : isSelf
      ? "You can't delete your own account"
      : null;
  const showForm = mode === "create" || savedLoaded;

  return (
    <div className="flex h-full min-h-0 flex-col bg-gms-page">
      <div className="relative flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto pb-6 pl-6 pr-10 pt-6 print:overflow-visible">
          <PageHeader
            formId={FORM_ID}
            mode={mode}
            total={list.data?.items.length}
            saving={saving}
            deleting={deleteTarget !== null}
            savedLoaded={savedLoaded && Boolean(catalog.data)}
            deleteBlockedReason={deleteBlockedReason}
            refreshing={list.isFetching}
            onPrint={print}
            onDuplicate={duplicateSelected}
            onRefresh={refresh}
            onCreateUser={() => startDraft(emptyUserForm())}
            onCancel={cancel}
            onEdit={startEdit}
            onDelete={() => {
              if (selectedSummary && deleteBlockedReason === null) setDeleteTarget(selectedSummary);
            }}
          />

          {selectedUserId !== null && detail.isError ? (
            <div role="alert" className="flex flex-col items-start gap-3 rounded-gms-lg border border-gms-border bg-gms-surface p-6">
              <p className="text-sm text-gms-text">{loadErrorMessage(detail.error, "this user")}</p>
              {!detailNotFound && <Button onClick={() => void detail.refetch()}>Retry</Button>}
            </div>
          ) : !showForm ? (
            <div aria-busy="true" aria-label="Loading user" className="space-y-4">
              <div className="h-[220px] animate-pulse rounded-gms-lg bg-gms-surface-sunken" />
              <div className="h-[420px] animate-pulse rounded-gms-lg bg-gms-surface-sunken" />
            </div>
          ) : (
            <form
              id={FORM_ID}
              noValidate
              onSubmit={onSubmit}
              className="space-y-4"
              aria-label={mode === "create" ? "Create user" : mode === "edit" ? "Edit user" : "User details"}
            >
              {formError && (
                <p role="alert" className="rounded-gms-md border border-gms-danger bg-gms-danger-subtle px-4 py-3 text-sm text-gms-danger">
                  {formError}
                </p>
              )}
              <PersonalInformationCard
                mode={mode}
                form={form}
                locations={locationsState}
                superAdmin={superAdminTarget}
                isSelf={isSelf}
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
                    values={superAdminTarget ? valuesFromGrants("ALL", catalog.data?.nodes) : field.value}
                    onChange={mode === "view" ? undefined : field.onChange}
                    superAdminLocked={superAdminTarget}
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
            "absolute top-4 z-20 flex h-10 w-6 items-center justify-center rounded-l-gms-sm bg-gms-primary-strong text-gms-on-primary print:hidden",
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
          draft={mode === "create" ? { username: draftUsername } : null}
          onSelectDraft={() => undefined}
          onSelectUser={(user) => selectUser(user.id)}
          onClose={closeDrawer}
        />
      </div>

      <DeleteUserDialog
        user={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => {
          setPreviousUserId(null);
          setSelectedUserId(null);
          setMode("create");
          reset(emptyUserForm());
        }}
      />
    </div>
  );
}
