import { fromContractPhone, toContractPhone, type PhoneValue } from "@/lib/phone";
import { isCallerLicenseCode, readDomainError } from "@/lib/trpc-error";
import type { CatalogOutput, CreateUserInput, LocationOptionsOutput, UpdateUserInput, UserDetailOutput, UserListOutput } from "./contract";

/**
 * user-permission data boundary, UI revision 2 (ADR-0020).
 *
 * Procedures: permission.catalog (v2 tree), permission.mine,
 * userAdmin.list/get/create/update/delete/locationOptions. The identity field
 * is `username` (sign-in name, immutable after create). Contract output types
 * come from the gateway `AppRouter` (contract.ts); this module maps them to the
 * small view models the components use and maps domain errors.
 * Passwords are never logged, cached, or returned.
 */

export type { CreateUserInput, UpdateUserInput };

export const PERMISSION_ACTIONS = ["VIEW", "ADD", "EDIT", "DELETE", "CANCEL", "APPROVE", "PRICE", "PRINT", "EXCEL"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export type CatalogNodeKind = "section" | "group" | "leaf";

/**
 * Catalog v2 node. Only `leaf` nodes carry permission cells (`actions`);
 * section and group rows are UI aggregates and are never sent as grants.
 */
export type CatalogNode = {
  id: string;
  label: string;
  kind: CatalogNodeKind;
  actions: readonly PermissionAction[];
  children: readonly CatalogNode[];
};

export type PermissionCatalog = { nodes: readonly CatalogNode[]; applicableCount: number };

export type UserSummary = { id: string; name: string; username: string; isSuperAdmin: boolean; active: boolean };

export type UserList = { items: UserSummary[]; usage: UserListOutput["usage"] };

export type UserDetail = UserSummary & {
  phone: PhoneValue;
  hasPhone: boolean;
  locationIds: string[];
  /** Keys `${menuKey}:${ACTION}`, or "ALL" for a Super Admin. */
  permissions: string[] | "ALL";
  /** Optimistic-concurrency token sent back as `expectedUpdatedAt`. */
  updatedAt: string;
};

export type LocationOption = { id: string; label: string };

// ---- contract -> view model (used as TanStack Query `select`) ----

type CatalogContractNode = CatalogOutput["nodes"][number];

/**
 * Section headings in sentence case for display (owner 2026-10-16): "SETUP" → "Setup",
 * "PRE-SALE" → "Pre-Sale". The catalog contract keeps its own labels.
 */
export function sectionLabel(label: string): string {
  return label.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_match, separator: string, letter: string) => separator + letter.toUpperCase());
}

function toCatalogNode(node: CatalogContractNode): CatalogNode {
  return {
    id: node.key,
    label: node.kind === "section" ? sectionLabel(node.label) : node.label,
    kind: node.kind,
    actions: node.actions ?? [],
    children: (node.children ?? []).map(toCatalogNode),
  };
}

export function toPermissionCatalog(output: CatalogOutput): PermissionCatalog {
  return { applicableCount: output.applicableCount, nodes: output.nodes.map(toCatalogNode) };
}

export function toUserList(output: UserListOutput): UserList {
  return {
    usage: output.usage,
    items: output.items.map(({ id, name, username, isSuperAdmin, active }) => ({ id, name, username, isSuperAdmin, active })),
  };
}

export function toUserDetail(output: UserDetailOutput): UserDetail {
  return {
    id: output.id,
    name: output.name,
    username: output.username,
    isSuperAdmin: output.isSuperAdmin,
    active: output.active,
    phone: fromContractPhone(output.phone),
    hasPhone: output.phone !== null,
    locationIds: output.locationKeys,
    permissions: output.permissions,
    updatedAt: output.updatedAt,
  };
}

export function toLocationOptions(output: LocationOptionsOutput): LocationOption[] {
  return output.items.map(({ key, label }) => ({ id: key, label }));
}

/** Username rule (ADR-0020 §1): trimmed and lowercased before validation and sending. */
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

type PersonalValues = { name: string; phone: PhoneValue; locationIds: string[] };

/** An empty phone number is sent as `null` (Phone No. is optional in UI revision 2). */
function contractPhone(phone: PhoneValue) {
  return phone.number.replace(/\D/g, "").length === 0 ? null : toContractPhone(phone);
}

/** Form values -> strict create input. `photo` is deferred and never sent. */
export function toCreateUserInput(
  values: PersonalValues & { username: string; password: string; active: boolean; permissions: string[] },
): CreateUserInput {
  return {
    username: normalizeUsername(values.username),
    password: values.password,
    name: values.name.trim(),
    phone: contractPhone(values.phone),
    locationKeys: values.locationIds,
    active: values.active,
    permissions: values.permissions,
  };
}

