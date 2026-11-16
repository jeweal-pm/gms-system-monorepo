import type { PartnerEntity } from "@/features/partner/entity";
import { isCallerLicenseCode, readDomainError } from "@/lib/trpc-error";
import type { LocationFormValues } from "./schema";

/**
 * location-master data boundary (data-fetching.md): contract → form values and back, drawer row text and
 * domain-code messages for the master `locationMaster.*` procedures (SA rev 1, ADR-0052).
 */

/** Wording for the shared Partner Master header / drawer / dialogs; `key` is the permission menu key. */
export const LOCATION_ENTITY: PartnerEntity = { key: "location-master", singular: "Location", plural: "Locations" };

export type LocationListItem = { id: string; name: string; active: boolean };
/** The shared drawer row shape: a location has no code (like Stone Master › Size), so the drawer shows the name. */
export type LocationDrawerItem = LocationListItem & { code: null };
export type LocationDetail = LocationListItem & { createdAt: string; updatedAt: string };

export function toFormValues(detail: LocationDetail): LocationFormValues {
  return { name: detail.name, active: detail.active };
}

/** Duplicate: Active copied, Name cleared (names are unique, ui-spec). */
export function toDuplicateValues(detail: LocationDetail): LocationFormValues {
  return { ...toFormValues(detail), name: "" };
}

export function toInput(values: LocationFormValues) {
  return { name: values.name.trim(), active: values.active };
}

/** Drawer row (ui-spec): the name in bold, no second line. */
export function rowText(item: LocationListItem): { primary: string; secondary: string } {
  return { primary: item.name, secondary: "" };
}

// ---- errors ----

export type FieldError = { name: keyof LocationFormValues; message: string };
export type SaveOutcome = { fieldErrors: FieldError[]; formError: string | null; stale?: boolean; notFound?: boolean; recheckAccess?: boolean };

export function mapSaveError(error: unknown): SaveOutcome {
  const { domainCode, fieldErrors } = readDomainError(error);
  switch (domainCode) {
    case "LOCATION_NAME_TAKEN":
      return { fieldErrors: [{ name: "name", message: "This name is already used" }], formError: null };
    case "LOCATION_CHANGED":
      return { fieldErrors: [], formError: "This location was changed by someone else. Cancel to load the latest version, then edit again.", stale: true };
    case "LOCATION_NOT_FOUND":
      return { fieldErrors: [], formError: "This location no longer exists.", notFound: true };
    case "VALIDATION_ERROR": {
      const mapped = fieldErrors.flatMap((entry): FieldError[] =>
        entry.path === "name" ? [{ name: "name", message: entry.code === "too_big" ? "Up to 40 characters" : "Enter a name" }] : [],
      );
      return { fieldErrors: mapped, formError: mapped.length < fieldErrors.length || fieldErrors.length === 0 ? "Some details couldn't be saved. Check the form and try again." : null };
    }
    case "PERMISSION_DENIED":
      return { fieldErrors: [], formError: "You don't have permission to do this. Nothing was saved.", recheckAccess: true };
    default:
      if (isCallerLicenseCode(domainCode)) return { fieldErrors: [], formError: "Your license doesn't allow this right now. Nothing was saved." };
      if (domainCode === "UNAUTHORIZED") return { fieldErrors: [], formError: "Your session has ended. Sign in again." };
      return { fieldErrors: [], formError: "Couldn't save. Try again." };
  }
}

export type DeleteOutcome = { kind: "gone"; message: string } | { kind: "dialog"; message: string; recheckAccess?: boolean; stale?: boolean };

export function mapDeleteError(error: unknown): DeleteOutcome {
  const { domainCode } = readDomainError(error);
  if (domainCode === "LOCATION_NOT_FOUND") return { kind: "gone", message: "This location was already deleted." };
  if (domainCode === "LOCATION_CHANGED") return { kind: "dialog", message: "This location was changed by someone else. Refresh, then try again.", stale: true };
  if (domainCode === "PERMISSION_DENIED") return { kind: "dialog", message: "You don't have permission to delete this.", recheckAccess: true };
  if (isCallerLicenseCode(domainCode)) return { kind: "dialog", message: "Your license doesn't allow this right now. Nothing was deleted." };
  if (domainCode === "UNAUTHORIZED") return { kind: "dialog", message: "Your session has ended. Sign in again." };
  return { kind: "dialog", message: "Couldn't delete. Try again." };
}

export function loadErrorMessage(error: unknown, subject: string): string {
  const { domainCode } = readDomainError(error);
  if (domainCode === "LOCATION_NOT_FOUND") return "This location no longer exists.";
  if (domainCode === "PERMISSION_DENIED") return "You don't have access to Location Master.";
  if (isCallerLicenseCode(domainCode)) return `Your license doesn't allow loading ${subject} right now.`;
  if (domainCode === "UNAUTHORIZED") return "Your session has ended. Sign in again.";
  return `Couldn't load ${subject}.`;
}

export const isPermissionDenied = (error: unknown) => readDomainError(error).domainCode === "PERMISSION_DENIED";
export const isNotFound = (error: unknown) => readDomainError(error).domainCode === "LOCATION_NOT_FOUND";
