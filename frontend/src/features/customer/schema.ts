import { z } from "zod";
import { DEFAULT_PHONE_COUNTRY, toE164 } from "@/lib/phone";

/**
 * Customer form (FE-CUS-008). Rules mirror ADR-0018 §3 and SA rev 1 api-contract.md
 * exactly; copy follows form-guidelines.md (P-06). Client validation is UX only.
 * Lengths are counted after trimming; the mapper in api.ts trims before sending.
 */

export const ADDRESS_MAX = 10;
export const PHONE_MAX_DIGITS = 15;
export type AddressType = "invoice" | "shipping";
export const addressArrayName = { invoice: "invoiceAddresses", shipping: "shippingAddresses" } as const;
export type AddressArrayName = (typeof addressArrayName)[AddressType];

const emailFormat = z.email();

function requiredText(label: string, max: number) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);
}

function optionalText(label: string, max: number) {
  return z.string().trim().max(max, `${label} must be at most ${max} characters`);
}

/**
 * Address fields are plain strings and are checked in one refinement, so the
 * "State/City only after Country" rule always runs with the other field checks
 * (zod skips object refinements after a field-level failure).
 */
const addressFieldsSchema = z.object({
  /** Server ID of a loaded address. Not sent: update replaces the whole set (SA-CUS-03). */
  id: z.string().nullable(),
  name: z.string(),
  taxId: z.string(),
  address: z.string(),
  countryCode: z.string(),
  state: z.string(),
  city: z.string(),
  postcode: z.string(),
  isDefault: z.boolean(),
});

function checkText(ctx: z.RefinementCtx, value: string, path: string, label: string, max: number, required: boolean) {
  const trimmed = value.trim();
  if (required && trimmed.length === 0) ctx.addIssue({ code: "custom", path: [path], message: `${label} is required` });
  else if (trimmed.length > max) ctx.addIssue({ code: "custom", path: [path], message: `${label} must be at most ${max} characters` });
}

const addressSchema = addressFieldsSchema.superRefine((value, ctx) => {
  checkText(ctx, value.name, "name", "Name", 200, true);
  checkText(ctx, value.taxId, "taxId", "Tax ID", 32, false);
  checkText(ctx, value.address, "address", "Address", 500, true);
  if (value.countryCode === "") ctx.addIssue({ code: "custom", path: ["countryCode"], message: "Country is required" });
  // State/City are disabled until a Country is chosen; their required error appears only after that (form-guidelines.md).
  checkText(ctx, value.state, "state", "State/Province", 100, value.countryCode !== "");
  checkText(ctx, value.city, "city", "City", 100, value.countryCode !== "");
  checkText(ctx, value.postcode, "postcode", "Postcode", 20, true);
});

function addressListSchema(type: AddressType) {
  return z
    .array(addressSchema)
    .min(1, `Add at least one ${type} address`)
    .max(ADDRESS_MAX, `Up to ${ADDRESS_MAX} ${type} addresses`)
    // Safety net: the UI keeps exactly one default per type (P-01).
    .refine((items) => items.filter((item) => item.isDefault).length === 1, { message: "Exactly one default address is required" });
}

export const customerFormSchema = z.object({
  code: optionalText("Code name", 120),
  name: requiredText("Name", 200),
  currencyCode: z.string().min(1, "Currency is required"),
  active: z.boolean(),
  firstName: requiredText("First name", 100),
  middleName: optionalText("Middle name", 100),
  lastName: optionalText("Last name", 100),
  phone: z.object({ country: z.string(), number: z.string() }).superRefine((value, ctx) => {
    const digits = value.number.replace(/\D/g, "");
    if (digits.length === 0) return; // optional: sent as null
    if (digits.length > PHONE_MAX_DIGITS) ctx.addIssue({ code: "custom", path: ["number"], message: `Phone No. must be at most ${PHONE_MAX_DIGITS} digits` });
    else if (toE164(value) === null) ctx.addIssue({ code: "custom", path: ["number"], message: "Enter a valid phone number" });
  }),
  email: z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      if (value.length === 0) ctx.addIssue({ code: "custom", message: "Email is required" });
      else if (value.length > 254) ctx.addIssue({ code: "custom", message: "Email must be at most 254 characters" });
      else if (!emailFormat.safeParse(value).success) ctx.addIssue({ code: "custom", message: "Enter a valid email address" });
    }),
  invoiceAddresses: addressListSchema("invoice"),
  shippingAddresses: addressListSchema("shipping"),
});

export type CustomerFormValues = z.infer<typeof customerFormSchema>;
export type AddressFormValue = CustomerFormValues["invoiceAddresses"][number];

export function emptyAddress(isDefault: boolean): AddressFormValue {
  return { id: null, name: "", taxId: "", address: "", countryCode: "", state: "", city: "", postcode: "", isDefault };
}

/** New draft: Active on, one Invoice and one Shipping item, both default (ADR-0018 §3). */
export function emptyCustomerForm(): CustomerFormValues {
  return {
    code: "",
    name: "",
    currencyCode: "",
    active: true,
    firstName: "",
    middleName: "",
    lastName: "",
    phone: { country: DEFAULT_PHONE_COUNTRY, number: "" },
    email: "",
    invoiceAddresses: [emptyAddress(true)],
    shippingAddresses: [emptyAddress(true)],
  };
}

const ADDRESS_FIELD_ORDER = ["name", "taxId", "address", "countryCode", "state", "city", "postcode"] as const;
const CUSTOMER_FIELD_ORDER = ["code", "name", "currencyCode", "firstName", "middleName", "lastName", "phone", "email"] as const;

type ErrorTree = Record<string, unknown> | undefined;

function hasError(node: unknown): boolean {
  return typeof node === "object" && node !== null && Object.keys(node).length > 0;
}

/**
 * First invalid field in visual order (form-guidelines.md "Timing"): customer fields,
 * then Invoice #1…#n, then Shipping #1…#n. Returns the RHF field name to focus.
 */
export function firstErrorField(errors: ErrorTree): string | null {
  if (!errors) return null;
  for (const field of CUSTOMER_FIELD_ORDER) {
    // `phone` is one Controller; its ref is the number input.
    if (hasError(errors[field])) return field;
  }
  for (const arrayName of [addressArrayName.invoice, addressArrayName.shipping]) {
    // RHF may store field-array errors as an object with numeric keys (plus `root`), so index it directly.
    const list = errors[arrayName] as ErrorTree;
    if (!list) continue;
    for (let index = 0; index < ADDRESS_MAX; index += 1) {
      const item = list[index] as ErrorTree;
      if (!item) continue;
      for (const field of ADDRESS_FIELD_ORDER) {
        if (hasError(item[field])) return `${arrayName}.${index}.${field}`;
      }
    }
  }
  return null;
}

/** Indexes of address items in `arrayName` that contain at least one field error. */
export function addressIndexesWithErrors(errors: ErrorTree, arrayName: AddressArrayName): number[] {
  const list = errors?.[arrayName] as ErrorTree;
  if (!list) return [];
  const indexes: number[] = [];
  for (let index = 0; index < ADDRESS_MAX; index += 1) {
    const item = list[index] as ErrorTree;
    if (item && ADDRESS_FIELD_ORDER.some((field) => hasError(item[field]))) indexes.push(index);
  }
  return indexes;
}