/**
 * Form values -> update input. A Super Admin target accepts only personal
 * information (ADR-0020 §4); an empty password means "unchanged" and is omitted.
 */
export function toUpdateUserInput(
  target: Pick<UserDetail, "id" | "updatedAt" | "isSuperAdmin">,
  values: PersonalValues & { password: string; active: boolean; permissions: string[] },
): UpdateUserInput {
  const personal = {
    id: target.id,
    expectedUpdatedAt: target.updatedAt,
    name: values.name.trim(),
    phone: contractPhone(values.phone),
    locationKeys: values.locationIds,
  };
  if (target.isSuperAdmin) return personal;
  return {
    ...personal,
    active: values.active,
    permissions: values.permissions,
    ...(values.password.length > 0 ? { password: values.password } : {}),
  };
}

// ---- errors (readDomainError / isCallerLicenseCode / retryTransient live in @/lib/trpc-error) ----

export type FormField = "username" | "password" | "name" | "phone" | "locationIds";
export type SaveErrorOutcome = {
  fieldErrors: { field: FormField; message: string }[];
  formError: string | null;
  /** Side effects the page applies. */
  refetchCatalog?: boolean;
  refetchLocations?: boolean;
  refetchList?: boolean;
  refetchDetail?: boolean;
  recheckAccess?: boolean;
  /** The edited user no longer exists: leave edit mode. */
  gone?: boolean;
};

const PASSWORD_POLICY_MESSAGE = "Password must be 4–64 characters";
const USERNAME_RULE_MESSAGE = "Use 3–64 characters: a-z, 0-9, and . _ - @ + (no spaces)";
const USERNAME_TAKEN_MESSAGE = "This username is already in use";

function fieldMessage(path: string, code: string): { field: FormField; message: string } | null {
  const root = path.split(".")[0];
  switch (root) {
    case "username":
      if (code === "duplicate") return { field: "username", message: USERNAME_TAKEN_MESSAGE };
      return { field: "username", message: USERNAME_RULE_MESSAGE };
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

/** userAdmin.create / userAdmin.update domain codes -> field errors / FormError banner. */
export function mapSaveError(error: unknown, kind: "create" | "update", usage: UserList["usage"] | undefined): SaveErrorOutcome {
  const { domainCode, fieldErrors } = readDomainError(error);
  const mappedFields = fieldErrors.map((entry) => fieldMessage(entry.path, entry.code)).filter((entry) => entry !== null);
  const nothingSaved = kind === "create" ? "Couldn't save the user. Try again." : "Couldn't save the changes. Try again.";

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
    case "USERNAME_TAKEN":
      return { fieldErrors: [{ field: "username", message: USERNAME_TAKEN_MESSAGE }], formError: null };
    case "USERNAME_IMMUTABLE":
      return { fieldErrors: [], formError: "The username can't be changed after the user is created.", refetchDetail: true };
    case "SUPER_ADMIN_LOCKED":
      return {
        fieldErrors: [],
        formError: "Super Admin permissions, password and Active status can't be changed. Nothing was saved.",
        refetchDetail: true,
      };
    case "USER_CHANGED":
      return {
        fieldErrors: [],
        formError: "This user was changed by someone else. Cancel to load the latest details, then edit again.",
        refetchDetail: true,
        refetchList: true,
      };
    case "USER_NOT_FOUND":
      return { fieldErrors: [], formError: "This user no longer exists. It may have been deleted.", refetchList: true, gone: true };
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
      return { fieldErrors: [], formError: "This username has no issued license. Contact sales." };
    case "USER_LICENSE_UNVERIFIABLE":
      return { fieldErrors: [], formError: "Couldn't verify the license. Try again." };
    case "SUPER_ADMIN_REQUIRED":
      return { fieldErrors: [], formError: "Only a Super Admin can manage users.", recheckAccess: true };
    default:
      if (isCallerLicenseCode(domainCode)) return { fieldErrors: [], formError: "Your license doesn't allow this right now. Nothing was saved." };
      if (domainCode === "UNAUTHORIZED") return { fieldErrors: [], formError: "Your session has ended. Sign in again." };
      // USER_SERVICE_UNAVAILABLE, INTERNAL_SERVER_ERROR, network failure or timeout.
      return { fieldErrors: [], formError: nothingSaved };
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
    case "SUPER_ADMIN_LOCKED":
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
