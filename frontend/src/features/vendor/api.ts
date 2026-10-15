import { mapPartnerFieldError, type FieldErrorScope, type MappedFieldError } from "@/features/partner/errors";
import { fromContractPhone, toContractPhone } from "@/lib/phone";
import { isCallerLicenseCode, readDomainError, type DomainErrorInfo } from "@/lib/trpc-error";
import type { VendorDetail, VendorFieldsInput, VendorInvoiceAddress } from "./contract";
import type { AddressFormValue, VendorFormValues } from "./schema";

/**
 * vendor data boundary: contract <-> form mappers (FE-VEN-010) and error mapping (FE-VEN-011).
 * Contract: gateway `vendor.*` (SA revision 1 + ADR-0019 revision 1, delivered 2026-10-15); types in contract.ts.
 * Errors are read from `data.domainCode` / `data.fieldErrors` only; raw server messages are never shown
 * (error-handling.md). Unknown codes (e.g. `NOT_FOUND` from an older partner image) get the generic copy.
 */

export type { MappedFieldError } from "@/features/partner/errors";

function addressToForm(address: VendorInvoiceAddress): AddressFormValue {
  return {
    id: address.id,
    name: address.name,
    taxId: address.taxId ?? "",
    address: address.address,
    countryCode: address.countryCode,
    state: address.state,
    city: address.city,
    postcode: address.postcode,
    isDefault: address.isDefault,
  };
}

/** Saved vendor -> form values (Edit / read-only view). */
export function toFormValues(detail: VendorDetail): VendorFormValues {
  return {
    code: detail.code ?? "",
    name: detail.name,
    currencyCode: detail.currencyCode,
    active: detail.active,
    firstName: detail.firstName,
    middleName: detail.middleName ?? "",
    lastName: detail.lastName ?? "",
    phone: fromContractPhone(detail.phone),
    email: detail.email,
    invoiceAddresses: [...detail.invoiceAddresses].sort((a, b) => a.position - b.position).map(addressToForm),
  };
}

/** Duplicate (FE-VEN-009): the saved vendor without Code Name and without address IDs. */
export function toDuplicateValues(detail: VendorDetail): VendorFormValues {
  const values = toFormValues(detail);
  return { ...values, code: "", invoiceAddresses: values.invoiceAddresses.map((address) => ({ ...address, id: null })) };
}

const nullIfEmpty = (value: string) => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

/**
 * Form values -> strict create/update fields. Trims, empty optional -> null, email lower-cased,
 * array order = position; `isDefault` is sent as ticked (zero or one default, D-V03).
 */
export function toVendorFields(values: VendorFormValues): VendorFieldsInput {
  return {
    name: values.name.trim(),
    code: nullIfEmpty(values.code),
    currencyCode: values.currencyCode,
    active: values.active,
    firstName: values.firstName.trim(),
    middleName: nullIfEmpty(values.middleName),
    lastName: nullIfEmpty(values.lastName),
    phone: values.phone.number.replace(/\D/g, "") === "" ? null : toContractPhone(values.phone),
    email: values.email.trim().toLowerCase(),
    invoiceAddresses: values.invoiceAddresses.map((item) => ({
      name: item.name.trim(),
      taxId: nullIfEmpty(item.taxId),
      address: item.address.trim(),
      countryCode: item.countryCode,
      state: item.state.trim(),
      city: item.city.trim(),
      postcode: item.postcode.trim(),
      isDefault: item.isDefault,
    })),
  };
}

// ---- errors (FE-VEN-011) ----

/** Domain error of a vendor call (gateway errorFormatter: `data.domainCode`, `data.fieldErrors`). */
export function readVendorError(error: unknown): DomainErrorInfo {
  return readDomainError(error);
}

export function isPermissionDenied(error: unknown): boolean {
  return readVendorError(error).domainCode === "PERMISSION_DENIED";
}

export function isVendorNotFound(error: unknown): boolean {
  return readVendorError(error).domainCode === "VENDOR_NOT_FOUND";
}

/** Load failures for list/get/options: short inline copy (error-handling.md). */
export function loadErrorMessage(error: unknown, subject: string): string {
  const { domainCode } = readVendorError(error);
  if (domainCode === "VENDOR_NOT_FOUND") return "This vendor no longer exists. It may have been deleted.";
  if (domainCode === "PERMISSION_DENIED") return "You don't have permission to view vendors.";
  if (isCallerLicenseCode(domainCode)) return `Your license doesn't allow loading ${subject} right now.`;
  if (domainCode === "UNAUTHORIZED") return "Your session has ended. Sign in again.";
  return `Couldn't load ${subject}.`;
}

