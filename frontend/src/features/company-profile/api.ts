import type { inferRouterClient } from "@trpc/client";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import type { AppRouter } from "@gem-crm/backend-api-gateway/src/trpc/router";
import type { ServerFieldError } from "@/lib/trpc-error";
import { normalizePlainText, type CompanyProfileFormValues } from "./schema";

/**
 * company-profile SA revision 3 contract mapping (FE-CP-009): profile ↔ form values, logo REST
 * upload, and error messages. Server data stays in TanStack Query; nothing is cached here.
 */

type CompanyProfileClient = inferRouterClient<AppRouter>["companyProfile"];
export type CompanyProfile = NonNullable<Awaited<ReturnType<CompanyProfileClient["get"]["query"]>>["profile"]>;

/** Same-origin logo URL; `v` makes it immutable per logo version (gateway cache headers). */
export function logoUrl(profile: CompanyProfile | null): string | null {
  return profile?.logo ? `/api/v1/company-profile/logo?v=${profile.logo.version}` : null;
}

export function toFormValues(profile: CompanyProfile): CompanyProfileFormValues {
  const parsed = parsePhoneNumberFromString(profile.phone.e164);
  return {
    name: profile.name,
    taxId: profile.taxId,
    contactName: profile.contactName,
    phone: { country: profile.phone.country, number: parsed?.nationalNumber ?? profile.phone.e164 },
    email: profile.email,
    website: profile.website,
    address: profile.address,
    address2: profile.address2,
    roadStreet: profile.roadStreet,
    countryCode: profile.countryCode,
    state: profile.state,
    city: profile.city,
    postcode: profile.postcode,
    currencyCode: profile.currencyCode,
    bankDetails: profile.bankDetails,
    showBankDetailsOnInvoice: profile.showBankDetailsOnInvoice,
  };
}

/** Form values (already validated) → `companyProfile.save` input. Phone becomes E.164 via libphonenumber-js. */
export function toSaveInput(values: CompanyProfileFormValues, expectedVersion: number | null) {
  const phone = parsePhoneNumberFromString(values.phone.number, values.phone.country as CountryCode);
  return {
    name: values.name.trim(),
    taxId: values.taxId.trim(),
    contactName: values.contactName.trim(),
    phone: { country: values.phone.country, e164: phone?.number ?? "" },
    email: values.email.trim(),
    website: values.website.trim(),
    address: values.address.trim(),
    address2: values.address2.trim(),
    roadStreet: values.roadStreet.trim(),
    countryCode: values.countryCode,
    state: values.state.trim(),
    city: values.city.trim(),
    postcode: values.postcode.trim(),
    currencyCode: values.currencyCode,
    bankDetails: normalizePlainText(values.bankDetails),
    showBankDetailsOnInvoice: values.showBankDetailsOnInvoice,
    expectedVersion,
  };
}

/** Server field path → form field (`phone.e164` → `phone`); unknown paths return null. */
export function formFieldFor(path: string): keyof CompanyProfileFormValues | null {
  const head = path.split(".")[0];
  const fields: readonly string[] = [
    "name", "taxId", "contactName", "phone", "email", "website", "address", "address2", "roadStreet",
    "countryCode", "state", "city", "postcode", "currencyCode", "bankDetails",
  ];
  return fields.includes(head) ? (head as keyof CompanyProfileFormValues) : null;
}

const fieldMessages: Record<string, string> = {
  unknown: "Choose a value from the list",
  too_long: "This text is too long",
};

export function fieldErrorMessage(error: ServerFieldError): string {
  return fieldMessages[error.code] ?? "Check this field";
}

export class LogoUploadError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "LogoUploadError";
  }
}

/** Logo REST upload (SA-CP-04): raw file body, same-origin proxy → gateway → partner. */
export async function uploadLogo(file: File, expectedVersion: number): Promise<CompanyProfile> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/company-profile/logo?expectedVersion=${expectedVersion}`, {
      method: "PUT",
      headers: { "content-type": file.type },
      body: file,
      credentials: "same-origin",
    });
  } catch {
    throw new LogoUploadError("NETWORK");
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = (payload as { error?: { code?: unknown } } | null)?.error?.code;
    throw new LogoUploadError(typeof code === "string" ? code : "UNKNOWN");
  }
  return (payload as { profile: CompanyProfile }).profile;
}

export function logoErrorMessage(code: string): string {
  if (code === "PAYLOAD_TOO_LARGE") return "the image must be 10 MB or smaller";
  if (code === "UNSUPPORTED_MEDIA_TYPE") return "choose a JPEG or PNG image";
  if (code === "CONFLICT") return "someone else changed the profile; refresh and try again";
  if (code === "PERMISSION_DENIED") return "you don't have permission to change it";
  return "try again";
}
