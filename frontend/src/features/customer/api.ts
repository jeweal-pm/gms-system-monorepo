import { fromContractPhone, toContractPhone } from "@/lib/phone";
import { isCallerLicenseCode, readDomainError, type DomainErrorInfo } from "@/lib/trpc-error";
import type { CustomerDetail, CustomerFieldsInput } from "./contract";
import { ADDRESS_MAX, type AddressFormValue, type CustomerFormValues } from "./schema";

/**
 * customer data boundary: contract <-> form mappers and error mapping (FE-CUS-014/015).
 * Contract: gateway `customer.*` (SA revision 1, delivered 2026-10-14); types in contract.ts.
 * Raw server messages are never shown (error-handling.md).
 * Option-list mapping is shared: `toSelectOptions` in features/partner/options.ts (vendor FE-VEN-001).
 */

function addressToForm(address: CustomerDetail["shippingAddresses"][number] & { taxId?: string | null }): AddressFormValue {
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

function byPosition<T extends { position: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.position - b.position);
}

/** Saved customer -> form values (Edit / read-only view). */
export function toFormValues(detail: CustomerDetail): CustomerFormValues {
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
    invoiceAddresses: byPosition(detail.invoiceAddresses).map(addressToForm),
    shippingAddresses: byPosition(detail.shippingAddresses).map(addressToForm),
  };
}

/** Duplicate (FE-CUS-011): the saved customer without Code Name and without address IDs. */
export function toDuplicateValues(detail: CustomerDetail): CustomerFormValues {
  const values = toFormValues(detail);
  return {
    ...values,
    code: "",
    invoiceAddresses: values.invoiceAddresses.map((address) => ({ ...address, id: null })),
    shippingAddresses: values.shippingAddresses.map((address) => ({ ...address, id: null })),
  };
}

const nullIfEmpty = (value: string) => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

/** Form values -> strict create/update fields. Trims, empty optional -> null, email lower-cased, array order = position. */
export function toCustomerFields(values: CustomerFormValues): CustomerFieldsInput {
  const address = (item: AddressFormValue) => ({
    name: item.name.trim(),
    address: item.address.trim(),
    countryCode: item.countryCode,
    state: item.state.trim(),
    city: item.city.trim(),
    postcode: item.postcode.trim(),
    isDefault: item.isDefault,
  });
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
    invoiceAddresses: values.invoiceAddresses.map((item) => ({ ...address(item), taxId: nullIfEmpty(item.taxId) })),
    shippingAddresses: values.shippingAddresses.map(address),
  };
}

// ---- errors ----

/** Domain error of a customer call (gateway errorFormatter: `data.domainCode`, `data.fieldErrors`). */
export function readCustomerError(error: unknown): DomainErrorInfo {
  return readDomainError(error);
}

export function isPermissionDenied(error: unknown): boolean {
  return readCustomerError(error).domainCode === "PERMISSION_DENIED";
}

/** Load failures for list/get/options: short inline copy (error-handling.md). */
export function loadErrorMessage(error: unknown, subject: string): string {
  const { domainCode } = readCustomerError(error);
  if (domainCode === "CUSTOMER_NOT_FOUND") return "This customer no longer exists. It may have been deleted.";
  if (domainCode === "PERMISSION_DENIED") return "You don't have permission to view customers.";
  if (isCallerLicenseCode(domainCode)) return `Your license doesn't allow loading ${subject} right now.`;
  if (domainCode === "UNAUTHORIZED") return "Your session has ended. Sign in again.";
  return `Couldn't load ${subject}.`;
}

/** A server field error mapped to an RHF field name (e.g. `invoiceAddresses.1.postcode`). */
export type MappedFieldError = { name: string; message: string };

export type SaveErrorOutcome = {
  fieldErrors: MappedFieldError[];
  formError: string | null;
  /** CUSTOMER_STALE: banner with a Reload action. */
  stale?: boolean;
  /** CUSTOMER_NOT_FOUND on Save: the record is gone; Save is hidden for it. */
  notFound?: boolean;
  recheckAccess?: boolean;
  refetchOptions?: boolean;
  refetchList?: boolean;
  /**
   * Create failed without a definite answer (timeout / service unavailable): the customer may
   * have been created. Owner decision 2026-10-14: refresh the list before allowing a retry
   * (no idempotency key).
   */
  refreshListBeforeRetry?: boolean;
};

const UNAVAILABLE_SAVE = "Customer service is unavailable. Nothing was saved. Try again.";
const UNCERTAIN_CREATE =
  "Customer service didn't respond, so the customer may or may not have been created. The customer list was refreshed: check it before you try again.";
const UNMAPPED_VALIDATION = "Some details couldn't be saved. Check the form and try again.";

type FieldRule = { label: string; max?: number };

const customerFieldRules: Record<string, FieldRule> = {
  code: { label: "Code name", max: 120 },
  name: { label: "Name", max: 200 },
  currencyCode: { label: "Currency" },
  firstName: { label: "First name", max: 100 },
  middleName: { label: "Middle name", max: 100 },
  lastName: { label: "Last name", max: 100 },
  email: { label: "Email", max: 254 },
};

