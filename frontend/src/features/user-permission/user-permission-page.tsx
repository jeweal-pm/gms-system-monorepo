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
import { grantableOnly, userAdminAccess, type UserAdminAccess } from "./access";
import { DeleteUserDialog } from "./components/delete-user-dialog";
import { PhotoTile } from "./components/photo-tile";
import { photoErrorMessage, photoUrl, PhotoUploadError, UNCHANGED_PHOTO, uploadUserPhoto, type PhotoChange } from "./photo";
import { PageHeader, type PageMode } from "./components/page-header";
import { PermissionsCard } from "./components/permissions-card";
import { PersonalInformationCard } from "./components/personal-information-card";
import { Button, cx, focusRing } from "@/components/ui/button";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { USERS_DRAWER_ID, UsersDrawer } from "./components/users-drawer";
import { useLocationOptions, usePermissionCatalog, usePermissionMine, useRemovePhoto, useSaveUser, useUserDetail, useUserList } from "./hooks";
import { grantsFromValues, valuesFromGrants } from "./permission-utils";
import { emptyUserForm, userFormSchema, type UserFormValues } from "./schema";

const FORM_ID = "user-permission-form";

/**
 * Setup › User and permission, UI revision 2 (ADR-0020).
 * Delegated admin (owner 2026-10-17, delegated-admin.md): anyone with `user-and-permission:VIEW`
 * may open it; buttons are disabled per action, VIEW-only lands on a disabled Add page, and the
 * matrix only lets you hand out permissions you hold. No `userAdmin.*` request is made without VIEW.
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
          <p className="text-gms-body text-gms-text">{message}</p>
          <Button onClick={() => void mine.refetch()}>Retry</Button>
        </div>
      </PageFrame>
    );
  }

  const access = userAdminAccess(mine.data);
  if (!access.view) {
    return (
      <PageFrame>
        <section aria-labelledby="access-denied-title" className="flex flex-col items-start gap-3 rounded-gms-lg border border-gms-border bg-gms-surface p-8">
          <ShieldAlert size={28} className="text-gms-text-secondary" aria-hidden />
          <h1 id="access-denied-title" className="text-gms-title font-medium text-gms-text-heading">
            You don&apos;t have access to User and permission
          </h1>
          <p className="text-gms-body text-gms-text-secondary">Ask an administrator for the User and Permission VIEW permission.</p>
          <Link href="/" className={cx("mt-2 rounded-gms-md border border-gms-border px-4 py-2 text-gms-body font-medium text-gms-text hover:bg-gms-surface-sunken", focusRing)}>
            Back to Home
          </Link>
        </section>
      </PageFrame>
    );
  }

  return <UserPermissionWorkspace access={access} />;
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

function UserPermissionWorkspace({ access }: { access: UserAdminAccess }) {
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
  const removePhoto = useRemovePhoto();
  const [photoChange, setPhotoChange] = useState<PhotoChange>(UNCHANGED_PHOTO);
  const [photoUploading, setPhotoUploading] = useState(false);

  const target = mode !== "create" && detail.data && detail.data.id === selectedUserId ? detail.data : null;
  const superAdminTarget = Boolean(target?.isSuperAdmin);
  const isSelf = target !== null && target.id === session.data?.user.id;
  // DA-03…05: auth says whether this caller may change the open user at all.
  const manageable = target?.manageable ?? true;
  // VIEW-only (no ADD) sees the Add page with everything disabled (owner 2026-10-17).
  const formMode: PageMode = mode === "create" && !access.add ? "view" : mode;

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

  // Lost the VIEW permission mid-session: re-check access so the guard shows the denied state.
  const lostAccess = [list.error, detail.error, locations.error].some((error) => readDomainError(error).domainCode === "PERMISSION_DENIED");
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

  /** Drops a picked-but-unsaved photo (and its preview URL). */
  function resetPhoto() {
    setPhotoChange((current) => {
      if (current.kind === "new") URL.revokeObjectURL(current.previewUrl);
      return UNCHANGED_PHOTO;
    });
  }

  /**
   * PH-08: after the details are saved, upload or remove the photo for that user. A failure keeps the
   * saved details and only reports the photo.
   */
  async function applyPhoto(userId: string) {
    const change = photoChange;
    if (change.kind === "unchanged") return;
    setPhotoUploading(true);
    try {
      if (change.kind === "new") await uploadUserPhoto(userId, change.file);
      else await removePhoto.mutateAsync({ id: userId });
    } catch (cause) {
      const code = cause instanceof PhotoUploadError ? cause.code : readDomainError(cause).domainCode;
      toast.show("error", `Details saved, but the photo couldn't be updated: ${photoErrorMessage(code)}.`);
    } finally {
      setPhotoUploading(false);
      resetPhoto();
    }
  }

  function startDraft(values: UserFormValues) {
    resetPhoto();
    if (selectedUserId !== null) setPreviousUserId(selectedUserId);
    reset(values);
    setFormError(null);
    setSelectedUserId(null);
    setMode("create");
    setFocusRequest({ field: "username", seq: Date.now() });
  }

  function selectUser(id: string) {
    resetPhoto();
    setFormError(null);
    setSelectedUserId(id);
    setMode("view");
  }

  function cancel() {
    resetPhoto();
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
    if (!target || !access.edit || !manageable) return;
    setFormError(null);
    setMode("edit");
    setFocusRequest({ field: "name", seq: Date.now() });
  }

  function duplicateSelected() {
    const source = detail.data;
    if (!source || !catalog.data) return;
    // ADR-0020 §4: copy the details and permissions into a new draft; Username and Password are cleared.
    const copied = formFromDetail(source, catalog.data);
    startDraft({ ...copied, permissions: grantableOnly(copied.permissions, access.grantable), username: "", password: "", active: true });
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
    if (formMode === "view" || saving) return;
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
        await applyPhoto(result.id);
        setPreviousUserId(null);
        reset(emptyUserForm()); // also clears the password
        selectUser(result.id);
        toast.show("success", "User created");
      } else {
        if (!target) return;
        const result = await update(toUpdateUserInput(target, { ...values, permissions }));
        if (result === null) return;
        await applyPhoto(target.id);
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
      : !manageable
        ? "This user has permissions you don't have"
        : null;
  const showForm = mode === "create" || savedLoaded;

  return (
    <div className="flex h-full min-h-0 flex-col bg-gms-page">
      <div className="relative flex min-h-0 flex-1">
        {/* The page stays put and only the permission table scrolls (owner 2026-10-17); the page itself
            scrolls only when the window is too short for the table's minimum height. */}
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto pb-6 pl-6 pr-10 pt-6 print:block print:overflow-visible">
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
              if (access.delete && selectedSummary && deleteBlockedReason === null) setDeleteTarget(selectedSummary);
            }}
            canAdd={access.add}
            canEdit={access.edit && manageable}
            canDelete={access.delete}
            canPrint={access.print}
          />

          {selectedUserId !== null && detail.isError ? (
            <div role="alert" className="flex flex-col items-start gap-3 rounded-gms-lg border border-gms-border bg-gms-surface p-6">
              <p className="text-gms-body text-gms-text">{loadErrorMessage(detail.error, "this user")}</p>
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
              className="flex min-h-0 flex-1 flex-col gap-4 print:block print:space-y-4"
              aria-label={formMode === "create" ? "Create user" : formMode === "edit" ? "Edit user" : "User details"}
            >
              {formError && (
                <p role="alert" className="rounded-gms-md border border-gms-danger bg-gms-danger-subtle px-4 py-3 text-gms-body text-gms-danger">
                  {formError}
                </p>
              )}
              <PersonalInformationCard
                mode={formMode}
                form={form}
                locations={locationsState}
                superAdmin={superAdminTarget}
                isSelf={isSelf}
                photo={
                  <PhotoTile
                    value={photoChange}
                    savedUrl={target ? photoUrl(target.id, target.photoVersion) : null}
                    onChange={setPhotoChange}
                    // PH-06: your own photo is not changed on this page; unmanageable users stay read-only.
                    readOnly={formMode === "view" || isSelf || !manageable}
                    uploading={photoUploading}
                  />
                }
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
                    onChange={formMode === "view" ? undefined : field.onChange}
                    superAdminLocked={superAdminTarget}
                    grantable={access.grantable}
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
            "absolute top-4 z-40 flex h-10 w-6 items-center justify-center rounded-l-gms-sm bg-gms-primary-strong text-gms-on-primary print:hidden",
            drawerOpen ? "max-sm:hidden sm:right-80" : "right-0",
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
