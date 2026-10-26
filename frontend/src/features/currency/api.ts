import type { PartnerEntity } from "@/features/partner/entity";
import { isCallerLicenseCode, readDomainError } from "@/lib/trpc-error";
import { formatRate } from "./rates";
import { isBaseCode, type CurrencyFormValues } from "./schema";

/**
 * currency data boundary (data-fetching.md, error-handling.md): contract → form values and back,
 * drawer row text and domain-code messages for the master `currency.*` procedures.
 */

/** Wording for the shared Partner Master header/drawer/dialogs; `key` is the permission menu key. */
export const CURRENCY_ENTITY: PartnerEntity = { key: "currency", singular: "Currency", plural: "Currencies" };

export type CurrencyListItem = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  sellingRate: string | null;
  buyingRate: string | null;
};

export type CurrencyDetail = CurrencyListItem & {
  description: string;
  createdAt: string;
  updatedAt: string;
  baseCode: string | null;
};

export function toFormValues(detail: CurrencyDetail): CurrencyFormValues {
  return {
    code: detail.code,
    name: detail.name,
    description: detail.description,
    active: detail.active,
    sellingRate: detail.sellingRate ?? "",
    buyingRate: detail.buyingRate ?? "",
  };
}

/** Duplicate: every field copied, Code cleared (codes are unique). */
export function toDuplicateValues(detail: CurrencyDetail): CurrencyFormValues {
  return { ...toFormValues(detail), code: "" };
}

/** Form values → create input; the base currency sends no rates (SA-CUR-02). */
export function toCreateInput(values: CurrencyFormValues, baseCode: string | null) {
  const base = isBaseCode(values.code, baseCode);
  return {
    code: values.code.trim().toUpperCase(),
    name: values.name.trim(),
    description: values.description.trim(),
    active: values.active,
    sellingRate: base ? null : formatRate(values.sellingRate.trim()),
    buyingRate: base ? null : formatRate(values.buyingRate.trim()),
  };
}

/** Form values → update fields; the code can't change after saving (Q-CUR-04). */
export function toUpdateFields(values: CurrencyFormValues, storedCode: string, baseCode: string | null) {
  const input = toCreateInput({ ...values, code: storedCode }, baseCode);
  return { name: input.name, description: input.description, active: input.active, sellingRate: input.sellingRate, buyingRate: input.buyingRate };
}

/** Drawer row (ui-spec C-07): "USD · US Dollar", then base / rates / not set. */
export function rowText(item: CurrencyListItem, baseCode: string | null): { primary: string; secondary: string } {
  const primary = `${item.code} · ${item.name}`;
  if (item.code === baseCode) return { primary, secondary: "Base currency" };
  if (item.sellingRate === null || item.buyingRate === null) return { primary, secondary: "Rates not set" };
  return { primary, secondary: `Sell ${item.sellingRate} · Buy ${item.buyingRate} ${baseCode ?? ""}`.trimEnd() };
}

// ---- errors ----

export type FieldError = { name: keyof CurrencyFormValues; message: string };
export type SaveOutcome = { fieldErrors: FieldError[]; formError: string | null; stale?: boolean; notFound?: boolean; recheckAccess?: boolean };

const FIELD_NAMES: ReadonlySet<string> = new Set(["code", "name", "description", "active", "sellingRate", "buyingRate"]);

export function mapSaveError(error: unknown): SaveOutcome {
  const { domainCode, fieldErrors } = readDomainError(error);
  switch (domainCode) {
    case "CURRENCY_CODE_TAKEN":
      return { fieldErrors: [{ name: "code", message: "This code is already used" }], formError: null };
    case "CURRENCY_BASE_LOCKED":
      return { fieldErrors: [], formError: "The company currency is always active. Turn Active back on to save." };
    case "CURRENCY_CHANGED":
      return { fieldErrors: [], formError: "This record was changed by someone else. Cancel to load the latest version, then edit again.", stale: true };
    case "CURRENCY_NOT_FOUND":
      return { fieldErrors: [], formError: "This record no longer exists.", notFound: true };
    case "VALIDATION_ERROR": {
      const mapped = fieldErrors.flatMap((entry): FieldError[] => {
        if (!FIELD_NAMES.has(entry.path) || entry.path === "active") return [];
        const name = entry.path as keyof CurrencyFormValues;
        const message = entry.code === "required" ? (name === "sellingRate" || name === "buyingRate" ? "Rate is required" : "This field is required") : "Check this field";
        return [{ name, message }];
      });
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

export type DeleteOutcome = { kind: "gone"; message: string } | { kind: "dialog"; message: string; recheckAccess?: boolean };

export function mapDeleteError(error: unknown): DeleteOutcome {
  const { domainCode } = readDomainError(error);
  if (domainCode === "CURRENCY_NOT_FOUND") return { kind: "gone", message: "This record was already deleted." };
  if (domainCode === "CURRENCY_IN_USE") return { kind: "dialog", message: "This currency is used by other records. Turn off Active instead." };
  if (domainCode === "PERMISSION_DENIED") return { kind: "dialog", message: "You don't have permission to delete this.", recheckAccess: true };
  if (isCallerLicenseCode(domainCode)) return { kind: "dialog", message: "Your license doesn't allow this right now. Nothing was deleted." };
  if (domainCode === "UNAUTHORIZED") return { kind: "dialog", message: "Your session has ended. Sign in again." };
  return { kind: "dialog", message: "Couldn't delete. Try again." };
}

export function loadErrorMessage(error: unknown, subject: string): string {
  const { domainCode } = readDomainError(error);
  if (domainCode === "CURRENCY_NOT_FOUND") return "This record no longer exists.";
  if (domainCode === "PERMISSION_DENIED") return "You don't have permission to view Currency.";
  if (isCallerLicenseCode(domainCode)) return `Your license doesn't allow loading ${subject} right now.`;
  if (domainCode === "UNAUTHORIZED") return "Your session has ended. Sign in again.";
  return `Couldn't load ${subject}.`;
}

export const isPermissionDenied = (error: unknown) => readDomainError(error).domainCode === "PERMISSION_DENIED";
export const isNotFound = (error: unknown) => readDomainError(error).domainCode === "CURRENCY_NOT_FOUND";
