import { ADDRESS_MAX, type AddressArrayName } from "./schema";

/**
 * Shared mapping of gateway field errors (`data.fieldErrors`: dot-joined 0-based `path`, zod issue
 * `code` or `duplicate` / `unknown` / `multiple_defaults` / `invalid`) to Partner Master form fields.
 * Added for vendor FE-VEN-011; same rules and copy as the customer mapper (customer/api.ts).
 * Raw server messages are never used.
 */

/** A server field error mapped to an RHF field name (e.g. `invoiceAddresses.1.postcode`). */
export type MappedFieldError = { name: string; message: string };

type FieldRule = { label: string; max?: number };

const infoFieldRules: Record<string, FieldRule> = {
  code: { label: "Code name", max: 120 },
  name: { label: "Name", max: 200 },
  currencyCode: { label: "Currency" },
  firstName: { label: "First name", max: 100 },
  middleName: { label: "Middle name", max: 100 },
  lastName: { label: "Last name", max: 100 },
  email: { label: "Email", max: 254 },
};

function addressFieldRules(nameLabel: string): Record<string, FieldRule> {
  return {
    name: { label: nameLabel, max: 200 },
    taxId: { label: "Tax ID", max: 32 },
    address: { label: "Address", max: 500 },
    countryCode: { label: "Country" },
    state: { label: "State/Province", max: 100 },
    city: { label: "City", max: 100 },
    postcode: { label: "Postcode", max: 20 },
  };
}

function ruleMessage(field: string, rule: FieldRule, code: string): string {
  if (field === "code" && code === "duplicate") return "This code name is already in use";
  if (field === "currencyCode") return code === "unknown" ? "Choose a currency from the list" : "Currency is required";
  if (field === "countryCode") return code === "unknown" ? "Choose a country from the list" : "Country is required";
  if (field === "email" && code !== "too_big") return code === "too_small" ? "Email is required" : "Enter a valid email address";
  if (code === "too_big" && rule.max !== undefined) return `${rule.label} must be at most ${rule.max} characters`;
  if (code === "too_small" || code === "invalid_type") return `${rule.label} is required`;
  return `Check ${rule.label}`;
}

export type FieldErrorScope = {
  /** Address arrays the entity has, e.g. `["invoiceAddresses"]` for vendor. */
  arrayNames: readonly AddressArrayName[];
  /** Arrays whose items have a Tax ID. */
  taxIdArrays: readonly AddressArrayName[];
  /** Error label of the address name field ("Name", "Name/Company Name"). */
  addressNameLabel: string;
};

/** Maps one server field error to a form field, or null when the path is not a form field. */
export function mapPartnerFieldError(path: string, code: string, scope: FieldErrorScope): MappedFieldError | null {
  const parts = path.split(".");
  const [root] = parts;
  if (root === "phone") return { name: "phone", message: "Enter a valid phone number" };
  if (parts.length === 1 && infoFieldRules[root]) return { name: root, message: ruleMessage(root, infoFieldRules[root], code) };
  const arrayName = scope.arrayNames.find((name) => name === root);
  if (arrayName && parts.length === 3) {
    const index = Number(parts[1]);
    const field = parts[2];
    const rule = addressFieldRules(scope.addressNameLabel)[field];
    if (!Number.isInteger(index) || index < 0 || index >= ADDRESS_MAX || !rule) return null;
    if (field === "taxId" && !scope.taxIdArrays.includes(arrayName)) return null;
    return { name: `${arrayName}.${index}.${field}`, message: ruleMessage(field, rule, code) };
  }
  return null;
}