const VENDOR_FIELD_SCOPE: FieldErrorScope = { arrayNames: ["invoiceAddresses"], taxIdArrays: ["invoiceAddresses"], addressNameLabel: "Name/Company Name" };

/** Maps one server field error (`path` dot-joined, 0-based indexes) to a vendor form field, or null. */
export function mapServerFieldError(path: string, code: string): MappedFieldError | null {
  return mapPartnerFieldError(path, code, VENDOR_FIELD_SCOPE);
}

export type SaveErrorOutcome = {
  fieldErrors: MappedFieldError[];
  formError: string | null;
  /** VENDOR_STALE: banner with a Reload action. */
  stale?: boolean;
  /** VENDOR_NOT_FOUND on Save: the record is gone; Save is hidden for it. */
  notFound?: boolean;
  recheckAccess?: boolean;
  refetchOptions?: boolean;
  refetchList?: boolean;
  /**
   * Create failed without a definite answer (timeout / service unavailable): the vendor may have
   * been created (create is not idempotent). Refresh the list before allowing a retry (customer
   * owner decision reused by SA vendor rev 1).
   */
  refreshListBeforeRetry?: boolean;
};

const UNAVAILABLE_SAVE = "Vendor service is unavailable. Nothing was saved. Try again.";
const UNCERTAIN_CREATE =
  "Vendor service didn't respond, so the vendor may or may not have been created. The vendor list was refreshed: check it before you try again.";
const UNMAPPED_VALIDATION = "Some details couldn't be saved. Check the form and try again.";

/** Create/Save failures -> field errors and/or the FormError banner (error-handling.md). */
export function mapSaveError(error: unknown, action: "create" | "edit"): SaveErrorOutcome {
  const { domainCode, fieldErrors } = readVendorError(error);
  switch (domainCode) {
    case "VENDOR_CODE_TAKEN":
      return { fieldErrors: [{ name: "code", message: "This code name is already in use" }], formError: null };
    case "VALIDATION_ERROR": {
      const mapped = fieldErrors.map((entry) => mapServerFieldError(entry.path, entry.code)).filter((entry): entry is MappedFieldError => entry !== null);
      const multipleDefaults = fieldErrors.some((entry) => entry.code === "multiple_defaults");
      const unmapped = fieldErrors.length === 0 || mapped.length + (multipleDefaults ? 1 : 0) < fieldErrors.length;
      return {
        fieldErrors: mapped,
        formError: multipleDefaults ? "Only one default invoice address is allowed." : unmapped ? UNMAPPED_VALIDATION : null,
        refetchOptions: fieldErrors.some((entry) => entry.code === "unknown"),
      };
    }
    case "VENDOR_STALE":
      return {
        fieldErrors: [],
        formError: "Someone else changed this vendor after you opened it. Reload to see the latest version; your changes here will be lost.",
        stale: true,
      };
    case "VENDOR_NOT_FOUND":
      return { fieldErrors: [], formError: "This vendor was deleted by someone else.", notFound: true, refetchList: true };
    case "PERMISSION_DENIED":
      return { fieldErrors: [], formError: `You don't have permission to ${action} vendors.`, recheckAccess: true };
    case "UNAUTHORIZED":
      return { fieldErrors: [], formError: "Your session has ended. Sign in again." };
    default:
      if (isCallerLicenseCode(domainCode)) return { fieldErrors: [], formError: "Your license doesn't allow this right now. Nothing was saved." };
      // PARTNER_UNAVAILABLE (incl. gateway timeout), 5xx, network failure, unknown codes.
      if (action === "create") return { fieldErrors: [], formError: UNCERTAIN_CREATE, refreshListBeforeRetry: true };
      return { fieldErrors: [], formError: UNAVAILABLE_SAVE };
  }
}

export type DeleteErrorOutcome = { kind: "dialog"; message: string; recheckAccess?: boolean } | { kind: "gone"; message: string };

/** vendor.delete failures -> in-dialog error, or "already gone" (close + info toast). */
export function mapDeleteError(error: unknown): DeleteErrorOutcome {
  const { domainCode } = readVendorError(error);
  switch (domainCode) {
    case "VENDOR_NOT_FOUND":
      return { kind: "gone", message: "This vendor was already deleted." };
    case "PERMISSION_DENIED":
      return { kind: "dialog", message: "You don't have permission to delete vendors.", recheckAccess: true };
    case "UNAUTHORIZED":
      return { kind: "dialog", message: "Your session has ended. Sign in again." };
    default:
      if (isCallerLicenseCode(domainCode)) return { kind: "dialog", message: "Your license doesn't allow this right now. Nothing was deleted." };
      return { kind: "dialog", message: "Vendor service is unavailable. Nothing was deleted. Try again." };
  }
}
