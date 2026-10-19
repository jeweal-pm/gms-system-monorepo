import { z } from "zod";
import { DEFAULT_PHONE_COUNTRY, toE164 } from "@/lib/phone";

/**
 * Partner Master form building blocks (vendor FE-VEN-001, extracted from customer FE-CUS-008).
 * Customer and vendor each build their final form schema from these; rules mirror
 * ADR-0018 §3 and the customer SA rev 1 contract. Client validation is UX only.
 * Lengths are counted after trimming; entity mappers trim before sending.
 */

export const ADDRESS_MAX = 10;
export const PHONE_MAX_DIGITS = 15;
export type AddressArrayName = "invoiceAddresses" | "shippingAddresses";
/**
 * `exactlyOne`: the first item starts as default and the default can't be unticked (customer P-01).
 * `atMostOne`: new items start unticked, ticking moves the default, it can be unticked (vendor Q-VEN-03).
 */
export type DefaultRule = "exactlyOne" | "atMostOne";

const emailFormat = z.email();

export function requiredText(label: string, max: number) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);
}

export function optionalText(label: string, max: number) {
  return z.string().trim().max(max, `${label} must be at most ${max} characters`);
}

/**
 * Address fields are plain strings and are checked in one refinement, so the
 * "State/City only after Country" rule always runs with the other field checks
 * (zod skips object refinements after a field-level failure).
 */
const addressFieldsSchema = z.object({
  /** Server ID of a loaded address. Not sent: update replaces the whole set. */
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

export type AddressFormValue = z.infer<typeof addressFieldsSchema>;

function checkText(ctx: z.RefinementCtx, value: string, path: string, label: string, max: number, required: boolean) {
  const trimmed = value.trim();
  if (required && trimmed.length === 0) ctx.addIssue({ code: "custom", path: [path], message: `${label} is required` });
  else if (trimmed.length > max) ctx.addIssue({ code: "custom", path: [path], message: `${label} must be at most ${max} characters` });
}

/** One address item. `nameLabel` is the error label of the name field ("Name", "Name/Company Name"). */
export function addressSchema(nameLabel: string) {
  return addressFieldsSchema.superRefine((value, ctx) => {
    checkText(ctx, value.name, "name", nameLabel, 200, true);
    checkText(ctx, value.taxId, "taxId", "Tax ID", 32, false);
    checkText(ctx, value.address, "address", "Address", 500, true);
    if (value.countryCode === "") ctx.addIssue({ code: "custom", path: ["countryCode"], message: "Country is required" });
    // State is disabled until a Country is chosen; its required error appears only after that (form-guidelines.md).
    checkText(ctx, value.state, "state", "State/Province", 100, value.countryCode !== "");
    // City is optional (owner 2026-10-19): some places have no city.
    checkText(ctx, value.city, "city", "City", 100, false);
    checkText(ctx, value.postcode, "postcode", "Postcode", 20, true);
  });
}

/** 1–10 items of one address type (`typeNoun` = "invoice" / "shipping"), with the entity's default rule. */
export function addressListSchema(typeNoun: string, nameLabel: string, defaultRule: DefaultRule) {
  const list = z
    .array(addressSchema(nameLabel))
    .min(1, `Add at least one ${typeNoun} address`)
    .max(ADDRESS_MAX, `Up to ${ADDRESS_MAX} ${typeNoun} addresses`);
  const defaults = (items: readonly AddressFormValue[]) => items.filter((item) => item.isDefault).length;
  // Safety nets: the list card already keeps the default count within the rule.
  return defaultRule === "exactlyOne"
    ? list.refine((items) => defaults(items) === 1, { message: "Exactly one default address is required" })
    : list.refine((items) => defaults(items) <= 1, { message: "Only one default address is allowed" });
}

const phoneSchema = z.object({ country: z.string(), number: z.string() }).superRefine((value, ctx) => {
  const digits = value.number.replace(/\D/g, "");
  if (digits.length === 0) return; // optional: sent as null (customer; vendor Q-VEN-02)
  if (digits.length > PHONE_MAX_DIGITS) ctx.addIssue({ code: "custom", path: ["number"], message: `Phone No. must be at most ${PHONE_MAX_DIGITS} digits` });
  else if (toE164(value) === null) ctx.addIssue({ code: "custom", path: ["number"], message: "Enter a valid phone number" });
});

const emailSchema = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    if (value.length === 0) ctx.addIssue({ code: "custom", message: "Email is required" });
    else if (value.length > 254) ctx.addIssue({ code: "custom", message: "Email must be at most 254 characters" });
    else if (!emailFormat.safeParse(value).success) ctx.addIssue({ code: "custom", message: "Enter a valid email address" });
  });

/** Partner Information fields shared by customer and vendor; spread into each entity's `z.object`. */
export const partnerInfoShape = {
  // ADR-0021 §1: required, trimmed, 1–120 characters (unique case-insensitively on the server).
  code: requiredText("Code Name", 120),
  name: requiredText("Name", 200),
  currencyCode: z.string().min(1, "Currency is required"),
  active: z.boolean(),
  firstName: requiredText("First name", 100),
  middleName: optionalText("Middle name", 100),
  lastName: optionalText("Last name", 100),
  phone: phoneSchema,
  email: emailSchema,
};

export type PartnerInfoValues = z.infer<z.ZodObject<typeof partnerInfoShape>>;

/** Form values the shared address components work on (shipping exists only for customer). */
export type PartnerAddressValues = { invoiceAddresses: AddressFormValue[]; shippingAddresses?: AddressFormValue[] };

export function emptyAddress(isDefault: boolean): AddressFormValue {
  return { id: null, name: "", taxId: "", address: "", countryCode: "", state: "", city: "", postcode: "", isDefault };
}

/** New draft information: Active on, everything else empty. */
export function emptyPartnerInfo(): PartnerInfoValues {
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
  };
}

const ADDRESS_FIELD_ORDER = ["name", "taxId", "address", "countryCode", "state", "city", "postcode"] as const;
const INFO_FIELD_ORDER = ["code", "name", "currencyCode", "firstName", "middleName", "lastName", "phone", "email"] as const;

type ErrorTree = Record<string, unknown> | undefined;

function hasError(node: unknown): boolean {
  return typeof node === "object" && node !== null && Object.keys(node).length > 0;
}

/**
 * First invalid field in visual order (form-guidelines.md "Timing"): information fields,
 * then each address array in the given order, items #1…#n. Returns the RHF field name to focus.
 */
export function firstErrorField(errors: ErrorTree, arrayNames: readonly AddressArrayName[]): string | null {
  if (!errors) return null;
  for (const field of INFO_FIELD_ORDER) {
    // `phone` is one Controller; its ref is the number input.
    if (hasError(errors[field])) return field;
  }
  for (const arrayName of arrayNames) {
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

/** Builds an RHF-like error tree from dot-joined field names (server field errors). */
export function errorTreeFromEntries(entries: readonly { name: string; message: string }[]): Record<string, unknown> {
  const tree: Record<string, unknown> = {};
  for (const { name, message } of entries) {
    const parts = name.split(".");
    let node = tree;
    parts.forEach((part, index) => {
      if (index === parts.length - 1) node[part] = { message };
      else node = (node[part] ??= {}) as Record<string, unknown>;
    });
  }
  return tree;
}