const addressFieldRules: Record<string, FieldRule> = {
  name: { label: "Name", max: 200 },
  taxId: { label: "Tax ID", max: 32 },
  address: { label: "Address", max: 500 },
  countryCode: { label: "Country" },
  state: { label: "State/Province", max: 100 },
  city: { label: "City", max: 100 },
  postcode: { label: "Postcode", max: 20 },
};

function ruleMessage(field: string, rule: FieldRule, code: string): string {
  if (field === "code" && code === "duplicate") return "This code name is already in use";
  if (field === "currencyCode") return code === "unknown" ? "Choose a currency from the list" : "Currency is required";
  if (field === "countryCode") return code === "unknown" ? "Choose a country from the list" : "Country is required";
  if (field === "email" && code !== "too_big") return code === "too_small" ? "Email is required" : "Enter a valid email address";
  if (code === "too_big" && rule.max !== undefined) return `${rule.label} must be at most ${rule.max} characters`;
  if (code === "too_small" || code === "invalid_type") return `${rule.label} is required`;
  return `Check ${rule.label}`;
}

/** Maps one server field error (`path` dot-joined, 0-based indexes) to a form field, or null. */
export function mapServerFieldError(path: string, code: string): MappedFieldError | null {
  const parts = path.split(".");
  const [root] = parts;
  if (root === "phone") return { name: "phone", message: "Enter a valid phone number" };
  if (parts.length === 1 && customerFieldRules[root]) return { name: root, message: ruleMessage(root, customerFieldRules[root], code) };
  if ((root === "invoiceAddresses" || root === "shippingAddresses") && parts.length === 3) {
    const index = Number(parts[1]);
    const field = parts[2];
    const rule = addressFieldRules[field];
    if (!Number.isInteger(index) || index < 0 || index >= ADDRESS_MAX || !rule) return null;
    if (root === "shippingAddresses" && field === "taxId") return null;
    return { name: `${root}.${index}.${field}`, message: ruleMessage(field, rule, code) };
  }
  return null;
}

/** Create/Save failures -> field errors and/or the FormError banner (error-handling.md). */
export function mapSaveError(error: unknown, action: "create" | "edit"): SaveErrorOutcome {
  const { domainCode, fieldErrors } = readCustomerError(error);
  switch (domainCode) {
    case "CUSTOMER_CODE_TAKEN":
      return { fieldErrors: [{ name: "code", message: "This code name is already in use" }], formError: null };
    case "VALIDATION_ERROR": {
      const mapped = fieldErrors.map((entry) => mapServerFieldError(entry.path, entry.code)).filter((entry): entry is MappedFieldError => entry !== null);
      const multipleDefaults = fieldErrors.some((entry) => entry.code === "multiple_defaults");
      const unmapped = fieldErrors.length === 0 || mapped.length + (multipleDefaults ? 1 : 0) < fieldErrors.length;
      return {
        fieldErrors: mapped,
        formError: multipleDefaults ? "Only one default address is allowed per type." : unmapped ? UNMAPPED_VALIDATION : null,
        refetchOptions: fieldErrors.some((entry) => entry.code === "unknown"),
      };
    }
    case "CUSTOMER_STALE":
      return {
        fieldErrors: [],
        formError: "Someone else changed this customer after you opened it. Reload to see the latest version; your changes here will be lost.",
        stale: true,
      };
    case "CUSTOMER_NOT_FOUND":
      return { fieldErrors: [], formError: "This customer was deleted by someone else.", notFound: true, refetchList: true };
    case "PERMISSION_DENIED":
      return { fieldErrors: [], formError: `You don't have permission to ${action} customers.`, recheckAccess: true };
    case "UNAUTHORIZED":
      return { fieldErrors: [], formError: "Your session has ended. Sign in again." };
    default:
      if (isCallerLicenseCode(domainCode)) return { fieldErrors: [], formError: "Your license doesn't allow this right now. Nothing was saved." };
      // PARTNER_UNAVAILABLE (incl. gateway timeout), 5xx, network failure.
      if (action === "create") return { fieldErrors: [], formError: UNCERTAIN_CREATE, refreshListBeforeRetry: true };
      return { fieldErrors: [], formError: UNAVAILABLE_SAVE };
  }
}

export type DeleteErrorOutcome = { kind: "dialog"; message: string; recheckAccess?: boolean } | { kind: "gone"; message: string };

/** customer.delete failures -> in-dialog error, or "already gone" (close + info toast). */
export function mapDeleteError(error: unknown): DeleteErrorOutcome {
  const { domainCode } = readCustomerError(error);
  switch (domainCode) {
    case "CUSTOMER_NOT_FOUND":
      return { kind: "gone", message: "This customer was already deleted." };
    case "PERMISSION_DENIED":
      return { kind: "dialog", message: "You don't have permission to delete customers.", recheckAccess: true };
    case "UNAUTHORIZED":
      return { kind: "dialog", message: "Your session has ended. Sign in again." };
    default:
      if (isCallerLicenseCode(domainCode)) return { kind: "dialog", message: "Your license doesn't allow this right now. Nothing was deleted." };
      return { kind: "dialog", message: "Customer service is unavailable. Nothing was deleted. Try again." };
  }
}
