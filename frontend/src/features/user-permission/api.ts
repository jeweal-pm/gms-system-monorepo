import { isTRPCClientError, type inferRouterClient } from "@trpc/client";
import type { AppRouter } from "@gem-crm/backend-api-gateway/src/trpc/router";
import { fromContractPhone, toContractPhone, type PhoneValue } from "./phone";

/**
 * user-permission data boundary (FE-UP-012, first slice).
 *
 * Contract: SA revision 1, document/apps/backend/auth/user-permission/api-contract.md
 * ("Implementation notes (first slice)"). Procedures used: permission.catalog,
 * permission.mine, userAdmin.list/get/create/delete/locationOptions. Not yet
 * available: userAdmin.update, photo and CSV routes.
 *
 * Contract output types come from the gateway `AppRouter`; this module maps
 * them to the small view models the components use and maps domain errors.
 * Passwords are never logged, cached, or returned.
 */

type Client = inferRouterClient<AppRouter>;
type Output<T extends (...args: never[]) => Promise<unknown>> = Awaited<ReturnType<T>>;

export type CatalogOutput = Output<Client["permission"]["catalog"]["query"]>;
export type UserListOutput = Output<Client["userAdmin"]["list"]["query"]>;
export type UserDetailOutput = Output<Client["userAdmin"]["get"]["query"]>;
export type LocationOptionsOutput = Output<Client["userAdmin"]["locationOptions"]["query"]>;
export type CreateUserInput = Parameters<Client["userAdmin"]["create"]["mutate"]>[0];

export const PERMISSION_ACTIONS = ["VIEW", "ADD", "EDIT", "DELETE", "CANCEL", "PRICE"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export type PermissionMenu = {
  id: string;
  label: string;
  /** Applicable actions of a leaf menu. Group rows derive theirs from children. */
  actions: readonly PermissionAction[];
  children?: readonly PermissionMenu[];
};

export type PermissionCatalog = { menus: readonly PermissionMenu[]; applicableCount: number };

export type UserSummary = Pick<UserListOutput["items"][number], "id" | "name" | "email" | "isSuperAdmin" | "active">;

export type UserList = { items: UserSummary[]; usage: UserListOutput["usage"] };

export type UserDetail = UserSummary & {
  phone: PhoneValue;
  hasPhone: boolean;
  locationIds: string[];
  /** Keys `${menuKey}:${ACTION}`, or "ALL" for a Super Admin. */
  permissions: string[] | "ALL";
  readOnly: boolean;
};

export type LocationOption = { id: string; label: string };

// ---- contract -> view model (used as TanStack Query `select`) ----

export function toPermissionCatalog(output: CatalogOutput): PermissionCatalog {
  return {
    applicableCount: output.applicableCount,
    menus: output.nodes.map((node) => ({
      id: node.key,
      label: node.label,
      actions: node.actions ?? [],
      children: node.children?.map((child) => ({ id: child.key, label: child.label, actions: child.actions })),
    })),
  };
}

export function toUserList(output: UserListOutput): UserList {
  return {
    usage: output.usage,
    items: output.items.map(({ id, name, email, isSuperAdmin, active }) => ({ id, name, email, isSuperAdmin, active })),
  };
}

export function toUserDetail(output: UserDetailOutput): UserDetail {
  return {
    id: output.id,
    name: output.name,
    email: output.email,
    isSuperAdmin: output.isSuperAdmin,
    active: output.active,
    phone: fromContractPhone(output.phone),
    hasPhone: output.phone !== null,
    locationIds: output.locationKeys,
    permissions: output.permissions,
    readOnly: output.readOnly,
  };
}

export function toLocationOptions(output: LocationOptionsOutput): LocationOption[] {
  return output.items.map(({ key, label }) => ({ id: key, label }));
}

/** Form values -> strict create input. `photo` is deferred and never sent; `active` stays true until BE-UP-011. */
export function toCreateUserInput(values: {
  username: string;
  password: string;
  name: string;
  phone: PhoneValue;
  locationIds: string[];
  permissions: string[];
}): CreateUserInput {
  return {
    email: values.username.trim(),
    password: values.password,
    name: values.name.trim(),
    phone: toContractPhone(values.phone),
    locationKeys: values.locationIds,
    active: true,
    permissions: values.permissions,
  };
}

// ---- errors ----

export type ServerFieldError = { path: string; code: string };
export type DomainErrorInfo = { domainCode: string | null; fieldErrors: ServerFieldError[]; httpStatus: number | null };

const DOMAIN_CODE_PATTERN = /^[A-Z][A-Z_]{1,63}$/;

/**
 * Reads `data.domainCode` / `data.fieldErrors` from the gateway errorFormatter (falls back to the
 * message code). A 401 has no domain code ("Authentication required"), so it is reported as "UNAUTHORIZED".
 */
export function readDomainError(error: unknown): DomainErrorInfo {
  if (!isTRPCClientError<AppRouter>(error)) return { domainCode: null, fieldErrors: [], httpStatus: null };
  const data = error.data;
  const domainCode =
    data?.domainCode ??
    (DOMAIN_CODE_PATTERN.test(error.message) ? error.message : null) ??
    (data?.code === "UNAUTHORIZED" ? "UNAUTHORIZED" : null);
  return { domainCode, fieldErrors: data?.fieldErrors ?? [], httpStatus: data?.httpStatus ?? null };
}

export function isCallerLicenseCode(code: string | null): boolean {
  return code !== null && /^LICENSE_/.test(code);
}

/** Reads: retry up to twice only for transient failures (no 4xx retries). Mutations are never retried. */
export function retryTransient(failureCount: number, error: unknown): boolean {
  const { httpStatus, domainCode } = readDomainError(error);
  if (domainCode === "UNAUTHORIZED" || isCallerLicenseCode(domainCode)) return false;
  if (httpStatus !== null && httpStatus < 500) return false;
  return failureCount < 2;
}

export type FormField = "username" | "password" | "name" | "phone" | "locationIds";
export type CreateErrorOutcome = {
  fieldErrors: { field: FormField; message: string }[];
  formError: string | null;
  /** Side effects the page applies. */
  refetchCatalog?: boolean;
  refetchLocations?: boolean;
  refetchList?: boolean;
  recheckAccess?: boolean;
};

const PASSWORD_POLICY_MESSAGE = "Password must be 4–64 characters";
const GENERIC_SAVE_ERROR = "Couldn't save the user. Try again.";

function fieldMessage(path: string, code: string): { field: FormField; message: string } | null {
  const root = path.split(".")[0];
  switch (root) {
    case "email":
      if (code === "duplicate") return { field: "username", message: "This username is already in use" };
      if (code === "too_big") return { field: "username", message: "Username must be at most 254 characters" };
      return { field: "username", message: "Enter a valid email address" };
    case "password":
      return { field: "password", message: PASSWORD_POLICY_MESSAGE };
    case "name":
      return { field: "name", message: code === "too_big" ? "Name must be at most 120 characters" : "Name is required" };
    case "phone":
      return { field: "phone", message: "Enter a valid phone number" };
    case "locationKeys":
      if (code === "unknown") return { field: "locationIds", message: "Select a location from the list" };
      if (code === "too_big") return { field: "locationIds", message: "Select at most 20 locations" };
      return { field: "locationIds", message: "Location is required" };
    default:
      return null;
  }
}

/** userAdmin.create domain codes -> field errors / FormError banner (error-handling.md, frontend + service). */
export function mapCreateError(error: unknown, usage: UserList["usage"] | undefined): CreateErrorOutcome {
  const { domainCode, fieldErrors } = readDomainError(error);
  const mappedFields = fieldErrors.map((entry) => fieldMessage(entry.path, entry.code)).filter((entry) => entry !== null);

  switch (domainCode) {
    case "VALIDATION_ERROR": {
      const unmapped = fieldErrors.length === 0 || mappedFields.length < fieldErrors.length;
      return {
        fieldErrors: mappedFields,
        formError: unmapped ? "Some details couldn't be saved. Check the form and try again." : null,
      };
    }
    case "PASSWORD_POLICY_VIOLATION":
      return { fieldErrors: [{ field: "password", message: PASSWORD_POLICY_MESSAGE }], formError: null };
    case "EMAIL_ALREADY_EXISTS":
      return { fieldErrors: [{ field: "username", message: "This username is already in use" }], formError: null };
    case "LOCATION_UNKNOWN":
      return { fieldErrors: [{ field: "locationIds", message: "Select a location from the list" }], formError: null, refetchLocations: true };
    case "PERMISSION_UNKNOWN":
      return {
        fieldErrors: [],
        formError: "The permission list has changed and was reloaded. Review the permissions, then try again.",
        refetchCatalog: true,
      };
    case "USER_LIMIT_REACHED":
      return {
        fieldErrors: [],
        formError: usage
          ? `User limit reached (${usage.limit} of ${usage.limit}). Delete a user before adding another.`
          : "User limit reached. Delete a user before adding another.",
        refetchList: true,
      };
    case "USER_LICENSE_NOT_ELIGIBLE":
      return { fieldErrors: [], formError: "This email has no issued license. Contact sales." };
    case "USER_LICENSE_UNVERIFIABLE":
      return { fieldErrors: [], formError: "Couldn't verify the license. Try again." };
    case "SUPER_ADMIN_REQUIRED":
      return { fieldErrors: [], formError: "Only a Super Admin can add users.", recheckAccess: true };
    default:
      if (isCallerLicenseCode(domainCode)) return { fieldErrors: [], formError: "Your license doesn't allow this right now. Nothing was saved." };
      if (domainCode === "UNAUTHORIZED") return { fieldErrors: [], formError: "Your session has ended. Sign in again." };
      // USER_SERVICE_UNAVAILABLE, INTERNAL_SERVER_ERROR, network failure or timeout.
      return { fieldErrors: [], formError: GENERIC_SAVE_ERROR };
  }
}

export type DeleteErrorOutcome =
  | { kind: "dialog"; message: string; recheckAccess?: boolean }
  | { kind: "gone"; message: string };

/** userAdmin.delete domain codes -> in-dialog error, or "already gone" (close + toast). */
export function mapDeleteError(error: unknown): DeleteErrorOutcome {
  const { domainCode } = readDomainError(error);
  switch (domainCode) {
    case "USER_NOT_FOUND":
      return { kind: "gone", message: "This user was already deleted." };
    case "SUPER_ADMIN_READ_ONLY":
      return { kind: "dialog", message: "Super Admin accounts and your own account can't be deleted." };
    case "SUPER_ADMIN_REQUIRED":
      return { kind: "dialog", message: "Only a Super Admin can delete users.", recheckAccess: true };
    default:
      if (isCallerLicenseCode(domainCode)) return { kind: "dialog", message: "Your license doesn't allow this right now. Nothing was deleted." };
      if (domainCode === "UNAUTHORIZED") return { kind: "dialog", message: "Your session has ended. Sign in again." };
      return { kind: "dialog", message: "Couldn't delete the user. Try again." };
  }
}

/** Load failures for list/get/catalog/locations: short inline copy. */
export function loadErrorMessage(error: unknown, subject: string): string {
  const { domainCode } = readDomainError(error);
  if (domainCode === "USER_NOT_FOUND") return "This user no longer exists. It may have been deleted.";
  if (domainCode === "SUPER_ADMIN_REQUIRED") return `Only a Super Admin can view ${subject}.`;
  if (isCallerLicenseCode(domainCode)) return `Your license doesn't allow loading ${subject} right now.`;
  if (domainCode === "UNAUTHORIZED") return "Your session has ended. Sign in again.";
  return `Couldn't load ${subject}.`;
}
